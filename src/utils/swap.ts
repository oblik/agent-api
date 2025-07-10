import {
  type BuildSwapTxInput,
  SwapSide,
  constructSimpleSDK,
} from "@paraswap/sdk";
import axios, { AxiosError } from "axios";
import { config } from "dotenv";
import { ethers } from "ethers";
import {
  addBalance,
  createVnet,
  duplicateVnet,
  getVnetIdFromRpc,
  setErc20Balance,
} from "../__tests__/helper.js";
import { abis } from "../config/abis.js";
import ChainIDs from "../config/common/chainid.js";
import { INT128_MAX, NATIVE_TOKEN, NATIVE_TOKEN2 } from "../constants.js";
import { getUnsupportedProtocolError } from "./error.js";
import { getViemPublicClientFromEthers } from "./ethers2viem.js";
import {
  convertToHexString,
  getABIForProtocol,
  getApproveData,
  getChainNameFromId,
  getCoinData,
  getErrorMessage,
  getNativeTokenSymbolForChain,
  getProtocolAddressForChain,
  getRoughAmountIn,
  getRpcUrlForChain,
  getTokenInfoForChain,
  isNaNValue,
  isValidChainId,
  sfParseUnits,
  withRetry,
} from "./index.js";
import { usePrintError, usePrintLog } from "./log.js";
import { compileAndExecute, poolId, toToken } from "./protocols/bladeswap.js";
import {
  type SignData as HyperliquidSignData,
  fetchHyperliquidSpotMarkets,
} from "./protocols/hyperliquid.js";
import { RetryProvider } from "./retryProvider.js";
import type {
  ChainId,
  CoinCache,
  CoinData,
  ContractCallParam,
  JSONObject,
  TokenInfo,
  Transaction,
} from "./types.js";
import { assert, isDefined, isHexStr } from "./types.js";

config();

interface VnetEntry {
  data: Promise<{ vnetId: string; rpcUrl: string }>;
  used: boolean;
}

const vNets: Record<string, VnetEntry[]> = {};

interface OpenOceanQueryParams {
  inTokenAddress: string;
  outTokenAddress: string;
  amount: string;
  gasPrice: string;
  slippage: number;
  account: string;
  enabledDexIds?: number;
}

interface OpenOceanQuoteResponse {
  data: {
    data: {
      outAmount: string;
      estimatedGas: string;
      inAmount: string;
      to: string;
      value: string;
      data: string;
    };
  };
}

interface LifiRequest {
  fromChain: string;
  toChain: string;
  fromToken: string;
  fromAmount: string;
  toToken: string;
  fromAddress: string;
  slippage: number;
}

interface LifiQuoteResponse {
  data: {
    estimate: {
      fromAmount: string;
      toAmount: string;
      gasCosts: Array<{ amountUsd: string }>;
    };
    transactionRequest: {
      to: string;
      value: string;
      data: string;
    };
  };
}

interface OpenOceanError extends Error {
  message: string;
  response: { data: unknown };
}

interface OneInchQuoteResponse {
  data: {
    toAmount: string;
    tx: {
      to: string;
      value: string;
      data: string;
    };
  };
}

interface HashflowQuoteData {
  quoteData: {
    pool: string;
    externalAccount: string;
    trader: string;
    effectiveTrader: string;
    baseToken: string;
    quoteToken: string;
    baseTokenAmount: string;
    quoteTokenAmount: string;
    quoteExpiry: number;
    nonce: number;
    txid: string;
  };
  signature: string;
}

interface SynapseQuoteData {
  maxAmountOut: {
    hex: string;
  };
}

interface SynapseSwapTxInfo {
  to: string;
  data: string;
}

function stringifyValues(
  obj: OpenOceanQueryParams | LifiRequest,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [key, String(value)]),
  );
}

export const getQuoteFromOpenOcean = async (
  lenRoutes: number,
  chainId: ChainId,
  account: string,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  initAmountIn: bigint | null,
  amountOut: bigint | null,
  gasPrice: bigint,
  slippage = 50,
  protocol?: string,
): Promise<{
  amountIn: string;
  amountOut: string;
  gasUsd: number;
  tx: { to: string; value: string; data: string };
  source: string;
} | null> => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);

  const exactOut = !initAmountIn;
  let amountIn = initAmountIn;
  if (exactOut && amountOut) {
    amountIn = await getRoughAmountIn(
      account,
      tokenIn,
      tokenOut,
      amountOut,
      chainId,
    );
  }
  if (!amountIn) {
    printLog(
      "open ocean amountIn issue",
      tokenIn,
      tokenOut,
      amountOut,
      slippage,
      chainId,
    );
    return null;
  }

  const baseUrl = "https://open-api.openocean.finance/v3";
  const timeout = 3 * 1000; // 3 seconds
  const nativeTokenSymbol =
    getNativeTokenSymbolForChain(chainId)?.toLowerCase();
  if (
    !tokenIn.address ||
    !tokenOut.address ||
    !tokenIn.symbol ||
    !tokenOut.symbol
  ) {
    printLog("open ocean token address issue", tokenIn, tokenOut);
    return null;
  }
  try {
    const queryParams: OpenOceanQueryParams = {
      inTokenAddress:
        tokenIn.symbol.toLowerCase() === nativeTokenSymbol
          ? NATIVE_TOKEN2
          : tokenIn.address,
      outTokenAddress:
        tokenOut.symbol.toLowerCase() === nativeTokenSymbol
          ? NATIVE_TOKEN2
          : tokenOut.address,
      amount: ethers.formatUnits(amountIn, tokenIn.decimals),
      gasPrice: ethers.formatUnits(gasPrice, 9),
      slippage,
      account,
      ...(protocol === "syncswap" || protocol === "thruster"
        ? { enabledDexIds: 2 }
        : {}),
    };
    const { data }: OpenOceanQuoteResponse = await withRetry(account, () =>
      axios.get(
        `${baseUrl}/${chainId}/swap_quote?${new URLSearchParams(
          stringifyValues(queryParams),
        ).toString()}`,
        { timeout },
      ),
    );
    let quoteData = data;

    if (exactOut && amountOut) {
      amountIn =
        (BigInt(amountIn) * BigInt(amountOut)) /
        BigInt(quoteData.data.outAmount);
      queryParams.amount = ethers.formatUnits(amountIn, tokenIn.decimals);
      const { data: newData }: OpenOceanQuoteResponse = await withRetry(
        account,
        () =>
          axios.get(
            `${baseUrl}/${chainId}/swap_quote?${new URLSearchParams(
              stringifyValues(queryParams),
            ).toString()}`,
            { timeout },
          ),
      );
      quoteData = newData;
    }
    if (!quoteData) {
      printLog(
        "open ocean quote data empty",
        chainId,
        account,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        gasPrice,
      );
      return null;
    }
    if (!quoteData.data.estimatedGas) {
      printLog("openocean failure", quoteData);
      return null;
    }
    let gasCost: bigint;
    try {
      gasCost = BigInt(gasPrice) * BigInt(quoteData.data.estimatedGas);
    } catch (err) {
      printError(
        "openocean failure",
        gasPrice,
        typeof gasPrice,
        quoteData,
        err,
      );
      return null;
    }
    const gasTokenInfo = await getCoinData(
      account,
      getNativeTokenSymbolForChain(chainId),
      chainId,
    );
    if (!gasTokenInfo) {
      throw new Error("Rate Limit, come back later");
    }
    assert(isDefined(gasTokenInfo.price));
    return {
      amountIn: quoteData.data.inAmount,
      amountOut: quoteData.data.outAmount,
      gasUsd: Number(ethers.formatEther(gasCost)) * gasTokenInfo.price,
      tx: {
        to: quoteData.data.to,
        value: quoteData.data.value,
        data: quoteData.data.data,
      },
      source: "openocean",
    };
  } catch (err: unknown) {
    const typedErr = err as OpenOceanError;
    if (typedErr?.message !== "timeout of 3000ms exceeded") {
      printError("openocean", typedErr?.response?.data ?? err);
    }
    if (lenRoutes === 1) {
      throw new Error(
        "Error fetching quote from OpenOcean. Please try again later or contact support if the issue persists. You can also try a different protocol for your swap.",
      );
    }
  }
  return null;
};

export const getQuoteFromAmbient = async (
  lenRoutes: number,
  chainId: ChainId,
  account: string,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  amountIn: bigint | null,
  amountOut: bigint | null,
): Promise<
  | {
      amountIn: string;
      amountOut: string;
      tx: { to: string; value: string; data: string };
      source: string;
    }
  | undefined
> => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);

  const tokenInData: CoinData = await getCoinData(
    account,
    tokenIn.symbol,
    chainId,
  );
  const tokenOutData: CoinData = await getCoinData(
    account,
    tokenOut.symbol,
    chainId,
  );
  if (!tokenInData.price || !tokenOutData.price) {
    printLog("token data issue", tokenIn, tokenOut);
    return undefined;
  }
  const tokenInPrice = tokenInData.price;
  const tokenOutPrice = tokenOutData.price;

  const exactOut = !amountIn;
  if (!isValidChainId(chainId)) {
    throw new Error(`Invalid chain id: ${chainId}`);
  }
  try {
    const dexAddr = getProtocolAddressForChain("ambient", chainId);
    if (!dexAddr) {
      printLog(`${chainId} not supported on ambient`);
      return undefined;
    }
    const nativeTokenSymbol =
      getNativeTokenSymbolForChain(chainId)?.toLowerCase();
    const abi = getABIForProtocol("ambient");
    const rpcUrl = getRpcUrlForChain(chainId);
    const provider = new RetryProvider(rpcUrl, chainId);
    const dex = new ethers.Contract(dexAddr, abi);
    const isTokenInEth = tokenIn.symbol?.toLowerCase() === nativeTokenSymbol;
    const isTokenOutEth = tokenOut.symbol?.toLowerCase() === nativeTokenSymbol;
    if (!isTokenInEth && !isTokenOutEth) {
      return undefined;
    }

    const funcName = "userCmd";

    const queryAddress = getProtocolAddressForChain(
      "ambient",
      chainId,
      "query",
    );
    if (!queryAddress) {
      printLog("Could not find query for Ambient");
      return undefined;
    }
    const base = ethers.ZeroAddress;
    const quote = isTokenInEth ? tokenOut.address : tokenIn.address;
    assert(isHexStr(queryAddress));
    assert(isHexStr(base));
    assert(isHexStr(quote));
    const price = await (
      await getViemPublicClientFromEthers(provider)
    ).readContract({
      address: queryAddress,
      abi: abis["ambient-query"],
      functionName: "queryPrice",
      args: [base, quote, 420n],
    });
    const poolIdx = 420;
    const isBuy = isTokenInEth;
    const inBaseQty = isTokenInEth ? !exactOut : exactOut;
    const qty = amountIn || amountOut;
    if (!qty) throw new Error("Both amountIn and amountOut are null");
    const tip = 0;
    const limitPrice = isTokenInEth
      ? (price * 102n) / 100n
      : (price * 98n) / 100n;
    const minOut = 0;
    const settleFlags = 0;
    const cmd = ethers.AbiCoder.defaultAbiCoder().encode(
      [
        "address",
        "address",
        "uint256",
        "bool",
        "bool",
        "uint128",
        "uint16",
        "uint128",
        "uint128",
        "uint8",
      ],
      [
        base,
        quote,
        poolIdx,
        isBuy,
        inBaseQty,
        qty,
        tip,
        limitPrice,
        minOut,
        settleFlags,
      ],
    );

    const params: ContractCallParam[] = [];
    params.push(1); // callpath
    params.push(cmd);

    let amountInRet: bigint;
    let amountOutRet: bigint;
    if (!exactOut) {
      if (!amountIn) throw new Error("amountIn is null in non-exactOut case");
      amountInRet = amountIn;
      const inputValue =
        Number.parseFloat(ethers.formatUnits(amountIn, tokenIn.decimals)) *
        tokenInPrice;
      amountOutRet =
        (sfParseUnits(inputValue / tokenOutPrice, tokenOut.decimals) * 95n) /
        100n;
    } else {
      if (!amountOut) throw new Error("amountOut is null in exactOut case");
      amountOutRet = amountOut;
      const outputValue =
        Number.parseFloat(ethers.formatUnits(amountOut, tokenOut.decimals)) *
        tokenOutPrice;
      amountInRet =
        (sfParseUnits(outputValue / tokenInPrice, tokenIn.decimals) * 105n) /
        100n;
    }

    return {
      amountIn: amountInRet.toString(),
      amountOut: amountOutRet.toString(),
      tx: {
        to: dexAddr,
        value: isTokenInEth ? amountInRet.toString() : "0",
        data: dex.interface.encodeFunctionData(funcName, params),
      },
      source: "ambient",
    };
  } catch (err: unknown) {
    const typedErr = err as { response?: { data?: unknown } };
    printError("ambient", typedErr?.response?.data ?? err);
    if (lenRoutes === 1) {
      throw new Error(
        "Error fetching quote from Ambient. Please try again later or contact support if the issue persists. You can also try a different protocol for your swap.",
      );
    }
  }
  return undefined;
};

