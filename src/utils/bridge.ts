import { JsonRpcProvider } from "@ethersproject/providers";
import { getRoutes, getStepTransaction } from "@lifi/sdk";
import {
  MAINNET_RELAY_API,
  createClient,
  getClient,
} from "@reservoir0x/relay-sdk";
import { SynapseSDK } from "@synapsecns/sdk-router";
import axios from "axios";
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
import { NATIVE_TOKEN2 } from "../constants.js";
import { getUnsupportedProtocolError } from "./error.js";
import { getViemPublicClientFromEthers } from "./ethers2viem.js";
import {
  convertToHexString,
  getABIForProtocol,
  getAcrossSupportedTokens,
  getChainNameFromId,
  getCoinData,
  getCurrentTimestamp,
  getFunctionData,
  getNativeTokenSymbolForChain,
  getProtocolAddressForChain,
  getRpcUrlForChain,
  getStargateChainId,
  getTokenInfoForChain,
  isValidChainId,
  sfParseUnits,
  withRetry,
} from "./index.js";
import { usePrintError, usePrintLog } from "./log.js";
import { RetryProvider } from "./retryProvider.js";
import type {
  ChainId,
  ContractCallParam,
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

export const getQuoteFromAcross: BridgeQuoteFunction = async (
  sourceChainId,
  destChainId,
  account,
  sourceToken,
  destToken,
  amount,
  lenRoutes,
) => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);
  const srcSupportedTokens = getAcrossSupportedTokens(sourceChainId);
  if (
    !srcSupportedTokens
      .map((token) => token.toLowerCase())
      .includes(sourceToken.symbol.toLowerCase())
  ) {
    printError(
      `Token ${sourceToken.symbol.toLowerCase()} is not supported on ${getChainNameFromId(sourceChainId)} for Across.`,
    );
    if (lenRoutes === 1) {
      throw new Error(
        `Token ${sourceToken.symbol.toLowerCase()} is not supported on ${getChainNameFromId(sourceChainId)} for Across.`,
      );
    }
    return null;
  }
  try {
    if (sourceToken.symbol.toLowerCase() === "weth") {
      if (lenRoutes === 1) {
        throw new Error(
          `Token ${sourceToken.symbol.toLowerCase()} is not supported on ${getChainNameFromId(sourceChainId)} for Across.`,
        );
      }
      printLog("across messes up eth/weth");
      return null;
    }

    const srcNativeTknSym =
      getNativeTokenSymbolForChain(sourceChainId)?.toLowerCase();

    const isBridgingNative =
      sourceToken.symbol.toLowerCase() === srcNativeTknSym;

    if (!isValidChainId(sourceChainId)) {
      throw new Error(`Invalid chain id: ${sourceChainId}`);
    }
    const address = getProtocolAddressForChain(
      "across",
      sourceChainId,
      isBridgingNative ? "spokePoolVerifier" : "spokePool",
    );
    const abi = getABIForProtocol(
      "across",
      isBridgingNative ? "spoke-pool-verifier" : "spoke-pool",
    );
    if (!address || !abi) {
      printLog("across doesn't support this");
      return null;
    }

    const wrappedNative = await getTokenInfoForChain(
      `w${sourceToken.symbol}`,
      getChainNameFromId(sourceChainId),
    );
    if (isBridgingNative && !wrappedNative) {
      printError("Wrapped native token info not found");
      return null;
    }
    if (
      !sourceChainId ||
      !destChainId ||
      !sourceToken.address ||
      !destToken.address ||
      !amount
    ) {
      printError(
        "Invalid parameters for Across bridge",
        sourceChainId,
        destChainId,
        sourceToken.address,
        destToken.address,
        amount,
      );
      return null;
    }
    if (isBridgingNative && !wrappedNative?.address) {
      printError("Wrapped native token info not found");
      return null;
    }
    const apiUrl = "https://app.across.to/api/suggested-fees?";
    const bridgeParams = new URLSearchParams({
      originChainId: sourceChainId.toString(),
      destinationChainId: destChainId.toString(),
      token: isBridgingNative
        ? `${wrappedNative?.address}`
        : sourceToken.address,
      amount: amount.toString(),
    });
    const { data: quote } = await withRetry(account, () =>
      axios.get(apiUrl + bridgeParams.toString()),
    );

    const params: ContractCallParam[] = [];

    if (isBridgingNative) {
      params.push(quote.spokePoolAddress);
      params.push(account);
      params.push(`${wrappedNative?.address}`);
    } else {
      params.push(account);
      params.push(sourceToken.address);
    }
    params.push(amount);
    params.push(destChainId);
    params.push(quote.relayFeePct);
    params.push(quote.timestamp);
    params.push("0x");
    params.push(ethers.MaxUint256);

    const data = await getFunctionData(
      address,
      abi,
      "deposit",
      params,
      isBridgingNative ? amount.toString() : "0",
    );

    const amountOut =
      amount -
      BigInt(quote.capitalFeeTotal) -
      BigInt(quote.relayFeeTotal) -
      BigInt(quote.lpFee.total);

    return {
      amountOut: amountOut.toString(),
      txs: [
        {
          to: data.to,
          value: data.value.toString(),
          data: data.data,
        },
      ],
      source: "across",
      usdFee: 0, //already accounted for in amountOut
    };
  } catch (err) {
    const typedErr = err as { response?: { data?: unknown }; message?: string };
    printError("across", typedErr.response?.data ?? typedErr.message ?? err);
    if (lenRoutes === 1) {
      throw new Error(
        "Error fetching quote from Across. Please try again later or contact support if the issue persists. You can also try a different protocol for your swap.",
      );
    }
  }
  return null;
};

