import { ethers } from "ethers";
import { abis } from "../../config/abis.js";
import { NATIVE_TOKEN } from "../../constants.js";
import { getUnsupportedActionError } from "../error.js";
import { getViemPublicClientFromEthers } from "../ethers2viem.js";
import {
  getABIForProtocol,
  getApproveData,
  getFunctionData,
  getProtocolAddressForChain,
  sfParseUnits,
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
  const {
    provider,
    poolName,
    amount: amount_,
    chainId,
    tokenInfo,
  } = actionData;
  const viemClient = await getViemPublicClientFromEthers(provider);
  const amount = amount_ || 0n;

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
    case "claim": {
      address = getProtocolAddressForChain("hop", chainId, poolName);
      if (!address) {
        throw new Error("Could not find address for Hop claim");
      }
      abi = getABIForProtocol("hop");

      funcName = "getReward";
      break;
    }
    case "deposit": {
      address = getProtocolAddressForChain(
        "hop",
        chainId,
        `${token}SaddleSwap`,
      );
      if (!address) {
        throw new Error("Could not find address for Hop deposit");
      }
      abi = getABIForProtocol("hop", "saddleswap");

      assert(isHexStr(address));
      const virtualPrice = await viemClient.readContract({
        address,
        abi: abis["hop-saddleswap"],
        functionName: "getVirtualPrice",
      });
      const minToMint =
        (((((amount * ethers.WeiPerEther) /
          sfParseUnits("1", tokenInfo?.decimals)) *
          ethers.WeiPerEther) /
          virtualPrice) *
          9n) /
        10n;

      params.push([amount, 0]);
      params.push(minToMint);
      params.push(Math.floor(Date.now() / 1000) + 60 * 20);

      funcName = "addLiquidity";

      if (tokenInfo?.address !== NATIVE_TOKEN) {
        approveInfo.spender = address;
      }
      break;
    }
    // case "stake": {
    //   let key = token;
    //   const outputToken = "TODO: lp token 1 symbol";
    //   if (outputToken.toLowerCase() !== "hop")
    //     key += `-${outputToken.toLowerCase()}`;
    //   address = getProtocolAddressForChain("hop", chainId, key);
    //   abi = getABIForProtocol("hop");
    //   params.push(amount);

    //   if (tokenInfo?.address !== NATIVE_TOKEN) {
    //     approveInfo.spender = address;
    //   }
    //   break;
    // }
    case "withdraw": {
      address = getProtocolAddressForChain(
        "hop",
        chainId,
        `${token}SaddleSwap`,
      );
      abi = getABIForProtocol("hop", "saddleswap");
      if (!address) {
        throw new Error("Could not find address for Hop withdraw");
      }

      assert(isHexStr(address));
      assert(isHexStr(tokenInfo?.address));
      const [tokenIndex, virtualPrice] = await Promise.all([
        viemClient.readContract({
          address,
          abi: abis["hop-saddleswap"],
          functionName: "getTokenIndex",
          args: [tokenInfo?.address],
        }),
        viemClient.readContract({
          address,
          abi: abis["hop-saddleswap"],
          functionName: "getVirtualPrice",
        }),
      ]);
      const amountToBurn =
        (((amount * ethers.WeiPerEther) /
          sfParseUnits("1", tokenInfo?.decimals)) *
          ethers.WeiPerEther) /
        virtualPrice;

      params.push(amountToBurn);
      params.push(tokenIndex);
      params.push((amount * 99n) / 100n);
      params.push(Math.floor(Date.now() / 1000) + 60 * 20);

      funcName = "removeLiquidityOneToken";
      break;
    }
    default: {
      throw new Error(
        getUnsupportedActionError(
          action,
          ["claim", "deposit", "withdraw"],
          "Hop",
        ),
      );
    }
  }

  if (!address) {
    throw new Error(
      getProtocolErrorMessage(
        action,
        tokenInfo?.symbol,
        "hop",
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