export const getQuoteFromLeetswap = async (
  lenRoutes: number,
  chainId: ChainId,
  account: string,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  amountIn: bigint | null,
  amountOut: bigint | null,
): Promise<
  | {
      amountIn: string;
      amountOut: string;
      tx: { to: string; value: string; data: string };
      source: string;
    }
  | undefined
> => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);

  const exactOut = !amountIn;
  try {
    if (!isValidChainId(chainId)) {
      throw new Error(`Invalid chain id: ${chainId}`);
    }
    const routerAddr = getProtocolAddressForChain(
      "leetswap",
      chainId,
      "router",
    );
    if (!routerAddr) {
      printLog(`${chainId} not supported on leetswap`);
      return undefined;
    }
    const abi = getABIForProtocol("leetswap", "router");
    const rpcUrl = getRpcUrlForChain(chainId);
    const provider = new RetryProvider(rpcUrl, chainId);
    const router = new ethers.Contract(routerAddr, abi);
    const viemClient = await getViemPublicClientFromEthers(provider);
    const isTokenInEth = tokenIn.address === NATIVE_TOKEN;
    const isTokenOutEth = tokenOut.address === NATIVE_TOKEN;
    const WETH = "0x4200000000000000000000000000000000000006";
    const path: string[] = [];
    if (!tokenIn.address || !tokenOut.address) {
      printLog("leetswap token address issue", tokenIn, tokenOut);
      return undefined;
    }
    if (isTokenInEth) {
      path.push(WETH, tokenOut.address);
    } else if (isTokenOutEth) {
      path.push(tokenIn.address, WETH);
    } else if (tokenIn.address === WETH || tokenOut.address === WETH) {
      path.push(tokenIn.address, tokenOut.address);
    } else {
      path.push(tokenIn.address, WETH, tokenOut.address);
    }
    let funcName = "";
    let amountOutMin = 0n;
    let amountInMax = 0n;
    const params: ContractCallParam[] = [];
    if (!exactOut) {
      assert(isHexStr(routerAddr));
      const estimateAmountOut = await viemClient.readContract({
        address: routerAddr,
        abi: abis["leetswap-router"],
        functionName: "getAmountsOut",
        args: [amountIn, path as `0x${string}`[]],
      });
      amountOutMin =
        (estimateAmountOut[estimateAmountOut.length - 1] * 98n) / 100n;
      if (isTokenInEth) {
        funcName = "swapExactETHForTokens";
      } else if (isTokenOutEth) {
        params.push(amountIn);
        funcName = "swapExactTokensForETH";
      } else {
        params.push(amountIn);
        funcName = "swapExactTokensForTokens";
      }
      params.push(amountOutMin);
    } else if (amountOut) {
      assert(isHexStr(routerAddr));
      const estimateAmountIn = await viemClient.readContract({
        address: routerAddr,
        abi: abis["leetswap-router"],
        functionName: "getAmountsIn",
        args: [amountOut, path as `0x${string}`[]],
      });
      amountInMax = (estimateAmountIn[0] * 102n) / 100n;
      params.push(amountOut);
      if (isTokenInEth) {
        funcName = "swapETHForExactTokens";
      } else if (isTokenOutEth) {
        params.push(amountInMax);
        funcName = "swapTokensForExactETH";
      } else {
        params.push(amountInMax);
        funcName = "swapTokensForExactTokens";
      }
    }
    params.push(path);
    params.push(account);
    params.push(Math.floor(Date.now() / 1000) + 1200);

    return {
      amountIn: (!exactOut ? amountIn : amountInMax).toString(),
      amountOut: ((!exactOut ? amountOutMin : amountOut) || 0).toString(),
      tx: {
        to: routerAddr,
        value: isTokenInEth
          ? (!exactOut ? amountIn : amountInMax).toString()
          : "0",
        data: router.interface.encodeFunctionData(funcName, params),
      },
      source: "leetswap",
    };
  } catch {
    printError("leetswap failed");
    if (lenRoutes === 1) {
      throw new Error(
        "Error fetching quote from Leetswap. Please try again later or contact support if the issue persists. You can also try a different protocol for your swap.",
      );
    }
  }
};

export const getQuoteFromBlastChain = async (
  lenRoutes: number,
  chainId: ChainId,
  account: string,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  amountIn: bigint | null,
  amountOut: bigint | null,
) => {
  const printError = usePrintError(account);
  const amount = amountIn || amountOut;
  if (chainId.toString() !== "81457" || !amount) {
    return null;
  }
  try {
    const wethAddr = "0x4300000000000000000000000000000000000004"; // WETH address on Blast
    const isTokenInEth =
      tokenIn?.address === NATIVE_TOKEN && tokenOut?.address === wethAddr;
    const isTokenOutEth =
      tokenOut?.address === NATIVE_TOKEN && tokenIn?.address === wethAddr;
    if (!isTokenInEth && !isTokenOutEth) {
      return null;
    }
    const abi = [
      "function deposit() payable",
      "function withdraw(uint256 wad) public",
    ];
    const wethContract = new ethers.Contract(wethAddr, abi);

    let funcName: string;
    const params: ContractCallParam[] = [];
    let value = 0n;

    if (isTokenOutEth) {
      funcName = "withdraw";
      params.push(amount);
    } else {
      funcName = "deposit";
      value = amount;
    }

    return {
      amountIn: amount.toString(),
      amountOut: amount.toString(),
      tx: {
        to: wethAddr,
        value: value.toString(),
        data: wethContract.interface.encodeFunctionData(funcName, params),
      },
      source: "slate",
    };
  } catch (err) {
    printError("WETH/ETH failure", err);
    if (lenRoutes === 1) {
      throw new Error(
        "Error fetching quote from chain. Please try again later or contact support if the issue persists. You can also try a different protocol for your swap.",
      );
    }
  }
};

export const getQuoteFrom1inch = async (
  lenRoutes: number,
  chainId: ChainId,
  account: string,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  initAmountIn: bigint | null,
  amountOut: bigint | null,
  gasPrice: bigint,
  slippage = 50,
): Promise<{
  amountIn: string;
  amountOut: string;
  tx: { to: string; value: string; data: string };
  source: string;
} | null> => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);

  const exactOut = !initAmountIn;
  let amountIn = initAmountIn;
  if (exactOut) {
    amountIn = await getRoughAmountIn(
      account,
      tokenIn,
      tokenOut,
      amountOut,
      chainId,
    );
  }
  if (!amountIn) {
    printLog(
      "1inch amountIn issue",
      tokenIn,
      tokenOut,
      amountOut,
      slippage,
      chainId,
    );
    return null;
  }
  if (!tokenIn.address || !tokenOut.address) {
    printLog("1inch token address issue", tokenIn, tokenOut);
    return null;
  }
  const apiBaseUrl = `https://api.1inch.dev/swap/v5.2/${chainId}`;
  const headers = {
    headers: {
      Authorization: `Bearer ${process.env.API_KEY_1INCH}`,
      accept: "application/json",
    },
  };

  const nativeTokenSymbol =
    getNativeTokenSymbolForChain(chainId)?.toLowerCase();
  try {
    const swapParams = {
      src:
        tokenIn.symbol?.toLowerCase() === nativeTokenSymbol
          ? NATIVE_TOKEN2
          : tokenIn.address,
      dst:
        tokenOut.symbol?.toLowerCase() === nativeTokenSymbol
          ? NATIVE_TOKEN2
          : tokenOut.address,
      amount: amountIn.toString(),
      from: account,
      slippage: slippage.toString(),
      disableEstimate: "true",
      allowPartialFill: "false",
    };
    const url = `${apiBaseUrl}/swap?${new URLSearchParams(
      swapParams,
    ).toString()}`;

    const response: OneInchQuoteResponse = await withRetry(account, () =>
      axios.get(url, headers),
    );
    const quoteData = response.data;

    return {
      amountIn: amountIn.toString(),
      amountOut: quoteData.toAmount,
      tx: {
        to: quoteData.tx.to,
        value: quoteData.tx.value,
        data: quoteData.tx.data,
      },
      source: "1inch",
    };
  } catch (err: unknown) {
    const typedErr = err as { response?: { data?: { description?: string } } };
    if (
      typedErr?.response?.data?.description ===
      "amount should be positive integer string"
    ) {
      printError(
        "1inch swap failure with params",
        chainId,
        account,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
      );
    } else {
      printError("1inch", typedErr.response?.data ?? err);
    }
    if (lenRoutes === 1) {
      throw new Error(
        "Error fetching quote from 1inch. Please try again later or contact support if the issue persists. You can also try a different protocol for your swap.",
      );
    }
  }
  return null;
};

