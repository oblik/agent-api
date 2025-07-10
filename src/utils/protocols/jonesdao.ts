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

  switch (action) {
    case "claim": {
      address = getProtocolAddressForChain("jonesdao", chainId);
      abi = getABIForProtocol("jonesdao");
      params.push(0 /* uint256 _pid */);

      funcName = "harvest";
      break;
    }
    case "deposit":
    case "stake": {
      address = getProtocolAddressForChain("jonesdao", chainId);
      if (!address) {
        throw new Error("Could not find address for JonesDAO stake");
      }
      abi = getABIForProtocol("jonesdao");
      params.push(0); // pid, other pools are Sushi LP Tokens
      params.push(amount);

      if (tokenInfo?.address !== NATIVE_TOKEN) {
        approveInfo.spender = address;
      }
      funcName = "deposit";
      break;
    }
    case "withdraw":
    case "unstake": {
      address = getProtocolAddressForChain("jonesdao", chainId);
      if (!address) {
        throw new Error("Could not find address for JonesDAO unstake");
      }
      abi = getABIForProtocol("jonesdao");
      params.push(0 /* uint256 _pid */);
      params.push(amount);
      funcName = "withdraw";
      break;
    }
    default: {
      throw new Error(
        getUnsupportedActionError(
          action,
          ["claim", "deposit", "stake", "withdraw", "unstake"],
          "JonesDAO",
        ),
      );
    }
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