export const getQuoteFromBungee: BridgeQuoteFunction = async (
  sourceChainId,
  destChainId,
  account,
  sourceToken,
  destToken,
  amount,
  lenRoutes,
) => {
  const printError = usePrintError(account);
  if (!sourceToken.address || !destToken.address) {
    return null;
  }
  try {
    const srcNativeTknSym =
      getNativeTokenSymbolForChain(sourceChainId)?.toLowerCase();
    const destNativeTknSym =
      getNativeTokenSymbolForChain(destChainId)?.toLowerCase();
    const queryParams = new URLSearchParams({
      fromChainId: sourceChainId.toString(),
      fromTokenAddress:
        sourceToken.symbol.toLowerCase() === srcNativeTknSym
          ? NATIVE_TOKEN2
          : sourceToken.address,
      toChainId: destChainId.toString(),
      toTokenAddress:
        destToken.symbol.toLowerCase() === destNativeTknSym
          ? NATIVE_TOKEN2
          : destToken.address,
      fromAmount: amount.toString(),
      userAddress: account,
      uniqueRoutesPerBridge: true.toString(),
      sort: "output",
      singleTxOnly: true.toString(),
    });
    let response = await withRetry(account, () =>
      axios.get(`https://api.socket.tech/v2/quote?${queryParams}`, {
        headers: { "API-KEY": process.env.API_KEY_BUNGEE },
      }),
    );
    const {
      data: { success, result },
    } = response;

    if (!success) return null;
    if (result.routes.length === 0) return null;
    const bestRoute = result.routes[0];
    response = await withRetry(account, () =>
      axios.post(
        "https://api.socket.tech/v2/build-tx?",
        { route: bestRoute },
        { headers: { "API-KEY": process.env.API_KEY_BUNGEE } },
      ),
    );
    const data = response.data;
    if (!data.success) return null;

    return {
      amountOut: bestRoute.toAmount,
      txs: [
        {
          to: data.result.txTarget,
          value: data.result.value,
          data: data.result.txData,
        },
      ],
      source: "bungee",
      usdFee:
        bestRoute.totalGasFeesInUsd + Number(bestRoute.integratorFee.amount), // assumes usd or stablecoin integrator fee, might not always be true
    };
  } catch (err) {
    const typedErr = err as { response?: { data?: unknown }; message?: string };
    printError(
      "bungee",
      typedErr.response?.data ?? typedErr.response ?? typedErr.message ?? err,
    );
    if (lenRoutes === 1) {
      throw new Error(
        "Error fetching quote from Bungee/Socket. Please try again later or contact support if the issue persists. You can also try a different protocol for your swap.",
      );
    }
  }
  return null;
};

export const getQuoteFromHop: BridgeQuoteFunction = async (
  sourceChainId,
  destChainId,
  account,
  sourceToken,
  destToken,
  amount,
  lenRoutes,
) => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);

  // Skip Hop if bridging from Base, with specific error if user requested Hop
  if (sourceChainId === 8453) {
    printLog("Skipping Hop bridge from Base chain");
    return null;
  }

  const srcNativeTknSym =
    getNativeTokenSymbolForChain(sourceChainId)?.toLowerCase();
  if (!isValidChainId(sourceChainId)) {
    throw new Error(`Invalid chain id: ${sourceChainId}`);
  }

  const bridgeContractAddress = getProtocolAddressForChain(
    "hop",
    sourceChainId,
    `bridge-${sourceToken.symbol.toLowerCase()}`,
  );

  // Log the bridge contract address
  // console.log("Hop: Bridge Contract Address:", bridgeContractAddress);

  if (!bridgeContractAddress) {
    printLog(
      "hop bridge is missing",
      sourceToken,
      "on",
      sourceChainId,
      "to",
      destChainId,
    );
    return null;
  }
  const abi = getABIForProtocol(
    "hop",
    sourceChainId === 1 ? "l1bridge" : "l2bridge",
  );
  const funcName = sourceChainId === 1 ? "sendToL2" : "swapAndSend";
  try {
    const fromChain = getChainNameFromId(sourceChainId);
    const toChain = getChainNameFromId(destChainId);
    if (!fromChain || !toChain) {
      return null;
    }
    const headers = { headers: { accept: "application/json" } };
    const apiUrl = "https://api.hop.exchange/v1/quote?";
    const bridgeParams = new URLSearchParams({
      fromChain,
      toChain,
      token: sourceToken.symbol.toUpperCase(),
      amount: amount.toString(),
      slippage: "1",
    });
    const url = apiUrl + bridgeParams.toString();
    const { data: quote } = await withRetry(account, () =>
      axios.get(url, headers),
    );
    if (quote.error) {
      printLog(quote.error);
      printLog(
        "hop unsupported chain",
        sourceToken,
        "on",
        sourceChainId,
        "to",
        destChainId,
      );
      return null;
    }

    const params: ContractCallParam[] = [];
    if (sourceChainId === 1) {
      params.push(destChainId);
      params.push(account);
      params.push(amount);
      params.push(0);
      params.push(getCurrentTimestamp() + 1200);
      params.push(ethers.ZeroAddress);
      params.push(0);
    } else {
      params.push(destChainId);
      params.push(account);
      params.push(amount);
      params.push(BigInt(quote.bonderFee));
      params.push(BigInt(quote.amountOutMin));
      params.push(getCurrentTimestamp() + 1200);
      if (destChainId === 1) {
        params.push(0);
        params.push(0);
      } else {
        params.push(BigInt(quote.destinationAmountOutMin));
        params.push(quote.destinationDeadline);
      }
    }

    const data = await getFunctionData(
      bridgeContractAddress,
      abi,
      funcName,
      params,
      sourceToken.symbol.toLowerCase() === srcNativeTknSym
        ? amount.toString()
        : "0",
    );

    return {
      amountOut: quote.amountOutMin,
      txs: [
        {
          to: data.to,
          value: data.value.toString(),
          data: data.data,
        },
      ],
      source: "hop",
      approveInfo: {
        token: sourceToken.address,
        spender: bridgeContractAddress,
        amount: amount,
      },
      usdFee: Number(ethers.formatUnits(quote.bonderFee, sourceToken.decimals)),
    };
  } catch (err) {
    const typedErr = err as { response?: { data?: unknown }; message?: string };
    printError(
      "hop",
      typedErr.response?.data ?? typedErr.response ?? typedErr.message ?? err,
    );
    if (lenRoutes === 1) {
      throw new Error(
        "Error fetching quote from Hop. Please try again later or contact support if the issue persists. You can also try a different protocol for your swap.",
      );
    }
  }
  return null;
};