export const getQuoteFromLiFi = async (
  lenRoutes: number,
  chainId: ChainId,
  account: string,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  initAmountIn: bigint | null,
  amountOut: bigint | null,
  gasPrice: bigint,
  slippage = 50,
): Promise<{
  amountIn: string;
  amountOut: string;
  gasUsd: string;
  tx: { to: string; value: string; data: string };
  source: string;
} | null> => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);

  const exactOut = !initAmountIn;
  let amountIn = initAmountIn;
  if (exactOut) {
    amountIn = await getRoughAmountIn(
      account,
      tokenIn,
      tokenOut,
      amountOut,
      chainId,
    );
  }
  if (!amountIn) {
    printLog(
      "LiFi amountIn issue",
      tokenIn,
      tokenOut,
      amountOut,
      slippage,
      chainId,
    );
    return null;
  }
  if (!tokenIn.address || !tokenOut.address) {
    printLog("LiFi token address issue", tokenIn, tokenOut);
    return null;
  }

  try {
    const {
      data: { chains },
    }: { data: { chains: Array<{ id: number; key: string }> } } =
      await withRetry(account, () => axios.get("https://li.quest/v1/chains"));
    const chain = chains.find((c) => c.id === chainId);
    if (!chain) return null;

    const chainKey = chain.key;

    const params: LifiRequest = {
      fromChain: chainKey,
      toChain: chainKey,
      fromToken: tokenIn.address,
      fromAmount: amountIn.toString(),
      toToken: tokenOut.address,
      fromAddress: account,
      slippage: slippage / 100,
    };

    const {
      data: { estimate, transactionRequest },
    }: LifiQuoteResponse = await withRetry(account, () =>
      axios.get(
        `https://li.quest/v1/quote?${new URLSearchParams(
          stringifyValues(params),
        ).toString()}`,
      ),
    );
    let quoteData = estimate;
    let txRequest = transactionRequest;

    if (exactOut) {
      if (!amountOut) {
        printLog(
          "LiFi amountOut issue",
          tokenIn,
          tokenOut,
          amountOut,
          slippage,
          chainId,
        );
        return null;
      }
      amountIn =
        (ethers.getBigInt(amountIn) * ethers.getBigInt(amountOut)) /
        ethers.getBigInt(quoteData.toAmount);
      params.fromAmount = amountIn.toString();
      const {
        data: { estimate: newEstimate, transactionRequest: newTxRequest },
      }: LifiQuoteResponse = await withRetry(account, () =>
        axios.get(
          `https://li.quest/v1/quote?${new URLSearchParams(
            stringifyValues(params),
          ).toString()}`,
        ),
      );
      quoteData = newEstimate;
      txRequest = newTxRequest;
    }

    return {
      amountIn: quoteData.fromAmount,
      amountOut: quoteData.toAmount,
      gasUsd: quoteData.gasCosts[0].amountUsd,
      tx: {
        to: txRequest.to,
        value: ethers.getBigInt(txRequest.value).toString(),
        data: txRequest.data,
      },
      source: "lifi",
    };
  } catch (err: unknown) {
    const typedErr = err as { response?: { data?: { message?: string } } };
    if (typedErr?.response?.data?.message === "validation failed") {
      printError(
        "LiFi swap failure with params",
        tokenIn.address,
        amountIn.toString(),
        tokenOut.address,
        account,
        slippage / 100,
      );
    } else {
      printError("lifi", typedErr.response?.data ?? err);
    }
    if (lenRoutes === 1) {
      throw new Error(
        "Error fetching quote from LiFi/Jumper. Please try again later or contact support if the issue persists. You can also try a different protocol for your swap.",
      );
    }
  }
  return null;
};

export const getQuoteFromHashflow = async (
  lenRoutes: number,
  chainId: ChainId,
  account: string,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  initAmountIn: bigint | null,
  amountOut: bigint | null,
  gasPrice: bigint,
  slippage = 50,
): Promise<{
  amountIn: string;
  amountOut: string;
  tx: { to: string; value: string; data: string };
  source: string;
} | null> => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);

  const nativeTokenSymbol =
    getNativeTokenSymbolForChain(chainId)?.toLowerCase();
  const exactOut = !initAmountIn;
  let amountIn = initAmountIn;
  if (exactOut) {
    amountIn = await getRoughAmountIn(
      account,
      tokenIn,
      tokenOut,
      amountOut,
      chainId,
    );
  }
  if (!amountIn) {
    printLog(
      "Hashflow amountIn issue",
      tokenIn,
      tokenOut,
      amountOut,
      slippage,
      chainId,
    );
    return null;
  }

  try {
    let quoteData: HashflowQuoteData;

    const reqBody = {
      baseChain: {
        chainType: "evm",
        chainId,
      },
      quoteChain: {
        chainType: "evm",
        chainId,
      },
      rfqs: [
        {
          baseToken: tokenIn.address,
          baseTokenAmount: amountIn.toString(),
          options: {},
          quoteToken: tokenOut.address,
          trader: account,
        },
      ],
      source: "spicefi",
    };
    const headers = {
      accept: "application/json",
      Authorization: process.env.HASHFLOW_API_KEY,
    };
    const {
      data: { quotes },
    }: { data: { quotes: HashflowQuoteData[] } } = await withRetry(
      account,
      () =>
        axios.post("https://api.hashflow.com/taker/v3/rfq", reqBody, {
          headers,
        }),
    );
    if (!quotes || quotes.length === 0) {
      printLog(
        "No quotes available on Hashflow",
        tokenIn,
        tokenOut,
        amountOut,
        slippage,
        chainId,
      );
      return null;
    }
    quoteData = quotes[0];

    if (exactOut) {
      if (!amountOut) {
        printLog(
          "Hashflow amountOut issue",
          tokenIn,
          tokenOut,
          amountOut,
          slippage,
          chainId,
        );
        return null;
      }
      amountIn =
        (ethers.getBigInt(amountIn) * ethers.getBigInt(amountOut)) /
        ethers.getBigInt(quoteData.quoteData.quoteTokenAmount);
      reqBody.rfqs[0].baseTokenAmount = amountIn.toString();
      const {
        data: { quotes: newQuotes },
      }: { data: { quotes: HashflowQuoteData[] } } = await withRetry(
        account,
        () =>
          axios.post("https://api.hashflow.com/taker/v3/rfq", reqBody, {
            headers,
          }),
      );
      if (!newQuotes || newQuotes.length === 0) {
        printLog(
          "No quote available on Hashflow",
          tokenIn,
          tokenOut,
          amountOut,
          slippage,
          chainId,
        );
        return null;
      }
      quoteData = newQuotes[0];
    }

    if (!isValidChainId(chainId)) {
      throw new Error(`Invalid chain id: ${chainId}`);
    }
    const router = getProtocolAddressForChain("hashflow", chainId, "router");
    if (!router) {
      printLog("Could not find router for Hashflow");
      return null;
    }
    const hashflowRouterAbi = getABIForProtocol("hashflow", "router");
    const contract = new ethers.Contract(router, hashflowRouterAbi);

    return {
      amountIn: quoteData.quoteData.baseTokenAmount,
      amountOut: quoteData.quoteData.quoteTokenAmount,
      tx: {
        to: router,
        value:
          tokenIn.symbol?.toLowerCase() === nativeTokenSymbol
            ? amountIn.toString()
            : "0",
        data: contract.interface.encodeFunctionData("tradeRFQT", [
          {
            pool: quoteData.quoteData.pool,
            externalAccount: quoteData.quoteData.externalAccount,
            trader: quoteData.quoteData.trader,
            effectiveTrader: quoteData.quoteData.effectiveTrader,
            baseToken: quoteData.quoteData.baseToken,
            quoteToken: quoteData.quoteData.quoteToken,
            effectiveBaseTokenAmount: quoteData.quoteData.baseTokenAmount,
            baseTokenAmount: quoteData.quoteData.baseTokenAmount,
            quoteTokenAmount: quoteData.quoteData.quoteTokenAmount,
            quoteExpiry: quoteData.quoteData.quoteExpiry,
            nonce: quoteData.quoteData.nonce,
            txid: quoteData.quoteData.txid,
            signature: quoteData.signature,
          },
        ]),
      },
      source: "hashflow",
    };
  } catch (err: unknown) {
    const typedErr = err as {
      response?: { data?: { error?: { code: number } } };
    };
    if (typedErr?.response?.data?.error?.code !== 42) {
      printError("hashflow", typedErr.response?.data ?? err);
    } else {
      printError("hashflow failed");
    }
    if (lenRoutes === 1) {
      throw new Error(
        "Error fetching quote from Hashflow. Please try again later or contact support if the issue persists. You can also try a different protocol for your swap.",
      );
    }
  }
  return null;
};

export const getQuoteFromSynapse = async (
  lenRoutes: number,
  chainId: ChainId,
  account: string,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  initAmountIn: bigint | null,
  amountOut: bigint | null,
  gasPrice: bigint,
  slippage = 50,
): Promise<{
  amountIn: string;
  amountOut: string;
  tx: { to: string; value: string; data: string };
  source: string;
} | null> => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);

  const nativeTokenSymbol =
    getNativeTokenSymbolForChain(chainId)?.toLowerCase();
  const exactOut = !initAmountIn;
  let amountIn = initAmountIn;
  if (exactOut) {
    amountIn = await getRoughAmountIn(
      account,
      tokenIn,
      tokenOut,
      amountOut,
      chainId,
    );
  }
  if (!amountIn) {
    printLog(
      "Synapse amountIn issue",
      tokenIn,
      tokenOut,
      amountOut,
      slippage,
      chainId,
    );
    return null;
  }
  if (!tokenIn.symbol || !tokenOut.symbol) {
    printLog("Synapse token symbol issue", tokenIn, tokenOut);
    return null;
  }

  const apiBaseUrl = "https://synapse-rest-api-v2.herokuapp.com";
  const headers = { headers: { accept: "application/json" } };
  const swapParams = {
    chain: chainId.toString(),
    fromToken: tokenIn.symbol.toUpperCase(),
    toToken: tokenOut.symbol.toUpperCase(),
    amount: ethers.formatUnits(amountIn, tokenIn.decimals),
  };
  const url = `${apiBaseUrl}/swap?${new URLSearchParams(
    swapParams,
  ).toString()}`;

  try {
    let quoteData: SynapseQuoteData;
    const { data: quote } = await withRetry(account, () =>
      axios.get<SynapseQuoteData>(url, headers),
    );
    quoteData = quote;

    if (exactOut && quote.maxAmountOut) {
      if (!amountOut) {
        printLog(
          "Synapse amountOut issue",
          tokenIn,
          tokenOut,
          amountOut,
          slippage,
          chainId,
        );
        return null;
      }
      amountIn =
        (ethers.getBigInt(amountIn) * ethers.getBigInt(amountOut)) /
        ethers.getBigInt(quote.maxAmountOut.hex);
      swapParams.amount = ethers.formatUnits(amountIn, tokenIn.decimals);
      const url = `${apiBaseUrl}/swap?${new URLSearchParams(
        swapParams,
      ).toString()}`;
      const { data: newQuote } = await withRetry(account, () =>
        axios.get<SynapseQuoteData>(url, headers),
      );
      quoteData = newQuote;
    }

    const {
      data: { to, data },
    } = await withRetry(account, () =>
      axios.get<SynapseSwapTxInfo>(
        `${apiBaseUrl}/swapTxInfo?${new URLSearchParams(
          swapParams,
        ).toString()}`,
        headers,
      ),
    );
    if (quoteData && data) {
      const res = ethers.AbiCoder.defaultAbiCoder().decode(
        [
          "address",
          "address",
          "uint256",
          "(address,address,uint256,uint256,bytes)",
        ],
        ethers.dataSlice(data, 4),
      );
      const calldata = ethers.AbiCoder.defaultAbiCoder().encode(
        [
          "address",
          "address",
          "uint256",
          "(address,address,uint256,uint256,bytes)",
        ],
        [account, tokenIn.address, res[2], res[3]],
      );
      return {
        amountIn: amountIn.toString(),
        amountOut: ethers.getBigInt(quoteData.maxAmountOut.hex).toString(),
        tx: {
          to,
          value:
            tokenIn.symbol?.toLowerCase() === nativeTokenSymbol
              ? amountIn.toString()
              : "0",
          data: ethers.dataSlice(data, 0, 4) + calldata.slice(2),
        },
        source: "synapse",
      };
    }
  } catch (err: unknown) {
    const typedErr = err as { response?: { status?: number } };
    if (typedErr?.response?.status === 503) {
      printLog("synapse failed with 503");
    } else {
      printError("synapse failed");
    }
    if (lenRoutes === 1) {
      throw new Error(
        "Error fetching quote from Synapse. Please try again later or contact support if the issue persists. You can also try a different protocol for your swap.",
      );
    }
  }
  return null;
};

interface ParaSwapTxInfo {
  to: string;
  value: string;
  data: string;
}

