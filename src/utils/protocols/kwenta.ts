import type { InterfaceAbi } from "ethers";
import { NATIVE_TOKEN } from "../../constants.js";
import { getUnsupportedActionError } from "../error.js";
import {
  getABIForProtocol,
  getApproveData,
  getFunctionData,
  getProtocolAddressForChain,
} from "../index.js";
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
  const {
    provider,
    token,
    amount: amount_,
    chainId,
    tokenInfo,
    inputTokenInfo,
    inputAmount,
    leverageMultiplier,
  } = actionData;
  const amount = amount_ || 0n;

  if (["long", "short", "close"].includes(action)) {
    if (
      !leverageMultiplier ||
      Number.parseFloat(leverageMultiplier.toString()) <= 0
    ) {
      throw new Error("Leverage multiplier must be greater than zero");
    }
  }

  let approveTxs: Transaction[] = [];
  let address: string | null = "";
  let abi: InterfaceAbi = [];
  const funcName = action;
  const value = 0;
  const isPerpAction = ["long", "short"].includes(action);
  const approveInfo = {
    spender: "",
    tokenInfo: isPerpAction ? inputTokenInfo : tokenInfo,
    amount: isPerpAction ? inputAmount : amount,
  };
  const params: ContractCallParam[] = [];

  switch (action) {
    case "stake": {
      address = getProtocolAddressForChain("kwenta", chainId, "staking");
      if (!address) {
        throw new Error("Could not find address for Kwenta stake");
      }
      abi = getABIForProtocol("kwenta", "staking");
      params.push(amount);

      if (!token || token.toLowerCase() !== "kwenta") {
        throw new Error("Token not supported");
      }

      if (tokenInfo?.address !== NATIVE_TOKEN) {
        approveInfo.spender = address;
      }
      break;
    }
    case "unstake": {
      address = getProtocolAddressForChain("kwenta", chainId, "staking");
      if (!address) {
        throw new Error("Could not find address for Kwenta unstake");
      }
      abi = getABIForProtocol("kwenta", "staking");
      params.push(amount);
      break;
    }
    /* case "long":
    case "short":
    case "close": {
      address = getProtocolAddressForChain("kwenta", chainId, "margin");
      abi = getABIForProtocol("kwenta", "margin");

      funcName = "execute";

      if (action !== "close" && inputTokenInfo.address !== NATIVE_TOKEN) {
        approveInfo.spender = address;
      }
      break;
    } */
    default: {
      throw new Error(
        getUnsupportedActionError(action, ["stake", "unstake"], "Kwenta"),
      );
    }
  }

  if (!address) {
    throw new Error(
      getProtocolErrorMessage(action, tokenInfo?.symbol, "kwenta", chainId),
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
    transactions: [...approveTxs, data],
    funcNames: [...Array(approveTxs.length).fill("Approve"), action],
  };
};
