import { ethers } from "ethers";
import { abis } from "../../config/abis.js";
import { NATIVE_TOKEN, NATIVE_TOKEN2 } from "../../constants.js";
import { getUnsupportedActionError } from "../error.js";
import { getViemPublicClientFromEthers } from "../ethers2viem.js";
import {
  getABIForProtocol,
  getApproveData,
  getFunctionData,
  getProtocolAddressForChain,
  sfParseUnits,
} from "../index.js";
import { sfConsoleError } from "../log.js";
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
  const { provider, poolName, amount, chainId, tokenInfo } = actionData;
  const viemClient = await getViemPublicClientFromEthers(provider);

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
    case "deposit": {
      address = getProtocolAddressForChain("curve", chainId, poolName);

      if (!address) {
        throw new Error("Invalid pool name");
      }

      abi = getABIForProtocol("curve", poolName);
      let count = 0;
      let tokenIndex = 0;
      /* eslint-disable no-await-in-loop */
      assert(isHexStr(address));
      while (true) {
        try {
          const coin = await viemClient.readContract({
            address,
            abi: abis[`curve${poolName}` as keyof typeof abis],
            functionName: "coins",
            args: [BigInt(count)],
          });
          if (
            coin.toLowerCase() === NATIVE_TOKEN2 &&
            tokenInfo?.address === NATIVE_TOKEN
          ) {
            tokenIndex = count;
          } else if (tokenInfo?.address?.toLowerCase() === coin.toLowerCase()) {
            tokenIndex = count;
          }
          count++;
        } catch {
          break;
        }
      }
      const amounts = new Array(count).fill(0);
      amounts[tokenIndex] = amount;

      if (tokenInfo?.address === NATIVE_TOKEN2) {
        value = amount || 0n;
      }

      params.push(amounts);
      params.push(0);

      funcName = "add_liquidity";

      if (tokenInfo?.address !== NATIVE_TOKEN) {
        approveInfo.spender = address;
      }
      break;
    }
    case "withdraw": {
      address = getProtocolAddressForChain("curve", chainId, poolName);
      if (!address) {
        sfConsoleError(chainId, poolName);
        throw new Error("Could not find address for Curve withdraw");
      }
      abi = getABIForProtocol("curve", poolName);
      let tokenIndex = 0;
      /* eslint-disable no-await-in-loop */
      while (true) {
        try {
          assert(isHexStr(address));
          const coin = await viemClient.readContract({
            address,
            abi: abis[`curve${poolName}` as keyof typeof abis],
            functionName: "coins",
            args: [BigInt(tokenIndex)],
          });
          if (
            coin.toLowerCase() === NATIVE_TOKEN2 &&
            tokenInfo?.address === NATIVE_TOKEN
          ) {
            break;
          }
          if (tokenInfo?.address?.toLowerCase() === coin.toLowerCase()) {
            break;
          }
          tokenIndex++;
        } catch {
          throw new Error("Token is invalid");
        }
      }

      const virtualPrice = await viemClient.readContract({
        address,
        abi: abis[`curve${poolName}` as keyof typeof abis],
        functionName: "get_virtual_price",
      });
      const poolTokenAmount =
        ((((amount || 0n) * ethers.WeiPerEther) / virtualPrice) *
          ethers.WeiPerEther) /
        sfParseUnits("1", tokenInfo?.decimals);

      params.push(poolTokenAmount);
      params.push(tokenIndex);
      params.push(((amount || 0n) * 99n) / 100n);

      funcName = "remove_liquidity_one_coin";
      break;
    }
    default: {
      throw new Error(
        getUnsupportedActionError(action, ["deposit", "withdraw"], "Curve"),
      );
    }
  }

  if (!address) {
    throw new Error(
      getProtocolErrorMessage(
        action,
        tokenInfo?.symbol,
        "curve",
        chainId,
        poolName,
      ),
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