export const getQuoteFromParaSwap = async (
  lenRoutes: number,
  chainId: ChainId,
  account: string,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  initAmountIn: bigint | null,
  amountOut: bigint | null,
  gasPrice: bigint,
  slippage = 50,
  protocol?: string,
  dexList?: string[],
): Promise<{
  amountIn: string;
  amountOut: string;
  gasUsd: number;
  tx: { to: string; value: string; data: string };
  source: string;
} | null> => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);

  const exactOut = !initAmountIn;
  let amountIn = initAmountIn;
  if (exactOut) {
    amountIn = await getRoughAmountIn(
      account,
      tokenIn,
      tokenOut,
      amountOut,
      chainId,
    );
  }
  if (!amountIn) {
    printLog(
      "ParaSwap amountIn issue",
      tokenIn,
      tokenOut,
      amountOut,
      slippage,
      chainId,
    );
    return null;
  }
  if (!tokenIn.address || !tokenOut.address) {
    printLog("ParaSwap token address issue", tokenIn, tokenOut);
    return null;
  }

  // @ts-expect-error: Necessary to bypass type checking for buildTx method
  const paraswapSdk = constructSimpleSDK({ chainId, axios });
  try {
    const nativeTokenSymbol =
      getNativeTokenSymbolForChain(chainId)?.toLowerCase();
    const swapParams = {
      srcToken:
        tokenIn.symbol?.toLowerCase() === nativeTokenSymbol ||
        tokenIn.address === NATIVE_TOKEN
          ? NATIVE_TOKEN2
          : tokenIn.address,
      destToken:
        tokenOut.symbol?.toLowerCase() === nativeTokenSymbol ||
        tokenOut.address === NATIVE_TOKEN
          ? NATIVE_TOKEN2
          : tokenOut.address,
      srcDecimals: tokenIn.decimals,
      destDecimals: tokenOut.decimals,
      amount: amountIn.toString(),
      side: SwapSide.SELL,
      options: { includeDEXS: dexList },
    };
    let priceRoute = await paraswapSdk.swap.getRate(swapParams);

    if (exactOut && priceRoute.destAmount) {
      if (!amountOut) {
        printLog(
          "Paraswap amountOut issue",
          tokenIn,
          tokenOut,
          amountOut,
          slippage,
          chainId,
        );
        return null;
      }
      amountIn =
        (ethers.getBigInt(amountIn) * ethers.getBigInt(amountOut)) /
        ethers.getBigInt(priceRoute.destAmount);
      swapParams.amount = amountIn.toString();
      priceRoute = await paraswapSdk.swap.getRate(swapParams);
    }

    let txInfo: BuildSwapTxInput;
    if (amountIn)
      txInfo = {
        srcToken: priceRoute.srcToken,
        destToken: priceRoute.destToken,
        slippage: slippage * 0.01 * 10000,
        priceRoute,
        srcAmount: priceRoute.srcAmount,
        userAddress: account,
      };
    else
      txInfo = {
        srcToken: priceRoute.srcToken,
        destToken: priceRoute.destToken,
        slippage: slippage * 0.01 * 10000,
        priceRoute,
        destAmount: priceRoute.destAmount,
        userAddress: account,
      };
    const data: ParaSwapTxInfo = await paraswapSdk.swap.buildTx(txInfo, {
      ignoreChecks: true,
      ignoreGasEstimate: true,
    });

    return {
      amountIn: amountIn
        ? priceRoute.srcAmount
        : (
            (ethers.getBigInt(priceRoute.srcAmount) *
              ethers.getBigInt(100 + slippage)) /
              100n +
            1n
          ).toString(),
      amountOut: priceRoute.destAmount,
      gasUsd: Number.parseFloat(priceRoute.gasCostUSD),
      tx: {
        to: data.to,
        value: data.value,
        data: data.data,
      },
      source: "paraswap",
    };
  } catch (err) {
    let message = getErrorMessage(err);
    if (err instanceof AxiosError) {
      message = message.error;
    }
    if (message === "Invalid Amount") {
      printError(
        "paraswap swap failure with params",
        chainId,
        account,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
      );
    } else if (message) {
      printError("paraswap", message);
    } else {
      printLog("paraswap failed with no data");
    }
    if (lenRoutes === 1) {
      throw new Error(
        "Error fetching quote from Paraswap. Please try again later or contact support if the issue persists. You can also try a different protocol for your swap.",
      );
    }
  }
  return null;
};

interface OdosQuoteData {
  pathId: string;
  inAmounts: string[];
  outAmounts: string[];
}

interface OdosTxData {
  gasEstimateValue: number;
  transaction: {
    to: string;
    value: string;
    data: string;
  };
}

export const getQuoteFromOdos = async (
  lenRoutes: number,
  chainId: ChainId,
  account: string,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  initAmountIn: bigint | null,
  amountOut: bigint | null,
  gasPrice: bigint,
  slippage = 50,
): Promise<{
  amountIn: string;
  amountOut: string;
  gasUsd: number;
  tx: { to: string; value: string; data: string };
  source: string;
} | null> => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);

  const exactOut = !initAmountIn;
  let amountIn = initAmountIn;
  if (exactOut) {
    amountIn = await getRoughAmountIn(
      account,
      tokenIn,
      tokenOut,
      amountOut,
      chainId,
    );
  }
  if (!amountIn) {
    printLog(
      "Odos amountIn issue",
      tokenIn,
      tokenOut,
      amountOut,
      slippage,
      chainId,
    );
    return null;
  }

  try {
    const baseUrl = "https://api.odos.xyz";

    let quoteData: OdosQuoteData;
    const reqBody = {
      chainId,
      inputTokens: [
        {
          amount: amountIn.toString(),
          tokenAddress: tokenIn.address,
        },
      ],
      outputTokens: [
        {
          proportion: 1,
          tokenAddress: tokenOut.address,
        },
      ],
      referralCode: 0,
      slippageLimitPercent: slippage,
      userAddr: account,
    };
    const { data: quote } = await withRetry(account, () =>
      axios.post<OdosQuoteData>(`${baseUrl}/sor/quote/v2`, reqBody, {
        headers: { accept: "application/json" },
      }),
    );
    quoteData = quote;

    if (exactOut && quote.outAmounts[0]) {
      if (!amountOut) {
        printLog(
          "Odos amountOut issue",
          tokenIn,
          tokenOut,
          amountOut,
          slippage,
          chainId,
        );
        return null;
      }
      amountIn =
        (ethers.getBigInt(amountIn) * ethers.getBigInt(amountOut)) /
        ethers.getBigInt(quote.outAmounts[0]);

      reqBody.inputTokens[0].amount = amountIn.toString();

      const { data: newQuote } = await withRetry(account, () =>
        axios.post<OdosQuoteData>(`${baseUrl}/sor/quote/v2`, reqBody, {
          headers: { accept: "application/json" },
        }),
      );
      quoteData = newQuote;
    }

    const { data: txData } = await withRetry(account, () =>
      axios.post<OdosTxData>(
        `${baseUrl}/sor/assemble`,
        {
          userAddr: account,
          chainId,
          pathId: quoteData.pathId,
        },
        { headers: { accept: "application/json" } },
      ),
    );

    return {
      amountIn: amountIn
        ? quoteData.inAmounts[0]
        : (
            (ethers.getBigInt(quoteData.inAmounts[0]) *
              ethers.getBigInt(100 + slippage)) /
              100n +
            1n
          ).toString(),
      amountOut: quoteData.outAmounts[0],
      gasUsd: txData.gasEstimateValue,
      tx: {
        to: txData.transaction.to,
        value: txData.transaction.value,
        data: txData.transaction.data,
      },
      source: "odos",
    };
  } catch (err: unknown) {
    const typedErr = err as { response?: { data?: { error?: string } } };
    if (typedErr?.response?.data?.error === "Invalid Amount") {
      printError(
        "odos swap failure with params",
        chainId,
        account,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
      );
    } else {
      printError("odos", typedErr.response?.data ?? err);
    }
    if (lenRoutes === 1) {
      throw new Error(
        "Error fetching quote from Odos. Please try again later or contact support if the issue persists. You can also try a different protocol for your swap.",
      );
    }
  }
  return null;
};

interface ZeroXQuoteResponse {
  grossSellAmount?: string;
  sellAmount: string;
  grossBuyAmount?: string;
  buyAmount: string;
  estimatedGas: string;
  to: string;
  value: string;
  data: string;
}

type ApiUrls = { [key: number]: string };

export const getQuoteFrom0x = async (
  lenRoutes: number,
  chainId: ChainId,
  account: string,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  amountIn: bigint | null,
  amountOut: bigint | null,
  gasPrice: bigint,
  slippage = 50,
  protocol?: string,
): Promise<
  | {
      amountIn: string;
      amountOut: string;
      gasUsd: number;
      tx: { to: string; value: string; data: string };
      source: string;
    }
  | undefined
> => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);

  const apis: ApiUrls = {
    1: "https://api.0x.org/",
    137: "https://polygon.api.0x.org/",
    56: "https://bsc.api.0x.org/",
    10: "https://optimism.api.0x.org/",
    250: "https://fantom.api.0x.org/",
    42220: "https://celo.api.0x.org/",
    43114: "https://avalanche.api.0x.org/",
    42161: "https://arbitrum.api.0x.org/",
    8453: "https://base.api.0x.org/",
  };
  const baseURL = apis[chainId];
  if (!baseURL) return undefined;
  if (!tokenIn.address || !tokenOut.address) {
    printLog("0x token address issue", tokenIn, tokenOut);
    return undefined;
  }

  const nativeTokenSymbol =
    getNativeTokenSymbolForChain(chainId)?.toLowerCase();
  try {
    const queryParams: Record<string, string> = {
      sellToken:
        tokenIn.symbol?.toLowerCase() === nativeTokenSymbol
          ? NATIVE_TOKEN2
          : tokenIn.address,
      buyToken:
        tokenOut.symbol?.toLowerCase() === nativeTokenSymbol
          ? NATIVE_TOKEN2
          : tokenOut.address,
      slippagePercentage: (slippage / 100).toString(),
      gasPrice: gasPrice.toString(),
    };
    if (protocol) {
      queryParams.includeSources = protocol;
    }
    if (amountIn) {
      queryParams.sellAmount = amountIn.toString();
    } else if (amountOut) {
      queryParams.buyAmount = amountOut.toString();
    } else {
      throw new Error("Either amountIn or amountOut must be provided");
    }
    const { data } = await withRetry(account, () =>
      axios.get<ZeroXQuoteResponse>(
        `${baseURL}swap/v1/quote?${new URLSearchParams(
          queryParams,
        ).toString()}`,
        { headers: { "0x-api-key": process.env.API_KEY_0X } },
      ),
    );
    const gasCost =
      ethers.getBigInt(gasPrice) * ethers.getBigInt(data.estimatedGas);
    const gasTokenInfo: CoinData = await getCoinData(
      account,
      getNativeTokenSymbolForChain(chainId),
      chainId,
    );
    if (!gasTokenInfo.price) {
      throw new Error("Rate Limit, come back later");
    }
    return {
      amountIn: amountIn
        ? data.grossSellAmount || data.sellAmount
        : (
            (ethers.getBigInt(data.grossSellAmount || data.sellAmount) *
              ethers.getBigInt(100 + slippage)) /
              100n +
            1n
          ).toString(),
      amountOut: data.grossBuyAmount || data.buyAmount,
      gasUsd: Number(ethers.formatEther(gasCost)) * gasTokenInfo.price,
      tx: {
        to: data.to,
        value: data.value,
        data: data.data,
      },
      source: "0x",
    };
  } catch (err: unknown) {
    const typedErr = err as {
      response?: {
        data?: {
          code?: number;
          validationErrors?: Array<{ reason?: string }>;
        };
      };
    };
    if (typedErr?.response?.data?.code === 100) {
      printLog(
        "0x quote failed",
        typedErr?.response?.data?.validationErrors?.[0]?.reason,
      );
    } else {
      printError("0x", typedErr.response?.data ?? err);
    }
    if (lenRoutes === 1) {
      throw new Error(
        "Error fetching quote from 0x. Please try again later or contact support if the issue persists. You can also try a different protocol for your swap.",
      );
    }
  }
  return undefined;
};