export const getQuoteFromLiFi: BridgeQuoteFunction = async (
  sourceChainId,
  destChainId,
  account,
  sourceToken,
  destToken,
  amount,
  lenRoutes,
) => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);
  const {
    data: { chains },
  } = await withRetry(account, () => axios.get("https://li.quest/v1/chains"));
  const sourceChain = chains.find(
    (c: { id: number }) => c.id === sourceChainId,
  );
  const destChain = chains.find((c: { id: number }) => c.id === destChainId);
  if (!sourceChain || !destChain) return null;

  try {
    const { routes } = await withRetry(account, () =>
      getRoutes({
        fromChainId: sourceChainId,
        toChainId: destChainId,
        fromTokenAddress: sourceToken.address?.toLowerCase() || "",
        toTokenAddress: destToken.address?.toLowerCase() || "",
        fromAmount: amount.toString(),
        fromAddress: account,
      }),
    );
    const bestRoute = routes.sort((a, b) => +b.toAmountUSD - +a.toAmountUSD)[0];
    const txs: Transaction[] = [];
    for (const step of bestRoute.steps) {
      /* eslint-disable no-await-in-loop */
      const stepTx = await getStepTransaction(step);
      if (!stepTx?.transactionRequest) {
        throw new Error("LiFi transaction request is undefined");
      }
      txs.push({
        to: stepTx.transactionRequest.to || "",
        value: ethers
          .getBigInt(stepTx.transactionRequest.value || "0")
          .toString(),
        data: stepTx.transactionRequest.data || "",
        gas: stepTx.transactionRequest.gasLimit || "",
      });
    }
    return {
      amountOut: bestRoute.toAmountMin,
      txs,
      source: "jumper",
      usdFee: 0, // fees already included in amountOut
    };
  } catch (err) {
    const typedErr = err as {
      response?: { data?: { code?: number; message?: string } };
      message?: string;
    };
    if (typedErr?.response?.data?.code === 1002) {
      printLog("LiFi quote failed", typedErr?.response?.data?.message);
      if (lenRoutes === 1) {
        throw new Error(typedErr?.response?.data?.message);
      }
    } else {
      printError("lifi", typedErr?.response?.data ?? typedErr.message ?? err);
    }
    if (lenRoutes === 1) {
      throw new Error(
        "Error fetching quote from LiFi/Jumper. Please try again later or contact support if the issue persists. You can also try a different protocol for your swap.",
      );
    }
  }
  return null;
};

export const getQuoteFromOrbiter: BridgeQuoteFunction = async (
  sourceChainId,
  destChainId,
  account,
  sourceToken,
  destToken,
  amount,
  lenRoutes,
) => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);

  try {
    const {
      data: { result: chains },
    } = await withRetry(account, () =>
      axios.get("https://api.orbiter.finance/sdk/chains"),
    );
    const srcChain = chains.find(
      (chain: { chainId: string }) =>
        chain.chainId === sourceChainId.toString(),
    );
    const destChain = chains.find(
      (chain: { chainId: string }) => chain.chainId === destChainId.toString(),
    );
    if (!srcChain) {
      if (lenRoutes === 1) {
        throw new Error(
          `${getChainNameFromId(sourceChainId)} is not supported on Orbiter`,
        );
      }
      return null;
    }
    if (!destChain) {
      if (lenRoutes === 1) {
        throw new Error(
          `${getChainNameFromId(destChainId)} is not supported on Orbiter`,
        );
      }
      return null;
    }
    const srcToken = srcChain.tokens.find(
      (token: { address: string }) =>
        token.address.toLowerCase() === sourceToken.address?.toLowerCase(),
    );
    if (!srcToken) {
      if (lenRoutes === 1) {
        throw new Error(`${sourceToken.symbol} is not supported on Orbiter`);
      }
      return null;
    }

    const {
      data: { result: routers },
    } = await withRetry(account, () =>
      axios.get("https://api.orbiter.finance/sdk/routers"),
    );
    const line = `${sourceChainId}/${destChainId}-${srcToken.symbol}/${destToken.symbol.toUpperCase()}`;
    const router = routers.find(
      (router: { line: string }) => router.line === line,
    );
    if (!router) {
      printLog("orbiter no router found");
      return null;
    }
    const nativeTokenSymbol =
      getNativeTokenSymbolForChain(sourceChainId)?.toLowerCase();
    let amountToUse = amount;
    let amountStr = ethers.formatUnits(amountToUse, srcToken.decimals);
    const parts = amountStr.split(".");
    if (parts.length > 1) {
      if (parts[1].length > srcToken.decimals - 4) {
        amountStr = `${parts[0]}.${parts[1].slice(0, srcToken.decimals - 4)}`;
        amountToUse = sfParseUnits(amountStr, srcToken.decimals);
      }
    }
    const inputAmount = amountToUse + ethers.getBigInt(router.vc);
    let to = router.endpoint;
    let value: bigint | string;
    let data: string;
    if (sourceToken.symbol.toLowerCase() === nativeTokenSymbol) {
      value = inputAmount;
      data = "0x";
    } else {
      to = router.srcToken;
      const token = new ethers.Contract(to, abis.erc20);
      value = "0x0";
      data = token.interface.encodeFunctionData("transfer", [
        router.endpoint,
        inputAmount,
      ]);
    }

    const {
      data: { result },
    } = await withRetry(account, () =>
      axios.get(
        `https://api.orbiter.finance/sdk/routers/simulation/receiveAmount?line=${line}&value=${inputAmount}`,
      ),
    );

    if (!result) {
      printLog("orbiter no simulation result found");
      return null;
    }
    return {
      amountOut: result.receiveAmount,
      txs: [
        {
          to,
          value: value.toString(),
          data,
        },
      ],
      source: "orbiter",
      skipApprove: true,
      usdFee: 0, // accounted for in receiveAmount already
    };
  } catch (err) {
    const typedErr = err as {
      response?: { data?: { code?: number; message?: string } };
      message?: string;
    };
    if (typedErr?.response?.data?.code === 1002) {
      printLog("Orbiter quote failed", typedErr?.response?.data?.message);
    } else {
      printError(
        "orbiter",
        typedErr?.response?.data ?? typedErr.message ?? err,
      );
    }
    if (lenRoutes === 1) {
      throw new Error(
        "Error fetching quote from Orbiter. Please try again later or contact support if the issue persists. You can also try a different protocol for your swap.",
      );
    }
  }
  return null;
};

