import axios from "axios";
import { ethers } from "ethers";
import type { ParamType } from "ethers";
import { abis } from "../../config/abis.js";
import { TICKER_URL, TOKEN_URL } from "../../config/gmx/endpoints.js";
import Markets, { availableMarkets } from "../../config/gmx/markets.js";
import ProtocolPools from "../../config/pools.js";
import { NATIVE_TOKEN } from "../../constants.js";
import { getUnsupportedActionError } from "../error.js";
import { getViemPublicClientFromEthers } from "../ethers2viem.js";
import {
  getABIForProtocol,
  getApproveData,
  getChainNameFromId,
  getCoinData,
  getErrorMessage,
  getFunctionData,
  getProtocolAddressForChain,
  getRpcUrlForChain,
  getTokenInfoForChain,
  sfParseUnits,
} from "../index.js";
import { usePrintError } from "../log.js";
import { RetryProvider } from "../retryProvider.js";
import { assert, isDefined, isHexStr } from "../types.js";
import type {
  ChainId,
  ContractCallParam,
  GMXPosition,
  JSONObject,
  PortfolioToken,
  ProtocolActionData,
  TokenInfo,
  Transaction,
} from "../types.js";
import { getABIErrorMessage, getProtocolErrorMessage } from "./index.js";

export type PoolData = {
  market: string;
  indexToken: string;
  longToken: string;
  shortToken: string;
};

type GMXClosePosition = {
  initialCollateralDeltaAmount: bigint;
  isLong: boolean;
  sizeDeltaUsd: bigint;
  acceptablePrice: bigint;
};

type Multicall = {
  method: string;
  params: (JSONObject | string | bigint | null)[];
};