interface PoolInfo {
  pool: string;
  tokenA: string;
  tokenB: string;
  rate0: string;
  rate1: string;
}

interface RouteStep {
  pair: PoolInfo;
  amountOut: number;
}

const getBladeswapPairsInfo = async (): Promise<PoolInfo[]> => {
  const rpcUrl = getRpcUrlForChain(81457);
  const provider = new RetryProvider(rpcUrl, 81457);
  const volatileAddress = getProtocolAddressForChain(
    "bladeswap",
    81457,
    "volatile",
  );
  if (!volatileAddress) {
    console.error("Could not find volatile address for Bladeswap");
    return [];
  }
  const viemClient = await getViemPublicClientFromEthers(provider);
  assert(isHexStr(volatileAddress));
  const pools = await viemClient.readContract({
    address: volatileAddress,
    abi: abis["bladeswap-volatilepool"],
    functionName: "getPools",
    args: [0n, 10n],
  });
  return await Promise.all(
    pools.map(async (pool: string) => {
      assert(isHexStr(pool));
      const tokenA = await viemClient.readContract({
        address: pool,
        abi: abis["bladeswap-pool"],
        functionName: "token0",
      });
      const tokenB = await viemClient.readContract({
        address: pool,
        abi: abis["bladeswap-pool"],
        functionName: "token1",
      });
      const tokenRates = await viemClient.readContract({
        address: pool,
        abi: abis["bladeswap-pool"],
        functionName: "getReserves",
      });
      const tokenRateA = ethers.formatEther(tokenRates[0]);
      const tokenRateB = ethers.formatEther(tokenRates[1]);
      return {
        pool,
        tokenA: tokenA.toLowerCase(),
        tokenB: tokenB.toLowerCase(),
        rate0: tokenRateA,
        rate1: tokenRateB,
      };
    }),
  );
};

const getTokenReserves = (
  tokenRateA: string,
  tokenRateB: string,
  AmountIn: number,
): number => {
  return (AmountIn / Number(tokenRateA)) * Number(tokenRateB);
};

const getBladeswapBestPath = async (
  from: string,
  to: string,
  AmountIn: number,
): Promise<RouteStep[]> => {
  const pairsInfo = await getBladeswapPairsInfo();
  const Routes: RouteStep[][] = [];
  for (const pair of pairsInfo) {
    if (
      (pair.tokenA === from && pair.tokenB === to) ||
      (pair.tokenA === to && pair.tokenB === from)
    ) {
      Routes.push([
        {
          pair,
          amountOut: getTokenReserves(
            pair.tokenA === from ? pair.rate0 : pair.rate1,
            pair.tokenA === from ? pair.rate1 : pair.rate0,
            AmountIn,
          ),
        },
      ]);
    } else if (pair.tokenA === from || pair.tokenB === from) {
      const curFrom = pair.tokenA === from ? pair.tokenB : pair.tokenA;
      const curAmountIn = getTokenReserves(
        pair.tokenA === from ? pair.rate0 : pair.rate1,
        pair.tokenA === from ? pair.rate1 : pair.rate0,
        AmountIn,
      );
      for (let i = 0; i < pairsInfo.length; i++) {
        if (
          (pairsInfo[i].tokenA === curFrom && pairsInfo[i].tokenB === to) ||
          (pairsInfo[i].tokenA === to && pairsInfo[i].tokenB === curFrom)
        ) {
          Routes.push([
            {
              pair,
              amountOut: getTokenReserves(
                pair.tokenA === from ? pair.rate0 : pair.rate1,
                pair.tokenA === from ? pair.rate1 : pair.rate0,
                AmountIn,
              ),
            },
            {
              pair: pairsInfo[i],
              amountOut: getTokenReserves(
                pairsInfo[i].tokenA === curFrom
                  ? pairsInfo[i].rate0
                  : pairsInfo[i].rate1,
                pairsInfo[i].tokenA === curFrom
                  ? pairsInfo[i].rate1
                  : pairsInfo[i].rate0,
                curAmountIn,
              ),
            },
          ]);
        }
      }
    }
  }
  let bestRouteId = 0;
  for (let i = 1; i < Routes.length; i++)
    if (
      Routes[bestRouteId][Routes[bestRouteId].length - 1].amountOut <
      Routes[i][Routes[i].length - 1].amountOut
    )
      bestRouteId = i;
  return Routes[bestRouteId];
};

export const getQuoteFromBladeSwap = async (
  lenRoutes: number,
  chainId: ChainId,
  account: string,
  tIn: TokenInfo,
  tOut: TokenInfo,
  amountIn: bigint | null,
): Promise<
  | {
      amountIn: string;
      amountOut: string;
      tx: { data: string; value: string; to: string };
      source: string;
    }
  | undefined
> => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);
  if (!amountIn) {
    printLog("bladeswap amountOut not supported yet");
    return undefined;
  }
  try {
    if (!isValidChainId(chainId)) {
      throw new Error(`Invalid chain id: ${chainId}`);
    }
    const BLAST_NATIVE_TOKEN = getProtocolAddressForChain(
      "bladeswap",
      chainId,
      "weth",
    );
    const parsedTokenIn = tIn.address;
    const parsedTokenOut = tOut.address;

    const isNativeIn = parsedTokenIn === NATIVE_TOKEN;
    const isNativeOut = parsedTokenOut === NATIVE_TOKEN;

    const wrappedTokenIn = isNativeIn ? BLAST_NATIVE_TOKEN : parsedTokenIn;
    const wrappedTokenOut = isNativeOut ? BLAST_NATIVE_TOKEN : parsedTokenOut;
    const normalAmountIn = Number(ethers.formatEther(amountIn.toString()));
    const bestPath = await getBladeswapBestPath(
      wrappedTokenIn || "",
      wrappedTokenOut || "",
      normalAmountIn,
    );
    let tokenBefore = wrappedTokenIn;
    let tokenAmountIn = normalAmountIn;

    const ops = bestPath?.map((item) => {
      const tokenAfter =
        item.pair.tokenA === tokenBefore ? item.pair.tokenB : item.pair.tokenA;

      const isNativeA = item.pair.tokenA === BLAST_NATIVE_TOKEN;
      const isNativeB = item.pair.tokenB === BLAST_NATIVE_TOKEN;

      const wrappedA = toToken(
        "erc20",
        0,
        isNativeA ? NATIVE_TOKEN2 : item.pair.tokenA,
      );
      const wrappedB = toToken(
        "erc20",
        0,
        isNativeB ? NATIVE_TOKEN2 : item.pair.tokenB,
      );
      const opData: [string, [string, string, bigint][]] = [
        poolId(0, item.pair.pool),
        [
          [
            wrappedA,
            item.pair.tokenA === tokenBefore
              ? isNativeA
                ? "all"
                : "exactly"
              : "at most",
            item.pair.tokenA === tokenBefore
              ? isNativeA
                ? INT128_MAX
                : ethers.parseEther(tokenAmountIn.toString())
              : 0n,
          ],
          [
            wrappedB,
            item.pair.tokenB === tokenBefore
              ? isNativeB
                ? "all"
                : "exactly"
              : "at most",
            item.pair.tokenB === tokenBefore
              ? isNativeB
                ? INT128_MAX
                : ethers.parseEther(item.amountOut.toFixed(7))
              : 0n,
          ],
        ],
      ];

      tokenBefore = tokenAfter;
      tokenAmountIn = item.amountOut;
      return opData;
    });
    if (!ops) {
      return undefined;
    }
    const res = compileAndExecute(isNativeIn ? amountIn : 0n, ops);
    const vaultAddress = getProtocolAddressForChain(
      "bladeswap",
      chainId,
      "vault",
    );
    if (!vaultAddress) {
      printLog("Could not find vault for Bladeswap");
      return undefined;
    }
    return {
      amountIn: amountIn.toString(),
      amountOut: ethers.parseEther(tokenAmountIn.toFixed(7)).toString(),
      tx: {
        data: res.calldata,
        value: isNativeIn ? amountIn.toString() : "0",
        to: vaultAddress,
      },
      source: "bladeswap",
    };
  } catch (err: unknown) {
    printError("bladeswap", err);
    if (lenRoutes === 1) {
      throw new Error(
        "Error fetching quote from Bladeswap. Please try again later or contact support if the issue persists. You can also try a different protocol for your swap.",
      );
    }
  }
  return undefined;
};

interface CowQuoteRequest {
  sellToken: string;
  buyToken: string;
  from: string;
  receiver: string;
  onchainOrder: boolean;
  kind: "sell" | "buy";
  sellAmountBeforeFee?: string;
  buyAmountAfterFee?: string;
}

interface CowQuoteResponse {
  quote: {
    sellAmount: string;
    buyAmount: string;
    feeAmount: string;
    sellToken: string;
    buyToken: string;
    receiver: string;
    validTo: number;
    appData: string;
    partiallyFillable: boolean;
  };
  id: string;
}

export const getQuoteFromCow = async (
  lenRoutes: number,
  chainId: ChainId,
  account: string,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  amountIn: bigint | null,
  amountOut: bigint | null,
): Promise<{
  amountIn: string;
  amountOut: string;
  gasUsd: number;
  signData: CowQuoteResponse;
  source: string;
  tx: undefined;
} | null> => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);

  if (chainId !== 1 && chainId !== 42161) {
    if (lenRoutes === 1) {
      throw new Error("Only Ethereum and Arbitrum are supported for Cowswap.");
    }
    return null;
  }

  try {
    const nativeTokenSymbol =
      getNativeTokenSymbolForChain(chainId)?.toLowerCase();
    const nativeSwap =
      tokenIn.symbol?.toLowerCase() === nativeTokenSymbol ||
      tokenIn.address === NATIVE_TOKEN;

    if (nativeSwap) {
      return null;
    }
    if (!tokenIn.address || !tokenOut.address) {
      printLog("Cowswap token address issue", tokenIn, tokenOut);
      return null;
    }

    const quoteRequest: CowQuoteRequest = {
      sellToken: tokenIn.address,
      buyToken:
        tokenOut.symbol?.toLowerCase() === nativeTokenSymbol ||
        tokenOut.address === NATIVE_TOKEN
          ? NATIVE_TOKEN2
          : tokenOut.address,
      from: account,
      receiver: account,
      onchainOrder: false,
      kind: amountIn ? "sell" : "buy",
    };

    if (amountIn) {
      quoteRequest.sellAmountBeforeFee = amountIn.toString();
    } else if (amountOut) {
      quoteRequest.buyAmountAfterFee = amountOut.toString();
    } else {
      throw new Error("Either amountIn or amountOut must be provided");
    }

    const { data }: { data: CowQuoteResponse } = await withRetry(account, () =>
      axios.post(
        `https://api.cow.fi/${
          chainId === 1 ? "mainnet" : "arbitrum_one"
        }/api/v1/quote`,
        quoteRequest,
        {
          headers: { accept: "application/json" },
        },
      ),
    );

    const newSellAmount = (
      BigInt(data.quote.sellAmount) + BigInt(data.quote.feeAmount)
    ).toString();

    return {
      amountIn: newSellAmount,
      amountOut: data.quote.buyAmount,
      gasUsd: 0,
      signData: {
        ...data,
        quote: {
          ...data.quote,
          sellAmount: newSellAmount,
          feeAmount: "0",
        },
      },
      source: "cowswap",
      tx: undefined,
    };
  } catch (err: unknown) {
    const typedErr = err as { response?: { data?: unknown } };
    if (typedErr?.response?.data !== "") {
      printError("cowswap", typedErr?.response?.data ?? err);
    } else {
      printLog("cowswap failed with no data");
    }
    if (lenRoutes === 1) {
      throw new Error(
        "Error fetching quote from Cowswap. Please try again later or contact support if the issue persists. You can also try a different protocol for your swap.",
      );
    }
  }
  return null;
};