export const getQuoteFromSynapse: BridgeQuoteFunction = async (
  sourceChainId,
  destChainId,
  account,
  sourceToken,
  destToken,
  amount,
  lenRoutes,
) => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);
  if (!sourceToken.address || !destToken.address) {
    return null;
  }
  try {
    const chainIds = [sourceChainId, destChainId];
    const providers = chainIds.map((chainId) => {
      const rpcUrl = getRpcUrlForChain(chainId);
      return new JsonRpcProvider(rpcUrl, chainId);
    });
    const Synapse = new SynapseSDK(chainIds, providers);

    const quote = await Synapse.bridgeQuote(
      sourceChainId, // From Chain
      destChainId, // To Chain
      sourceToken.address, // From Token
      destToken.address, // To Token
      amount.toString(), // Amount
    );

    const { to, data, value } = await Synapse.bridge(
      account, // To Address
      quote.routerAddress,
      sourceChainId, // Origin Chain
      destChainId, // Destination Chain
      sourceToken.address, // Origin Token Address
      amount.toString(), // Amount
      quote.originQuery, // Origin query from bridgeQuote()
      quote.destQuery, // Destination query from bridgeQuote()
    );

    if (quote.maxAmountOut && value && to && data) {
      return {
        amountOut: quote.maxAmountOut.sub(quote.feeAmount).toString(),
        txs: [
          {
            to,
            value: value.toString(),
            data,
          },
        ],
        source: "synapse",
        usdFee: 0, // accounted for in amountOut
      };
    }
  } catch (err) {
    const typedErr = err as {
      response?: { status?: number };
      message?: string;
    };
    if (typedErr?.response?.status === 503) {
      printLog("synapse bridge call failed with 503");
    } else if (typedErr?.message === "No route found") {
      printLog("synapse no route found");
    } else {
      printError("synapse", err);
    }
    if (lenRoutes === 1) {
      throw new Error(
        "Error fetching quote from Synapse. Please try again later or contact support if the issue persists. You can also try a different protocol for your swap.",
      );
    }
  }
  return null;
};

export const getQuoteFromAxelar: BridgeQuoteFunction = async (
  sourceChainId,
  destChainId,
  account,
  sourceToken,
  destToken,
  amount,
  lenRoutes,
) => {
  const printError = usePrintError(account);
  try {
    const srcNativeTknSym =
      getNativeTokenSymbolForChain(sourceChainId)?.toLowerCase();
    const destNativeTknSym =
      getNativeTokenSymbolForChain(destChainId)?.toLowerCase();

    if (
      srcNativeTknSym === "matic" &&
      sourceToken.symbol.toLowerCase() === "matic"
    ) {
      return null;
    }
    if (!sourceToken.address || !destToken.address) {
      return null;
    }

    const queryParams = new URLSearchParams({
      fromChain: sourceChainId.toString(),
      fromToken:
        sourceToken.symbol.toLowerCase() === srcNativeTknSym
          ? NATIVE_TOKEN2
          : sourceToken.address,
      fromAmount: amount.toString(),
      toChain: destChainId.toString(),
      toToken:
        destToken.symbol.toLowerCase() === destNativeTknSym
          ? NATIVE_TOKEN2
          : destToken.address,
      toAddress: account,
      quoteOnly: "false",
      slippage: "1.5",
    });
    const { data } = await withRetry(account, () =>
      axios.get(`https://api.0xsquid.com/v1/route?${queryParams}`),
    );
    const { route } = data;
    return {
      amountOut: route.estimate.toAmountMin,
      txs: [
        {
          to: route.transactionRequest.targetAddress,
          value: route.transactionRequest.value,
          data: route.transactionRequest.data,
          gas: `0x${Number.parseInt(route.transactionRequest.gasLimit, 10).toString(16)}`,
        },
      ],
      source: "axelar",
      usdFee: Number(route.estimate.feeCosts[0].amountUSD),
    };
  } catch (err) {
    const typedErr = err as { response?: { data?: unknown }; message?: string };
    printError("axelar", typedErr?.response?.data ?? typedErr.message ?? err);
    if (lenRoutes === 1) {
      throw new Error(
        "Error fetching quote from Axelar. Please try again later or contact support if the issue persists. You can also try a different protocol for your swap.",
      );
    }
  }
  return null;
};

