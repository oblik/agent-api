import type { ethers } from "ethers";
import { abis } from "../../config/abis.js";
import { NATIVE_TOKEN } from "../../constants.js";
import { getUnsupportedActionError } from "../error.js";
import { getViemPublicClientFromEthers } from "../ethers2viem.js";
import {
  getABIForProtocol,
  getApproveData,
  getFunctionData,
  getProtocolAddressForChain,
} from "../index.js";
import {
  assert,
  type ContractCallParam,
  type ProtocolActionData,
  type Transaction,
  isHexStr,
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
    case "deposit":
    case "stake": {
      if (tokenInfo?.address !== NATIVE_TOKEN) {
        throw new Error("Token not supported");
      }
      value = amount || 0n;

      address = getProtocolAddressForChain("rocketpool", chainId);
      abi = getABIForProtocol("rocketpool");

      funcName = "deposit";
      break;
    }
    case "unstake":
    case "withdraw": {
      address = getProtocolAddressForChain("rocketpool", chainId, "reth");
      if (!address) {
        throw new Error("Could not find address for RocketPool reth");
      }
      abi = getABIForProtocol("rocketpool", "reth");
      assert(isHexStr(address));
      const rethAmount = await (
        await getViemPublicClientFromEthers(provider)
      ).readContract({
        address,
        abi: abis["rocketpool-reth"],
        functionName: "getRethValue",
        args: [amount || 0n],
      });
      params.push(rethAmount);

      funcName = "burn";
      break;
    }
    default: {
      throw new Error(
        getUnsupportedActionError(
          action,
          ["deposit", "withdraw", "stake", "unstake"],
          "RocketPool",
        ),
      );
    }
  }

  if (!address) {
    throw new Error(
      getProtocolErrorMessage(action, tokenInfo?.symbol, "rocketpool", chainId),
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