export const getQuoteFromHyperliquid = async (
  chainId: ChainId,
  account: string,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  initAmountIn: bigint | null,
  amountOut: bigint | null,
  slippage = 50,
  limitPrice?: string | number,
): Promise<{
  amountIn: string;
  amountOut: string;
  amountOutUsd: number;
  signData: HyperliquidSignData;
  source: string;
  tx: undefined;
} | null> => {
  if (
    tokenIn.symbol.toLowerCase() !== "usdc" &&
    tokenOut.symbol.toLowerCase() !== "usdc"
  ) {
    throw new Error("Only swaps with USDC are supported on Hyperliquid.");
  }

  const isTokenInUsdc = tokenIn.symbol.toLowerCase() === "usdc";
  const marketToken = (
    isTokenInUsdc ? tokenOut.symbol : tokenIn.symbol
  ).toLowerCase();
  const markets = await fetchHyperliquidSpotMarkets();
  const pool = markets.find((x) => x?.base?.toLowerCase() === marketToken);
  if (!pool?.info.markPx) {
    throw new Error(`${marketToken} is not supported for swap on Hyperliquid`);
  }

  let price = Number(limitPrice || 0);

  if (!price) {
    price = pool.info.markPx;
  }

  const usdcPrice = (await getCoinData(account, "usdc", chainId)).price || 1;
  const exactOut = !initAmountIn;
  let amountIn = initAmountIn;
  if (exactOut && amountOut) {
    const tempInAmount =
      (Number.parseFloat(
        ethers.formatUnits(amountOut || 0n, tokenOut.decimals),
      ) *
        (isTokenInUsdc ? price : usdcPrice)) /
      (isTokenInUsdc ? usdcPrice : price);
    amountIn = sfParseUnits(
      tempInAmount.toFixed(tokenIn.decimals),
      tokenIn.decimals,
    );
  }
  const market = `${marketToken.toUpperCase()}/USDC`;
  let retAmount = +ethers.formatUnits(amountIn || 0n, tokenIn.decimals);
  let outputAmount = retAmount;
  if (isTokenInUsdc) {
    outputAmount /= price / usdcPrice;
  } else {
    outputAmount *= price / usdcPrice;
  }
  if (isTokenInUsdc) {
    retAmount /= price;
  }

  return {
    signData: {
      market,
      side: isTokenInUsdc ? "buy" : "sell",
      amount: retAmount,
      price,
      outputAmount,
    },
    amountIn: amountIn?.toString() || "",
    amountOut: amountOut?.toString() || "",
    amountOutUsd: 0,
    source: "hyperliquid",
    tx: undefined,
  };
};

// export const getQuoteFromFirebird = async (
//   chainId,
//   account,
//   tokenIn,
//   tokenOut,
//   amount,
//   gasPrice,
//   slippage = 1
// ) => {
//   try {
//     const sellAmount = sfParseUnits(amount, tokenIn.decimals).toString();
//     const queryParams = new URLSearchParams({
//       chainId,
//       from: tokenIn.symbol.toLowerCase() === nativeTokenSymbol ? NATIVE_TOKEN2 : tokenIn.address,
//       to: tokenOut.symbol.toLowerCase() === nativeTokenSymbol ? NATIVE_TOKEN2 : tokenOut.address,
//       amount: sellAmount,
//       receiver: account,
//       slippage,
//       source: "firebird",
//     });
//     const { data } = await axios.get(
//       `https://router.firebird.finance/aggregator/v2/quote?${queryParams}`,
//       { headers: { "Content-Type": "application/json" } }
//     );
//     return {
//       amountOut: data.grossBuyAmount,
//       tx: {
//         to: data.encodedData.router,
//         value: tokenIn.symbol.toLowerCase() === nativeTokenSymbol ? sellAmount : "0",
//         data: data.encodedData.data,
//       },
//     };
//   } catch (err) {
//     printError(err);
//   }
// };

// export const getQuoteFromKyber = async (
//   chainId,
//   account,
//   tokenIn,
//   tokenOut,
//   amount,
//   gasPrice,
//   slippage = 1
// ) => {
//   const supportedChains = {
//     42161: "arbitrum",
//     43114: "avalanche",
//     1: "ethereum",
//     137: "polygon",
//     56: "bsc",
//     10: "optimism",
//     250: "fantom",
//     25: "cronos",
//     59144: "linea",
//     8453: "base",
//     59144: "linea",
//   };
//   const chain = supportedChains[chainId];
//   if (!chain) return;

//   try {
//     const queryParams = new URLSearchParams({
//       chain,
//       tokenIn:
//         tokenIn.symbol.toLowerCase() === nativeTokenSymbol ? NATIVE_TOKEN2 : tokenIn.address,
//       tokenOut:
//         tokenOut.symbol.toLowerCase() === nativeTokenSymbol ? NATIVE_TOKEN2 : tokenOut.address,
//       amountIn: amount.toString(),
//       saveGas: false,
//       gasPrice: gasPrice.toString(),
//       source: "spice-finance",
//     });
//     const {
//       data: { data },
//     } = await axios.get(
//       `https://aggregator-api.kyberswap.com/${chain}/api/v1/routes?${queryParams}`,
//       { headers: { "x-client-id": "spice-finance" } }
//     );
//     const {
//       data: { data: _data },
//     } = await axios.post(
//       `https://aggregator-api.kyberswap.com/${chain}/api/v1/route/build`,
//       {
//         routeSummary: data.routeSummary,
//         deadline: 0,
//         slippageTolerance: slippage * 100,
//         sender: account,
//         recipient: account,
//         source: "spice-finance",
//       },
//       { headers: { "x-client-id": "spice-finance" } }
//     );
//     return {
//       amountOut: _data.amountOut,
//       gasUsd: parseFloat(_data.gasUsd),
//       tx: {
//         to: _data.routerAddress,
//         value: tokenIn.symbol.toLowerCase() === nativeTokenSymbol ? amount.toString() : "0",
//         data: _data.data,
//         gasLimit: parseInt(_data.gas),
//       },
//       source: "kyber",
//     };
//   } catch (err) {
//     printError(err);
//   }
// };

export const getQuoteFromUniswap = async (
  lenRoutes: number,
  chainId: ChainId,
  account: string,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  amountIn: bigint | null,
  amountOut: bigint | null,
  gasPrice: bigint,
  slippage = 50,
): Promise<{
  amountIn: string;
  amountOut: string;
  tx: { to: string; value: string; data: string };
  source: string;
} | null> => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);

  try {
    const quoterAddress = getProtocolAddressForChain(
      "uniswap",
      chainId,
      "quoter",
    );
    const routerAddress = getProtocolAddressForChain(
      "uniswap",
      chainId,
      "router",
    );
    const WETH_ADDRESS = getWethAddress(chainId);

    if (!quoterAddress || !routerAddress || !WETH_ADDRESS) {
      printLog("uniswap missing contract addresses", chainId);
      return null;
    }

    const actualTokenIn =
      tokenIn.symbol?.toLowerCase() === "eth" ? WETH_ADDRESS : tokenIn.address;
    const actualTokenOut =
      tokenOut.symbol?.toLowerCase() === "eth"
        ? WETH_ADDRESS
        : tokenOut.address;

    if (!actualTokenIn || !actualTokenOut) {
      printLog("Uniswap: Invalid token addresses");
      return null;
    }

    const rpcUrl = getRpcUrlForChain(chainId);
    const provider = new RetryProvider(rpcUrl, chainId);
    const quoterContract = new ethers.Contract(
      quoterAddress,
      abis["uniswap-quoter-v3"],
      provider,
    );

    let paths: string[];
    if (amountOut && !amountIn) {
      // For exact output, encode path in reverse order
      paths = [
        encodePath([actualTokenOut, actualTokenIn], [3000]),
        actualTokenIn !== WETH_ADDRESS && actualTokenOut !== WETH_ADDRESS
          ? encodePath(
              [actualTokenOut, WETH_ADDRESS, actualTokenIn],
              [3000, 3000],
            )
          : null,
      ].filter((path): path is string => path !== null);
    } else {
      // For exact input, keep current order
      paths = [
        encodePath([actualTokenIn, actualTokenOut], [3000]),
        actualTokenIn !== WETH_ADDRESS && actualTokenOut !== WETH_ADDRESS
          ? encodePath(
              [actualTokenIn, WETH_ADDRESS, actualTokenOut],
              [3000, 3000],
            )
          : null,
      ].filter((path): path is string => path !== null);
    }

    let bestQuote: bigint | null = null;
    let bestPath: string | null = null;

    if (amountOut && !amountIn) {
      const quotePromises = paths.map((path) => {
        return quoterContract.quoteExactOutput
          .staticCall(path, amountOut.toString())
          .then((quotedAmountIn) => ({
            path,
            quotedAmountIn,
          }))
          .catch((err) => {
            printLog("uniswap failed to get quote for path");
            return null;
          });
      });
      const results = await Promise.all(quotePromises);
      for (const result of results) {
        if (!result) continue;

        if (!bestQuote || result.quotedAmountIn < bestQuote) {
          bestQuote = result.quotedAmountIn;
          bestPath = result.path;
        }
      }
    } else {
      const quotePromises = paths.map((path) =>
        quoterContract.quoteExactInput
          .staticCall(path, amountIn?.toString())
          .catch((err) => {
            printLog("uniswap failed to get quote for path");
            return null;
          }),
      );
      const quotes = await Promise.all(quotePromises);
      quotes.forEach((quote, index) => {
        if (quote && (!bestQuote || quote > bestQuote)) {
          bestQuote = quote;
          bestPath = paths[index];
        }
      });
    }

    if (!bestQuote || !bestPath) {
      printLog("uniswap no valid route found");
      return null;
    }

    const minAmountOut = (bestQuote * BigInt(100 - slippage)) / BigInt(100);

    const routerContract = new ethers.Contract(
      routerAddress,
      abis["uniswap-router-v3"],
      provider,
    );
    let swapData: string; // Since encodeFunctionData returns a string

    if (amountOut) {
      swapData = routerContract.interface.encodeFunctionData("exactOutput", [
        {
          path: bestPath,
          recipient: account,
          deadline: Math.floor(Date.now() / 1000) + 1800,
          amountOut: amountOut,
          amountInMaximum: bestQuote,
        },
      ]);
    } else {
      swapData = routerContract.interface.encodeFunctionData("exactInput", [
        {
          path: bestPath,
          recipient: account,
          deadline: Math.floor(Date.now() / 1000) + 1800,
          amountIn: amountIn,
          amountOutMinimum: minAmountOut,
        },
      ]);
    }

    return {
      amountIn: amountOut ? bestQuote.toString() : (amountIn || "0").toString(),
      amountOut: amountOut ? amountOut.toString() : bestQuote.toString(),
      tx: {
        to: routerAddress,
        value:
          tokenIn.symbol?.toLowerCase() ===
          getNativeTokenSymbolForChain(chainId)?.toLowerCase()
            ? (amountOut ? bestQuote : amountIn || "0").toString()
            : "0",
        data: swapData,
      },
      source: "uniswap",
    };
  } catch (err) {
    printError("uniswap quote failed", err);
    if (lenRoutes === 1) {
      throw err;
    }
    return null;
  }
};

// Helper function to encode path for multi-hop swaps
function encodePath(path: string[], fees: number[]): string {
  if (path.length !== fees.length + 1) {
    throw new Error("Uniswap: path/fee lengths do not match");
  }
  let encoded = "0x";
  for (let i = 0; i < fees.length; i++) {
    encoded += path[i].slice(2);
    encoded += fees[i].toString(16).padStart(6, "0");
  }
  encoded += path[path.length - 1].slice(2);
  return encoded;
}