export const getQuoteFromStargate: BridgeQuoteFunction = async (
  sourceChainId,
  destChainId,
  account,
  sourceToken,
  destToken,
  amount,
  lenRoutes,
) => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);
  const protocol = "stargate";
  const rpcUrl = getRpcUrlForChain(sourceChainId);
  const provider = new RetryProvider(rpcUrl, sourceChainId);
  const srcNativeTknSym =
    getNativeTokenSymbolForChain(sourceChainId)?.toLowerCase();
  const isNativeSwap =
    getNativeTokenSymbolForChain(sourceChainId) === "ETH" &&
    sourceToken.symbol.toLowerCase() === srcNativeTknSym;
  if (!isValidChainId(sourceChainId)) {
    throw new Error(`Invalid chain id: ${sourceChainId}`);
  }
  const symbol =
    sourceToken.symbol.toLowerCase() === "usdc.e"
      ? "usdc"
      : sourceToken.symbol.toLowerCase();
  const _dstChainId = getStargateChainId(destChainId);
  if (!_dstChainId) {
    printLog(`stargate does not support ${destChainId}`);
    return null;
  }
  try {
    const sendParam = {
      dstEid: getStargateChainId(destChainId) || 0,
      to: ethers.zeroPadValue(account, 32) as `0x${string}`,
      amountLD: amount,
      minAmountLD: amount,
      extraOptions: "0x" as `0x${string}`,
      composeMsg: "0x" as `0x${string}`,
      oftCmd: "0x" as `0x${string}`,
    };
    const poolAddress = getProtocolAddressForChain(
      protocol,
      sourceChainId,
      `${symbol}v2`,
    );
    if (!poolAddress) {
      printLog(`stargate does not support ${symbol}`);
      return null;
    }
    const viemClient = await getViemPublicClientFromEthers(provider);
    const poolAbi = getABIForProtocol(protocol, "poolv2");
    assert(isHexStr(poolAddress));
    const quote = await viemClient.readContract({
      address: poolAddress,
      abi: abis["stargate-poolv2"],
      functionName: "quoteOFT",
      args: [sendParam],
    });

    sendParam.minAmountLD = quote[2].amountReceivedLD;
    const messagingFee = await viemClient.readContract({
      address: poolAddress,
      abi: abis["stargate-poolv2"],
      functionName: "quoteSend",
      args: [sendParam, false],
    });
    let valueToSend = messagingFee.nativeFee;
    if (isNativeSwap) valueToSend += sendParam.amountLD;

    const params: ContractCallParam[] = [];
    params.push(sendParam);
    params.push(messagingFee);
    params.push(account);

    const data = await getFunctionData(
      poolAddress,
      poolAbi,
      "sendToken",
      params,
      valueToSend.toString(),
    );
    const ethPrice = (await getCoinData(account, "eth", 1, false)) || {
      price: 0,
    };
    assert(isDefined(ethPrice.price));
    return {
      amountOut: amount.toString(),
      txs: [
        {
          to: data.to,
          value: data.value.toString(),
          data: data.data,
        },
      ],
      source: protocol,
      usdFee: 0,
    };
  } catch (err) {
    printError("stargate errored", err);
    if (lenRoutes === 1) {
      throw new Error(
        "Error fetching quote from Stargate. Please try again later or contact support if the issue persists. You can also try a different protocol for your swap.",
      );
    }
  }
  return null;
};

export const getQuoteFromReservoir: BridgeQuoteFunction = async (
  sourceChainId,
  destChainId,
  account,
  sourceToken,
  destToken,
  amount,
  lenRoutes,
) => {
  const printError = usePrintError(account);

  // Early return if not supported token
  if (
    !(
      sourceToken.symbol === "degen" ||
      sourceToken.symbol === "eth" ||
      sourceToken.symbol === "usdc" ||
      sourceToken.symbol === "xai" ||
      sourceToken.symbol === "sipher" ||
      sourceToken.symbol === "pop" ||
      sourceToken.symbol === "tia" ||
      sourceToken.symbol === "tg7" ||
      sourceToken.symbol === "cgt" ||
      sourceToken.symbol === "omi"
    )
  ) {
    return null;
  }

  if (sourceToken.symbol.toLowerCase() === "usdc" && destChainId === 8453) {
    console.log("skipping reservoir for usdc to base");
    return null; // Skip Reservoir for USDC to Base to avoid getting USDbC
  }

  try {
    const option = {
      baseApiUrl: MAINNET_RELAY_API,
    };
    createClient(option);
    const { enabled } = await getClient().actions.getSolverCapacity({
      originChainId: sourceChainId.toString(), // The chain id to bridge from
      destinationChainId: destChainId.toString(), // The chain id to bridge to
      currency: sourceToken.symbol,
    });

    if (enabled) {
      const bodyData = {
        allowSplitRouting: true,
        amount: amount.toString(),
        currency: sourceToken.symbol,
        destinationChainId: destChainId,
        originChainId: sourceChainId,
        recipient: account,
        source: "Slate",
        usePermit: false,
        user: account,
      };
      try {
        const quoteData = await getClient().actions.getQuote({
          chainId: sourceChainId as number,
          toChainId: destChainId as number,
          amount: amount.toString(),
          currency: `${sourceToken.address}`,
          toCurrency: `${destToken.address}`,
          tradeType: "EXACT_INPUT",
          recipient: account.startsWith("0x")
            ? (account as `0x${string}`)
            : `0x${account}`,
        });
        // console.log("quoteData:", quoteData);
        if (quoteData && typeof quoteData === "object") {
          const response = await withRetry(account, () =>
            axios.post(`${MAINNET_RELAY_API}/execute/bridge`, bodyData, {
              headers: { "Content-Type": "application/json" },
            }),
          );

          if (response.status === 200 && quoteData.fees) {
            const txData = response.data.steps[0].items[0].data;
            const relayerServiceFee = ethers.getBigInt(
              quoteData?.fees?.relayerService?.amount || "0",
            );
            const relayerGasFee = ethers.getBigInt(
              quoteData?.fees?.relayerGas?.amount || "0",
            );
            const appFee = ethers.getBigInt(
              quoteData?.fees?.app?.amount || "0",
            );
            const totalFee = relayerServiceFee + relayerGasFee + appFee;
            const amountOut = amount - totalFee;
            return {
              amountOut: amountOut.toString(),
              txs: [
                {
                  to: txData.to,
                  value: txData.value,
                  data: txData.data,
                  gas: quoteData.fees.gas?.amount,
                },
              ],
              source: "reservoir",
              usdFee: 0, // accounted for in amountOut
            };
          }
        }
      } catch (err) {
        printError("reservoir failed 2", err);
      }
    }
  } catch (err) {
    printError("reservoir failed 3", err);
    if (lenRoutes === 1) {
      throw new Error(
        "Error fetching quote from Reservoir. Please try again later or contact support if the issue persists. You can also try a different protocol for your swap.",
      );
    }
  }
  return null;
};

