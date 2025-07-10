import { ethers } from "ethers";
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
  const { provider, amount, chainId, tokenInfo } = actionData;

  let approveTxs: Transaction[] = [];
  let address: string | null = "";
  let abi: ethers.InterfaceAbi = [];
  let funcName = action;
  let value = 0n;
  const approveInfo = {
    spender: "",
    tokenInfo,
    amount,
  };
  const params: ContractCallParam[] = [];

  switch (action) {
    case "stake": {
      address = getProtocolAddressForChain("lido", chainId);
      abi = getABIForProtocol("lido");

      params.push(ethers.ZeroAddress);

      funcName = "submit";

      if (tokenInfo?.address === NATIVE_TOKEN) {
        value = amount || 0n;
      } else {
        throw new Error("Token not supported");
      }
      break;
    }
    default: {
      throw new Error(getUnsupportedActionError(action, ["stake"], "Lido"));
    }
  }

  if (!address) {
    throw new Error(
      getProtocolErrorMessage(action, tokenInfo.symbol, "lido", chainId),
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