function getWethAddress(chainId: ChainId): string | null {
  switch (chainId) {
    case 1:
      return "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // Mainnet
    case 137:
      return "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270"; // Polygon (WMATIC)
    case 8453:
      return "0x4200000000000000000000000000000000000006"; // Base
    case 81457:
      return "0x4300000000000000000000000000000000000004"; // Blast
    case 42161:
      return "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"; // Arbitrum
    case 10:
      return "0x4200000000000000000000000000000000000006"; // Optimism
    default:
      return null;
  }
}

export type SwapRoute = {
  tx?: {
    to: string;
    data: string;
    value: string;
    gas?: string;
  };
  signData?: CowQuoteResponse | HyperliquidSignData;
  source: string;
  amountIn: string;
  amountOut?: string;
  amountOutUsd?: number;
  realAmountOutUsd?: number;
};

type QuoteFunction = (
  lenRoutes: number,
  chainId: ChainId,
  account: string,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  amountIn: bigint | null,
  amountOut: bigint | null,
  gasPrice: bigint,
  slippage: number,
  prevSource?: string,
  dexList?: string[],
) => Promise<SwapRoute | null | undefined>;

export const getBestSwapRoutes = async (
  chainId: ChainId,
  account: string,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  amountIn: bigint | null,
  amountOut: bigint | null,
  gasPrice: bigint,
  slippage0 = 50,
  limitPrice: string | number | undefined = undefined,
  ignore: string[] = [],
  prevSource?: string,
  rpc?: string,
  isExecution?: boolean,
): Promise<SwapRoute[]> => {
  let slippage = slippage0;
  if (!slippage0 || isNaNValue(slippage0)) slippage = 50;

  const originVnetId = getVnetIdFromRpc(rpc);
  const simulationId = Date.now().toString();
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);
  let tIn = tokenIn;
  let tOut = tokenOut;
  const nativeToken = getNativeTokenSymbolForChain(chainId);
  const chainName = getChainNameFromId(chainId);
  const wETHInfo = await getTokenInfoForChain("weth", chainName);
  if (nativeToken?.toLowerCase() !== "eth" && wETHInfo) {
    if (tokenIn.symbol?.toLowerCase() === "eth") {
      tIn = wETHInfo;
    } else if (tokenOut.symbol?.toLowerCase() === "eth") {
      tOut = wETHInfo;
    }
  }

  if (prevSource === "hyperliquid") {
    const route = await getQuoteFromHyperliquid(
      chainId,
      account,
      tIn,
      tOut,
      amountIn,
      amountOut,
      slippage,
      limitPrice,
    );
    if (route) {
      return [
        {
          ...route,
          signData: route.signData,
        },
      ];
    }
  }

  let swapRoutes: QuoteFunction[] = [
    getQuoteFromOpenOcean,
    getQuoteFromAmbient,
    getQuoteFromLeetswap,
    getQuoteFrom1inch,
    getQuoteFromLiFi,
    getQuoteFromParaSwap,
    getQuoteFrom0x,
    getQuoteFromSynapse,
    getQuoteFromOdos,
    getQuoteFromBladeSwap,
    getQuoteFromCow,
    getQuoteFromBlastChain,
    getQuoteFromUniswap,
  ];
  let dexList: string[] | undefined;
  if (prevSource) {
    switch (prevSource) {
      case "paraswap":
      case "sushiswap":
      case "llamazip":
      case "curve":
      case "camelot":
      case "kyberswap":
      case "pancakeswap":
      case "traderjoe":
      case "balancer": {
        if (prevSource === "sushiswap") {
          dexList = ["SushiSwap"];
        } else if (prevSource === "llamazip") {
          dexList = ["Llamazip"];
        } else if (prevSource === "curve") {
          dexList = ["Curve"];
        } else if (prevSource === "camelot") {
          dexList = ["Camelot", "CamelotV3"];
        } else if (prevSource === "balancer") {
          dexList = ["Balancer"];
        } else if (prevSource === "kyberswap") {
          dexList = ["KyberDmm"];
        } else if (prevSource === "pancakeswap") {
          dexList = ["PancakeswapV3"];
        } else if (prevSource === "traderjoe") {
          dexList = ["TraderJoe"];
        }
        swapRoutes = [getQuoteFromParaSwap];
        break;
      }
      case "uniswap": {
        swapRoutes = [getQuoteFromUniswap];
        break;
      }
      case "ambient": {
        swapRoutes = [getQuoteFromAmbient];
        break;
      }
      case "hashflow": {
        swapRoutes = [getQuoteFromHashflow];
        break;
      }
      case "0x":
      case "aerodrome":
      case "matcha":
      case "velodrome": {
        swapRoutes = [getQuoteFrom0x];
        break;
      }
      case "synapse": {
        swapRoutes = [getQuoteFromSynapse];
        break;
      }
      case "1inch": {
        swapRoutes = [getQuoteFrom1inch];
        break;
      }
      case "lifi":
      case "jumper": {
        swapRoutes = [getQuoteFromLiFi];
        break;
      }
      case "odos": {
        swapRoutes = [getQuoteFromOdos];
        break;
      }
      case "syncswap":
      case "thruster":
      case "openocean": {
        swapRoutes = [getQuoteFromOpenOcean];
        break;
      }
      case "leetswap": {
        swapRoutes = [getQuoteFromLeetswap];
        break;
      }
      case "cowswap": {
        swapRoutes = [getQuoteFromCow];
        break;
      }
      case "bladeswap": {
        swapRoutes = [getQuoteFromBladeSwap];
        break;
      }
      case "slate": {
        swapRoutes = [getQuoteFromBlastChain];
        break;
      }
      default: {
        throw new Error(getUnsupportedProtocolError(prevSource, "swap"));
      }
    }
  }

  if (prevSource === "cowswap") {
    if (tokenIn.symbol?.toLowerCase() === "eth") {
      throw new Error("Native token swap is not supported on Cowswap");
    }
  }

  const gasTokenInfo = await getCoinData(
    account,
    getNativeTokenSymbolForChain(chainId),
    chainId,
  );
  if (!gasTokenInfo) {
    throw new Error("Rate limit, come back later");
  }
  const tokenOutPriceData = await getCoinData(
    account,
    tOut.address ?? tOut.symbol,
    chainId,
    false,
  );
  const tokenOutPrice = tokenOutPriceData?.price ?? 0;

  const tokenInPriceData = await getCoinData(
    account,
    tIn.address ?? tIn.symbol,
    chainId,
    false,
  );
  const tokenInPrice = tokenInPriceData?.price ?? 0;

  const timeLimit =
    swapRoutes.length === 1
      ? 86400000
      : Number(process.env.MAX_TIME || "23000");

  if (originVnetId) {
    let previousPromise: Promise<{ vnetId: string; rpcUrl: string }> =
      Promise.resolve({ vnetId: "", rpcUrl: "" });
    vNets[simulationId] = Array(swapRoutes.length)
      .fill(null)
      .map(() => {
        previousPromise = previousPromise.then(() =>
          duplicateVnet(originVnetId),
        );
        return {
          data: previousPromise,
          used: false,
        };
      });
  }

  // Get all routes with a timeout of 13s
  let promises = swapRoutes.map(async (swapRoute) => {
    return Promise.race([
      bestSwapRoute(
        swapRoute,
        swapRoutes,
        chainId,
        account,
        tIn,
        tOut,
        amountIn,
        amountOut,
        gasPrice,
        slippage,
        prevSource,
        dexList,
        ignore,
        tokenOut,
        tokenOutPrice,
        originVnetId,
        printLog,
        gasTokenInfo,
        printError,
        simulationId,
      )(),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve("TIME_OUT"), timeLimit),
      ),
    ]);
  });

  // Filter route based on slippage
  // Returns true if route passes slippage check, false otherwise
  const filterRoute = (route: SwapRoute) => {
    const amountInUsd =
      +ethers.formatUnits(route.amountIn, tokenIn.decimals) * tokenInPrice;
    let amountOutUsd = route.realAmountOutUsd;
    if (!amountOutUsd && route.amountOut)
      amountOutUsd =
        +ethers.formatUnits(route.amountOut, tokenOut.decimals) * tokenOutPrice;

    if (!amountOutUsd) return false;
    return amountOutUsd / amountInUsd >= (100 - slippage) / 100;
  };

  // If execution flow, proceed await all routes to complete, then sort and filter
  if (isExecution) {
    const routes = (await Promise.all(promises)).filter(
      (data): data is SwapRoute =>
        !!data &&
        typeof data === "object" &&
        !("length" in data) &&
        "source" in data,
    );

    const sortedRoutes = sortRoutes(
      routes,
      amountOut,
      tokenOutPrice,
      tokenOut.decimals,
    );
    if (tokenInPrice && tokenOutPrice) {
      const filteredRoutes = sortedRoutes.filter(filterRoute);
      if (filteredRoutes.length) {
        return filteredRoutes;
      }

      throw new Error(`No swap route found with slippage ${slippage}%`);
    }
    return sortedRoutes;
  }

  // Otherwise, if simulation flow, proceed with the following logic
  // Wait for the first promise to resolve, then maximally wait for 500ms for other promises to complete
  // If the first promise resolves to a route, check if it passes the slippage check
  // Otherwise, continue with the next promise
  // Meant to save time by not waiting for all routes to complete during simulation
  const validRoutes: SwapRoute[] = [];
  while (promises.length > 0) {
    // Get the first promise to resolve
    const [nextPossibleRoute, index] = await Promise.race(
      promises.map(
        async (p, i) =>
          [await p, i] as [SwapRoute | string | undefined, number],
      ),
    );

    if (nextPossibleRoute === "TIME_OUT") {
      if (validRoutes.length) {
        break;
      }
      throw new Error(`No swap route found with slippage ${slippage}%`);
    }

    // Get the remaining promises
    promises = [...promises.slice(0, index), ...promises.slice(index + 1)];

    // Skip undefined/invalid routes but keep original timeouts
    if (!nextPossibleRoute) {
      continue;
    }

    const route = nextPossibleRoute as SwapRoute;

    if (tokenInPrice && tokenOutPrice) {
      // If slippage is set, check if route is valid
      const amountInUsd =
        +ethers.formatUnits(route.amountIn, tokenIn.decimals) * tokenInPrice;
      let amountOutUsd = route.realAmountOutUsd;
      if (!amountOutUsd && route.amountOut) {
        amountOutUsd =
          +ethers.formatUnits(route.amountOut, tokenOut.decimals) *
          tokenOutPrice;
      }

      if (!amountOutUsd) {
        // Route does not pass slippage check, wait for other routes to complete
        continue;
      }

      if (amountOutUsd / amountInUsd >= (100 - slippage) / 100) {
        // Route passes slippage check!
        validRoutes.push(route);
        // Add 500ms timeout to remaining routes
        promises = promises.map((promise) =>
          Promise.race([
            promise,
            new Promise<string>((resolve) =>
              setTimeout(() => resolve("TIME_OUT"), 500),
            ),
          ]),
        );
      }
      continue;
    }
    // No slippage check possible
    validRoutes.push(route);
    // Add 500ms timeout to remaining routes
    promises = promises.map((promise) =>
      Promise.race([
        promise,
        new Promise<string>((resolve) =>
          setTimeout(() => resolve("TIME_OUT"), 500),
        ),
      ]),
    );
  }

  if (validRoutes.length) {
    return sortRoutes(validRoutes, amountOut, tokenOutPrice, tokenOut.decimals);
  }

  console.log("DONE ERROR");
  throw new Error(`No swap route found with slippage ${slippage}%`);
};