export const getQuoteFromDebridge: BridgeQuoteFunction = async (
  sourceChainId,
  destChainId,
  account,
  sourceToken,
  destToken,
  amount,
  lenRoutes,
) => {
  const printError = usePrintError(account);
  if (!sourceToken.address || !destToken.address) {
    return null;
  }
  try {
    const queryParams = new URLSearchParams({
      srcChainId: sourceChainId.toString(),
      srcChainTokenIn: sourceToken.address,
      srcChainTokenInAmount: amount.toString(),
      dstChainId: destChainId.toString(),
      dstChainTokenOut: destToken.address,
      dstChainTokenOutRecipient: account,
      srcChainOrderAuthorityAddress: account,
      dstChainOrderAuthorityAddress: account,
      affiliateFeePercent: "0.1",
      affiliateFeeRecipient: account,
    });
    const { data } = await withRetry(account, () =>
      axios.get(
        `https://api.dln.trade/v1.0/dln/order/create-tx?${queryParams}`,
      ),
    );
    const { estimation, tx } = data;

    return {
      amountOut: estimation.dstChainTokenOut.amount,
      txs: [tx],
      source: "debridge",
      usdFee: 0, // amountOut includes fees already
    };
  } catch (err) {
    const typedErr = err as { response?: { data?: unknown }; message?: string };
    printError("debridge", typedErr?.response?.data ?? typedErr.message ?? err);
    if (lenRoutes === 1) {
      throw new Error(
        "Error fetching quote from Debridge. Please try again later or contact support if the issue persists. You can also try a different protocol for your swap.",
      );
    }
  }
  return null;
};

interface QuoteResponse {
  amountOut: string;
  txs: Transaction[];
  source: string;
  skipApprove?: boolean;
  usdFee: number;
}

type BridgeQuoteFunction = (
  sourceChainId: ChainId,
  destChainId: ChainId,
  account: string,
  sourceToken: TokenInfo,
  destToken: TokenInfo,
  amount: bigint,
  lenRoutes: number,
) => Promise<QuoteResponse | null>;

export type BridgeRoute = {
  txs: Transaction[];
  source: string;
  amountIn: string;
  amountOut: string;
  amountOutUsd: number;
  skipApprove: boolean;
};

