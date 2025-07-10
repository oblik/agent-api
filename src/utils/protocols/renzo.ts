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
  const { provider, amount: amount_, chainId, tokenInfo } = actionData;
  const amount = amount_ || 0n;

  let approveTxs: Transaction[] = [];
  let address: string | null = "";
  let abi: InterfaceAbi = [];
  let value = 0n;
  const approveInfo = {
    spender: "",
    tokenInfo,
    amount,
  };
  const params: ContractCallParam[] = [];
  const isEth = tokenInfo?.address === NATIVE_TOKEN;
  const funcName = isEth ? "depositETH" : "deposit";

  switch (action) {
    case "stake": {
      address = getProtocolAddressForChain("renzo", chainId);
      if (!address) {
        throw new Error("Could not find address for Renzo stake");
      }

      if (chainId === 1) {
        abi = getABIForProtocol("renzo", "manager");
        if (isEth) {
          value = amount;
        } else {
          params.push(tokenInfo?.address ?? "renzo token address?");
          params.push(amount);
          approveInfo.spender = address;
        }
      } else {
        abi = getABIForProtocol("renzo", "l2manager");
        const deadline = new Date().getTime() + 2500;
        if (isEth) {
          value = amount;
        } else {
          params.push(amount);
          approveInfo.spender = address;
        }
        params.push(0);
        params.push(deadline);
      }
      break;
    }
    default: {
      throw new Error(getUnsupportedActionError(action, ["stake"]));
    }
  }

  if (!address) {
    throw new Error(
      getProtocolErrorMessage(action, tokenInfo?.symbol, "renzo", chainId),
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