function bestSwapRoute(
  swapRoute: QuoteFunction,
  swapRoutes: QuoteFunction[],
  chainId: ChainId,
  account: string,
  tIn: TokenInfo,
  tOut: TokenInfo,
  amountIn: bigint | null,
  amountOut: bigint | null,
  gasPrice: bigint,
  slippage: number,
  prevSource: string | undefined,
  dexList: string[] | undefined,
  ignore: string[],
  tokenOut: TokenInfo,
  tokenOutPrice: number,
  originVnetId: string | undefined,
  printLog: (...logs: unknown[]) => void,
  gasTokenInfo: CoinCache,
  printError: (...errs: unknown[]) => void,
  simulationId: string,
) {
  return async (): Promise<SwapRoute | undefined> => {
    const data = await swapRoute(
      swapRoutes.length,
      chainId,
      account,
      tIn,
      tOut,
      amountIn,
      amountOut,
      gasPrice,
      slippage,
      prevSource,
      dexList,
    );

    if (!data) return undefined;

    if (ignore.includes(data.source)) {
      return undefined;
    }

    let attempts = 0;
    /* eslint-disable no-await-in-loop */
    while (attempts < 2) {
      if (chainId === ChainIDs.zksync) {
        return {
          tx: data.tx,
          signData: data.signData,
          source: data.source,
          amountIn: data.amountIn,
          amountOutUsd: 0,
        };
      }
      if (data.source === "cowswap" && data.amountOut) {
        const newAmountOutUsd =
          Number(
            ethers.formatUnits(BigInt(data.amountOut), tokenOut.decimals),
          ) * tokenOutPrice;
        return {
          tx: data.tx,
          signData: data.signData,
          source: data.source,
          amountIn: data.amountIn,
          amountOutUsd: newAmountOutUsd,
          realAmountOutUsd: newAmountOutUsd,
        };
      }
      try {
        if (!data.tx) {
          throw new Error("No transaction data for swap found.");
        }

        let vnetInfo: { vnetId: string; rpcUrl: string };
        if (originVnetId && chainId !== ChainIDs.zksync) {
          if (!vNets[simulationId]) {
            printError(`No vnets initialized for simulation ${simulationId}`);
            return undefined;
          }

          // Find first unused vnet
          const unusedVnetIndex = vNets[simulationId].findIndex((v) => !v.used);
          if (unusedVnetIndex === -1) {
            printError(`No vnets free for simulation ${simulationId}`);
            return undefined;
          }
          vNets[simulationId][unusedVnetIndex].used = true;
          vnetInfo = await vNets[simulationId][unusedVnetIndex].data;
        } else {
          vnetInfo = await createVnet(chainId);
        }

        const provider = new RetryProvider(vnetInfo.rpcUrl, chainId);

        await addBalance(provider, account, ethers.parseEther("1000000"));
        const nativeTokenSymbol =
          getNativeTokenSymbolForChain(chainId)?.toLowerCase();

        // Get initial balance of input token
        let initialInAmount: bigint;
        const viemClient = await getViemPublicClientFromEthers(provider);
        if (tIn.symbol?.toLowerCase() === nativeTokenSymbol) {
          initialInAmount = await provider.getBalance(account);
        } else {
          if (!tIn.address) {
            throw new Error("Token address is undefined");
          }
          assert(isHexStr(tIn.address));
          assert(isHexStr(account));
          initialInAmount = await viemClient.readContract({
            address: tIn.address,
            abi: abis.erc20,
            functionName: "balanceOf",
            args: [account],
          });
        }

        // Get initial balance of output token
        let initialOutAmount = 0n;
        if (tOut.symbol?.toLowerCase() === nativeTokenSymbol) {
          initialOutAmount = await provider.getBalance(account);
        } else {
          if (!tOut.address) {
            throw new Error("Token address is undefined");
          }
          assert(isHexStr(tOut.address));
          assert(isHexStr(account));
          initialOutAmount = await viemClient.readContract({
            address: tOut.address,
            abi: abis.erc20,
            functionName: "balanceOf",
            args: [account],
          });
        }

        if (tIn.symbol?.toLowerCase() !== nativeTokenSymbol) {
          if (!tIn.address) {
            throw new Error("Token address is undefined");
          }
          assert(isHexStr(tIn.address));
          assert(isHexStr(account));
          const currentBalance = await viemClient.readContract({
            address: tIn.address,
            abi: abis.erc20,
            functionName: "balanceOf",
            args: [account],
          });
          const toAdd = data.amountIn ? BigInt(data.amountIn) : currentBalance;
          const newBalance = currentBalance + toAdd;
          if (currentBalance < toAdd && chainId.toString() !== "81457") {
            await setErc20Balance(provider, tIn.address, account, newBalance);
          }
          if (data.source === "paraswap") {
            if (!isValidChainId(chainId)) {
              throw new Error(`Invalid chain id: ${chainId}`);
            }
            const tokenProxy = getProtocolAddressForChain(
              data.source,
              chainId,
              "transferProxy",
            );
            if (!tokenProxy) {
              throw new Error(
                `No token proxy for Paraswap chainId ${chainId}.`,
              );
            }
            const approveTxs: Transaction[] = await getApproveData(
              provider,
              tIn,
              ethers.MaxUint256,
              account,
              tokenProxy,
            );
            for (const approveTx of approveTxs) {
              const hash = await provider.send("eth_sendTransaction", [
                {
                  ...approveTx,
                  value: "0x0",
                  from: account,
                },
              ]);
              await withRetry(account, () => provider.waitForTransaction(hash));
            }
          } else {
            // approve for ERC20 tokens
            const tokenContract = new ethers.Contract(tIn.address, abis.erc20);
            const hash = await provider.send("eth_sendTransaction", [
              {
                from: account,
                to: tIn.address,
                data: tokenContract.interface.encodeFunctionData("approve", [
                  data.tx.to,
                  ethers.MaxUint256,
                ]),
                value: "0x0",
              },
            ]);
            await withRetry(account, () => provider.waitForTransaction(hash));
          }
        }
        let skip = false;
        let j = 0;
        const maxRetries = 4;
        let receipt: ethers.TransactionReceipt | null = null;
        while (j < maxRetries) {
          j++;
          try {
            const hash = await provider.send("eth_sendTransaction", [
              {
                from: account,
                to: data.tx.to,
                data: data.tx.data,
                value: convertToHexString(data.tx.value),
              },
            ]);
            receipt = await withRetry(account, () =>
              provider.waitForTransaction(hash),
            );
            if (!receipt?.status) {
              if (j >= maxRetries) {
                skip = true;
                break;
              }
              await new Promise((resolve) =>
                setTimeout(resolve, 2 ** (j - 1) * 1000),
              ); // Exponential backoff
            } else {
              break;
            }
          } catch {
            if (j >= maxRetries) {
              skip = true;
              break;
            }
            await new Promise((resolve) =>
              setTimeout(resolve, 2 ** (j - 1) * 1000),
            ); // Exponential backoff
          }
        }
        if (skip || !receipt) {
          printLog(data.source, "failed", vnetInfo.vnetId);
          return undefined;
        }

        // Get final balances and calculate actual amounts
        let outAmount: bigint;
        let finalInAmount: bigint;
        if (tOut.symbol?.toLowerCase() === nativeTokenSymbol) {
          outAmount = await provider.getBalance(account);
        } else {
          if (!tOut.address) {
            throw new Error("Token address is undefined");
          }
          assert(isHexStr(tOut.address));
          assert(isHexStr(account));
          outAmount = await viemClient.readContract({
            address: tOut.address,
            abi: abis.erc20,
            functionName: "balanceOf",
            args: [account],
          });
        }
        if (outAmount) outAmount -= initialOutAmount;

        const gasCost = BigInt(gasPrice) * BigInt(receipt.gasUsed);

        if (tIn.symbol?.toLowerCase() === nativeTokenSymbol) {
          finalInAmount = await provider.getBalance(account);
          // For native token, need to account for gas cost in the input amount
          finalInAmount = initialInAmount - finalInAmount - gasCost;
        } else {
          if (!tIn.address) {
            throw new Error("Token address is undefined");
          }
          assert(isHexStr(tIn.address));
          assert(isHexStr(account));

          finalInAmount = await viemClient.readContract({
            address: tIn.address,
            abi: abis.erc20,
            functionName: "balanceOf",
            args: [account],
          });
          finalInAmount = initialInAmount - finalInAmount;
        }

        const requestedAmount = Number(
          ethers.formatUnits(data.amountIn, tIn.decimals),
        );
        let balanceChange = Number(
          ethers.formatUnits(finalInAmount, tIn.decimals),
        );
        if (tIn.symbol?.toLowerCase() === nativeTokenSymbol) {
          balanceChange += Number(ethers.formatUnits(gasCost, tIn.decimals));
        }
        if (
          Math.abs(balanceChange - requestedAmount) / requestedAmount >
          0.05
        ) {
          printLog(
            "error too different",
            data.source,
            requestedAmount,
            balanceChange,
            initialInAmount,
            finalInAmount,
          );
          return undefined;
        }

        const newAmountOut = outAmount || BigInt(data.amountOut || 0);
        assert(isDefined(gasTokenInfo.price));
        const gasUsd = Number(ethers.formatEther(gasCost)) * gasTokenInfo.price;
        let newAmountOutUsd = 0;
        if (tokenOutPrice) {
          newAmountOutUsd =
            Number(ethers.formatUnits(newAmountOut, tokenOut.decimals)) *
            tokenOutPrice;
        }
        return {
          tx: {
            ...data.tx,
            gas: convertToHexString((receipt.gasUsed || 0n).toString()),
          },
          signData: data.signData,
          source: data.source,
          amountIn:
            Number(data.amountIn) > Number(finalInAmount)
              ? data.amountIn
              : finalInAmount.toString(),
          amountOut: data.amountOut,
          amountOutUsd: newAmountOutUsd - gasUsd || 1,
          realAmountOutUsd: newAmountOutUsd || 1,
        };
      } catch (err) {
        if (attempts >= 1) {
          printError(`${data.source} failed initial simulation`, err);
        }
      }
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 10000)); // Exponential backoff
    }
    return undefined;
  };
}

function sortRoutes(
  routes: SwapRoute[],
  amountOut: bigint | null,
  tokenOutPrice?: number,
  tokenOutDecimals?: number,
) {
  if (amountOut && tokenOutPrice && tokenOutDecimals !== undefined) {
    const amountOutUsd_ =
      Number(ethers.formatUnits(amountOut, tokenOutDecimals)) * tokenOutPrice;

    return routes.sort((a, b) => {
      const aDiff = Math.abs((a.amountOutUsd ?? 0) - amountOutUsd_);
      const bDiff = Math.abs((b.amountOutUsd ?? 0) - amountOutUsd_);

      if (a.source === "cowswap") {
        // CowSwap needs to be 5% better
        return aDiff < bDiff * 0.95 ? -1 : 1;
      }
      if (b.source === "cowswap") {
        // Normal comparison for other routes against CowSwap
        return aDiff < bDiff ? -1 : 1;
      }
      // Normal comparison
      return aDiff - bDiff;
    });
  }
  return routes.sort((a, b) => {
    const aRatio = (a.amountOutUsd ?? 0) / Number(a.amountIn);
    const bRatio = (b.amountOutUsd ?? 0) / Number(b.amountIn);

    if (a.source === "cowswap") {
      // CowSwap needs to be 5% better
      return aRatio > bRatio * 1.05 ? -1 : 1;
    }
    if (b.source === "cowswap") {
      // Normal comparison for other routes against CowSwap
      return aRatio > bRatio ? -1 : 1;
    }
    // Normal comparison
    return bRatio - aRatio;
  });
}
