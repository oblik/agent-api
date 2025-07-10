import type { InterfaceAbi } from "ethers";
import { NATIVE_TOKEN } from "../../constants.js";
import { getUnsupportedActionError } from "../error.js";
import {
  getABIForProtocol,
  getApproveData,
  getFunctionData,
  getProtocolAddressForChain,
} from "../index.js";
import { sfConsoleError } from "../log.js";
import type {
  ContractCallParam,
  ProtocolActionData,
  Transaction,
} from "../types.js";
import { getABIErrorMessage, getProtocolErrorMessage } from "./index.js";

export default async (
  accountAddress: string,
  action: string,
  actionData: ProtocolActionData,
): Promise<{
  transactions: Transaction[];
  funcNames: string[];
}> => {
  const { provider, amount: amount_, chainId, tokenInfo } = actionData;
  const amount = amount_ || 0n;

  let approveTxs: Transaction[] = [];
  let address: string | null = "";
  let abi: InterfaceAbi = [];
  let funcName = action;
  const value = 0;
  const approveInfo = {
    spender: "",
    tokenInfo,
    amount,
  };
  const params: ContractCallParam[] = [];
  const preAction: Transaction[] = [];
  const token = (tokenInfo?.symbol || "").toLowerCase();

  switch (action) {
    case "claim": {
      address = getProtocolAddressForChain("plutus", chainId, "router");
      if (!address) {
        throw new Error("Could not find address for Plutus claim");
      }
      abi = getABIForProtocol("plutus", "router");

      const claim1 = await getFunctionData(
        address,
        abi,
        "claimAndStakeMpPls",
        [],
        "0",
      );
      const claim2 = await getFunctionData(address, abi, "claimEsPls", [], "0");
      return {
        transactions: [claim1, claim2],
        funcNames: ["Claim and Stake MpPls", "Claim EsPls"],
      };
    }
    case "lock": {
      if (token !== "pls") {
        throw new Error(`Token ${token} is not supported`);
      }

      address = getProtocolAddressForChain("plutus", chainId, "router");
      if (!address) {
        throw new Error("Could not find address for Plutus lock");
      }
      abi = getABIForProtocol("plutus", "router");
      params.push(amount);

      funcName = "stakeAndLockPls";

      approveInfo.spender = "0xE9645988a5E6D5EfCc939bed1F3040Dba94C6CbB";

      preAction.push(
        await getFunctionData(
          address,
          abi,
          "toggleAutoExtend",
          [getProtocolAddressForChain("plutus", chainId, "lockedPls")],
          "0",
        ),
      );
      break;
    }
    case "stake": {
      if (["plvglp", "plsspa", "plsjones"].includes(token)) {
        address = getProtocolAddressForChain("plutus", chainId, token);
        if (!address) {
          sfConsoleError(token);
          throw new Error("Could not find address for Plutus stake");
        }
        abi = getABIForProtocol("plutus", "chef");
        funcName = "deposit";
      } else if (token === "espls") {
        address = getProtocolAddressForChain("plutus", chainId, "router");
        if (!address) {
          throw new Error("Could not find router for Plutus stake");
        }
        abi = getABIForProtocol("plutus", "router");
        funcName = "stakeEsPls";
      } else throw new Error("Token not supported");

      params.push(amount);

      if (tokenInfo?.address !== NATIVE_TOKEN && token !== "espls") {
        approveInfo.spender = address;
      }
      break;
    }
    case "unlock": {
      if (token !== "pls") {
        throw new Error(`Token ${token} is not supported`);
      }

      address = getProtocolAddressForChain("plutus", chainId, "router");
      abi = getABIForProtocol("plutus", "router");

      funcName = "unlockAndUnstakePls";
      break;
    }
    case "unstake": {
      if (["plvglp", "plsspa", "plsjones"].includes(token)) {
        address = getProtocolAddressForChain("plutus", chainId, token);
        abi = getABIForProtocol("plutus", "chef");
        params.push(amount);
        funcName = "withdraw";
      } else if (token === "espls") {
        address = getProtocolAddressForChain("plutus", chainId, "router");
        abi = getABIForProtocol("plutus", "router");
        funcName = "unstakeEsPls";
        params.push(amount);
      } else throw new Error("Token not supported");
      break;
    }
    default: {
      throw new Error(
        getUnsupportedActionError(
          action,
          ["claim", "stake", "unstake", "lock", "unlock"],
          "Plutus",
        ),
      );
    }
  }

  if (!address) {
    throw new Error(
      getProtocolErrorMessage(action, tokenInfo?.symbol, "plutus", chainId),
    );
  }
  if (!abi || abi.length === 0) {
    throw new Error(getABIErrorMessage(address, chainId));
  }

  if (approveInfo.spender) {
    approveTxs = await getApproveData(
      provider,
      approveInfo.tokenInfo,
      approveInfo.amount,
      accountAddress,
      approveInfo.spender,
    );
  }

  const data = await getFunctionData(
    address,
    abi,
    funcName,
    params,
    value.toString(),
  );

  return {
    transactions: [...approveTxs, ...preAction, data],
    funcNames: [
      ...Array(approveTxs.length).fill("Approve"),
      ...Array(preAction.length).fill("Toggle Auto Extend"),
      action,
    ],
  };
};
