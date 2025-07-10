import type { InterfaceAbi } from "ethers";
import { NATIVE_TOKEN } from "../../constants.js";
import { getUnsupportedActionError } from "../error.js";
import {
  getABIForProtocol,
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
  const { amount, chainId, tokenInfo } = actionData;

  let address: string | null = "";
  let abi: InterfaceAbi = [];
  let funcName = action;
  let value = 0n;
  const params: ContractCallParam[] = [];

  switch (action) {
    case "stake": {
      if (tokenInfo?.address !== NATIVE_TOKEN) {
        throw new Error("Token not supported");
      }
      address = getProtocolAddressForChain("swell", chainId);
      abi = getABIForProtocol("swell");
      value = amount || 0n;

      funcName = "deposit";
      break;
    }
    default: {
      throw new Error(getUnsupportedActionError(action, ["stake"], "Swell"));
    }
  }

  if (!address) {
    throw new Error(
      getProtocolErrorMessage(action, tokenInfo?.symbol, "swell", chainId),
    );
  }
  if (!abi || abi.length === 0) {
    throw new Error(getABIErrorMessage(address, chainId));
  }

  const data = await getFunctionData(
    address,
    abi,
    funcName,
    params,
    value.toString(),
  );

  return { transactions: [data], funcNames: [action] };
};