export const getBestBridgeRoutes = async (
  sourceChainId: ChainId,
  destChainId: ChainId,
  account: string,
  sourceToken: TokenInfo,
  destToken: TokenInfo,
  amount: bigint,
  gasPrice: bigint,
  ignore: string[] = [],
  prevSource?: string,
  rpc?: string,
  isAllAmount?: boolean,
  isExecution?: boolean,
): Promise<BridgeRoute[]> => {
  const originVnetId = getVnetIdFromRpc(rpc);
  const simulationId = Date.now().toString();
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);
  const nativeSrcToken = getNativeTokenSymbolForChain(sourceChainId);
  const nativeDstToken = getNativeTokenSymbolForChain(destChainId);
  const sourceChainName = getChainNameFromId(sourceChainId);
  const destChainName = getChainNameFromId(destChainId);

  const wETHSrcInfo = await getTokenInfoForChain("weth", sourceChainName);
  const wETHDstInfo = await getTokenInfoForChain("weth", destChainName);
  let sToken = sourceToken;
  let dToken = destToken;
  if (
    nativeSrcToken?.toLowerCase() !== "eth" &&
    sourceToken.symbol.toLowerCase() === "eth" &&
    wETHSrcInfo
  ) {
    sToken = wETHSrcInfo;
  }

  if (
    nativeDstToken?.toLowerCase() !== "eth" &&
    destToken.symbol.toLowerCase() === "eth" &&
    wETHDstInfo
  ) {
    dToken = wETHDstInfo;
  }

  let bridgeRoutes = [
    getQuoteFromBungee,
    getQuoteFromHop,
    getQuoteFromLiFi,
    // getQuoteFromSynapse, // consistently takes too long + stole Niyant's money
    getQuoteFromAxelar,
    // getQuoteFromOrbiter, // took 8 hours to bridge once, unacceptable
    getQuoteFromStargate,
    getQuoteFromAcross,
    getQuoteFromDebridge,
  ];
  if (isAllAmount === false) {
    bridgeRoutes.push(getQuoteFromReservoir);
  }
  const lowerPrevSource = prevSource?.toLowerCase();
  if (lowerPrevSource) {
    switch (lowerPrevSource) {
      case "across": {
        bridgeRoutes = [getQuoteFromAcross];
        break;
      }
      case "squid":
      case "axelar": {
        bridgeRoutes = [getQuoteFromAxelar];
        break;
      }
      case "socket":
      case "bungee": {
        bridgeRoutes = [getQuoteFromBungee];
        break;
      }
      case "debridge": {
        bridgeRoutes = [getQuoteFromDebridge];
        break;
      }
      case "hop": {
        bridgeRoutes = [getQuoteFromHop];
        break;
      }
      case "lifi":
      case "jumper": {
        bridgeRoutes = [getQuoteFromLiFi];
        break;
      }
      case "orbiter": {
        bridgeRoutes = [getQuoteFromOrbiter];
        break;
      }
      case "synapse": {
        bridgeRoutes = [getQuoteFromSynapse];
        break;
      }
      case "stargate": {
        bridgeRoutes = [getQuoteFromStargate];
        break;
      }
      case "reservoir":
      case "relay":
        if (!isAllAmount) {
          bridgeRoutes = [getQuoteFromReservoir];
          break;
        }
        throw new Error(
          "Reservoir relay bridges don't work when using all amount",
        );
      default: {
        throw new Error(getUnsupportedProtocolError(lowerPrevSource, "bridge"));
      }
    }
  }

  const timeLimit =
    bridgeRoutes.length === 1
      ? 86400000
      : Number.parseFloat(process.env.MAX_TIME || "23000");

  if (originVnetId) {
    let previousPromise: Promise<{ vnetId: string; rpcUrl: string }> =
      Promise.resolve({ vnetId: "", rpcUrl: "" });
    vNets[simulationId] = Array(bridgeRoutes.length)
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

  let promises = bridgeRoutes.map(async (bridgeRoute) => {
    return Promise.race([
      getBridgeRoute(
        sourceChainId,
        destChainId,
        account,
        sToken,
        dToken,
        amount,
        bridgeRoutes,
        bridgeRoute,
        ignore,
        originVnetId,
        gasPrice,
        printLog,
        printError,
        simulationId,
      ),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve("TIME_OUT"), timeLimit),
      ),
    ]);
  });

  let validRoutes: BridgeRoute[] = [];
  if (isExecution) {
    // if execution flow, wait for all routes to be finished
    validRoutes = (await Promise.all(promises)).filter(
      (data): data is BridgeRoute =>
        // filter out any routes that are not BridgeRoute objects
        !!data &&
        typeof data === "object" &&
        !("length" in data) &&
        "source" in data,
    );
    return sortBridgeRoutes(validRoutes);
  }

  // Otherwise, if simulation flow, proceed with the following logic
  // Wait for the first promise to resolve, then maximally wait for 500ms for other promises to complete
  // If the first promise resolves to a route, check if it passes the slippage check
  // Otherwise, continue with the next promise
  // Meant to save time by not waiting for all routes to complete during simulation
  while (promises.length > 0) {
    // Get the first promise to resolve
    const [nextPossibleRoute, index] = await Promise.race(
      promises.map(
        async (p, i) =>
          [await p, i] as [BridgeRoute | string | undefined, number],
      ),
    );

    if (nextPossibleRoute === "TIME_OUT") {
      // Time limit reached
      if (validRoutes.length) return validRoutes;
      throw new Error("No bridge routes found within timeout");
    }

    // Get the remaining promises
    promises = [...promises.slice(0, index), ...promises.slice(index + 1)];

    // If no route is found, wait for other routes to complete
    if (!nextPossibleRoute) continue;

    const route = nextPossibleRoute as BridgeRoute; // Type assertion

    // Add timeout to remaining routes
    promises = promises.map((promise) =>
      Promise.race([
        promise,
        new Promise<string>((resolve) =>
          setTimeout(() => resolve("TIME_OUT"), 500),
        ),
      ]),
    );
    validRoutes.push(route);
  }

  return sortBridgeRoutes(validRoutes);
};