export default async function gmx(
  accountAddress: string,
  action: string,
  actionData: ProtocolActionData,
): Promise<{
  transactions: Transaction[];
  funcNames: string[];
}> {
  const {
    provider,
    poolName,
    token,
    amount,
    chainId,
    tokenInfo,
    inputTokenInfo,
    inputAmount,
    leverageMultiplier: levMul,
  } = actionData;
  let { outputTokenInfo } = actionData;

  if (!Markets[chainId]) {
    throw new Error(
      `GMX is not supported on ${getChainNameFromId(
        chainId,
      )}. The available chains are arbitrum and avalanche.`,
    );
  }

  const leverageMultiplier = levMul ?? "1";
  if (["long", "short", "close"].includes(action)) {
    if (action !== "close" && !outputTokenInfo) {
      throw new Error(`Output token is required for ${action}`);
    }
    if (Number.parseFloat(leverageMultiplier.toString()) < 0) {
      throw new Error("Leverage multiplier must be greater than zero");
    }
    let market =
      (outputTokenInfo?.symbol || inputTokenInfo?.symbol)?.toLowerCase() ??
      "gmx market?";
    if (market?.startsWith("w")) market = market.slice(1);
    if (!Markets[chainId].includes(market)) {
      throw new Error(
        `${
          action === "close" ? "clos" : action
        }ing ${market} is not supported on gmx. The available tokens to ${action} are ${availableMarkets(
          chainId,
        )}.`,
      );
    }
    outputTokenInfo = await getGMXTokenInfo(chainId, market);
  }
  let wrapData: Transaction | undefined;
  let approveTxs: Transaction[] = [];
  let address: string | null = "";
  let abi: ethers.InterfaceAbi = [];
  let funcName = action;
  let value = 0n;
  const isPerpAction = ["long", "short"].includes(action);
  const approveInfo = {
    spender: "",
    tokenInfo: isPerpAction ? inputTokenInfo : tokenInfo,
    amount: isPerpAction ? inputAmount : amount,
  };
  const params: ContractCallParam[] = [];

  const wethAddr = await getTokenInfoForChain(
    "weth",
    getChainNameFromId(chainId),
  );

  switch (action) {
    case "deposit": {
      address = getProtocolAddressForChain("gmx", chainId, "exchangeRouter");
      if (!address) {
        throw new Error("Could not find router for GMX deposit");
      }
      const depositVault = getProtocolAddressForChain(
        "gmx",
        chainId,
        "depositVault",
      );
      const v2Router = getProtocolAddressForChain("gmx", chainId, "v2Router");
      if (!v2Router) {
        throw new Error("Could not find v2Router for GMX deposit");
      }
      let poolData = getPoolData(chainId, poolName);
      if (!poolData) {
        if (poolName?.toLowerCase().startsWith("w")) {
          poolData = getPoolData(chainId, poolName.slice(1));
        }
        throw new Error(`${poolName} pool not supported on chain ${chainId}`);
      }

      abi = getABIForProtocol("gmx", "exchange-router");
      const contract = new ethers.Contract(address, abi);

      value = await getExecutionFee(provider, chainId, action);
      if (tokenInfo?.address === NATIVE_TOKEN) {
        wrapData = await getFunctionData(
          wethAddr?.address,
          abis.weth,
          "deposit",
          [],
          amount?.toString(),
        );
      }
      const sendWntData = contract.interface.encodeFunctionData("sendWnt", [
        depositVault,
        value,
      ]);
      const sendTokensData = contract.interface.encodeFunctionData(
        "sendTokens",
        [
          tokenInfo?.address === ethers.ZeroAddress
            ? wethAddr?.address
            : tokenInfo?.address,
          depositVault,
          amount,
        ],
      );
      const createDepositData = contract.interface.encodeFunctionData(
        "createDeposit",
        [
          [
            accountAddress,
            ethers.ZeroAddress,
            ethers.ZeroAddress,
            poolData.market,
            poolData.longToken,
            poolData.shortToken,
            [],
            [],
            0,
            false,
            value,
            0,
          ],
        ],
      );

      params.push([sendWntData, sendTokensData, createDepositData]);

      funcName = "multicall";
      approveInfo.spender = v2Router;
      if (tokenInfo?.address === NATIVE_TOKEN) {
        approveInfo.tokenInfo = await getTokenInfoForChain(
          "weth",
          getChainNameFromId(chainId),
        );
      }
      break;
    }
    case "stake": {
      if (token?.toLowerCase() !== "gmx") {
        throw new Error("Token not supported");
      }

      address = getProtocolAddressForChain("gmx", chainId, "gmxRewardRouter");
      abi = getABIForProtocol("gmx", "reward-router");
      params.push(amount || 0n);

      funcName = "stakeGmx";

      if (tokenInfo?.address !== NATIVE_TOKEN) {
        const stakeRouter = getProtocolAddressForChain(
          "gmx",
          chainId,
          `staked${token.toUpperCase()}Tracker`,
        );
        if (!stakeRouter) {
          throw new Error("Could not find router for GMX staking");
        }
        approveInfo.spender = stakeRouter;
      }
      break;
    }
    case "unstake": {
      if (token?.toLowerCase() !== "gmx") {
        throw new Error("Token not supported");
      }

      address = getProtocolAddressForChain("gmx", chainId, "gmxRewardRouter");
      abi = getABIForProtocol("gmx", "reward-router");
      params.push(amount || 0n);

      funcName = "unstakeGmx";
      break;
    }
    case "withdraw": {
      address = getProtocolAddressForChain("gmx", chainId, "exchangeRouter");
      if (!address) {
        throw new Error("Could not find router for GMX withdraw");
      }
      const withdrawalVault = getProtocolAddressForChain(
        "gmx",
        chainId,
        "withdrawalVault",
      );
      const v2Router = getProtocolAddressForChain("gmx", chainId, "v2Router");
      if (!v2Router) {
        throw new Error("Could not find v2Router for GMX withdraw");
      }
      let poolData = getPoolData(chainId, poolName);
      if (!poolData) {
        if (poolName?.toLowerCase().startsWith("w")) {
          poolData = getPoolData(chainId, poolName.slice(1));
        }
        throw new Error(`${poolName} pool not supported on chain ${chainId}`);
      }

      abi = getABIForProtocol("gmx", "exchange-router");
      const contract = new ethers.Contract(address, abi);

      value = await getExecutionFee(provider, chainId, action);
      const sendWntData = contract.interface.encodeFunctionData("sendWnt", [
        withdrawalVault,
        value,
      ]);
      const sendTokensData = contract.interface.encodeFunctionData(
        "sendTokens",
        [
          poolData.market,
          withdrawalVault,
          ethers.parseEther(
            ethers.formatUnits(amount || 0n, tokenInfo?.decimals),
          ),
        ],
      );
      const createWithdrawalData = contract.interface.encodeFunctionData(
        "createWithdrawal",
        [
          [
            accountAddress,
            ethers.ZeroAddress,
            ethers.ZeroAddress,
            poolData.market,
            [],
            [],
            1,
            1,
            false,
            value,
            0,
          ],
        ],
      );

      params.push([sendWntData, sendTokensData, createWithdrawalData]);

      funcName = "multicall";

      approveInfo.tokenInfo = {
        symbol: tokenInfo?.symbol || "",
        address: poolData.market,
        decimals: 18,
      };
      approveInfo.amount = ethers.parseEther(
        ethers.formatUnits(amount || 0n, tokenInfo?.decimals),
      );
      approveInfo.spender = v2Router;
      break;
    }
    case "long":
    case "short":
    case "close":
      return await getPerpTx(accountAddress, action, {
        ...actionData,
        outputTokenInfo,
      });
    default: {
      throw new Error(
        getUnsupportedActionError(
          action,
          ["deposit", "stake", "withdraw", "unstake", "long", "short", "close"],
          "GMX",
        ),
      );
    }
  }

  if (!address) {
    throw new Error(
      getProtocolErrorMessage(
        action,
        tokenInfo?.symbol || "",
        "gmx",
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
  if (wrapData) {
    return {
      transactions: [wrapData, ...approveTxs, data],
      funcNames: [
        "Deposit",
        ...Array(approveTxs.length).fill("Approve"),
        action,
      ],
    };
  }
  return {
    transactions: [...approveTxs, data],
    funcNames: [...Array(approveTxs.length).fill("Approve"), action],
  };
}

export const getPoolData = (
  chainId: ChainId,
  poolName?: string,
): PoolData | undefined => {
  const effectiveChainId = chainId ?? 42161;
  let ret =
    ProtocolPools.gmx[effectiveChainId]?.[(poolName || "").toLowerCase()];
  if (!ret) {
    ret =
      ProtocolPools.gmx[effectiveChainId.toString()]?.[
        (poolName || "").toLowerCase()
      ];
  }
  return ret;
};

export const getPerpTx = async (
  accountAddress: string,
  action: string,
  actionData: ProtocolActionData,
) => {
  const {
    provider,
    chainId,
    chainName,
    inputTokenInfo,
    inputAmount,
    outputTokenInfo,
    leverageMultiplier: levMul,
  } = actionData;

  const leverageMultiplier = levMul || "1";

  const transactions: Transaction[] = [];
  const funcNames: string[] = [];

  let poolData = getPoolData(
    chainId,
    `${(outputTokenInfo?.symbol || "").toLowerCase()}-usdc`,
  );
  if (!poolData) {
    poolData = getPoolData(
      chainId,
      `usdc-${(outputTokenInfo?.symbol || "").toLowerCase()}`,
    );
    if (!poolData)
      throw new Error(
        `${(outputTokenInfo?.symbol || "").toLowerCase()}-usdc pool not supported on chain ${chainId}`,
      );
  }

  const exchangeRouterAddress = getProtocolAddressForChain(
    "gmx",
    chainId,
    "exchangeRouter",
  );
  if (!exchangeRouterAddress) {
    throw new Error("Could not find router for GMX perp action");
  }
  const exchangeRouterAbi = getABIForProtocol("gmx", "exchange-router");
  const exchangeRouter = new ethers.Contract(
    exchangeRouterAddress,
    exchangeRouterAbi,
  );

  const orderVaultAddress = getProtocolAddressForChain(
    "gmx",
    chainId,
    "orderVault",
  );
  const isNativePayment = inputTokenInfo?.address === NATIVE_TOKEN;
  const wntCollateralAmount =
    action !== "close" && isNativePayment ? (inputAmount ?? 0n) : 0n;
  let swapPath: string[] = [];
  if (action !== "close" && inputTokenInfo?.symbol !== "usdc") {
    swapPath = getSwapPath(
      chainId,
      action,
      inputTokenInfo?.symbol ?? "",
      outputTokenInfo?.symbol ?? "",
    );
  }
  let executionFee = await getExecutionFee(
    provider,
    chainId,
    action,
    swapPath.length,
  );
  const totalWntAmount = wntCollateralAmount + executionFee;
  const wrappedNative = await getTokenInfoForChain(
    chainId === 42161 ? "WETH" : "WAVAX",
    chainName,
  );
  let initialCollateralTokenAddress = isNativePayment
    ? wrappedNative?.address
    : inputTokenInfo?.address;

  let currentPrice: number | undefined;
  try {
    currentPrice = (
      await getCoinData(accountAddress, outputTokenInfo?.symbol, chainId)
    ).price;
  } catch {
    currentPrice = (
      await getCoinData(accountAddress, outputTokenInfo?.symbol, 1)
    ).price;
  }
  assert(isDefined(currentPrice));
  let acceptablePrice =
    sfParseUnits(currentPrice.toString(), 30) /
    sfParseUnits("1", outputTokenInfo?.decimals);
  let price: number | undefined = 0;
  try {
    price = (await getCoinData(accountAddress, inputTokenInfo?.symbol, chainId))
      .price;
  } catch {
    /* empty */
  }
  if (!price) {
    throw new Error(
      `Failed to get price of ${inputTokenInfo?.symbol} on chain ${chainId}`,
    );
  }
  let sizeDeltaUsd = 0n;
  if (action !== "close") {
    const amount = +ethers.formatUnits(
      inputAmount ?? 0n,
      inputTokenInfo?.decimals,
    );
    const usdMin = sfParseUnits(`${amount * price}`, 30);
    const precisionFactor = 1000;
    const leverageMultiplierFixed = ethers.getBigInt(
      Math.round(
        Number.parseFloat(leverageMultiplier.toString()) * precisionFactor,
      ),
    );
    sizeDeltaUsd =
      (usdMin * leverageMultiplierFixed * 999n) /
      ethers.getBigInt(1000 * precisionFactor); // slippage 0.1%
  }

  const initialCollateralDeltaAmount = 0n;
  const isLong = action === "long";
  const positionsToClose: GMXClosePosition[] = [];
  if (action === "close") {
    const positions = await getGMXPositions(
      accountAddress,
      actionData,
      poolData,
    );
    if (!positions || positions.length === 0)
      throw new Error(
        `No GMX position to close for ${accountAddress} on ${chainName}`,
      );

    initialCollateralTokenAddress = (
      await getTokenInfoForChain("usdc", chainName)
    )?.address;

    const percentReduction = actionData.percentReduction
      ?.toString()
      ?.toLowerCase();
    const percent =
      percentReduction === "half"
        ? 5000
        : Number.parseFloat(percentReduction || "100") * 100;

    for (const pos of positions) {
      positionsToClose.push({
        initialCollateralDeltaAmount:
          (pos.numbers.collateralAmount * BigInt(percent)) / 10000n,
        isLong: pos.flags.isLong,
        sizeDeltaUsd: (pos.numbers.sizeInUsd * BigInt(percent)) / 10000n,
        acceptablePrice: pos.flags.isLong ? 0n : ethers.MaxUint256,
      });
    }
  } else {
    const delta = 200;
    acceptablePrice =
      (acceptablePrice *
        ethers.getBigInt(isLong ? 10000 + delta : 10000 - delta)) /
      10000n;
  }

  const orderParams = {
    addresses: {
      receiver: accountAddress,
      cancellationReceiver: accountAddress,
      initialCollateralToken: initialCollateralTokenAddress,
      callbackContract: ethers.ZeroAddress,
      market: poolData.market,
      swapPath,
      uiFeeReceiver: ethers.ZeroAddress,
    },
    numbers: {
      sizeDeltaUsd,
      acceptablePrice,
      executionFee,
      initialCollateralDeltaAmount,
      triggerPrice: 0n,
      callbackGasLimit: 0n,
      minOutputAmount: 0n,
    },
    orderType: action === "close" ? 4 : 2, // OrderType.MarketIncrease/Decrease
    decreasePositionSwapType: action === "close" ? 1 : 0, // DecreasePositionSwapType.NoSwap/SwapPnlTokenToCollateralToken
    isLong,
    shouldUnwrapNativeToken: isNativePayment,
    autoCancel: false,
    referralCode: ethers.ZeroHash,
  };

  const multicall: (Multicall | undefined)[] = [];
  if (action !== "close") {
    multicall.push(
      { method: "sendWnt", params: [orderVaultAddress, totalWntAmount] },
      !isNativePayment
        ? {
            method: "sendTokens",
            params: [
              inputTokenInfo?.address ?? "",
              orderVaultAddress,
              inputAmount ?? 0n,
            ],
          }
        : undefined,
      { method: "createOrder", params: [orderParams] },
    );
  } else {
    for (const pos of positionsToClose) {
      multicall.push({
        method: "sendWnt",
        params: [orderVaultAddress, executionFee],
      });
      multicall.push({
        method: "createOrder",
        params: [
          {
            ...orderParams,
            numbers: {
              ...orderParams.numbers,
              sizeDeltaUsd: pos.sizeDeltaUsd,
              acceptablePrice: pos.acceptablePrice,
              initialCollateralDeltaAmount: pos.initialCollateralDeltaAmount,
            },
            isLong: pos.isLong,
          },
        ],
      });
    }
    executionFee *= ethers.getBigInt(positionsToClose.length);
  }
  const params = multicall.filter(Boolean).map((call) => {
    if (call?.method) {
      return exchangeRouter.interface.encodeFunctionData(
        call.method,
        call.params,
      );
    }
    throw new Error("Invalid multicall entry");
  });

  if (action !== "close" && inputTokenInfo?.address !== NATIVE_TOKEN) {
    const v2Router = getProtocolAddressForChain("gmx", chainId, "v2Router");
    assert(isHexStr(inputTokenInfo?.address));
    assert(isHexStr(accountAddress));
    assert(isHexStr(v2Router));
    const allowance = await (
      await getViemPublicClientFromEthers(provider)
    ).readContract({
      address: inputTokenInfo?.address,
      abi: abis.erc20,
      functionName: "allowance",
      args: [accountAddress, v2Router],
    });
    if (allowance < (inputAmount ?? 0n)) {
      if (allowance !== 0n) {
        transactions.push(
          await getFunctionData(
            inputTokenInfo?.address ?? "",
            abis.erc20,
            "approve",
            [v2Router, 0],
            "0",
          ),
        );
        funcNames.push("Approve");
      }
      transactions.push(
        ...(await getApproveData(
          provider,
          inputTokenInfo,
          inputAmount,
          accountAddress,
          v2Router || "",
        )),
      );
      funcNames.push("Approve");
    }
  }

  transactions.push(
    await getFunctionData(
      exchangeRouterAddress,
      exchangeRouterAbi,
      "multicall",
      [params],
      (action !== "close" && isNativePayment
        ? totalWntAmount
        : executionFee
      ).toString(),
    ),
  );
  funcNames.push(action);

  return { transactions, funcNames };
};

const hashData = (
  dataTypes: (string | ParamType)[],
  dataValues: (string | boolean)[],
) => {
  const bytes = ethers.AbiCoder.defaultAbiCoder().encode(dataTypes, dataValues);
  return ethers.keccak256(ethers.getBytes(bytes)) as `0x${string}`;
};

const hashString = (str: string) => hashData(["string"], [str]);

export const getGMXPositions = async (
  accountAddress: string,
  args: { provider: RetryProvider; chainId: ChainId },
  poolData: PoolData | undefined = undefined,
): Promise<GMXPosition[]> => {
  const printError = usePrintError(accountAddress);
  const viemClient = await getViemPublicClientFromEthers(args.provider);

  try {
    const { chainId } = args;
    const dataStoreAddress = getProtocolAddressForChain(
      "gmx",
      chainId,
      "dataStore",
    );
    if (!dataStoreAddress) {
      throw new Error("Could not find data store for fetching GMX positions");
    }
    assert(isHexStr(dataStoreAddress));
    const readerAddress = getProtocolAddressForChain("gmx", chainId, "reader");
    if (!readerAddress) {
      throw new Error("Could not find reader for fetching GMX positions");
    }
    assert(isHexStr(readerAddress));

    const hashKey = hashData(
      ["bytes32", "address"],
      [hashString("ACCOUNT_POSITION_LIST"), accountAddress],
    );
    const count: number = ethers.getNumber(
      await viemClient.readContract({
        address: dataStoreAddress,
        abi: abis["gmx-data-store"],
        functionName: "getBytes32Count",
        args: [hashKey],
      }),
    );
    if (count === 0) return [];

    const positionKeys = await viemClient.readContract({
      address: dataStoreAddress,
      abi: abis["gmx-data-store"],
      functionName: "getBytes32ValuesAt",
      args: [hashKey, 0n, BigInt(count)],
    });
    const positionData = await Promise.all(
      positionKeys.map((x) =>
        viemClient.readContract({
          address: readerAddress,
          abi: abis["gmx-reader"],
          functionName: "getPosition",
          args: [dataStoreAddress, x],
        }),
      ),
    );
    const positions = positionData.map(
      (x) =>
        ({
          addresses: {
            market: x.addresses.market,
            swapPath: [],
          },
          numbers: {
            collateralAmount: x.numbers.collateralAmount,
            sizeInUsd: x.numbers.sizeInUsd,
            updatedAtTime: x.flags.isLong
              ? x.numbers.increasedAtTime
              : x.numbers.decreasedAtTime,
          },
          flags: {
            isLong: x.flags.isLong,
          },
        }) as GMXPosition,
    );

    if (!poolData) return positions;
    return positions.filter(
      (x) => x.addresses.market.toLowerCase() === poolData.market.toLowerCase(),
    );
  } catch (err: unknown) {
    printError("Error getting positions", getErrorMessage(err));
  }
  return [];
};

export const getGMXMarket = async (
  accountAddress: string | undefined,
  chainId: ChainId,
  outToken: string,
) => {
  const printError = usePrintError(accountAddress);
  const rpc = getRpcUrlForChain(chainId);
  const provider = new RetryProvider(rpc, chainId);
  const viemClient = await getViemPublicClientFromEthers(provider);

  let poolData = getPoolData(chainId, `${outToken}-usdc`);
  if (!poolData) {
    poolData = getPoolData(chainId, `usdc-${outToken}`);
    if (!poolData)
      throw new Error(
        `${outToken}-usdc pool not supported on chain ${chainId}`,
      );
  }

  try {
    const {
      data: tickers,
    }: {
      data: { tokenAddress: string; minPrice: string; maxPrice: string }[];
    } = await axios.get(TICKER_URL[chainId]);
    const tokenPrices: Record<string, { min: bigint; max: bigint }> = {};

    for (const x of tickers) {
      tokenPrices[x.tokenAddress.toLowerCase()] = {
        min: ethers.getBigInt(x.minPrice),
        max: ethers.getBigInt(x.maxPrice),
      };
    }

    const dataStoreAddress = getProtocolAddressForChain(
      "gmx",
      chainId,
      "dataStore",
    );
    if (!dataStoreAddress) {
      throw new Error("Could not find data store for fetching GMX positions");
    }
    assert(isHexStr(dataStoreAddress));
    const readerAddress = getProtocolAddressForChain("gmx", chainId, "reader");
    if (!readerAddress) {
      throw new Error("Could not find reader for fetching GMX markets");
    }
    assert(isHexStr(readerAddress));

    const hashKey = hashString("MARKET_LIST");
    const count = await viemClient.readContract({
      address: dataStoreAddress,
      abi: abis["gmx-data-store"],
      functionName: "getAddressCount",
      args: [hashKey],
    });
    if (count === 0n) return {};

    const markets = [
      ...(await viemClient.readContract({
        address: readerAddress,
        abi: abis["gmx-reader"],
        functionName: "getMarkets",
        args: [hashKey, 0n, count],
      })),
    ];
    const marketIndex = markets.findIndex(
      (x) => x.marketToken.toLowerCase() === poolData.market.toLowerCase(),
    );
    const marketPrices = [
      {
        indexTokenPrice: getTokenPrice(poolData.indexToken, tokenPrices),
        longTokenPrice: getTokenPrice(poolData.longToken, tokenPrices),
        shortTokenPrice: getTokenPrice(poolData.shortToken, tokenPrices),
      },
    ];
    const marketData = await viemClient.readContract({
      address: readerAddress,
      abi: abis["gmx-reader"],
      functionName: "getMarketInfoList",
      args: [
        dataStoreAddress,
        marketPrices,
        BigInt(marketIndex),
        BigInt(marketIndex + 1),
      ],
    });
    const funding =
      (ethers.getNumber(
        marketData[0].nextFunding.fundingFactorPerSecond / ethers.WeiPerEther,
      ) *
        3600) /
      1e12;

    let interest = await viemClient.readContract({
      address: dataStoreAddress,
      abi: abis["gmx-data-store"],
      functionName: "getUint",
      args: [
        hashData(
          ["bytes32", "address", "address", "bool"],
          [
            hashString("OPEN_INTEREST"),
            poolData.market,
            poolData.longToken,
            true,
          ],
        ),
      ],
    });
    if (poolData.longToken === poolData.shortToken) {
      interest *= 2n;
    } else {
      interest += await viemClient.readContract({
        address: dataStoreAddress,
        abi: abis["gmx-data-store"],
        functionName: "getUint",
        args: [
          hashData(
            ["bytes32", "address", "address", "bool"],
            [
              hashString("OPEN_INTEREST"),
              poolData.market,
              poolData.shortToken,
              false,
            ],
          ),
        ],
      });
    }
    interest /= sfParseUnits("1", 30);

    return { funding, interest: ethers.getNumber(interest) };
  } catch (err) {
    printError("Error getting gmx markets", chainId, outToken, err);
    return {};
  }
};

const getTokenPrice = (
  token: string,
  tokenPrices: Record<string, { min: bigint; max: bigint }>,
) => {
  if (token === ethers.ZeroAddress) {
    return { min: ethers.getBigInt(0), max: ethers.getBigInt(0) };
  }

  const stablecoinPrices = {
    ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831".toLowerCase()]: sfParseUnits(
      "1",
      24,
    ),
    ["0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8".toLowerCase()]: sfParseUnits(
      "1",
      24,
    ),
    ["0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9".toLowerCase()]: sfParseUnits(
      "1",
      24,
    ),
    ["0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1".toLowerCase()]: sfParseUnits(
      "1",
      12,
    ),
    ["0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e".toLowerCase()]: sfParseUnits(
      "1",
      24,
    ),
    ["0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664".toLowerCase()]: sfParseUnits(
      "1",
      24,
    ),
    ["0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7".toLowerCase()]: sfParseUnits(
      "1",
      24,
    ),
    ["0xc7198437980c041c805A1EDcbA50c1Ce5db95118".toLowerCase()]: sfParseUnits(
      "1",
      24,
    ),
    ["0xd586E7F844cEa2F87f50152665BCbc2C279D8d70".toLowerCase()]: sfParseUnits(
      "1",
      12,
    ),
  };

  let price = tokenPrices[token.toLowerCase()];

  if (!price) {
    price = {
      min: stablecoinPrices[token.toLowerCase()],
      max: stablecoinPrices[token.toLowerCase()],
    };
  }

  if (!price) {
    throw new Error(`Could not get price for ${token}`);
  }

  return price;
};

const getExecutionFee = async (
  provider: RetryProvider,
  chainId: ChainId,
  action: string,
  swapCount = 0,
) => {
  const viemClient = await getViemPublicClientFromEthers(provider);
  const { gasPrice } = await provider.getFeeData();

  const dataStoreAddress = getProtocolAddressForChain(
    "gmx",
    chainId,
    "dataStore",
  );
  if (!dataStoreAddress) {
    throw new Error("Could not find data store for fetching GMX positions");
  }
  assert(isHexStr(dataStoreAddress));

  const baseGas = await viemClient.readContract({
    address: dataStoreAddress,
    abi: abis["gmx-data-store"],
    functionName: "getUint",
    args: [hashString("ESTIMATED_GAS_FEE_BASE_AMOUNT")],
  });
  const multiplierFactor = await viemClient.readContract({
    address: dataStoreAddress,
    abi: abis["gmx-data-store"],
    functionName: "getUint",
    args: [hashString("ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR")],
  });
  const floatPrecision = sfParseUnits("1", 30);

  let estimatedGas = 0n;
  switch (action) {
    case "deposit":
      estimatedGas = await viemClient.readContract({
        address: dataStoreAddress,
        abi: abis["gmx-data-store"],
        functionName: "getUint",
        args: [
          hashData(
            ["bytes32", "bool"],
            [hashString("DEPOSIT_GAS_LIMIT"), true],
          ),
        ],
      });
      break;
    case "withdraw":
      estimatedGas = await viemClient.readContract({
        address: dataStoreAddress,
        abi: abis["gmx-data-store"],
        functionName: "getUint",
        args: [hashString("WITHDRAWAL_GAS_LIMIT")],
      });
      break;
    case "long":
    case "short":
      estimatedGas = await viemClient.readContract({
        address: dataStoreAddress,
        abi: abis["gmx-data-store"],
        functionName: "getUint",
        args: [hashString("INCREASE_ORDER_GAS_LIMIT")],
      });
      break;
    case "close":
      estimatedGas = await viemClient.readContract({
        address: dataStoreAddress,
        abi: abis["gmx-data-store"],
        functionName: "getUint",
        args: [hashString("DECREASE_ORDER_GAS_LIMIT")],
      });
      break;
    default:
      break;
  }
  const gasPerSwap = await viemClient.readContract({
    address: dataStoreAddress,
    abi: abis["gmx-data-store"],
    functionName: "getUint",
    args: [hashString("SINGLE_SWAP_GAS_LIMIT")],
  });

  return ethers.getBigInt(
    (((estimatedGas +
      gasPerSwap * ethers.getBigInt(swapCount + (action === "close" ? 1 : 0))) *
      multiplierFactor) /
      floatPrecision +
      baseGas) *
      (gasPrice ?? 0n),
  );
};

export const simulateExecute = async (
  provider: RetryProvider,
  chainId: ChainId,
  key: `0x${string}`,
  action?: string,
) => {
  const viemClient = await getViemPublicClientFromEthers(provider);
  const exchangeRouterAddress = getProtocolAddressForChain(
    "gmx",
    chainId,
    "exchangeRouter",
  );
  if (!exchangeRouterAddress) {
    throw new Error("Could not find router for GMX simulation");
  }
  const exchangeRouterAbi = getABIForProtocol("gmx", "exchange-router");
  const exchangeRouter = new ethers.Contract(
    exchangeRouterAddress,
    exchangeRouterAbi,
  );
  const dataStoreAddress = getProtocolAddressForChain(
    "gmx",
    chainId,
    "dataStore",
  );
  if (!dataStoreAddress) {
    throw new Error("Could not find data store for fetching GMX positions");
  }
  const readerAddress = getProtocolAddressForChain("gmx", chainId, "reader");
  if (!readerAddress) {
    throw new Error("Could not find reader for GMX simulation");
  }
  assert(isHexStr(dataStoreAddress));
  assert(isHexStr(readerAddress));

  let entityMarket: string | undefined;
  let entityUpdatedAt: bigint | undefined;
  let funcName: string;
  let swapPath: string[] = [];
  if (action === "deposit") {
    funcName = "simulateExecuteDeposit";
    const data = await viemClient.readContract({
      address: readerAddress,
      abi: abis["gmx-reader"],
      functionName: "getDeposit",
      args: [dataStoreAddress, key],
    });
    entityMarket = data.addresses.market;
    entityUpdatedAt = data.numbers.updatedAtTime;
  } else if (action === "withdraw") {
    funcName = "simulateExecuteWithdrawal";
    const data = await viemClient.readContract({
      address: readerAddress,
      abi: abis["gmx-reader"],
      functionName: "getWithdrawal",
      args: [dataStoreAddress, key],
    });
    entityMarket = data.addresses.market;
    entityUpdatedAt = data.numbers.updatedAtTime;
  } else {
    funcName = "simulateExecuteOrder";
    const data = await viemClient.readContract({
      address: readerAddress,
      abi: abis["gmx-reader"],
      functionName: "getOrder",
      args: [dataStoreAddress, key],
    });
    entityMarket = data.addresses.market;
    swapPath = [...data.addresses.swapPath];
    entityUpdatedAt = data.numbers.updatedAtTime;
  }
  const {
    data: tickers,
  }: {
    data: { tokenAddress: string; minPrice: string; maxPrice: string }[];
  } = await axios.get(TICKER_URL[chainId]);
  const market: PoolData | undefined = (
    Object.values(ProtocolPools.gmx[chainId]) as PoolData[]
  ).find((x) => x.market.toLowerCase() === entityMarket.toLowerCase());
  if (!market) {
    throw new Error(`Could not find market for ${entityMarket}`);
  }
  const tokens = [market.longToken, market.shortToken];
  if (!tokens.includes(market.indexToken) && market.indexToken !== NATIVE_TOKEN)
    tokens.splice(0, 0, market.indexToken);
  if (swapPath.length > 0) {
    for (const path of swapPath) {
      const swapMarket: PoolData | undefined = (
        Object.values(ProtocolPools.gmx[chainId]) as PoolData[]
      ).find((x) => x.market.toLowerCase() === path.toLowerCase());
      if (!swapMarket) {
        throw new Error(`Could not find market for ${path}`);
      }
      if (
        !tokens.includes(swapMarket.indexToken) &&
        swapMarket.indexToken !== NATIVE_TOKEN
      ) {
        tokens.push(swapMarket.indexToken);
      }
      if (!tokens.includes(swapMarket.longToken)) {
        tokens.push(swapMarket.longToken);
      }
      if (!tokens.includes(swapMarket.shortToken)) {
        tokens.push(swapMarket.shortToken);
      }
    }
  }
  const prices: { min: bigint; max: bigint }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const ticker = tickers.find((x) => x.tokenAddress === tokens[i]);
    if (!ticker) continue;
    prices.push({
      min: ethers.getBigInt(ticker.minPrice),
      max: ethers.getBigInt(ticker.maxPrice),
    });
  }

  const params: unknown[] = [
    key,
    {
      primaryTokens: tokens,
      primaryPrices: prices,
      minTimestamp: entityUpdatedAt,
      maxTimestamp: entityUpdatedAt ?? 0n + 300n,
    },
  ];

  if (action === "withdraw") {
    params.push(0);
  }

  return {
    to: exchangeRouterAddress,
    value: "0",
    data: exchangeRouter.interface.encodeFunctionData(funcName, params),
  };
};

const getSwapPath = (
  chainId: ChainId,
  action: string,
  inToken: string,
  outToken: string,
) => {
  let inSymbol = inToken.toLowerCase();
  if (inSymbol.startsWith("w")) inSymbol = inSymbol.slice(1);
  if (inSymbol === "usdt" && chainId === 43114) {
    const thisPool = getPoolData(chainId, "usdt-usdt.e");
    if (!thisPool) {
      throw new Error("Could not find Avalanche pool data for GMX.");
    }
    const path: string[] = [];
    path.push(thisPool.market);
    path.push(thisPool.market);
    return path;
  }

  let market = getPoolData(chainId, `${inSymbol}-usdc`);
  if (!market) {
    market = getPoolData(chainId, `usdc-${inSymbol}`);
    if (!market) {
      throw new Error(
        `${inSymbol} is not supported as collateral to ${action} ${outToken}.`,
      );
    }
  }
  return [market.market];
};

export const getGMXTokenInfo = async (
  chainId: ChainId,
  token: string,
): Promise<TokenInfo> => {
  let symbol = token?.toLowerCase();
  if (symbol?.startsWith("w")) symbol = symbol?.slice(1);

  let tokenInfo: TokenInfo | undefined;
  try {
    const {
      data: { tokens },
    }: { data: { tokens: TokenInfo[] } } = await axios.get(TOKEN_URL[chainId]);
    tokenInfo = tokens.find((x) => x.symbol.toLowerCase() === symbol);
    if (!tokenInfo)
      tokenInfo = tokens.find((x) => x.symbol.toLowerCase() === `w${symbol}`);
  } catch {
    /* empty */
  }
  return tokenInfo || { symbol: token, decimals: 18 };
};

export const getGMXTokensToClose = async (
  account: string,
  chainId: ChainId,
  provider: RetryProvider,
) => {
  const positions = await getGMXPositions(account, { chainId, provider });
  const tokens: PortfolioToken[] = [];
  const pools = ProtocolPools.gmx[chainId];

  for (const pos of positions) {
    const poolName = Object.keys(pools).find(
      (key) =>
        pools[key].market.toLowerCase() === pos.addresses.market.toLowerCase(),
    );

    if (!poolName) continue;

    tokens.push({
      poolName: poolName,
      symbol: poolName.replace("-usdc", ""),
      amount: 10n, // non-zero value to make it pass only, won't be used
    });
  }
  return tokens;
};
