import type { InterfaceAbi } from "ethers";
import { getUnsupportedActionError } from "../error.js";
import {
  getABIForProtocol,
  getApproveData,
  getChainNameFromId,
  getFunctionData,
  getProtocolAddressForChain,
  getTokenInfoForChain,
} from "../index.js";
import type {
  ContractCallParam,
  ProtocolActionData,
  TokenInfo,
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
  const approveInfo: {
    spender: string;
    tokenInfo?: TokenInfo;
    amount: bigint;
  } = {
    spender: "",
    tokenInfo,
    amount,
  };
  const params: ContractCallParam[] = [];
  const token = (tokenInfo?.symbol || "").toLowerCase();
  const chainName = getChainNameFromId(chainId);

  switch (action) {
    case "stake": {
      address = getProtocolAddressForChain("ethena", chainId);
      if (!address) {
        throw new Error("Could not find address for Ethena stake");
      }
      abi = getABIForProtocol("ethena", "staker");
      if (chainId !== 1) {
        throw new Error(
          `Ethena is not supported on ${chainName}, please try on ethereum.`,
        );
      }
      if (token !== "usde") {
        approveInfo.tokenInfo = await getTokenInfoForChain("usde", chainName);
      }
      funcName = "deposit";
      params.push(amount);
      params.push(accountAddress);
      approveInfo.spender = address;
      break;
    }
    case "unstake": {
      address = getProtocolAddressForChain("ethena", chainId);
      abi = getABIForProtocol("ethena", "staker");
      if (chainId !== 1) {
        throw new Error(
          `Ethena is not supported on ${chainName}, please try on ethereum.`,
        );
      }
      if (token !== "usde") {
        approveInfo.tokenInfo = await getTokenInfoForChain("usde", chainName);
      }
      params.push(accountAddress);
      break;
    }
    default: {
      throw new Error(
        getUnsupportedActionError(action, ["stake", "unstake"], "Ethena"),
      );
    }
  }

  if (!address) {
    throw new Error(
      getProtocolErrorMessage(action, tokenInfo?.symbol, "ethena", chainId),
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