async function getBridgeRoute(
  sourceChainId: ChainId,
  destChainId: ChainId,
  account: string,
  sToken: TokenInfo,
  dToken: TokenInfo,
  amount: bigint,
  bridgeRoutes: BridgeQuoteFunction[],
  bridgeRoute: BridgeQuoteFunction,
  ignore: string[],
  originVnetId: string | undefined,
  gasPrice: bigint,
  printLog: (...args: unknown[]) => void,
  printError: (...args: unknown[]) => void,
  simulationId: string,
): Promise<BridgeRoute | undefined> {
  const data = await bridgeRoute(
    sourceChainId,
    destChainId,
    account,
    sToken,
    dToken,
    amount,
    bridgeRoutes.length,
  );

  if (data) {
    if (ignore.includes(data.source)) {
      return undefined;
    }
    if (sourceChainId === ChainIDs.zksync) {
      return {
        txs: data.txs,
        source: data.source,
        skipApprove: !!data.skipApprove,
        amountIn: "0",
        amountOut: "0",
        amountOutUsd: 0,
      };
    }

    let vnetInfo: { vnetId: string; rpcUrl: string };
    if (originVnetId && sourceChainId !== ChainIDs.zksync) {
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
      vnetInfo = await createVnet(sourceChainId);
    }
    const provider = new RetryProvider(vnetInfo.rpcUrl, sourceChainId);

    const viemClient = await getViemPublicClientFromEthers(provider);
    await addBalance(provider, account, ethers.parseEther("1000000"));
    const nativeTokenSymbol =
      getNativeTokenSymbolForChain(sourceChainId)?.toLowerCase();

    // Get initial balance of input token
    let initialInAmount: bigint;
    if (sToken.symbol.toLowerCase() === nativeTokenSymbol) {
      initialInAmount = await provider.getBalance(account);
    } else {
      if (!sToken.address) {
        return undefined;
      }
      assert(isHexStr(sToken.address));
      assert(isHexStr(account));
      initialInAmount = await viemClient.readContract({
        address: sToken.address,
        abi: abis.erc20,
        functionName: "balanceOf",
        args: [account],
      });
    }

    if (sToken.symbol.toLowerCase() !== nativeTokenSymbol) {
      if (!sToken.address) {
        return undefined;
      }
      assert(isHexStr(sToken.address));
      assert(isHexStr(account));
      const currentBalance = await viemClient.readContract({
        address: sToken.address,
        abi: abis.erc20,
        functionName: "balanceOf",
        args: [account],
      });
      const newBalance = currentBalance + amount;
      if (currentBalance < amount && sourceChainId.toString() !== "81457") {
        await setErc20Balance(provider, sToken.address, account, newBalance);
      }
      // approve for ERC20 tokens
      const token = new ethers.Contract(sToken.address, abis.erc20);
      const hash = await provider.send("eth_sendTransaction", [
        {
          from: account,
          to: sToken.address,
          data: token.interface.encodeFunctionData("approve", [
            data.txs[0].to,
            ethers.MaxUint256,
          ]),
          value: "0x0",
        },
      ]);
      await withRetry(account, () => provider.waitForTransaction(hash));
    }

    const txs: Transaction[] = [];
    let gasCost = 0n;
    for (let i = 0; i < data.txs.length; i++) {
      const tx = data.txs[i];
      let skip = false;
      let j = 0;
      const maxRetries = 4;
      let receipt: ethers.TransactionReceipt | null = null;
      /* eslint-disable no-await-in-loop */
      while (j < maxRetries) {
        j++;
        try {
          const hash = await provider.send("eth_sendTransaction", [
            {
              from: account,
              to: tx.to,
              data: tx.data,
              value: convertToHexString(tx.value),
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
          }
          break;
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
        return;
      }

      // Get final balance and calculate actual input amount
      let finalInAmount: bigint;
      const tempGasCost = BigInt(gasPrice) * BigInt(receipt.gasUsed);
      if (sToken.symbol.toLowerCase() === nativeTokenSymbol) {
        finalInAmount = await provider.getBalance(account);
        // For native token, need to account for gas cost in the input amount
        finalInAmount = initialInAmount - finalInAmount - tempGasCost;
      } else {
        if (!sToken.address) {
          return undefined;
        }
        assert(isHexStr(sToken.address));
        assert(isHexStr(account));
        finalInAmount = await viemClient.readContract({
          address: sToken.address,
          abi: abis.erc20,
          functionName: "balanceOf",
          args: [account],
        });
        finalInAmount = initialInAmount - finalInAmount;
      }

      if (i === 0) {
        const requestedAmount = Number(
          ethers.formatUnits(amount, sToken.decimals),
        );
        let balanceChange = Number(
          ethers.formatUnits(finalInAmount, sToken.decimals),
        );
        if (sToken.symbol.toLowerCase() === nativeTokenSymbol) {
          balanceChange += Number(
            ethers.formatUnits(tempGasCost, sToken.decimals),
          );
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
          );
          return;
        }

        initialInAmount =
          finalInAmount > ethers.getBigInt(amount)
            ? finalInAmount
            : ethers.getBigInt(amount);
      }

      const gas = convertToHexString(receipt.gasUsed.toString());
      gasCost += BigInt(gas);
      txs.push({ ...tx, gas });
    }

    // Calculate gas cost in USD
    const gasTokenInfo = await getCoinData(
      account,
      getNativeTokenSymbolForChain(sourceChainId),
      sourceChainId,
    );
    if (!gasTokenInfo) {
      throw new Error("Rate limit, come back later");
    }
    assert(isDefined(gasTokenInfo.price));
    const newAmountOut = ethers.getBigInt(data.amountOut);
    gasCost *= ethers.getBigInt(gasPrice);
    const gasUsd = +ethers.formatEther(gasCost) * gasTokenInfo.price;
    const tokenOutPrice = (
      await getCoinData(account, dToken.symbol, destChainId, false)
    )?.price;
    let newAmountOutUsd = 0;
    // Calculate output amount in USD
    if (tokenOutPrice) {
      const outputUsd =
        Number.parseFloat(ethers.formatUnits(newAmountOut, dToken.decimals)) *
        tokenOutPrice;
      // Subtract gas cost from output amount
      newAmountOutUsd =
        outputUsd - gasUsd - data.usdFee > 0
          ? outputUsd - gasUsd - data.usdFee
          : 0;
    }

    return {
      amountIn: initialInAmount.toString(),
      amountOut: newAmountOut.toString(),
      txs,
      source: data.source,
      skipApprove: !!data.skipApprove,
      amountOutUsd: newAmountOutUsd,
    };
  }
}

function sortBridgeRoutes(routes: BridgeRoute[]): BridgeRoute[] {
  return routes.sort((a, b) => {
    const aRatio = (a.amountOutUsd ?? 0) / Number(a.amountIn);
    const bRatio = (b.amountOutUsd ?? 0) / Number(b.amountIn);

    if (a.source === "reservoir") {
      // Use Reservoir if it's not worse than 5% compared to b
      return aRatio * 1.05 >= bRatio ? -1 : 1;
    }
    if (b.source === "reservoir") {
      // Compare against Reservoir's 5% buffer
      return aRatio > bRatio * 1.05 ? -1 : 1;
    }
    // Normal comparison for non-Reservoir routes
    return bRatio - aRatio;
  });
}

//https://stargateprotocol.gitbook.io/stargate/v2-developer-docs/integrate-with-stargate/how-to-swap
