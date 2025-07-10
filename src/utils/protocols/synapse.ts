import type { ethers } from "ethers";
import { abis } from "../../config/abis.js";
import ProtocolTokens from "../../config/token.js";
import { getUnsupportedActionError } from "../error.js";
import { getViemPublicClientFromEthers } from "../ethers2viem.js";
import {
  getABIForProtocol,
  getApproveData,
  getFunctionData,
  getLPTokenInfo,
  getProtocolAddressForChain,
} from "../index.js";
import { sfConsoleError } from "../log.js";
import {
  assert,
  type ContractCallParam,
  type ProtocolActionData,
  type TokenInfo,
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
  const { provider, amount: amount_, chainId, tokenInfo } = actionData;
  const viemClient = await getViemPublicClientFromEthers(provider);
  const amount = amount_ || 0n;

  let approveTxs: Transaction[] = [];
  let address: string | null = "";
  let abi: ethers.InterfaceAbi = [];
  let funcName = action;
  const value = 0;
  const approveInfo: {
    spender: string;
    tokenInfo: TokenInfo | undefined;
    amount: bigint;
  } = {
    spender: "",
    tokenInfo: tokenInfo,
    amount,
  };
  const params: ContractCallParam[] = [];
  const token = (tokenInfo?.symbol || "").toLowerCase();

  switch (action) {
    case "deposit": {
      address = getProtocolAddressForChain("synapse", chainId, token);
      if (!address) {
        sfConsoleError(token);
        throw new Error("Could not find address for Synapse deposit");
      }
      assert(isHexStr(address));
      assert(isHexStr(tokenInfo?.address));
      abi = getABIForProtocol("synapse", "staking");
      const tokenIdx = await viemClient.readContract({
        address,
        abi: abis["synapse-staking"],
        functionName: "getTokenIndex",
        args: [tokenInfo?.address],
      });
      let count = tokenIdx + 1;
      /* eslint-disable no-await-in-loop */
      while (true) {
        try {
          await viemClient.readContract({
            address,
            abi: abis["synapse-staking"],
            functionName: "getToken",
            args: [count],
          });
          count++;
        } catch {
          break;
        }
      }
      const amounts = new Array(count).fill(0);
      amounts[tokenIdx] = amount;

      params.push(amounts);
      params.push(0);
      params.push(Math.floor(Date.now() / 1000) + 1200);

      funcName = "addLiquidity";
      approveInfo.spender = address;
      break;
    }
    case "withdraw": {
      address = getProtocolAddressForChain("synapse", chainId, token);
      if (!address) {
        sfConsoleError(token);
        throw new Error("Could not find address for Synapse withdraw");
      }
      assert(isHexStr(address));
      assert(isHexStr(tokenInfo?.address));
      abi = getABIForProtocol("synapse", "staking");
      const tokenIdx = await viemClient.readContract({
        address,
        abi: abis["synapse-staking"],
        functionName: "getTokenIndex",
        args: [tokenInfo?.address],
      });
      const tokenList: string[] = ProtocolTokens.synapse[chainId];
      const tokenPromises = tokenList.map((_, i) =>
        viemClient
          .readContract({
            address: address as `0x${string}`,
            abi: abis["synapse-staking"],
            functionName: "getToken",
            args: [i],
          })
          .catch(() => null),
      );
      const tokenResults: (string | null)[] = await Promise.all(tokenPromises);
      const amounts: bigint[] = tokenResults
        .map((result, i) => {
          if (result === null) return undefined;
          return i === Number(tokenIdx) ? amount : 0n;
        })
        .filter((amount) => amount !== undefined);
      const tokenAmount = await viemClient.readContract({
        address,
        abi: abis["synapse-staking"],
        functionName: "calculateTokenAmount",
        args: [amounts, false],
      });
      params.push(tokenAmount);
      params.push(tokenIdx);
      params.push(0);
      params.push(Math.floor(Date.now() / 1000) + 2400);
      funcName = "removeLiquidityOneToken";
      const lpTokenInfo = await getLPTokenInfo(
        { protocolName: "synapse", token },
        chainId,
        provider,
      );
      approveInfo.spender = address;
      approveInfo.tokenInfo = lpTokenInfo.lp || undefined;
      approveInfo.amount = tokenAmount;
      break;
    }
    default: {
      throw new Error(
        getUnsupportedActionError(action, ["deposit", "withdraw"], "Synapse"),
      );
    }
  }

  if (!address) {
    throw new Error(
      getProtocolErrorMessage(action, tokenInfo?.symbol, "synapse", chainId),
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
