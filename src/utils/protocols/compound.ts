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
} from "../index.js";
import { sfConsoleError } from "../log.js";
import type { RetryProvider } from "../retryProvider.js";
import {
  assert,
  type ChainId,
  type ContractCallParam,
  type ProtocolActionData,
  type Transaction,
  isHexStr,
} from "../types.js";
import { getABIErrorMessage, getProtocolErrorMessage } from "./index.js";

type CompoundCollateral = {
  balance: bigint;
};

type CompoundAsset = {
  asset: string;
  priceFeed: string;
  scale: bigint;
  borrowCollateralFactor: bigint;
};

export default async (
  accountAddress: string,
  action: string,
  actionData: ProtocolActionData,
): Promise<{
  transactions: Transaction[];
  funcNames: string[];
}> => {
  const { provider, poolName, amount, tokenInfo, chainId } = actionData;
  let { token } = actionData;
  if (!poolName && !token) {
    throw new Error("Missing pool and token for this compound action.");
  }

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
  token = (tokenInfo?.symbol || "").toLowerCase();
  const pool = (poolName || token).toLowerCase();
  const params: ContractCallParam[] = [];
  const comet = getProtocolAddressForChain("compound", chainId, pool);
  if (!comet) {
    throw new Error(
      getProtocolErrorMessage(
        action,
        tokenInfo?.symbol,
        "compound",
        chainId,
        poolName,
      ),
    );
  }
  const isNativeToken = (token || poolName || "").toLowerCase() === "eth";
  if (isNativeToken) value = amount || 0n;
  const bulkerKey = chainId === 1 && pool === "usdc" ? "bulker-usdc" : "bulker";

  switch (action) {
    case "claim": {
      address = getProtocolAddressForChain("compound", chainId, "rewards");
      abi = getABIForProtocol("compound", "rewards");
      params.push(comet);
      params.push(accountAddress);
      params.push(true);
      break;
    }
    case "deposit":
    case "lend":
    case "repay": {
      if (tokenInfo?.address !== NATIVE_TOKEN) {
        address = comet;
        abi = getABIForProtocol("compound", "comet");
        funcName = "supply";
        params.push(tokenInfo?.address ?? "compound token address?");
        params.push(amount || 0n);
        approveInfo.spender = address;
      } else {
        address = getProtocolAddressForChain("compound", chainId, bulkerKey);
        abi = getABIForProtocol("compound", bulkerKey);
        funcName = "invoke";
        params.push([
          chainId === 1 && pool === "usdc"
            ? 2
            : "0x414354494f4e5f535550504c595f4e41544956455f544f4b454e000000000000",
        ]);
        params.push([
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "address", "uint256"],
            [comet, accountAddress, amount],
          ),
        ]);
      }
      break;
    }
    case "borrow":
    case "withdraw": {
      if (tokenInfo?.address !== NATIVE_TOKEN) {
        address = comet;
        abi = getABIForProtocol("compound", "comet");
        funcName = "withdraw";
        params.push(tokenInfo?.address ?? "compound token address?");
        params.push(amount || 0n);
      } else {
        address = getProtocolAddressForChain("compound", chainId, bulkerKey);
        abi = getABIForProtocol("compound", bulkerKey);
        funcName = "invoke";
        params.push([
          chainId === 1 && pool === "usdc"
            ? 2
            : "0x414354494f4e5f57495448445241575f4e41544956455f544f4b454e00000000",
        ]);
        params.push([
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "address", "uint256"],
            [comet, accountAddress, amount],
          ),
        ]);
      }
      break;
    }
    default: {
      throw new Error(
        getUnsupportedActionError(
          action,
          ["claim", "deposit", "lend", "repay", "borrow", "withdraw"],
          "Compound",
        ),
      );
    }
  }

  if (!address) {
    throw new Error(
      getProtocolErrorMessage(
        action,
        tokenInfo?.symbol,
        "compound",
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
  if (action === "withdraw" && isNativeToken) {
    const extAbi = getABIForProtocol("compound", "ext");
    const contract = new ethers.Contract(comet, extAbi);
    assert(isHexStr(comet));
    assert(isHexStr(address));
    assert(isHexStr(accountAddress));
    const isAllowed = await (
      await getViemPublicClientFromEthers(provider)
    ).readContract({
      address: comet,
      abi: abis["compound-ext"],
      functionName: "isAllowed",
      args: [accountAddress, address],
    });
    if (!isAllowed) {
      const approveData = contract.interface.encodeFunctionData("allow", [
        address,
        true,
      ]);
      approveTxs.push({ to: comet, value: "0", data: approveData });
    }
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

export const getBorrowableAmountFromCompound = async (
  chainId: ChainId,
  account: string,
  symbol: string | undefined,
  provider: RetryProvider,
): Promise<number> => {
  const address = getProtocolAddressForChain("compound", chainId, symbol);
  const abi = getABIForProtocol("compound", "comet");

  if (!address) {
    throw new Error(
      getProtocolErrorMessage("borrow", symbol, "compound", chainId),
    );
  }
  if (!abi || abi.length === 0) {
    throw new Error(getABIErrorMessage(address, chainId));
  }

  try {
    const viemClient = await getViemPublicClientFromEthers(provider);
    assert(isHexStr(address));
    assert(isHexStr(account));
    const userBasic = await viemClient.readContract({
      address,
      abi: abis["compound-comet"],
      functionName: "userBasic",
      args: [account],
    });
    const baseScale = await viemClient.readContract({
      address,
      abi: abis["compound-comet"],
      functionName: "baseScale",
    });
    const assetsIn = ethers.getNumber(userBasic[3]);
    const numAssets = ethers.getNumber(
      await viemClient.readContract({
        address,
        abi: abis["compound-comet"],
        functionName: "numAssets",
      }),
    );
    const indexes = [...Array(numAssets).keys()].filter((x) =>
      isInAsset(assetsIn, x),
    );
    const assets: CompoundAsset[] = await Promise.all(
      indexes.map((x) =>
        viemClient.readContract({
          address,
          abi: abis["compound-comet"],
          functionName: "getAssetInfo",
          args: [x],
        }),
      ),
    );
    const collaterals: CompoundCollateral[] = (
      await Promise.all(
        assets.map((x) =>
          viemClient.readContract({
            address,
            abi: abis["compound-comet"],
            functionName: "userCollateral",
            args: [account, x.asset as `0x${string}`],
          }),
        ),
      )
    ).map((x) => ({ balance: x[0] }));
    const prices: bigint[] = await Promise.all(
      assets.map((x) =>
        viemClient.readContract({
          address,
          abi: abis["compound-comet"],
          functionName: "getPrice",
          args: [x.priceFeed as `0x${string}`],
        }),
      ),
    );
    let liquidity = (userBasic[0] * ethers.parseUnits("1", 8)) / baseScale;
    for (let i = 0; i < assets.length; i++) {
      liquidity +=
        (((collaterals[i].balance * prices[i]) / assets[i].scale) *
          assets[i].borrowCollateralFactor) /
        ethers.WeiPerEther;
    }
    liquidity -= await viemClient.readContract({
      address,
      abi: abis["compound-comet"],
      functionName: "borrowBalanceOf",
      args: [account],
    });
    return +ethers.formatUnits(liquidity, 8);
  } catch (err) {
    sfConsoleError(err);
  }
  return 0;
};

const isInAsset = (assetsIn: number, offset: number) => {
  return (assetsIn & (1 << offset)) !== 0;
};
