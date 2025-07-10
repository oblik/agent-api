import type { ethers } from "ethers";
import { abis } from "../../config/abis.js";
import strategies from "../../config/eigenlayer/strategies.js";
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
  const value = 0;
  const approveInfo = {
    spender: "",
    tokenInfo,
    amount,
  };
  const params: ContractCallParam[] = [];
  const token = (tokenInfo?.symbol || "").toLowerCase();

  switch (action) {
    case "deposit":
    case "stake": {
      const strategy = strategies[token];
      if (!strategy) {
        throw new Error(`No strategy supported for ${token}`);
      }
      address = getProtocolAddressForChain("eigenlayer", chainId);
      if (!address) {
        throw new Error("Could not find address for Eigenlayer");
      }
      abi = getABIForProtocol("eigenlayer");
      params.push(strategy.address);
      params.push(tokenInfo?.address ?? "eigenlayer token address?");
      params.push(amount || 0n);

      funcName = "depositIntoStrategy";

      if (tokenInfo?.address !== NATIVE_TOKEN) {
        approveInfo.spender = address;
      }
      break;
    }
    case "unstake":
    case "withdraw": {
      const strategy = strategies[token.toLowerCase()];
      if (!strategy) {
        throw new Error(`No strategy supported for ${token}`);
      }
      address = getProtocolAddressForChain("eigenlayer", chainId);
      if (!address) {
        throw new Error("Could not find address for Eigenlayer");
      }
      abi = getABIForProtocol("eigenlayer");

      const viemClient = await getViemPublicClientFromEthers(provider);
      assert(isHexStr(strategy.address));
      assert(isHexStr(address));
      assert(isHexStr(accountAddress));
      let share = await viemClient.readContract({
        address: strategy.address as `0x${string}`,
        abi: abis["eigenlayer-base"],
        functionName: "underlyingToShares",
        args: [amount || 0n],
      });
      const userShare = await viemClient.readContract({
        address: strategy.address,
        abi: abis["eigenlayer-base"],
        functionName: "shares",
        args: [accountAddress],
      });
      if (share > userShare) {
        share = userShare;
      }
      const [stakes] = await viemClient.readContract({
        address: address as `0x${string}`,
        abi: abis.eigenlayer,
        functionName: "getDeposits",
        args: [accountAddress],
      });
      const index = stakes.indexOf(strategy.address);
      if (index < 0) {
        throw new Error(
          `Nothing staked in ${token} strategy by ${accountAddress}`,
        );
      }

      params.push([index]);
      params.push([strategy.address]);
      params.push([share]);
      params.push(accountAddress);
      params.push(true);

      funcName = "queueWithdrawal";
      break;
    }
    default: {
      throw new Error(
        getUnsupportedActionError(
          action,
          ["deposit", "stake", "withdraw", "unstake"],
          "EigenLayer",
        ),
      );
    }
  }

  if (!address) {
    throw new Error(
      getProtocolErrorMessage(action, tokenInfo?.symbol, "eigenlayer", chainId),
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
