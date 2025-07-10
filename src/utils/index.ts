import { PublicKey } from "@solana/web3.js";
import axios, { AxiosError } from "axios";
import { ethers } from "ethers";
import { type FindOptions, type InferAttributes, Op } from "sequelize";
import { getAddress } from "viem";
import {
  addBalance,
  createVnet,
  recreateVnet,
  setErc20Balance,
} from "../__tests__/helper.js";
import { abis } from "../config/abis.js";
import ProtocolAddresses from "../config/addresses.js";
import ChainIDs from "../config/common/chainid.js";
import CoingeckoData from "../config/common/coingecko.js";
import DebankData from "../config/common/debank.js";
import DefiLlama from "../config/common/defillama.js";
import EntityData from "../config/common/entity.js";
import NativeTokens from "../config/common/native-token.js";
import RPCs from "../config/common/rpc.js";
import StargateChainIDs from "../config/common/stargate.js";
import WrappedTokens from "../config/common/wrapped-token.js";
import ProtocolErrors from "../config/errors.js";
import { ignoreTokenList } from "../config/ignoreToken.js";
import LPAddresses from "../config/lptokens.js";
import ProtocolPools from "../config/pools.js";
import isStable from "../config/stablecoins.js";
import ProtocolTokens from "../config/token.js";
import { NATIVE_TOKEN, NATIVE_TOKEN2 } from "../constants.js";
import { Histories, Protocols, Tokens, sequelize } from "../db/index.js";
import { getBestBridgeRoutes } from "./bridge.js";
import {
  getChainError,
  getMissingPoolNameError,
  getNoBridgeRouteError,
  getNoPositionError,
  getNoSwapRouteError,
  getUnsupportedActionError,
  getUnsupportedChainError,
  getUnsupportedPoolError,
  getUnsupportedPoolTokenError,
  getUnsupportedProtocolError,
  getUnsupportedTokenError,
} from "./error.js";
import { getViemPublicClientFromEthers } from "./ethers2viem.js";
import { sfConsoleError, usePrintError, usePrintLog } from "./log.js";
import { getGMXTokenInfo } from "./protocols/gmx.js";
import {
  type SignData,
  fetchHyperliquidSpotMarkets,
  getHyperliquidPools,
  getHyperliquidTokenInfo,
} from "./protocols/hyperliquid.js";
import ProtocolActions, {
  type ActionMap,
  getAlternativeChain,
  getBorrowableAmountForToken,
  getMarketInfoForProtocol,
  getTokensForAction,
} from "./protocols/index.js";
import {
  extractPendleToken,
  getPendleConfigFromPool,
  getProtocolEntitiesSort,
  pendleKeyPrefixes,
  pendleKeySuffixes,
} from "./protocols/pendle.js";
import { RetryProvider } from "./retryProvider.js";
import { getBestSwapRoutes } from "./swap.js";
import type {
  BalanceChange,
  BridgeRealRoute,
  BridgeResponse,
  Call,
  ChainId,
  CleanedAction,
  CoinCache,
  CoinData,
  CommonArgs,
  ContractCallParam,
  DebankPoolInfo,
  DebankPositionInfo,
  DebankTokenInfoR,
  Entities,
  FeeConfig,
  JSONObject,
  ProtocolActionData,
  RawAction,
  SimAction,
  SwapRealRoute,
  SwapResponse,
  TokenInfo,
  TokenPoolResponse,
  Transaction,
} from "./types.js";
import { assert, isChainId, isHexStr } from "./types.js";

const DEBANK_API = "https://pro-openapi.debank.com/v1";

const { CMC_API_KEY, CGC_API_KEY, DEFILLAMA_API_KEY } = process.env;
const CMC_API_ENDPOINT = "https://pro-api.coinmarketcap.com/v2/cryptocurrency";
const CGC_API_ENDPOINT = "https://pro-api.coingecko.com/api/v3";
const DEFILLAMA_API_ENDPOINT = `https://pro-api.llama.fi/${DEFILLAMA_API_KEY}`;
export const HYPERLIQUID_API_ENDPOINT =
  process.env.HYPERLIQUID_API_ENDPOINT ?? "https://api.hyperliquid.xyz";
// export const HYPERLIQUID_API_ENDPOINT = "https://api.hyperliquid-testnet.xyz";

export const nonProtocolNames = ["swap", "bridge", "transfer", "notification"];
const COIN_CACHE: Record<string | number, CoinCache | undefined> = {};
const CACHE_WINDOW = 144; // in seconds
const NOT_FOUND_CACHE_WINDOW = 3600; // 1 hour in seconds

const TTL_1_MIN = 60 * 1000; // 1 minute in milliseconds
const TTL_3_HOURS = 3 * 60 * 60 * 1000; // 3 hours in milliseconds
const TTL_3_DAYS = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds

export const fromActions = [
  "claim",
  "withdraw",
  "unstake",
  "unlock",
  "repay",
  "close",
];
export const toActions = [
  "swap",
  "bridge",
  "transfer",
  "stake",
  "deposit",
  "lend",
  "lock",
  "repay",
  "long",
  "short",
];

export const uniswapLikeProtocols = [
  "uniswap",
  "velodrome",
  "aerodrome",
  "camelot",
  "thruster",
];

export function sfParseUnits(
  value: string | number,
  unit: string | number | undefined,
): bigint {
  try {
    let decimals = 18;
    const Zeros = "0000";
    const names = ["wei", "kwei", "mwei", "gwei", "szabo", "finney", "ether"];
    if (typeof unit === "string") {
      const index = names.indexOf(unit);
      decimals = 3 * index;
    } else if (unit != null) {
      decimals = ethers.getNumber(unit, "unit");
    }

    // Convert value to string and handle scientific notation
    let valueStr = typeof value === "number" ? value.toString() : value;
    if (valueStr.includes("e") || valueStr.includes("E")) {
      // Convert scientific notation to a regular number string
      valueStr = Number(valueStr).toLocaleString("fullwide", {
        useGrouping: false,
      });
    }

    const match = valueStr.replace(",", "").match(/^(-?)([0-9]*)\.?([0-9]*)$/);

    if (!match) {
      throw new Error("Invalid value");
    }
    const whole = match[2] || "0";
    let decimal = match[3] || "";
    while (decimal.length < decimals) {
      decimal += Zeros;
    }
    decimal = decimal.substring(0, decimals);
    const val = `${match[1]}${whole}.${decimal}`;
    return ethers.parseUnits(val, unit);
  } catch (err) {
    console.log(err, value, unit);
    if (
      typeof value === "number" ||
      (typeof value === "string" && !isNaNValue(Number(value)))
    ) {
      return BigInt(Math.floor(Number(value) * 10 ** (Number(unit) || 18)));
    }
    return ethers.parseUnits(value, unit);
  }
}

export async function withRetry<T>(
  account: string | undefined,
  networkCall: () => Promise<T>,
  maxRetries = 4,
) {
  const printError = usePrintError(account);
  let attempt = 0;
  let delay = 1000; // Start with a 1 second delay

  while (attempt < maxRetries - 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await networkCall();
    } catch {
      attempt++;
      // printError(`Attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`,);
      if (attempt >= maxRetries - 1) {
        printError(`Attempt ${attempt} failed. will retry one last time.`);
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
  return await networkCall();
}

export const getChainNameFromCGC = (cgcChainName: string): string | null => {
  function isValidChainName(
    key: string,
  ): key is keyof typeof CoingeckoData.chainNames {
    return key in CoingeckoData.chainNames;
  }
  const chainNames = Object.keys(CoingeckoData.chainNames);
  const chainName = chainNames.find(
    (chainName: string) =>
      isValidChainName(chainName) &&
      CoingeckoData.chainNames[chainName] === cgcChainName,
  );
  if (chainName) return chainName;
  return null;
};

function isValidChainName(key: string) {
  return Object.keys(ChainIDs)
    .map((k) => k.toLowerCase())
    .includes(key.toLowerCase());
}

// Helper function to convert chainName to chainId
export const getChainIdFromName = (
  chainName: string | undefined,
  throwError = false,
): ChainId | undefined => {
  if (throwError && !chainName) {
    throw new Error("Missing chainName error");
  }
  const lowercaseName = (chainName || "").toLowerCase();
  if (isValidChainName(lowercaseName)) {
    return ChainIDs[lowercaseName];
  }
  if (throwError) {
    throw new Error(getChainError(chainName || ""));
  }
  return undefined;
};

// Helper function to convert chainId to chainName
export const getChainNameFromId = (
  chainId: ChainId | string | number,
): string | undefined => {
  const chainIdNumber = Number(chainId);

  const chainNames = Object.keys(ChainIDs);
  const matchingChainName = chainNames.find(
    (chainName: string) =>
      isValidChainName(chainName) && ChainIDs[chainName] === chainIdNumber,
  );
  return matchingChainName; // This will return `undefined` if no match is found
};

// Helper function to convert chainId to stargate chainId
export const getStargateChainId = (chainId: ChainId): number | undefined => {
  if (chainId in StargateChainIDs) {
    return StargateChainIDs[chainId];
  }
  return undefined;
};

interface StargatePoolConfig {
  [chainId: number | string]: {
    [token: string]: number;
  };
}
// Helper function to convert (chainId, token) to stargate poolId
export const getStargatePoolId = (chainId: number, token: string) => {
  const stargatePools: StargatePoolConfig = ProtocolPools.stargate;
  let ret: number | undefined;
  const chainKey: number | string =
    chainId in stargatePools ? chainId : chainId.toString();
  if (chainKey in stargatePools) {
    const tokenKey = token.toLowerCase();
    ret = stargatePools[chainKey][tokenKey];
  }
  return ret;
};

export const getAcrossSupportedTokens = (chainId: number): string[] => {
  const supportedTokens: { [key: number]: string[] } = {
    1: ["ETH", "WETH", "USDC", "USDT", "DAI", "WBTC", "BAL", "UMA", "ACX"],
    137: ["WETH", "USDC.e", "USDT", "DAI", "WBTC", "BAL", "UMA", "ACX", "POOL"],
    324: ["ETH", "WETH", "USDC", "USDT", "DAI", "WBTC"],
    10: [
      "ETH",
      "WETH",
      "USDC.e",
      "USDT",
      "DAI",
      "WBTC",
      "BAL",
      "UMA",
      "ACX",
      "SNX",
      "POOL",
    ],
    8453: ["ETH", "WETH", "USDbC", "DAI", "BAL", "USDC"],
    42161: [
      "ETH",
      "WETH",
      "USDC.e",
      "USDT",
      "DAI",
      "WBTC",
      "BAL",
      "UMA",
      "ACX",
      "USDC",
    ],
    59144: ["ETH", "WETH", "USDC", "USDT", "DAI", "WBTC"],
  };
  return supportedTokens[chainId] || [];
};

export const getAmbientCallPathForLiq = (chainId: number) => {
  if (chainId === 1) {
    return 2;
  }
  if (chainId === 81457) {
    return 128;
  }
  throw new Error("Chain not supported");
};

export const getRpcUrlForChain = (
  chainId: number | undefined,
  index = 0,
): string | undefined => {
  // First try environment variable
  const envRpc = process.env[`RPCURL_${chainId}`];
  if (envRpc) return envRpc;

  // Fallback to configured RPCs
  if (chainId && chainId in RPCs) {
    const rpcs = RPCs[chainId];
    return rpcs[index % rpcs.length];
  }

  return undefined;
};

const getRpcUrlForChain0 = (
  chainId: number | undefined,
  index = 0,
): string | undefined => {
  if (!chainId) return undefined;
  function isSupportedChainId(chainId: number): boolean {
    return chainId in RPCs;
  }
  if (isSupportedChainId(chainId)) {
    return RPCs[chainId][index % RPCs[chainId].length];
  }
  return undefined;
};

export const getNativeTokenSymbolForChain = (
  chainId?: number,
  throwError = false,
): string | undefined => {
  const adjustedChainId = chainId === 260 ? ChainIDs.zksync : chainId;
  const nativeTokenSymbol =
    adjustedChainId && adjustedChainId in NativeTokens
      ? NativeTokens[adjustedChainId as ChainId]
      : undefined;
  if (!nativeTokenSymbol && throwError) {
    throw new Error("Chain not supported");
  }

  return nativeTokenSymbol;
};

export const getEthBalanceForUser = async (
  chainId: number,
  user: string,
  rpc: string | undefined = undefined,
  blockNumber = undefined,
  zksyncid: number | undefined = 260,
): Promise<bigint> => {
  const rpcUrl = rpc || getRpcUrlForChain(chainId);
  const provider = new RetryProvider(
    rpcUrl,
    chainId === ChainIDs.zksync ? zksyncid : chainId,
  );
  return await withRetry(user, () => provider.getBalance(user, blockNumber));
};

export const getProtocolAddressForChain = (
  protocol: string,
  chainId: ChainId,
  key = "default",
): string | null => {
  if (protocol in ProtocolAddresses) {
    const protocolAddresses = ProtocolAddresses[protocol];
    const addresses = protocolAddresses[chainId];
    if (addresses) {
      let address: string | undefined =
        typeof addresses === "string" || addresses === undefined
          ? addresses
          : addresses[key];
      if (!address && protocol === "pendle" && key.includes("-")) {
        const symbol: string | undefined = Object.keys(addresses)
          .filter((x) => x.includes("-"))
          .find((x) => x.split("-")[1] === key.split("-")[1].toLowerCase());
        address = symbol ? addresses[symbol] : undefined;
      }
      return address || null;
    }
  }
  return null;
};

export function isValidChainId(
  chainId: ChainId | number | string,
): chainId is ChainId {
  return isChainId(+chainId);
}

export const getProtocolPoolNameForChain = async (
  protocol: string | undefined,
  chainId: ChainId,
  poolAddress: string,
): Promise<{ protocolName: string | null; poolName: string | null }> => {
  if (!protocol) {
    const protocols = [
      ...Object.keys(ProtocolAddresses),
      ...uniswapLikeProtocols,
    ];
    const results = await Promise.all(
      protocols.map(async (p) => {
        return getProtocolPoolNameForChain(p, chainId, poolAddress);
      }),
    );
    for (const result of results) {
      if (result.poolName) {
        return result;
      }
    }
    return { protocolName: null, poolName: null };
  }

  if (uniswapLikeProtocols.includes(protocol)) {
    try {
      const rpcUrl = getRpcUrlForChain(chainId);
      const provider = new RetryProvider(rpcUrl, chainId);
      const viemClient = await getViemPublicClientFromEthers(provider);
      if (!isValidChainId(chainId)) {
        return { protocolName: null, poolName: null };
      }
      const factory = getProtocolAddressForChain(
        protocol,
        chainId,
        "factory",
      )?.toLowerCase();
      const factoryV3 = getProtocolAddressForChain(
        protocol,
        chainId,
        "factoryV3",
      )?.toLowerCase();
      if (!factory && !factoryV3) {
        return { protocolName: null, poolName: null };
      }
      assert(isHexStr(poolAddress));
      const [token0Addr, token1Addr, factoryAddr] = await Promise.all([
        viemClient.readContract({
          address: poolAddress,
          abi: abis["uniswap-pair"],
          functionName: "token0",
        }),
        viemClient.readContract({
          address: poolAddress,
          abi: abis["uniswap-pair"],
          functionName: "token1",
        }),
        viemClient.readContract({
          address: poolAddress,
          abi: abis["uniswap-pair"],
          functionName: "factory",
        }),
      ]);
      const [token0, token1] = await Promise.all([
        getTokenInfoForChain(token0Addr, getChainNameFromId(chainId)),
        getTokenInfoForChain(token1Addr, getChainNameFromId(chainId)),
      ]);
      if (
        token0 &&
        token1 &&
        (factoryAddr.toLowerCase() === factory ||
          factoryAddr.toLowerCase() === factoryV3)
      ) {
        return {
          protocolName: protocol,
          poolName: `${token0.symbol}-${token1.symbol}`,
        };
      }
    } catch {
      /* empty */
    }
    return { protocolName: null, poolName: null };
  }

  if (protocol in ProtocolAddresses && isValidChainId(chainId)) {
    const protocolAddresses = ProtocolAddresses[protocol];
    const protocolAddress = protocolAddresses[chainId];
    if (protocolAddress) {
      const keys = Object.entries(protocolAddress)
        .filter(([, value]) => typeof value === "string")
        .filter(
          ([, value]) =>
            (value as string).toLowerCase() === poolAddress.toLowerCase(),
        )
        .map(([key]) => key);
      if (keys.length === 0) {
        return { protocolName: null, poolName: null };
      }
      const key = keys[0];
      switch (protocol) {
        case "compound": {
          const parts = key.split("-");
          const poolName = parts[parts.length - 1];
          if (poolName === "bulker") {
            return {
              protocolName: protocol,
              poolName: getNativeTokenSymbolForChain(chainId) || null,
            };
          }
          return { protocolName: protocol, poolName };
        }
        case "lodestar": {
          if (key.startsWith("v1l")) {
            return {
              protocolName: protocol,
              poolName: key.slice(3),
            };
          }
          return { protocolName: null, poolName: null };
        }
        default: {
          return { protocolName: protocol, poolName: key };
        }
      }
    }
  }

  return { protocolName: null, poolName: null };
};

function onlyUnique<T>(value: T, index: number, array: T[]): boolean {
  return array.indexOf(value) === index;
}

const getProtocolAddresses = (protocol: string) => {
  const protocolAddresses: Record<string, unknown> =
    ProtocolAddresses[protocol.toLowerCase()] || {};
  return Object.fromEntries(
    Object.entries(protocolAddresses).map(([chain, addresses]) => [
      chain,
      Object.values(addresses as Record<string, string>).filter(onlyUnique),
    ]),
  );
};

const __cache: JSONObject = {};
export const getVerifiedEntities = async (
  simple: boolean,
): Promise<Entities> => {
  const key = simple ? "A" : "B";
  const now = Date.now();
  const value = __cache[key];
  if (value && now - value.ts < 7200000) {
    return value.data;
  }
  const protocolsInfo = await Protocols.findAll({ raw: true });

  for (const action of Object.keys(EntityData.actions)) {
    EntityData.actions[action].sort();
  }

  const protocols = EntityData.protocols
    .sort()
    .map((protocol) => getProtocolEntities(protocol, protocolsInfo, simple));

  const hyperliquidIndex = protocols.findIndex((x) => x.name === "Hyperliquid");
  if (hyperliquidIndex >= 0) {
    const pools = await getHyperliquidPools();
    const poolsObj: JSONObject = {};
    Object.keys(pools)
      .sort()
      .forEach((name, _) => {
        poolsObj[name] = { name };
      });
    protocols.splice(hyperliquidIndex, 1, {
      ...protocols[hyperliquidIndex],
      pools: {
        42161: poolsObj,
      },
    });
  }

  const data = {
    actions: EntityData.actions,
    conditions: EntityData.conditions,
    protocols,
    chains: await Promise.all(
      EntityData.chains.map((chain) => getChainEntities(chain, simple)),
    ),
  };
  __cache[key] = { data, ts: now };
  return data;
};

const getProtocolEntities = (
  protocol: string,
  protocolsInfo: Protocols[],
  simple: boolean,
) => {
  const poolNames = JSON.parse(
    JSON.stringify(ProtocolPools[protocol.toLowerCase()] || {}),
  );
  const allChainIds = EntityData.chains
    .map((chain) => getChainIdFromName(chain))
    .filter((chainId) => chainId !== undefined);
  let chainIds = Object.keys(poolNames)
    .filter((chainId) => chainId !== "form")
    .filter((chainId) => allChainIds.includes(+chainId as ChainId));

  const form = poolNames.form;
  if (form) {
    chainIds = Object.keys(form);
    poolNames.form = undefined;
  }

  for (const chainId of chainIds) {
    // List of protocol pools can be array or object
    // If data is not array, covert it to array of keys
    if (poolNames[chainId] && !Array.isArray(poolNames[chainId])) {
      poolNames[chainId] = Object.keys(poolNames[chainId]);
    }
  }

  let reference: string | undefined;
  switch (protocol.toLowerCase()) {
    // case "kyberswap":
    //   addresses = {
    //     1: ["0x6131B5fae19EA4f9D964eAc0408E4408b66337b5"],
    //     56: ["0x6131B5fae19EA4f9D964eAc0408E4408b66337b5"],
    //     137: ["0x6131B5fae19EA4f9D964eAc0408E4408b66337b5"],
    //     250: ["0x6131B5fae19EA4f9D964eAc0408E4408b66337b5"],
    //     10: ["0x6131B5fae19EA4f9D964eAc0408E4408b66337b5"],
    //     42161: ["0x6131B5fae19EA4f9D964eAc0408E4408b66337b5"],
    //     43114: ["0x6131B5fae19EA4f9D964eAc0408E4408b66337b5"],
    //     25: ["0x6131B5fae19EA4f9D964eAc0408E4408b66337b5"],
    //   };
    //   break;
    case "balancer":
    case "sushiswap":
    case "uniswap":
    case "llamazip":
    case "curve":
    case "camelot":
    case "kyberswap":
    case "pancakeswap":
      reference = "ParaSwap";
      break;
    case "aerodrome":
    case "matcha":
    case "velodrome":
      reference = "0x";
      break;
    case "jumper":
      reference = "LiFi";
      break;
    default:
  }

  const pools: JSONObject = {};
  if (form) {
    pools.form = form;
  } else {
    for (const chainId of chainIds) {
      pools[chainId] = pools[chainId] || {};
      let filteredPoolNames = poolNames[chainId];

      if (protocol.toLowerCase() === "pendle") {
        filteredPoolNames = getProtocolEntitiesSort(filteredPoolNames);
      }

      for (const poolName of filteredPoolNames) {
        const protocolAddresses = ProtocolAddresses[protocol.toLowerCase()];
        const poolAddress =
          protocolAddresses[chainId][poolName] ||
          protocolAddresses[chainId.toString()][poolName];

        pools[chainId][poolName] = {
          name: poolName,
        };

        if (!simple) {
          pools[chainId][poolName].address = poolAddress;
        }
      }
    }
  }

  const addresses = getProtocolAddresses(protocol);
  const protocolEntities: Record<string, unknown> = {
    name: protocol,
    pools,
    chains: Object.keys(addresses).filter((x) =>
      allChainIds.includes(+x as ChainId),
    ),
    url: protocolsInfo.find(
      (info) => info.name.toLowerCase() === protocol.toLowerCase(),
    )?.url,
  };
  if (!simple) {
    protocolEntities.chains = (protocolEntities.chains as number[])
      .map((chainId) => getChainNameFromId(chainId))
      .filter((chainName) => !!chainName);
  }
  if (!simple) {
    protocolEntities.addresses = addresses;
  }
  if (reference) {
    protocolEntities.reference = reference;
  }
  return protocolEntities;
};

const getChainEntities = async (chainName: string, simple: boolean) => {
  const chainId = getChainIdFromName(chainName);

  return {
    id: chainId,
    name: chainName,
    tokens: chainId ? await getTokensForChain(chainId, simple) : undefined,
  };
};

export const getABIForProtocol = (
  protocol: string,
  key = "",
): ethers.InterfaceAbi =>
  abis[`${protocol}${!key ? "" : `-${key}`}` as keyof typeof abis];

export const convertProtocolNameToDefillamaProject = (
  protocolName: string,
): string | null => {
  if (!protocolName) return null;

  const protocol = protocolName.toLowerCase();

  return (DefiLlama.projects[protocol] as string) || protocol;
};

export const convertPoolNameToDefillamaSymbol = (
  protocolName: string,
  poolName_: string | undefined,
): string | undefined => {
  let poolName = poolName_;
  if (!poolName) return "";

  const protocol = protocolName?.toLowerCase();

  if (protocol === "stargate") {
    return poolName.includes("*")
      ? poolName.split("*")[1].toUpperCase()
      : poolName.toUpperCase();
  }
  if (protocol === "pendle") {
    poolName = extractPendleToken(poolName);
  } // check references to this function, might be the case that pendle never gets fed. low priority.

  if (protocol in DefiLlama.symbols) {
    const symbols = DefiLlama.symbols[protocol] as Record<string, string>;
    return symbols[poolName.toLowerCase()] || poolName.toUpperCase();
  }

  return poolName?.toUpperCase();
};

// Helper function to get tokens on a chain
const getTokensForChain = async (
  chainId: ChainId,
  simple: boolean,
): Promise<
  (Pick<Tokens, "name" | "symbol"> &
    Partial<Pick<Tokens, "address" | "decimals" | "thumb">>)[]
> => {
  const tokens: Tokens[] = await Tokens.findAll({
    where: { chainId },
    raw: true,
  });
  return tokens.map(({ name, symbol, address, decimals, thumb }) =>
    simple ? { name, symbol } : { name, symbol, address, decimals, thumb },
  );
};

// Helper function to get tokens on a chain
const getTokenForChainI = async (
  chainId: ChainId | undefined,
  symbol: string,
  extraInfo: JSONObject = {},
) => {
  // Function to create a query with multiple conditions
  const createQuery = (
    searchSymbol: string,
  ): FindOptions<InferAttributes<Tokens, { omit: never }>> => {
    const filter: JSONObject = {
      [Op.or]: [
        { symbol: searchSymbol },
        { name: { [Op.iLike]: searchSymbol } },
        { coingeckoId: searchSymbol },
        { coinmarketcapId: searchSymbol },
        { address: searchSymbol },
      ],
    };
    if (chainId) {
      filter.chainId = chainId;
    }

    return {
      where: filter,
      order: [["id", "ASC"]],
      raw: true,
    };
  };
  const nativeTokenSymbol = getNativeTokenSymbolForChain(chainId);
  let token: Tokens | undefined;
  // First, try to find with the original symbol
  let isMultiple = false;
  let tokens = await Tokens.findAll(createQuery(symbol));
  tokens = tokens.filter(
    (x) => isValidAddress(x.address) || isSolanaAddress(x.address),
  );
  const isAddressOrNative =
    symbol.toLowerCase() === nativeTokenSymbol?.toLowerCase() ||
    symbol.startsWith("0x") ||
    isSolanaAddress(symbol);
  tokens = await filterMultipleTokens(
    tokens,
    isAddressOrNative,
    chainId,
    extraInfo.liquidityThreshold,
  );
  if (chainId === 101) {
    token = tokens[0];
  } else {
    if (tokens.length > 1) {
      if (
        extraInfo.provider &&
        extraInfo.account &&
        symbol.toLowerCase() !== nativeTokenSymbol?.toLowerCase()
      ) {
        const balances = await Promise.all(
          tokens.map(async (t) => {
            try {
              const { amount, decimals } = await getTokenAmount(
                extraInfo.provider,
                t as TokenInfo,
                extraInfo.account,
              );
              return {
                token: t,
                balance: +ethers.formatUnits(amount, decimals),
              };
            } catch (err) {
              sfConsoleError("highest balance error", err);
              return { token: t, balance: 0 };
            }
          }),
        );
        const highestBalanceToken = balances.sort(
          (a, b) => b.balance - a.balance,
        )[0];
        token = highestBalanceToken.token;
        isMultiple = true;
      }
    }
    if (!token && tokens.length) {
      const marketCaps = await Promise.all(
        tokens.map(async (t) => {
          if (t.address === NATIVE_TOKEN) {
            return { token: t, marketCap: Number.POSITIVE_INFINITY };
          }
          try {
            const coinData = await fetchGeckoTerminalDataWithRetry(
              extraInfo?.account || "",
              chainId,
              t as TokenInfo,
            );
            return { token: t, marketCap: coinData.market_cap || 0 };
          } catch (error) {
            sfConsoleError(`Error fetching market cap for ${t.symbol}:`, error);
            return { token: t, marketCap: 0 };
          }
        }),
      );
      const highestMarketCapToken = marketCaps.sort(
        (a, b) => b.marketCap - a.marketCap,
      )[0];
      token =
        highestMarketCapToken.token ||
        tokens.sort((a, b) => a.name.length - b.name.length)[
          chainId === ChainIDs.zksync ? tokens.length - 1 : 0
        ];
    }
  }

  // If not found, try with the lowercase symbol
  if (!token && symbol !== symbol.toLowerCase()) {
    return await getTokenForChainI(chainId, symbol.toLowerCase(), extraInfo);
  }

  // Return the formatted object if token is found
  if (token) {
    return { ...token, isMultiple };
  }
  return null;
};

const memoizeCache: JSONObject = {};

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
const memoizeWithExpiration = <T extends (...args: any[]) => any>(
  fn: T,
  ttl: number,
): ((
  ...args: [...Parameters<T>, boolean?]
) => Promise<Awaited<ReturnType<T>>>) => {
  // Create a unique identifier for the function
  const fnId = fn.name || fn.toString().slice(0, 100);

  return async (
    ...args: [...Parameters<T>, boolean?]
  ): Promise<Awaited<ReturnType<T>>> => {
    const noCache =
      typeof args[args.length - 1] === "boolean"
        ? (args.pop() as boolean)
        : false;
    // Include function identifier in the cache key
    const key = `${fnId}:${JSON.stringify(args)}`;
    const now = Date.now();

    if (
      noCache ||
      !(memoizeCache[key] && now - memoizeCache[key].timestamp < ttl)
    ) {
      const result = await fn(...args);
      memoizeCache[key] = { value: result, timestamp: now };
    }
    return memoizeCache[key].value;
  };
};

const getTokenForChain = memoizeWithExpiration(getTokenForChainI, TTL_3_DAYS);

export const getPoolApy = async (
  account: string | undefined,
  chainId: ChainId,
  project: string,
  symbol: string | undefined,
): Promise<number | undefined> => {
  const printError = usePrintError(account);
  const chainName = getChainNameFromId(chainId);
  try {
    const { data } = await withRetry(`${account}`, () =>
      axios.get("https://yields.llama.fi/pools"),
    );
    if (data.status === "success") {
      const pools = data.data.filter(
        (x: { project: string; chain: string }) =>
          x.project === project &&
          x.chain.toLowerCase() === chainName?.toLowerCase(),
      );
      if (pools.length > 0) {
        let pool: { project: string; symbol: string; apy: number } | undefined;
        if (project === "pendle" && symbol) {
          pool = pools.find((x: { symbol: string }) =>
            x.symbol.startsWith(symbol),
          );
        } else {
          pool = pools.find((x: { symbol: string }) => x.symbol === symbol);
          if (!pool) {
            const nativeSymbol =
              getNativeTokenSymbolForChain(chainId)?.toLowerCase();
            if (symbol?.toLowerCase() === nativeSymbol) {
              pool = pools.find(
                (x: { symbol: string }) =>
                  x.symbol.toLowerCase() === `w${nativeSymbol}`,
              );
            } else if (symbol?.toLowerCase() === `w${nativeSymbol}`) {
              pool = pools.find(
                (x: { symbol: string }) =>
                  x.symbol.toLowerCase() === nativeSymbol,
              );
            }
          }
        }
        if (pool) return pool.apy;
      }
      throw new Error(
        `Could not find pool ${symbol} info for protocol ${project} from defillama.`,
      );
    }
  } catch (err) {
    printError(err);
  }
};

type DebankTokenR = {
  id: string;
  chain: string;
  name: string;
  symbol: string;
  display_symbol: string;
  decimals: number;
  logo_url: string;
  amount: number;
  price: number;
};

type DebankToken = {
  name: string;
  symbol: string;
  address: string;
  decimals: number;
  logo: string;
  balance: number;
  price: number;
};

const getUserOwnedTokenBalancesFromDeBankI = async (
  account?: string,
): Promise<Partial<Record<ChainId, DebankToken[]>>> => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);
  try {
    const queryParams = new URLSearchParams({
      id: `${account}`,
      is_all: "false",
    });
    const { data } = await withRetry(`${account}`, () =>
      axios.get<DebankTokenR[]>(
        `${DEBANK_API}/user/all_token_list?${queryParams}`,
        {
          headers: { AccessKey: process.env.DEBANK_ACCESS_KEY },
        },
      ),
    );

    const tokens: Partial<Record<ChainId, DebankToken[]>> = {};
    const chainIds = Object.keys(DebankData.chainIds);

    for (const token of data) {
      const chainId = Number(
        chainIds.find((id) => DebankData.chainIds[id] === token.chain),
      );
      if (chainId) {
        if (!(chainId in tokens)) {
          tokens[chainId as ChainId] = [];
        }
        if (
          token.symbol === "USDC" &&
          token.display_symbol === "USDC(Bridged)"
        ) {
          token.symbol = "USDC.e";
        }

        let address: string = token.id || "";
        if (!token.id.startsWith("0x")) {
          if (
            token.symbol.toLowerCase() !==
            getNativeTokenSymbolForChain(chainId)?.toLowerCase()
          ) {
            continue;
          }
          address = NATIVE_TOKEN;
        }
        const tokenInfo = {
          name: token.name,
          symbol: token.symbol,
          address,
          decimals: token.decimals,
          logo: token.logo_url,
          balance: token.amount,
          price: token.price,
        };

        if (
          !(chainId in tokens) ||
          !(tokens[chainId as ChainId] as DebankToken[]).some(
            (x) => x.address === address,
          )
        ) {
          (tokens[chainId as ChainId] as DebankToken[]).push(tokenInfo);
        }
      }
    }
    const chainIds_ = Object.keys(tokens);
    for (const chainId of chainIds_) {
      (tokens[+chainId as ChainId] as DebankToken[]).sort(
        (a, b) =>
          (b.balance || 0) * (b.price || 0) - (a.balance || 0) * (a.price || 0),
      );
    }

    return tokens;
  } catch (err) {
    printLog("Failed to get user's token list from Debank");
    printError(getErrorMessage(err));
  }

  return {};
};

export const getUserOwnedTokenBalancesFromDeBank = memoizeWithExpiration(
  getUserOwnedTokenBalancesFromDeBankI,
  TTL_1_MIN * 25,
);

async function defiLlamaPoolsI() {
  try {
    return (
      await withRetry("", () => axios.get("https://yields.llama.fi/pools"))
    )?.data;
  } catch (error) {
    if (error instanceof AxiosError) {
      sfConsoleError("defillama pools", error.response?.data);
    } else {
      sfConsoleError("error with pro defillama endpoint fetch");
    }
    return null;
  }
}
const defiLlamaPools = memoizeWithExpiration(defiLlamaPoolsI, TTL_3_HOURS * 4);

async function defiLlamaPoolsBorrowI() {
  try {
    return (
      await withRetry("", () =>
        axios.get(`${DEFILLAMA_API_ENDPOINT}/yields/poolsBorrow`),
      )
    )?.data;
  } catch (error) {
    if (error instanceof AxiosError) {
      sfConsoleError(error.response?.data);
    } else {
      sfConsoleError("error with pro defillama endpoint fetch");
    }
    return null;
  }
}
const defiLlamaPoolsBorrow = memoizeWithExpiration(
  defiLlamaPoolsBorrowI,
  TTL_3_HOURS * 4,
);

const getUserProtocolPositionsFromDeBank = async (account: string) => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);
  try {
    const queryParams = new URLSearchParams({
      id: account,
    });
    const { data } = await withRetry(account, () =>
      axios.get(`${DEBANK_API}/user/all_complex_protocol_list?${queryParams}`, {
        headers: { AccessKey: process.env.DEBANK_ACCESS_KEY },
      }),
    );

    const yieldData: JSONObject = {};

    try {
      [yieldData.pools, yieldData.poolsBorrow] = await Promise.all([
        defiLlamaPools(),
        defiLlamaPoolsBorrow(),
      ]);
    } catch (err) {
      printError(err);
    }

    const protocols: Partial<
      Record<
        ChainId,
        Record<
          string,
          { logo: string; url: string; positions: DebankPositionInfo[] }
        >
      >
    > = {};
    const chainIds = Object.keys(DebankData.chainIds);

    const getTokenInfo = (token: DebankTokenR): DebankTokenInfoR => {
      if (token.symbol === "USDC" && /^USD Coin (...)/.test(token.name)) {
        token.symbol = "USDC.e";
      }

      return {
        name: token.name,
        symbol: token.symbol,
        address: token.id.startsWith("0x") ? token.id : ethers.ZeroAddress,
        decimals: token.decimals,
        logo: token.logo_url,
        amount: token.amount,
      };
    };
    const getDetails = (detail: JSONObject) => {
      const positionDetails: JSONObject = {};

      for (const key of Object.keys(detail)) {
        if (!key.includes("_token")) {
          positionDetails[key] = detail[key];
        }
      }

      return positionDetails;
    };

    await Promise.all(
      data.map(async (protocol: JSONObject) => {
        const chainId =
          chainIds.find((id) => DebankData.chainIds[id] === protocol.chain) ||
          0;
        if (chainId) {
          protocols[+chainId as ChainId] ||= {};
          if (!(protocol.name in (protocols[+chainId as ChainId] || {}))) {
            (protocols[+chainId as ChainId] || {})[protocol.name] = {
              logo: protocol.logo_url,
              url: protocol.site_url,
              positions: [],
            };
          }

          await Promise.all(
            protocol.portfolio_item_list.map(async (item_list: JSONObject) => {
              try {
                if (item_list.name === "Liquidity Pool") {
                  const positionInfo: Partial<DebankPositionInfo> = {
                    id: item_list?.pool?.id,
                    type: item_list.name,
                    tokens: [],
                    detail: getDetails(item_list.detail) as DebankPoolInfo,
                  };
                  for (const token of item_list.asset_token_list) {
                    const tokenInfo = getTokenInfo(token);
                    if (tokenInfo) positionInfo.tokens?.push(tokenInfo);
                  }

                  try {
                    let poolInfo: Partial<DebankPoolInfo> | undefined;
                    try {
                      poolInfo = await getPoolMetadata(
                        getChainNameFromId(chainId) || "",
                        protocol.name.replace(/ V[1-9]/, ""),
                        item_list.asset_token_list
                          .map((token: DebankTokenInfoR) => token.symbol)
                          .join("-"),
                        "deposit",
                        yieldData,
                      );
                    } catch {
                      poolInfo = await getPoolMetadata(
                        getChainNameFromId(chainId) || "",
                        protocol.name.replace(/ V[1-9]/, ""),
                        [
                          ...item_list.asset_token_list.map(
                            (token: DebankTokenInfoR) => token.symbol,
                          ),
                        ]
                          .reverse()
                          .join("-"),
                        "deposit",
                        yieldData,
                      );
                    }
                    if (positionInfo.detail)
                      positionInfo.detail.apy = poolInfo?.apy;
                  } catch {
                    // printError(
                    // "defillama pool fetch error",
                    // item_list.asset_token_list
                    // .map((token) => token.symbol)
                    // .join("-"),
                    // protocol.name.replace(/ V[1-9]/, ""),
                    // );
                  }

                  protocols[+chainId as ChainId]?.[
                    protocol.name
                  ].positions.push(positionInfo as DebankPositionInfo);
                } else if (item_list.name === "Perpetuals") {
                  let subType = "";
                  if (
                    protocol.name.startsWith("GMX") &&
                    item_list?.detail?.side
                  ) {
                    subType = item_list?.detail?.side;
                  }

                  const positionInfo: Partial<DebankPositionInfo> = {
                    id: item_list?.pool?.id,
                    type: item_list.name,
                    subType,
                    tokens: [],
                    detail: getDetails(item_list.detail) as DebankPoolInfo,
                  };

                  positionInfo.tokens?.push(
                    getTokenInfo(item_list.detail.position_token),
                  );
                  positionInfo.tokens?.push(
                    getTokenInfo(item_list.detail.margin_token),
                  );

                  protocols[+chainId as ChainId]?.[
                    protocol.name
                  ].positions.push(positionInfo as DebankPositionInfo);
                } else {
                  const tokenListKey =
                    item_list.name === "Lending"
                      ? [
                          ["supply_token_list", "Supplied"],
                          ["borrow_token_list", "Borrowed"],
                          ["reward_token_list", "Rewards"],
                        ]
                      : [["supply_token_list"]];

                  await Promise.all(
                    tokenListKey.map(async ([listKey, listType]) => {
                      const tokenListData = item_list?.detail || {};

                      if (!tokenListData[listKey]) {
                        return;
                      }

                      await Promise.all(
                        tokenListData[listKey].map(
                          async (token: DebankTokenR) => {
                            const positionInfo: Partial<DebankPositionInfo> = {
                              id: `${item_list?.pool?.id}_${token.id}`,
                              type: item_list.name,
                              subType: listType,
                              tokens: [getTokenInfo(token)],
                              detail: getDetails(
                                item_list.detail,
                              ) as DebankPoolInfo,
                            };

                            if (listType !== "Rewards") {
                              try {
                                const poolInfo = await getPoolMetadata(
                                  getChainNameFromId(chainId) || "",
                                  protocol.name.replace(/ V[1-9]/, ""),
                                  token.symbol,
                                  listType === "Borrowed"
                                    ? "borrow"
                                    : "deposit",
                                  yieldData,
                                );
                                if (positionInfo.detail)
                                  positionInfo.detail.apy = poolInfo?.apy;
                              } catch {
                                // printError(
                                // "defillama pool fetch error",
                                // token.symbol,
                                // protocol.name.replace(/ V[1-9]/, ""),
                                // );
                              }
                            }

                            if (!token.id.startsWith("0x")) {
                              protocols[+chainId as ChainId]?.[
                                protocol.name
                              ].positions.splice(
                                0,
                                0,
                                positionInfo as DebankPositionInfo,
                              );
                            } else {
                              protocols[+chainId as ChainId]?.[
                                protocol.name
                              ].positions.push(
                                positionInfo as DebankPositionInfo,
                              );
                            }
                          },
                        ),
                      );
                    }),
                  );
                }
              } catch (err) {
                printError(err);
              }
            }),
          );
        }
      }),
    );

    return protocols;
  } catch (err) {
    printLog("Failed to get user's complex protocol list from Debank");
    printError(getErrorMessage(err));
  }

  return {};
};

type HyperliquidStateR = {
  crossMarginSummary: {
    accountValue: string;
    totalNtlPos: string;
  };
  assetPositions: {
    position: {
      coin: string;
      marginUsed: string;
      leverage: {
        type: string;
        value: number;
      };
      unrealizedPnl: string;
      positionValue: string;
      liquidationPx: string;
      entryPx?: string;
      markPx?: string;
    };
  }[];
  crossMaintenanceMarginUsed: string;
  withdrawable: string;
};

type HyperliquidSpotStateR = {
  balances: {
    coin: string;
    token: number;
    total: number;
    hold: number;
    entryNtl: number;
  }[];
};

type HyperliquidFills = {
  coin: string;
  side: string;
  dir: string;
}[];

type HyperliquidState = {
  42161?: {
    Hyperliquid: {
      logo: string;
      url: string;
      detail: {
        cross_margin_ratio: number;
        maintenance_margin: number;
        cross_account_leverage: number;
      };
      positions: {
        id: string;
        type: string;
        tokens: DebankTokenInfoR[];
        detail?: {
          side?: string;
          daily_funding_rate?: number;
          interest_rate?: number;
          leverage?: number;
          pnl_usd_value?: string;
          value?: string;
          liquidation_price?: string; // Add this field
          entry_price?: string;
          mark_price?: string;
        };
      }[];
    };
  };
};

export const getUserProtocolPositionsFromHyperliquid = async (
  account: string,
) => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);

  try {
    const { data } = await withRetry(account, () =>
      axios.post<HyperliquidStateR>(`${HYPERLIQUID_API_ENDPOINT}/info`, {
        type: "clearinghouseState",
        user: account,
      }),
    );

    const { data: spotData } = await withRetry(account, () =>
      axios.post<HyperliquidSpotStateR>(`${HYPERLIQUID_API_ENDPOINT}/info`, {
        type: "spotClearinghouseState",
        user: account,
      }),
    );

    const positions: HyperliquidState = {};

    if (
      !Number.parseFloat(data.withdrawable) &&
      data.assetPositions.length === 0 &&
      spotData.balances.length === 0
    ) {
      return positions;
    }

    positions[42161] = {
      Hyperliquid: {
        logo: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/8112.png",
        url: "https://app.hyperliquid.xyz",
        detail: {
          cross_margin_ratio:
            (Number(data.crossMaintenanceMarginUsed) * 100) /
            Number(data.crossMarginSummary.accountValue),
          maintenance_margin: Number(data.crossMaintenanceMarginUsed),
          cross_account_leverage:
            Number(data.crossMarginSummary.totalNtlPos) /
            Number(data.crossMarginSummary.accountValue),
        },
        positions: [],
      },
    };

    const usdcInfo = {
      name: "USD Coin",
      symbol: "USDC",
      address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
      decimals: 6,
      logo: "https://static.debank.com/image/arb_token/logo_url/0xaf88d065e77c8cc2239327c5edb3a432268e5831/fffcd27b9efff5a86ab942084c05924d.png",
    };

    if (Number.parseFloat(data.withdrawable)) {
      positions[42161].Hyperliquid.positions.push({
        id: "hyperliquid_balance",
        type: "Deposit",
        tokens: [
          {
            ...usdcInfo,
            amount: Number.parseFloat(data.withdrawable),
          } as DebankTokenInfoR,
        ],
      });
    }

    if (data.assetPositions.length > 0) {
      const fills =
        data.assetPositions.length > 0
          ? (
              await withRetry(account, () =>
                axios.post<HyperliquidFills>(
                  `${HYPERLIQUID_API_ENDPOINT}/info`,
                  {
                    type: "userFills",
                    user: account,
                  },
                ),
              )
            ).data
          : [];

      const { data: metaData } = await withRetry(account, () =>
        axios.post(`${HYPERLIQUID_API_ENDPOINT}/info`, {
          type: "metaAndAssetCtxs",
        }),
      );

      const assetPositionPromises = data.assetPositions.map(
        async (assetPosition) => {
          const position = assetPosition.position;
          const positionToken = position.coin;

          const metaIndex = metaData[0].universe.findIndex(
            (x: { name: string }) =>
              x.name.toLowerCase() === positionToken.toLowerCase(),
          );

          const fill = fills.find(
            (fill) =>
              fill.coin === positionToken && !fill.dir.startsWith("Close"),
          );

          return {
            id: `hyperliquid_${positionToken}_position`,
            type: "Perpetuals",
            tokens: [
              {
                symbol: positionToken,
                logo: `https://app.hyperliquid.xyz/coins/${positionToken}.svg`,
                amount: 0,
              } as DebankTokenInfoR,
              {
                ...usdcInfo,
                amount: Number.parseFloat(position.marginUsed),
              } as DebankTokenInfoR,
            ],
            detail: {
              side: fill?.side === "B" ? "Long" : "Short",
              daily_funding_rate: +metaData[1][metaIndex].funding,
              interest_rate: +metaData[1][metaIndex].openInterest,
              leverage: position.leverage.value,
              pnl_usd_value: position.unrealizedPnl,
              value: position.positionValue,
              liquidation_price: position.liquidationPx,
              entry_price: position.entryPx,
              mark_price: metaData[1][metaIndex].markPx,
            },
          };
        },
      );

      const resolvedAssetPositions = await Promise.all(assetPositionPromises);
      positions[42161].Hyperliquid.positions.push(...resolvedAssetPositions);
    }

    if (spotData.balances.filter((x) => x.total > 0).length > 0) {
      const markets = await fetchHyperliquidSpotMarkets();
      const prices: Record<string, number | undefined> = {};
      spotData.balances.forEach((x, _) => {
        const market = markets.find((m) => m?.base?.toUpperCase() === x.coin);
        prices[x.coin] = Number(market?.info.markPx);
      });
      prices.USDC =
        (await getCoinData(account, "usdc", 42161, false)).price || 1;
      const tokenInfos = await Promise.all(
        spotData.balances
          .filter((x) => x.total > 0)
          .map(async (x) => {
            const tokenInfo = await getHyperliquidTokenInfo(
              42161,
              x.coin,
              true,
            );
            return {
              ...x,
              tokenInfo: tokenInfo?.tokenInfo,
            };
          }),
      );
      positions[42161].Hyperliquid.positions.push({
        id: "hyperliquid_spot",
        type: "Spot",
        tokens: tokenInfos
          .filter((x) => !!x?.tokenInfo)
          .map(({ tokenInfo, ...x }) => ({
            name: x.coin,
            address: tokenInfo?.address || "",
            symbol: x.coin,
            decimals: x.coin === "USDC" ? 6 : tokenInfo?.decimals || 18,
            price: prices[x.coin] || 0,
            amount: x.total - x.hold,
            logo: tokenInfo?.thumb || "",
            pnl_usd_value:
              x.coin !== "USDC"
                ? (x.total - x.hold) * (prices[x.coin] || 0) - x.entryNtl
                : undefined,
          })),
      });
    }

    return positions;
  } catch (err) {
    printLog("Failed to get user's position info from Hyperliquid");
    printError(getErrorMessage(err));
  }

  return {};
};

const getProtocolPositionsI = async (account: string) => {
  const protocolPositions: JSONObject = {};

  const results = await Promise.all([
    getUserProtocolPositionsFromDeBank(account),
    getUserProtocolPositionsFromHyperliquid(account),
  ]);

  for (const positions of results) {
    for (const chainId of Object.keys(positions)) {
      if (!(chainId in protocolPositions)) {
        protocolPositions[chainId] = {};
      }

      for (const protocol of Object.keys((positions as JSONObject)[chainId])) {
        protocolPositions[chainId][protocol] = (positions as JSONObject)[
          chainId
        ][protocol];
      }
    }
  }

  return protocolPositions;
};

export const getProtocolPositions = memoizeWithExpiration(
  getProtocolPositionsI,
  TTL_1_MIN * 25,
);

export const getUserOwnedTokensFromDeBank = async (
  chainId: ChainId,
  account: string,
  symbol: string | undefined = undefined,
  minValue = 0,
) => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);

  let ownedTokens: string[] = [];

  const chain = DebankData.chainIds[chainId];
  if (!chain) {
    printLog(
      "following chain id not supported on Debank",
      chainId.toString(),
      Object.keys(DebankData.chainIds),
    );
    return symbol ? null : [];
  }

  try {
    const queryParams = new URLSearchParams({
      id: account,
      chain_id: chain,
      is_all: "false",
    });
    const { data } = await withRetry(account, () =>
      axios.get(`${DEBANK_API}/user/token_list?${queryParams}`, {
        headers: { AccessKey: process.env.DEBANK_ACCESS_KEY },
      }),
    );
    if (symbol) {
      const token = data.find(
        (x: { name: string; symbol: string }) =>
          x.symbol?.toLowerCase() === symbol.toLowerCase() ||
          x.name?.toLowerCase() === symbol.toLowerCase(),
      );
      if (!token) return null;
      const ret: JSONObject = {
        address: token.id,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals,
      };
      if (token.logo_url) {
        ret.thumb = token.logo_url;
      }
      return ret;
    }

    ownedTokens = data
      .filter(
        (token: { amount: number; price: number }) =>
          token.amount * token.price >= minValue,
      )
      .sort(
        (
          a: { amount: number; price: number },
          b: { amount: number; price: number },
        ) => (b.amount * b.price > a.amount * a.price ? 1 : -1),
      )
      .map((token: { symbol: string }) => token.symbol);
  } catch (err) {
    printLog("Failed to get user's token list from Debank");
    printError(getErrorMessage(err));
  }

  return symbol ? null : ownedTokens;
};

// const getUserOwnedTokensFromZapper = async (
// chainId,
// account,
// symbol: string | undefined = undefined,
// ) => {
// const printLog = usePrintLog(account);
// const printError = usePrintError(account);
//
// let ownedTokens: string[] = [];
//
// try {
// const headers = {
// accept: "*/*",
// Authorization: `Basic ${Buffer.from(
// `${process.env.ZAPPER_API_KEY}:`,
// "binary",
// ).toString("base64")}`,
// };
//
// if (!Object.keys(ZapperData.chainNames).includes(chainId.toString())) {
// printLog(
// "following chain id not supported on Zapper",
// chainId.toString(),
// Object.keys(ZapperData.chainNames),
// );
// return symbol ? null : [];
// }
//
// const queryParams = new URLSearchParams([
// ["addresses[]", [account]],
// ["networks[]", ZapperData.chainNames[chainId.toString()]],
// ]);
// let { data } = await withRetry(account, () =>
// axios.get(`https://api.zapper.xyz/v2/balances/tokens?${queryParams}`, {
// headers,
// }),
// );
// data = data[account.toLowerCase()] || [];
// if (symbol) {
// const token = data
// .map(({ token }) => token)
// .filter((x) => !!x.symbol)
// .find((x) => x.symbol.toLowerCase() === symbol.toLowerCase());
// if (!token) return null;
// const ret: JSONObject = {
// address: token.address,
// name: token.name,
// symbol: token.symbol,
// decimals: token.decimals,
// };
// if (token.coingeckoId) {
// ret.coingeckoId = token.coingeckoId;
// }
// return ret;
// }
// ownedTokens = data.map(({ token }) => token.symbol);
// } catch (err) {
// printLog("Failed to get user's token list from Zapper");
// printError(getErrorMessage(err));
// }
//
// return symbol ? null : ownedTokens;
// };
//
// const getUserOwnedTokensFromMoralis = async (
// chainId,
// account,
// symbol: string | undefined = undefined,
// ) => {
// const printLog = usePrintLog(account);
// const printError = usePrintError(account);
//
// let ownedTokens: string[] = [];
//
// try {
// const moralisChainId = MoralisData.chainIds[chainId];
// if (moralisChainId) {
// const response = await Moralis.EvmApi.token.getWalletTokenBalances({
// address: account,
// chain: moralisChainId,
// });
// const data = response
// .toJSON()
// .filter((token) => !token.possible_spam)
// .filter((x) => !!x.symbol);
// if (symbol) {
// const token = data.find(
// (x) => x.symbol.toLowerCase() === symbol.toLowerCase(),
// );
// if (!token) return null;
// const ret: JSONObject = {
// address: token.token_address,
// name: token.name,
// symbol: token.symbol,
// decimals: token.decimals,
// };
// if (token.thumbnail || token.logo) {
// ret.thumb = token.thumbnail || token.logo;
// }
// return ret;
// }
// ownedTokens = data.map((token) => token.symbol);
// }
// } catch (err) {
// printLog("Failed to get user's token list from Moralis");
// printError(err);
// }
//
// return symbol ? null : ownedTokens;
// };

export const getUserOwnedTokens = async (
  chainId: ChainId,
  account: string,
  symbol: string | undefined = undefined,
  minValue = 0,
) => {
  const ownedTokens: string[] = [];

  const results = await Promise.all([
    getUserOwnedTokensFromDeBank(chainId, account, symbol, minValue),
    // getUserOwnedTokensFromZapper(chainId, account, symbol),
    // getUserOwnedTokensFromMoralis(chainId, account, symbol),
  ]);
  if (symbol) {
    const result = results.filter((x) => x !== null);
    if (!result.length) return null;
    const address = (result[0] as JSONObject).address.toLowerCase();
    const token: JSONObject = result
      .slice(1)
      .filter((x) => (x as JSONObject).address.toLowerCase() === address)
      .reduce(
        (a, b) => ({ ...(a as JSONObject), ...b }),
        result[0] as JSONObject,
      );
    return {
      ...token,
      address,
      symbol: token.symbol.toLowerCase(),
    };
  }

  for (const tokens of results) {
    for (const token of (tokens as string[]) || []) {
      if (!ownedTokens.includes(token) && !!token) {
        ownedTokens.push(token);
      }
    }
  }

  const nativeTokenSymbol = getNativeTokenSymbolForChain(chainId);
  if (nativeTokenSymbol && !ownedTokens.includes(nativeTokenSymbol)) {
    const rpcUrl = getRpcUrlForChain(chainId);
    const provider = new RetryProvider(rpcUrl, chainId);
    const balance = await withRetry(account, () =>
      provider.getBalance(account),
    );
    const data = await getCoinData(account, nativeTokenSymbol, chainId, false);
    if (
      balance > 0 &&
      +ethers.formatEther(balance) * (data?.price || 0) >= minValue
    ) {
      ownedTokens.push(nativeTokenSymbol);
    }
  }

  return ownedTokens;
};

export const getTokenPortfolio = memoizeWithExpiration(
  getUserOwnedTokens,
  TTL_3_HOURS,
);

export const getApproveData = async (
  provider: RetryProvider,
  tokenInfo: Partial<TokenInfo> | undefined,
  amount: bigint | undefined,
  owner: string,
  spender: string,
) => {
  const printLog = usePrintLog(owner);
  const printError = usePrintError(owner);

  try {
    const viemClient = await getViemPublicClientFromEthers(provider);
    const token = new ethers.Contract(tokenInfo?.address || "", abis.erc20);
    assert(isHexStr(tokenInfo?.address));
    assert(isHexStr(owner));
    assert(isHexStr(spender));
    const allowance = await viemClient.readContract({
      address: tokenInfo?.address,
      abi: abis.erc20,
      functionName: "allowance",
      args: [owner, spender],
    });
    const txs: Transaction[] = [];
    if (allowance < (amount || 0n)) {
      if (tokenInfo?.symbol?.toUpperCase() === "USDT" && allowance !== 0n) {
        const data = token.interface.encodeFunctionData("approve", [
          spender,
          0,
        ]);
        txs.push({
          to: tokenInfo?.address || "",
          value: "0",
          from: ethers.getAddress(owner),
          data,
        });
      }
      const data = token.interface.encodeFunctionData("approve", [
        spender,
        amount,
      ]);
      txs.push({
        to: tokenInfo?.address || "",
        value: "0",
        from: ethers.getAddress(owner),
        data,
      });
    }
    return txs;
  } catch (err) {
    printLog("Approve failed");
    printError(err);
    return [];
  }
};

export const getRoughAmountIn = async (
  account: string,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  amountOut: bigint | null,
  chainId: ChainId,
) => {
  const tokenInPrice = (await getCoinData(account, tokenIn.symbol, chainId))
    .price;
  const tokenOutPrice = (await getCoinData(account, tokenOut.symbol, chainId))
    .price;
  if (tokenInPrice && tokenOutPrice) {
    const amountIn =
      (Number.parseFloat(
        ethers.formatUnits(amountOut || 0n, tokenOut.decimals),
      ) *
        tokenOutPrice) /
      tokenInPrice;
    return sfParseUnits(amountIn.toFixed(tokenIn.decimals), tokenIn.decimals);
  }
  return null;
};

export const getRoughAmountInForInference = async (
  tokenIn0: string,
  chainIn0: string,
  tokenOut0: string,
  chainOut0: string,
  amountIn0: string,
  amountOut: string,
) => {
  if (amountIn0 && !amountOut) return amountIn0;

  const tokenIn = await getTokenInfoForChain(tokenIn0, chainIn0, false);
  const tokenOut = await getTokenInfoForChain(tokenOut0, chainOut0, false);
  if (!tokenIn?.address || !tokenOut?.address) return "";

  const chainIn = getChainIdFromName(chainIn0);
  const chainOut = getChainIdFromName(chainOut0);
  const inPrice = (await getCoinData("", tokenIn.symbol, chainIn)).price;
  const outPrice = (await getCoinData("", tokenOut.symbol, chainOut)).price;

  if (!inPrice || !outPrice) return "";
  return ((+amountOut * outPrice * 1.05) / inPrice).toFixed(tokenIn.decimals);
};

export const getLPTokenInfo = async (
  args: CommonArgs,
  chainId: ChainId,
  provider: RetryProvider,
): Promise<{ lp: TokenInfo | null; token: string }> => {
  const chainName = getChainNameFromId(chainId);
  const { range } = args;
  let { protocolName, poolName, token } = args;
  protocolName = (protocolName || "").toLowerCase();
  poolName = (poolName || "").toLowerCase();
  token = (token || "").toLowerCase();

  let lp: TokenInfo | null = null;
  if (protocolName in LPAddresses) {
    const lpAddresses = LPAddresses[protocolName];
    const lpInfo = lpAddresses[chainId] || lpAddresses[chainId.toString()];
    if (lpInfo) {
      if (protocolName === "rocketpool") lp = lpInfo.default;
      else {
        const key = poolName || token;
        lp = lpInfo[key];
        if (!lp) {
          if (protocolName === "gmx" && poolName.startsWith("w")) {
            lp = lpInfo[poolName.slice(1)];
          } else if (protocolName === "pendle" && key.includes("-")) {
            lp = lpInfo[key.split("-")[1]];
          } else {
            const nativeToken = getNativeTokenSymbolForChain(chainId) || "";
            if (!poolName && token === nativeToken.toLowerCase()) {
              token = `w${token}`;
              lp = lpInfo[token];
            }
          }
        }
      }
      if (!lp) {
        lp = null;
      }
    }
  }

  const group1 = ["uniswap", "camelot", "thruster"];
  if (uniswapLikeProtocols.includes(protocolName) && !range) {
    const key = protocolName === "thruster" ? "router03" : "default";
    const address = getProtocolAddressForChain(protocolName, chainId, key);
    const factoryAddress = getProtocolAddressForChain(
      protocolName,
      chainId,
      protocolName === "thruster" ? "factory03" : "factory",
    );
    if (!address || !factoryAddress) {
      sfConsoleError(address, factoryAddress);
      throw new Error("Could not find necessary contract address");
    }

    const viemClient = await getViemPublicClientFromEthers(provider);
    assert(isHexStr(address));
    const WETH = await viemClient.readContract({
      address,
      abi: abis[protocolName as keyof typeof abis],
      functionName: group1.includes(protocolName) ? "WETH" : "weth",
    });

    const tokenInfo = await getTokenInfoForChain(token, chainName, true);
    const tokenSymbols = splitPool(poolName);
    const token1Symbol =
      tokenSymbols[0] === tokenInfo?.symbol ||
      `w${tokenSymbols[0]}` === tokenInfo?.symbol ||
      tokenSymbols[0] === `w${tokenInfo?.symbol}`
        ? tokenSymbols[1]
        : tokenSymbols[0];
    const tokenInfo2 = await getTokenInfoForChain(
      token1Symbol,
      chainName,
      true,
    );
    if (!tokenInfo2) {
      throw new Error("Pool does not exist");
    }

    let pairAddr: string;
    assert(isHexStr(factoryAddress));
    if (group1.includes(protocolName)) {
      pairAddr = await viemClient.readContract({
        address: factoryAddress,
        abi: abis[`${protocolName}-factory` as keyof typeof abis],
        functionName: "getPair",
        args: [
          tokenInfo?.address === NATIVE_TOKEN
            ? WETH
            : (tokenInfo?.address as `0x${string}`),
          tokenInfo2.address === NATIVE_TOKEN
            ? WETH
            : (tokenInfo2.address as `0x${string}`),
        ],
      });
    } else {
      pairAddr = await viemClient.readContract({
        address: factoryAddress,
        abi: abis[`${protocolName}-factory` as keyof typeof abis],
        functionName: "getPool",
        args: [
          tokenInfo?.address === NATIVE_TOKEN
            ? WETH
            : (tokenInfo?.address as `0x${string}`),
          tokenInfo2.address === NATIVE_TOKEN
            ? WETH
            : (tokenInfo2.address as `0x${string}`),
          isStable(tokenInfo?.symbol) && isStable(tokenInfo2.symbol),
        ],
      });
    }
    if (pairAddr === NATIVE_TOKEN) {
      throw new Error("Pool does not exist");
    }
    lp =
      pairAddr === NATIVE_TOKEN
        ? null
        : { symbol: "UNI-V2", address: pairAddr, decimals: 18 };
  }
  return { lp, token };
};

export const getProtocolMetadata = async (protocolName_: string) => {
  const protocolName: string = protocolName_.toLowerCase();

  let protocol = await Protocols.findOne({
    attributes: ["name", "thumb", "url"],
    where: { name: protocolName },
    raw: true,
  });

  if (!protocol) {
    const suffixes = ["finance", "protocol", "exchange", "token"];
    const allSuffixes = ["", ...suffixes];

    const tryFetchProtocol = async (suffix: string) => {
      try {
        const response = await axios
          .get(
            `${CMC_API_ENDPOINT}/info?slug=${protocolName}${
              suffix ? `-${suffix}` : ""
            }&aux=urls,logo`,
            { headers: { "X-CMC_PRO_API_KEY": CMC_API_KEY } },
          )
          .then((res) => res.data);

        const data = response?.data[Object.keys(response?.data)[0]];

        protocol = new Protocols({
          name: protocolName,
          thumb: data.logo,
          url: data.urls.website[0],
        });

        await Promise.all([
          new Protocols(protocol).save(),
          suffix
            ? new Protocols({
                name: `${protocolName}-${suffix}`,
                thumb: data.logo,
                url: data.urls.website[0],
              }).save()
            : Promise.resolve(),
        ]);

        return true;
      } catch (e) {
        if (suffix === suffixes[suffixes.length - 1]) {
          const { data } = await withRetry("", () =>
            axios.get(`${DEBANK_API}/protocol?id=${protocolName}`, {
              headers: { AccessKey: process.env.DEBANK_ACCESS_KEY },
            }),
          );

          if (data) {
            protocol = new Protocols({
              name: protocolName,
              thumb: data.logo_url,
              url: data.site_url,
            });
            await new Protocols(protocol).save();
            return true;
          }
          throw e;
        }
        return false;
      }
    };

    await Promise.all(allSuffixes.map(tryFetchProtocol));
  }

  return protocol;
};

export const getPoolMetadata = async (
  chainName: string,
  protocolName: string,
  poolName: string | undefined,
  actionName: string | undefined,
  yieldData: JSONObject = {},
  pendleApyType = "implied",
): Promise<Partial<DebankPoolInfo> | undefined> => {
  if (protocolName.toLowerCase() === "pendle") {
    const chainId = getChainIdFromName(chainName);
    if (!chainId) {
      throw new Error(
        `Could not find pool ${poolName} info for protocol ${protocolName} from defillama.`,
      );
    }
    const rpcUrl = getRpcUrlForChain(chainId);
    const provider = new RetryProvider(rpcUrl, chainId);
    const config = await getPendleConfigFromPool(
      provider,
      chainId,
      poolName || "",
    );
    if (!config) {
      throw new Error(
        `Could not find pool ${poolName} info for protocol ${protocolName} from ProtocolAddresses.`,
      );
    }
    const lpAddr = config.lp;

    try {
      const data = (
        await withRetry("", () =>
          axios.get(
            `https://api-v2.pendle.finance/core/v1/${chainId}/markets/${lpAddr}`,
          ),
        )
      )?.data;
      return {
        chain: chainName,
        project: protocolName,
        symbol: poolName,
        apy: poolName?.endsWith("-lp")
          ? data.aggregatedApy * 100
          : pendleApyType === "underlying"
            ? data.underlyingApy * 100
            : data.impliedApy * 100,
      };
    } catch (error) {
      if (error instanceof AxiosError) {
        sfConsoleError("pendle pools", error.response?.data);
      } else {
        sfConsoleError("error with pendle apy fetch");
      }
      throw new Error(
        `Could not find pool ${poolName} info for protocol ${protocolName} from defillama.`,
      );
    }
  } else {
    const project = convertProtocolNameToDefillamaProject(protocolName);
    const symbol = convertPoolNameToDefillamaSymbol(protocolName, poolName);

    const isBorrow = actionName && actionName.toLowerCase() === "borrow";

    let data = isBorrow ? yieldData.poolsBorrow : yieldData.pools;

    if (!data) {
      data = await (isBorrow ? defiLlamaPoolsBorrow() : defiLlamaPools());
    }

    if (data?.status === "success") {
      const pools = data.data.filter(
        (pool: { chain: string }) =>
          pool.chain.toLowerCase() === chainName.toLowerCase(),
      );
      let pool = pools.find(
        (pool: { project: string; symbol: string }) =>
          pool.project === project && pool.symbol === symbol,
      );

      if (!pool) {
        pool = pools.find(
          (pool: { project: string; symbol: string }) =>
            pool.project.split("-")[0] === project?.split(" ")[0] &&
            pool.symbol === symbol,
        );
      }

      if (pool) {
        return pool;
      }

      throw new Error(
        `Could not find pool ${poolName} info for protocol ${protocolName} from defillama.`,
      );
    }
  }
};

const checkLPTokensI = async (
  provider: RetryProvider,
  chainId: ChainId,
  symbol: string,
) => {
  const lpTokens: JSONObject[] = [];
  for (const addresses of Object.values(LPAddresses)) {
    if (!(chainId in addresses)) continue;

    for (const [key, value] of Object.entries(addresses[chainId])) {
      if (typeof value === "string") {
        if (key.toLowerCase() === symbol.toLowerCase()) {
          lpTokens.push({ symbol: key, address: value });
        }
      } else if (
        (value as JSONObject).symbol?.toLowerCase() === symbol.toLowerCase()
      ) {
        lpTokens.push(value as JSONObject);
      }
    }
  }
  if (lpTokens.length > 0) {
    try {
      const viemClient = await getViemPublicClientFromEthers(provider);
      assert(isHexStr(lpTokens[0].address));
      return {
        isMultiple: lpTokens.length > 1,
        name: await viemClient.readContract({
          address: lpTokens[0].address,
          abi: abis.erc20,
          functionName: "name",
        }),
        address: lpTokens[0].address,
        symbol: lpTokens[0].symbol,
        decimals: await viemClient.readContract({
          address: lpTokens[0].address,
          abi: abis.erc20,
          functionName: "decimals",
        }),
      };
    } catch {
      /* empty */
    }
  }
};

const checkLPTokens = memoizeWithExpiration(checkLPTokensI, TTL_3_DAYS * 10);

export const getTokenInfoForChain = async (
  symbol_: string | undefined | null,
  chainName: string | undefined | null,
  throwError = false,
  extraInfo: JSONObject = {},
  checkHyperSpot = false,
): Promise<TokenInfo | undefined> => {
  let symbol = symbol_;
  if (
    typeof symbol !== "string" ||
    symbol.trim() === "" ||
    typeof chainName !== "string" ||
    chainName.trim() === ""
  ) {
    if (throwError) {
      throw new Error(
        `Token symbol ${symbol} or chain name ${chainName} is invalid.`,
      );
    }
    return undefined;
  }

  const symbolDown = symbol.toLowerCase();

  // temporary hack to fix symbol="usdc."
  if (symbolDown === "usdc.") {
    symbol = "usdc.e";
  }

  const chainId = extraInfo.chainId || getChainIdFromName(chainName);

  if (chainId === 101 || chainName === "solana") {
    const backendToken = await getTokenForChain(chainId, symbol, extraInfo);
    if (backendToken) {
      return {
        ...backendToken,
        chainId: isChainId(backendToken.chainId)
          ? backendToken.chainId
          : undefined,
        decimals: backendToken.decimals || 18,
        onHyperSpot: false,
      };
    }
    const chainToken = await fetchNotFoundToken(chainId, symbolDown, extraInfo);
    if (chainToken) {
      return { ...chainToken, onHyperSpot: false };
    }
    return undefined;
  }

  let onHyperSpot = false;
  const hyperToken = await getHyperliquidTokenInfo(42161, symbol, true);
  if (hyperToken && symbolDown !== "usdc") {
    if (chainId === 42161) return hyperToken.tokenInfo;
    onHyperSpot = true;
  }

  const backendToken = await getTokenForChain(chainId, symbolDown, extraInfo);
  if (backendToken) {
    return {
      ...backendToken,
      chainId: isChainId(backendToken.chainId)
        ? backendToken.chainId
        : undefined,
      decimals: backendToken.decimals || 18,
      onHyperSpot,
    };
  }
  if (symbolDown === "eth" || symbolDown === "btc") {
    // try wrapped token
    const wrappedToken = await getTokenForChain(
      chainId,
      `w${symbolDown}`,
      extraInfo,
    );
    if (wrappedToken) {
      return {
        ...wrappedToken,
        chainId: isChainId(wrappedToken.chainId)
          ? wrappedToken.chainId
          : undefined,
        decimals: wrappedToken.decimals || 18,
        onHyperSpot,
      };
    }
  }
  if (!chainId) {
    if (throwError) {
      throw new Error(getChainError(chainName));
    }
    return checkHyperSpot ? { symbol, onHyperSpot } : undefined;
  }
  const rpcUrl = getRpcUrlForChain(chainId);
  const provider = new RetryProvider(rpcUrl, chainId);
  const viemClient = await getViemPublicClientFromEthers(provider);
  if (isValidAddress(symbol)) {
    symbol = getAddress(symbol);
    assert(isHexStr(symbol));
    try {
      let outputToken: string | null = null;
      try {
        const [token0, token1] = await Promise.all([
          viemClient.readContract({
            address: getAddress(symbol),
            abi: abis["uniswap-pair"],
            functionName: "token0",
          }),
          viemClient.readContract({
            address: getAddress(symbol),
            abi: abis["uniswap-pair"],
            functionName: "token1",
          }),
        ]);
        const nativeTokenSymbol = getNativeTokenSymbolForChain(chainId);
        const [wrappedNative, usdcToken, usdtToken, daiToken] =
          await Promise.all([
            getTokenInfoForChain(`W${nativeTokenSymbol}`, chainName),
            getTokenInfoForChain("USDC", chainName),
            getTokenInfoForChain("USDT", chainName),
            getTokenInfoForChain("DAI", chainName),
          ]);
        const tokens = [
          wrappedNative?.address?.toLowerCase(),
          usdcToken?.address?.toLowerCase(),
          usdtToken?.address?.toLowerCase(),
          daiToken?.address?.toLowerCase(),
        ].filter((tkn) => !!tkn);
        const token0Idx = tokens.indexOf(token0.toLowerCase());
        const token1Idx = tokens.indexOf(token1.toLowerCase());
        if (
          (token0Idx < 0 && token1Idx < 0) ||
          (token0Idx >= 0 && token1Idx >= 0)
        ) {
          throw new Error(
            "Please specify which token of the pair you would like to swap to.",
          );
        }
        outputToken = token0Idx < 0 ? getAddress(token0) : getAddress(token1);
      } catch {
        /* empty */
      }
      const [name, _symbol, decimals] = await Promise.all([
        viemClient.readContract({
          address: outputToken ? getAddress(outputToken) : symbol,
          abi: abis.erc20,
          functionName: "name",
        }),
        viemClient.readContract({
          address: outputToken ? getAddress(outputToken) : symbol,
          abi: abis.erc20,
          functionName: "symbol",
        }),
        viemClient.readContract({
          address: outputToken ? getAddress(outputToken) : symbol,
          abi: abis.erc20,
          functionName: "decimals",
        }),
      ]);
      return {
        isMultiple: false,
        name,
        symbol: _symbol,
        decimals: ethers.getNumber(decimals),
        address: outputToken ? getAddress(outputToken) : symbol,
        onHyperSpot,
      };
    } catch {
      // sfConsoleError(err);
      sfConsoleError(
        `Token ${symbol} not found on ${chainName}. Ensure you specify a chain and token properly in your next prompt.`,
      );
      if (throwError) {
        throw new Error(
          `Token ${symbol} not found on ${chainName}. Ensure you specify a chain and token properly in your next prompt.`,
        );
      }
      return undefined;
    }
  }

  if (symbolDown.endsWith("vlp")) {
    if (!isValidChainId(chainId)) {
      throw new Error(`Invalid chain id: ${chainId}, ${typeof chainId}`);
    }
    const poolAddr = getProtocolAddressForChain(
      "bladeswap",
      chainId,
      symbolDown,
    );
    if (!poolAddr) {
      sfConsoleError(chainId, symbolDown);
      if (throwError) {
        throw new Error(
          `Bladeswap contract address for token ${symbolDown} not found on chain id ${chainId}. Ensure you specify a chain and token properly in your next prompt.`,
        );
      }
      return undefined;
    }
    assert(isHexStr(poolAddr));
    try {
      const [name, _symbol, decimals] = await Promise.all([
        viemClient.readContract({
          address: poolAddr,
          abi: abis.erc20,
          functionName: "name",
        }),
        viemClient.readContract({
          address: poolAddr,
          abi: abis.erc20,
          functionName: "symbol",
        }),
        viemClient.readContract({
          address: poolAddr,
          abi: abis.erc20,
          functionName: "decimals",
        }),
      ]);
      return {
        isMultiple: false,
        name,
        symbol: _symbol,
        decimals: ethers.getNumber(decimals),
        address: poolAddr,
        onHyperSpot,
      };
    } catch (err) {
      sfConsoleError(err);
      sfConsoleError(
        `Token ${symbol} not found on ${chainName}. Ensure you specify a chain and token properly in your next prompt.`,
      );
      if (throwError) {
        throw new Error(
          `Token ${symbol} not found on ${chainName}. Ensure you specify a chain and token properly in your next prompt.`,
        );
      }
    }
  }

  const symbolParts = symbolDown.split("-");
  const prefixIndex = pendleKeyPrefixes.findIndex((x) =>
    symbolParts[0].startsWith(x),
  );
  const suffixIndex = pendleKeySuffixes.findIndex((x) =>
    symbolParts[symbolParts.length - 1].endsWith(x),
  );
  const pendleKey =
    chainId in ProtocolAddresses.pendle
      ? Object.keys(ProtocolAddresses.pendle[chainId]).find(
          (x) => x.toLowerCase() === symbolDown,
        )
      : null;
  let address: string | undefined;
  if (prefixIndex >= 0 || suffixIndex >= 0 || pendleKey) {
    if (prefixIndex >= 0 || suffixIndex >= 0) {
      const config = await getPendleConfigFromPool(
        provider,
        chainId,
        symbolDown,
      );
      if (prefixIndex >= 0) {
        address = config?.[pendleKeyPrefixes[prefixIndex]] as string;
      } else if (suffixIndex >= 0) {
        address = config?.[pendleKeySuffixes[suffixIndex]] as string;
      }
    } else if (pendleKey) {
      address = (ProtocolAddresses.pendle as JSONObject)?.[chainId]?.[
        pendleKey
      ];
    }
    if (address && isValidAddress(address)) {
      try {
        assert(isHexStr(address));
        const [name, _symbol, decimals] = await Promise.all([
          viemClient.readContract({
            address,
            abi: abis.erc20,
            functionName: "name",
          }),
          viemClient.readContract({
            address,
            abi: abis.erc20,
            functionName: "symbol",
          }),
          viemClient.readContract({
            address,
            abi: abis.erc20,
            functionName: "decimals",
          }),
        ]);
        return {
          isMultiple: false,
          name,
          symbol: _symbol,
          decimals: ethers.getNumber(decimals),
          address,
          onHyperSpot,
        };
      } catch (err) {
        sfConsoleError(err);
        sfConsoleError(
          `Token ${symbol} not found on ${chainName}. Ensure you specify a chain and token properly in your next prompt.`,
        );
        if (throwError) {
          throw new Error(
            `Token ${symbol} not found on ${chainName}. Ensure you specify a chain and token properly in your next prompt.`,
          );
        }
      }
    }
  }

  if (symbolDown === "espls" && chainId === 42161) {
    return {
      isMultiple: false,
      name: "Escrowed PLS",
      symbol: "esPLS",
      address: "0xc636c1f678df0a834ad103196338cb7dd1d194ff",
      decimals: 18,
    };
  }

  if (extraInfo.account) {
    const token = await getUserOwnedTokens(chainId, extraInfo.account, symbol);
    if (token) {
      const tmp = token as JSONObject;
      const tokenData = {
        address: tmp.address,
        name: tmp.name,
        symbol: tmp.symbol,
        decimals: tmp.decimals,
      };
      await saveToken({ ...tokenData, chainId });
      clearTokenCache(
        chainName,
        symbol,
        extraInfo.account,
        provider,
        extraInfo.liquidityThreshold,
      );
      return {
        isMultiple: false,
        ...tokenData,
        onHyperSpot,
      };
    }
  }

  const lpToken = await checkLPTokens(provider, chainId, symbol);
  if (lpToken) return lpToken;

  const token = await fetchNotFoundToken(chainId, symbolDown, extraInfo);
  if (token) return { ...token, onHyperSpot };

  if (throwError) {
    throw new Error(
      `Token ${symbol} not found on ${chainName}. Ensure you specify a chain and token properly in your next prompt.`,
    );
  }
  return checkHyperSpot ? { symbol, onHyperSpot } : undefined;
};

const getTokenLogoForChainI = async (
  symbol_: string,
  chainName: string | undefined,
  throwError = false,
) => {
  let symbol = symbol_;
  if (typeof symbol !== "string" || symbol.trim() === "") {
    if (throwError) {
      throw new Error(`Token symbol ${symbol} is invalid.`);
    }
    return null;
  }
  // temporary hack to fix symbol="usdc."
  symbol = symbol.toLowerCase();
  if (symbol === "usdc.") {
    symbol = "usdc.e";
  }
  const backendToken = await getTokenInfoForChain(symbol, null, false);
  if (backendToken?.thumb) {
    return backendToken.thumb;
  }
  // try wrapped token
  const wrappedToken = await getTokenInfoForChain(
    `w${symbol.toLowerCase()}`,
    null,
    false,
  );
  if (wrappedToken?.thumb) {
    return wrappedToken.thumb;
  }

  const chainId = getChainIdFromName(chainName);
  const address = ethers.isAddress(symbol) ? symbol : backendToken?.address;

  if (chainId && address) {
    const debankChainId = DebankData.chainIds[chainId];

    // Get token data from debank to get logo
    const { data } = await withRetry("", () =>
      axios.get(
        `${DEBANK_API}/token?chain_id=${debankChainId}&id=${address.toLowerCase()}`,
        { headers: { AccessKey: process.env.DEBANK_ACCESS_KEY } },
      ),
    );

    if (data?.logo_url) {
      return data.logo_url;
    }
  }

  const hyperliquidTokenInfo = await getHyperliquidTokenInfo(
    42161,
    symbol,
    true,
  );
  if (hyperliquidTokenInfo?.tokenInfo?.thumb) {
    return hyperliquidTokenInfo?.tokenInfo?.thumb;
  }

  if (throwError) {
    throw new Error(
      `Token ${symbol} not found. Ensure you specify a token properly in your next prompt.`,
    );
  }
  return null;
};

export const getTokenLogoForChain = memoizeWithExpiration(
  getTokenLogoForChainI,
  TTL_3_DAYS,
);

export const getFunctionData = async (
  address: string | undefined | null,
  abi: ethers.InterfaceAbi,
  funcName: string,
  params: unknown[],
  value = "0x0",
): Promise<Transaction> => {
  const contract = new ethers.Contract(address || "", abi);
  const data = contract.interface.encodeFunctionData(funcName, params);
  const transactionDetails = {
    to: address || "",
    value,
    data,
  };

  return transactionDetails;
};

/**
 *
 * @param address token address
 * @param user account address
 * @param amount token amount string
 *        - if undefined, return token balance of account address
 *        - if non-zero value, return token amount string in type of bignumber
 *        - in else cases (e.g. 0 or '' or 'all', etc.) return token balance of account address
 * @returns
 */
export const getTokenAmount = async (
  provider: RetryProvider,
  tokenInfo: TokenInfo | undefined | null,
  user: string,
  amount: string | undefined = undefined,
) => {
  if (!user.startsWith("0x")) {
    return { amount: 0n, decimals: 18 };
  }
  let decimals = tokenInfo?.decimals || 18;
  let _amount: bigint;
  const printError = usePrintError(user);
  let chainId = (await provider.getNetwork()).chainId;
  if (chainId === 260n) {
    chainId = 324n;
  }

  if (!isChainId(chainId)) {
    throw new Error(`Invalid chain id: ${chainId}, ${typeof chainId}`);
  }
  const chainName = getChainNameFromId(chainId)?.toLowerCase();
  const nativeTokenSymbol =
    getNativeTokenSymbolForChain(chainId)?.toLowerCase();

  if (!tokenInfo || !tokenInfo.address) {
    printError(provider, tokenInfo, user, amount);
    if (tokenInfo) {
      throw new Error(
        `Token ${tokenInfo.symbol} is not supported on ${chainName}. Please try again with a different token!`,
      );
    }
    throw new Error(
      "Could not fetch token info. This was a temporary issue, please try again.",
    );
  }

  if (isValidHyperliquidAddress(tokenInfo.address)) {
    return { amount: 1n, decimals: 18 };
  }

  const viemClient = await getViemPublicClientFromEthers(provider);
  const isNative = tokenInfo.symbol?.toLowerCase() === nativeTokenSymbol;
  if (!isNative) {
    if (decimals === undefined) {
      assert(isHexStr(tokenInfo.address));
      decimals = await viemClient.readContract({
        address: tokenInfo.address,
        abi: abis.erc20,
        functionName: "decimals",
      });
    }
  }

  if (
    amount === undefined ||
    amount === "all" ||
    amount === "half" ||
    amount.toString().endsWith("%")
  ) {
    if (isNative) {
      _amount = await withRetry(user, () => provider.getBalance(user));
    } else {
      assert(isHexStr(tokenInfo.address), tokenInfo.address);
      assert(isHexStr(user), user);
      _amount = await withRetry(user, () =>
        viemClient.readContract({
          address: tokenInfo.address as `0x${string}`,
          abi: abis.erc20,
          functionName: "balanceOf",
          args: [user],
        }),
      );
    }
    _amount =
      amount === "half"
        ? _amount / 2n
        : amount?.endsWith("%")
          ? (_amount *
              ethers.getBigInt(Math.floor(Number.parseFloat(amount) * 100))) /
            10000n
          : _amount;
  } else if (isNative) {
    const regex = /^(\d*\.\d{1,18})|\d+/;
    const match = amount.match(regex);
    if (match) {
      _amount = ethers.parseEther(match[0]);
    } else {
      _amount = ethers.parseEther(amount);
    }
  } else {
    _amount = sfParseUnits(amount, decimals);
  }

  return { amount: _amount, decimals };
};

// const getLPTokenBalance = async (chainId, user, tokenInfo) => {
//   const rpcUrl = getRpcUrlForChain(chainId);
//   const provider = new RetryProvider(rpcUrl, chainId);
//   const { amount } = await getTokenAmount(provider, tokenInfo, user);
//   return amount;
// };

const extractRpcUrl = (
  rpcs: string | JSONObject,
  chainId: number | undefined,
) => {
  let retvalue = "";
  if (typeof rpcs === "string") {
    retvalue = rpcs;
  } else if (rpcs && typeof rpcs === "object" && chainId) {
    retvalue = rpcs[chainId];
  }
  return retvalue;
};

export const checkBridgeActions = (rawActions: RawAction[]) => {
  for (let i = 0; i < rawActions.length; i++) {
    if (rawActions[i].name !== "bridge") {
      continue;
    }
    if (rawActions[i].args?.destinationChainName?.toLowerCase() === "zksync") {
      if (i < rawActions.length - 1) {
        return {
          success: false,
          message:
            "Simulations for actions after a bridge to zksync are not supported. Try bridging first and then performing the rest of your actions in a new prompt.",
        };
      }
    }
    if (
      rawActions[i].args?.destinationChainName?.toLowerCase() === "blast" &&
      rawActions[i].args?.token?.toLowerCase() !== "eth"
    ) {
      if (i < rawActions.length - 1) {
        return {
          success: false,
          message:
            "Simulations for actions after a bridge to blast are not supported. Try bridging first and then performing the rest of your actions in a new prompt.",
        };
      }
    }
    if (
      rawActions[i].args?.destinationChainName?.toLowerCase() === "mode" &&
      rawActions[i].args?.token?.toLowerCase() !== "eth"
    ) {
      return {
        success: false,
        message:
          "You can bridge only ETH to Mode chain. Try swapping to ETH first and then bridging to Mode chain.",
      };
    }
  }
  return { success: true };
};

export const fillChainName = (
  actions: RawAction[],
  connectedChainName: string,
) => {
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];

    if (action.name === "notification") {
      continue;
    }

    for (const key of Object.keys(action.args)) {
      if (typeof (action.args as JSONObject)[key] === "string") {
        (action.args as JSONObject)[key] = (action.args as JSONObject)[
          key
        ].trim();
      }
    }

    if (!action.args[getChainKey(action.name)]) {
      if (i === 0) {
        action.args[getChainKey(action.name)] = connectedChainName;
      } else {
        action.args[getChainKey(action.name)] =
          actions[i - 1].args[getDstChainKey(actions[i - 1].name)];
      }
    }
    action.args[getChainKey(action.name)] = (action.args as JSONObject)[
      getChainKey(action.name)
    ]?.toLowerCase();
    if (
      action.name === "bridge" &&
      action.args.sourceChainName === action.args.destinationChainName
    ) {
      for (let j = i - 1; j >= 0; j--) {
        if (
          (
            actions[j].args.outputToken || actions[j].args.token
          )?.toLowerCase() ===
            action.args[getTokenKey(action.name)]?.toLowerCase() &&
          actions[j].args[getDstChainKey(actions[j].name)] !==
            action.args.destinationChainName
        ) {
          action.args[getChainKey(action.name)] =
            actions[j].args[getDstChainKey(actions[j].name)];
        }
      }
    }
    if (action.args[getChainKey(action.name)] === "arbitrum one") {
      action.args[getChainKey(action.name)] = "arbitrum";
    }
    if (action.args[getDstChainKey(action.name)] === "arbitrum one") {
      action.args[getDstChainKey(action.name)] = "arbitrum";
    }
    action.args[getAmountKey(action.name)] =
      action.args[getAmountKey(action.name)]?.toLowerCase();
    if (action.args[getAmountKey(action.name)] === "all") {
      action.args.isAllAmount = true;
    }
    if (action.args[getAmountKey(action.name)] === "outputamount") {
      action.args[getAmountKey(action.name)] = "outputAmount";
    }
  }
  return actions;
};

export const isHyperliquidAction = (action: RawAction) => {
  return (
    action.args.protocolName?.toLowerCase() === "hyperliquid" &&
    [
      "deposit",
      "withdraw",
      "long",
      "short",
      "close",
      "swap",
      "transfer",
    ].includes(action.name)
  );
};

export const checkHyperliquidChainName = async (
  actions: RawAction[],
  rawActions: RawAction[],
) => {
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (isHyperliquidAction(action)) {
      if (!action.args.chainName) {
        rawActions[i].args.chainName = "arbitrum";
        return true;
      }

      if (action.args.chainName !== "arbitrum") {
        if (action.name === "withdraw") {
          rawActions[i].args.chainName = "arbitrum";
          return true;
        }

        const actionsToAdd: RawAction[] = [];
        const tokenInfo = await getTokenInfoForChain(
          action.args[getTokenKey(action.name)],
          action.args.chainName,
          false,
        );
        if (!tokenInfo) continue;

        if (tokenInfo.symbol.toLowerCase() === "usdc") {
          actionsToAdd.push({
            name: "bridge",
            args: {
              amount: action.args[getAmountKey(action.name)],
              amount_units: action.args[getAmountUnitKey(action.name)],
              token: action.args[getTokenKey(action.name)],
              sourceChainName: action.args.chainName,
              destinationChainName: "arbitrum",
            },
          });
        } else {
          actionsToAdd.push(
            ...[
              {
                name: "swap",
                args: {
                  inputAmount: action.args[getAmountKey(action.name)],
                  inputAmountUnits: action.args[getAmountUnitKey(action.name)],
                  inputToken: action.args[getTokenKey(action.name)],
                  outputToken: "usdc",
                  chainName: action.args.chainName,
                },
              },
              {
                name: "bridge",
                args: {
                  amount: "outputAmount",
                  token: "usdc",
                  chainName: action.args.chainName,
                  destinationChainName: "arbitrum",
                },
              },
            ],
          );
        }
        if (action.name !== "deposit") {
          actionsToAdd.push({
            name: "deposit",
            args: {
              amount: "outputAmount",
              token: "usdc",
              chainName: "arbitrum",
              protocolName: "hyperliquid",
            },
          });
        }
        if (action.name === "swap") {
          actionsToAdd.push({
            name: "transfer",
            args: {
              amount: "outputAmount",
              token: "usdc",
              recipient: "spot",
              chainName: "arbitrum",
              protocolName: "hyperliquid",
            },
          });
        }

        if (action.name !== "transfer" || action.args.recipient === "spot") {
          actionsToAdd.push({
            ...action,
            args: {
              ...action.args,
              amount_units: undefined,
              inputAmountUnits: undefined,
              realAmount: undefined,
              [getAmountKey(action.name)]: "outputAmount",
              [getTokenKey(action.name)]: "usdc",
              chainName: "arbitrum",
            },
          });
        }
        rawActions.splice(i, 1, ...actionsToAdd);
        return true;
      }
    }
  }
  return false;
};

export function handleAllChainsCases(actions: RawAction[]) {
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];

    if (action.name === "notification") {
      continue;
    }
    if (
      action.args[getChainKey(action.name)] !== "all" &&
      action.args.destinationChainName !== "all"
    ) {
      continue;
    }
    if (
      action.args[getChainKey(action.name)] === "all" &&
      action.args.destinationChainName === "all"
    ) {
      return {
        success: false,
        message:
          "You cannot bridge from all chains to all chains. Please specify correct arguments in your next prompt!",
      };
    }

    let chains = [...EntityData.chains].map((x) => x.toLowerCase());
    let key = "chainName";
    if (action.name === "bridge") {
      if (action.args.sourceChainName === "all") {
        key = "sourceChainName";
        chains = chains.filter(
          (x) =>
            getChainIdFromName(x) !==
            getChainIdFromName(action.args.destinationChainName),
        );
      } else {
        key = "destinationChainName";
        chains = chains.filter(
          (x) =>
            getChainIdFromName(x) !==
            getChainIdFromName(action.args.sourceChainName),
        );
      }
    }
    actions.splice(
      i,
      1,
      ...chains.map((chainName) => {
        return { ...action, args: { ...action.args, [key]: chainName } };
      }),
    );
    i += chains.length - 1;
  }
  return actions;
}

export const getChainIdsFromActions = (actions: RawAction[]) => {
  const chainIds: number[] = [];
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (action.name === "notification") {
      continue;
    }
    const srcChainName = action.args[getChainKey(action.name)];
    const destChainName = action.args[getDstChainKey(action.name)];

    const srcChainId = getChainIdFromName(srcChainName);
    const destChainId = getChainIdFromName(destChainName);
    if (!srcChainId) {
      return {
        success: false,
        message: getUnsupportedChainError(srcChainName),
      };
    }
    if (!destChainId) {
      return {
        success: false,
        message: getUnsupportedChainError(destChainName),
      };
    }

    if (!chainIds.includes(srcChainId)) {
      chainIds.push(srcChainId);
    }
    if (!chainIds.includes(destChainId)) {
      chainIds.push(destChainId);
    }
  }
  return { success: true, chainIds };
};

export const increaseBalanceOnChain = async (
  address: string,
  amount: string,
  token: string,
  chainName: string,
  rpcs: string | JSONObject,
  zksyncid: number | undefined = undefined,
) => {
  const tokenInfo = await getTokenInfoForChain(token, chainName);
  const chainId = getChainIdFromName(chainName);
  const { provider } = extractProvider(chainId, rpcs, zksyncid);
  if (!chainId) {
    throw new Error(getChainError(chainName));
  }
  const nativeToken = getNativeTokenSymbolForChain(chainId)?.toLowerCase();
  if (chainId !== ChainIDs.zksync) {
    if (
      tokenInfo?.address === NATIVE_TOKEN ||
      tokenInfo?.symbol.toLowerCase() === nativeToken
    ) {
      const regex = /^(\d*\.\d{1,18})|\d+/;
      let _amount: bigint;
      if (amount.match(regex)) {
        _amount = ethers.parseEther(amount.match(regex)?.[0] || "0");
      } else {
        _amount = ethers.parseEther(amount);
      }
      await addBalance(provider, address, _amount);
    } else if (chainId !== ChainIDs.blast && tokenInfo && tokenInfo.address) {
      const viemClient = await getViemPublicClientFromEthers(provider);
      assert(isHexStr(tokenInfo.address));
      assert(isHexStr(address));
      const _amount = sfParseUnits(amount, tokenInfo.decimals);
      const currentBalance = await viemClient.readContract({
        address: tokenInfo.address,
        abi: abis.erc20,
        functionName: "balanceOf",
        args: [address],
      });
      const newBalance = currentBalance + _amount;
      await setErc20Balance(provider, tokenInfo?.address, address, newBalance);
    }
  }
};

export const fillBody = (
  name: string | undefined,
  body: CommonArgs | undefined,
  address: string,
  chainName = "Ethereum",
) => {
  const result = { ...body };
  if (address) {
    result.accountAddress = address;
  }
  if (name?.toLowerCase() !== "bridge") {
    if (!result.chainName) result.chainName = chainName.toLowerCase();
  } else if (!result.sourceChainName) {
    result.sourceChainName = chainName.toLowerCase();
  } else if (!result.destinationChainName) {
    result.destinationChainName = chainName.toLowerCase();
  }
  return result;
};

export const getSwapTx = async (
  data: CommonArgs,
  ignore: string[] = [],
  baseLiquidity = 0,
  isExecution = true,
): Promise<SwapResponse> => {
  const {
    accountAddress,
    protocolName,
    chainName,
    inputAmount: amountStr,
    inputAmountUnits,
    realAmount,
    outputAmount,
    inputToken,
    token1Address,
    outputToken,
    slippage: slippageStr,
    limitPrice,
    rpc,
    rpc_hyperliquid,
    provider: prevSource,
  } = data;
  const printLog = usePrintLog(accountAddress);
  const printError = usePrintError(accountAddress);
  const protocol = (protocolName || prevSource || "").toLowerCase();
  const chainStr =
    protocol === "hyperliquid" ? "hyperliquid spot market" : chainName;

  try {
    if (inputToken === outputToken) {
      throw new Error(
        `You are trying to swap from ${inputToken} to ${outputToken} on ${chainStr}. Please make sure input and output token are different when swapping.`,
      );
    }
    if (!outputToken) {
      throw new Error("The output token of the swap is missing!");
    }

    let inputAmount = realAmount || amountStr;
    let slippage: number | undefined;
    try {
      slippage =
        typeof slippageStr === "string"
          ? Number.parseFloat((slippageStr as string).replace("%", ""))
          : slippageStr;
    } catch (e) {
      printError(e);
    }

    if (inputAmountUnits && !realAmount) {
      const temp = await convertAmount({
        account: accountAddress,
        token: inputToken,
        amount: inputAmount,
        amount_units: inputAmountUnits,
        chainId: getChainIdFromName(chainName?.toLowerCase()),
      });
      if (temp) inputAmount = temp;
    }
    const chainId = getChainIdFromName(chainName, true);
    const token = token1Address || inputToken || "";
    const inputTokenInfo = await getTokenInfoForChain(token, chainName, false, {
      liquidityThreshold: baseLiquidity,
    });
    if (!inputTokenInfo) {
      throw new Error(
        `Token ${token} not found on ${chainStr}. Ensure you specify a chain and token properly in your next prompt.`,
      );
    }

    const outputTokenInfo = await getTokenInfoForChain(
      outputToken,
      chainName,
      false,
      { liquidityThreshold: baseLiquidity },
    );
    if (!outputTokenInfo) {
      throw new Error(
        `Token ${outputToken} not found on ${chainStr}. Ensure you specify a chain and token properly in your next prompt.`,
      );
    }
    printLog(inputToken, inputTokenInfo?.address, chainName, inputAmount);
    printLog(outputToken, outputTokenInfo?.address, chainName, outputAmount);

    // Step 1: Check user balance on the given chain (Web3.js required)
    if (!chainId) {
      throw new Error(getChainError(chainName || ""));
    }
    const rpcUrl = rpc || getRpcUrlForChain(chainId);
    const provider = new RetryProvider(rpcUrl, chainId);

    let balances: JSONObject[] | undefined;
    if (rpc_hyperliquid) {
      balances = rpc_hyperliquid;
    } else if (protocol === "hyperliquid") {
      const state = await getUserProtocolPositionsFromHyperliquid(
        accountAddress || "",
      );
      balances = state?.[42161]?.Hyperliquid?.positions || [];
    }

    let balance = 0n;
    let inDecimals = inputTokenInfo.decimals || 18;
    if (protocol !== "hyperliquid") {
      ({ amount: balance, decimals: inDecimals } = await getTokenAmount(
        provider,
        inputTokenInfo,
        accountAddress || "",
      ));
    } else {
      balance = sfParseUnits(
        balances
          ?.find((x) => x.type === "Spot")
          ?.tokens?.find(
            (x: { symbol: string }) =>
              x.symbol.toUpperCase() === inputTokenInfo.symbol.toUpperCase(),
          )?.amount || "0",
        inputTokenInfo.decimals,
      );
    }

    const exactIn = inputAmount !== undefined;

    let _inputAmount = 0n;
    if (protocol !== "hyperliquid") {
      ({ amount: _inputAmount } = await getTokenAmount(
        provider,
        inputTokenInfo,
        accountAddress || "",
        inputAmount,
      ));
    } else {
      if (
        inputAmount === undefined ||
        inputAmount === "all" ||
        inputAmount === "half" ||
        inputAmount.toString().endsWith("%")
      ) {
        _inputAmount =
          inputAmount === "half"
            ? balance / 2n
            : inputAmount?.endsWith("%")
              ? (balance *
                  ethers.getBigInt(
                    Math.floor(Number.parseFloat(inputAmount) * 100),
                  )) /
                10000n
              : balance;
      } else {
        _inputAmount = sfParseUnits(inputAmount, inDecimals);
      }

      let inPrice = 0;
      if (inputTokenInfo.symbol === "usdc") {
        inPrice =
          (await getCoinData(accountAddress, "usdc", chainId, false)).price ||
          1;
      } else {
        const hyperToken = await getHyperliquidTokenInfo(
          chainId,
          inputTokenInfo.symbol,
          true,
        );
        inPrice = hyperToken?.price || 1;
      }
      if (!outputAmount && inPrice) {
        const amount = +ethers.formatUnits(_inputAmount, inDecimals) * inPrice;
        if (amount < 10) {
          throw new Error(
            "Hyperliquid only supports swaps of at least $10. Please ensure your input amount is properly set and try again.",
          );
        }
      }
    }

    let _outputAmount = 0n;
    let outDecimals = outputTokenInfo.decimals || 18;
    if (protocol !== "hyperliquid") {
      ({ amount: _outputAmount, decimals: outDecimals } = await getTokenAmount(
        provider,
        outputTokenInfo,
        accountAddress || "",
        outputAmount,
      ));
    } else {
      _outputAmount = sfParseUnits(
        outputAmount ||
          balances?.find((x) => x.coin === outputTokenInfo.symbol.toUpperCase())
            ?.balance ||
          "0",
        outputTokenInfo.decimals,
      );
    }
    if (exactIn && balance < _inputAmount) {
      if (balance > (_inputAmount * 999n) / 1000n) {
        _inputAmount = balance;
      } else {
        throw new Error(
          `Insufficient balance on ${chainStr}. On your Slate account, you have ${ethers.formatUnits(
            balance,
            inputTokenInfo?.decimals,
          )} and need ${ethers.formatUnits(
            _inputAmount,
            inputTokenInfo?.decimals,
          )}. Please onboard ${ethers.formatUnits(
            _inputAmount - balance,
            inputTokenInfo?.decimals,
          )} more ${inputTokenInfo?.symbol} and try again.`,
        );
      }
    }

    // Step 2: Get best swap route
    const {
      gasPrice: oldGas,
      maxFeePerGas,
      maxPriorityFeePerGas,
    } = await withRetry(accountAddress, () => provider.getFeeData());
    const gasPrice =
      maxFeePerGas === null || maxPriorityFeePerGas === null
        ? oldGas
        : maxFeePerGas + maxPriorityFeePerGas;
    if (gasPrice === null) {
      throw new Error("No gas price found");
    }
    if (exactIn && Number(_inputAmount) === 0) {
      throw new Error(
        `You are trying to swap from zero ${inputTokenInfo?.symbol} to ${outputTokenInfo?.symbol} on ${chainStr}. Please ensure your prompt is correctly formatted and try again.`,
      );
    }
    if (!exactIn && Number(_outputAmount) === 0) {
      throw new Error(
        `You are trying to swap from ${inputTokenInfo?.symbol} to zero ${outputTokenInfo?.symbol} on ${chainStr}. Please ensure your prompt is correctly formatted and try again.`,
      );
    }
    if (_inputAmount === undefined && _outputAmount === undefined) {
      throw new Error(
        "Missing input amount and output amount for swap. Please specify either input amount or output amount in your next prompt.",
      );
    }

    const { transactions, funcNames } = await checkWrap(
      provider,
      accountAddress || "",
      chainId,
      inputTokenInfo as TokenInfo,
      outputTokenInfo as TokenInfo,
      _inputAmount || _outputAmount,
    );
    if (transactions.length > 0) {
      return {
        status: "success",
        routes: [{ transactions, funcNames, source: "slate" }],
      };
    }

    if (!inputTokenInfo?.symbol || !outputTokenInfo?.symbol) {
      throw new Error(
        "Missing input/output token symbol for swap. Please specify a valid input token in your next prompt.",
      );
    }
    const routes = await getBestSwapRoutes(
      chainId,
      accountAddress || "",
      {
        address: inputTokenInfo?.address,
        symbol: inputTokenInfo.symbol,
        decimals: inDecimals,
      },
      {
        address: outputTokenInfo?.address,
        symbol: outputTokenInfo?.symbol,
        decimals: outDecimals,
      },
      exactIn ? _inputAmount : null,
      exactIn ? null : _outputAmount,
      gasPrice,
      slippage,
      limitPrice,
      ignore,
      protocol,
      rpc,
      isExecution,
    );

    if (
      !exactIn &&
      routes.length > 0 &&
      balance < ethers.getBigInt(routes[0].amountIn)
    ) {
      throw new Error(
        `Insufficient balance on ${chainStr}. On your Slate account, you have ${ethers.formatUnits(
          balance,
          inputTokenInfo?.decimals,
        )} and need ${ethers.formatUnits(
          ethers.getBigInt(routes[0].amountIn),
          inputTokenInfo?.decimals,
        )}. Please onboard ${ethers.formatUnits(
          ethers.getBigInt(routes[0].amountIn) - balance,
          inputTokenInfo?.decimals,
        )} more ${inputTokenInfo?.symbol} and try again.`,
      );
    }

    // Step 3: Parse the response and extract relevant information for the transaction
    if (routes.length === 0) {
      throw new Error(
        getNoSwapRouteError(
          inputTokenInfo?.symbol,
          outputTokenInfo?.symbol,
          chainName,
          slippage,
        ),
      );
    }

    const nativeTokenSymbol =
      getNativeTokenSymbolForChain(chainId)?.toLowerCase();

    const newRoutes: SwapRealRoute[] = [];
    /* eslint-disable no-await-in-loop */
    for (const route of routes) {
      // Step 4: Check user allowance and approve if necessary
      const newRoute: SwapRealRoute = {
        ...route,
        transactions: [],
        funcNames: [],
      };
      if (
        inputTokenInfo.symbol?.toLowerCase() !== nativeTokenSymbol &&
        protocol !== "hyperliquid"
      ) {
        let tokenProxy: string | null | undefined;
        if (route.source === "paraswap") {
          if (!isValidChainId(chainId)) {
            throw new Error(`Invalid chain id: ${chainId}, ${typeof chainId}`);
          }
          tokenProxy = getProtocolAddressForChain(
            route.source,
            chainId,
            "transferProxy",
          );
          if (!tokenProxy)
            throw new Error("No token proxy for the specified chain.");
        } else if (route.source === "cowswap") {
          if (!isValidChainId(chainId)) {
            throw new Error(`Invalid chain id: ${chainId}, ${typeof chainId}`);
          }
          tokenProxy = getProtocolAddressForChain(
            route.source,
            chainId,
            "relayer",
          );
        }
        const inAmount =
          ethers.getBigInt(route.amountIn) > 0n
            ? ethers.getBigInt(route.amountIn)
            : _inputAmount;
        const approveTxs = await getApproveData(
          provider,
          inputTokenInfo,
          inAmount,
          accountAddress || "",
          tokenProxy || route.tx?.to || "",
        );
        newRoute.transactions.push(...approveTxs);
        newRoute.funcNames.push(...Array(approveTxs.length).fill("Approve"));
      }
      // Step 5: Return the transaction details to the client
      if (route.tx) {
        newRoute.transactions.push({ ...route.tx, from: accountAddress });
      }
      newRoute.funcNames.push("Swap");
      if (
        route.source === "uniswap" &&
        outputTokenInfo?.symbol?.toLowerCase() === "eth"
      ) {
        const wethToken = await getTokenInfoForChain("weth", chainName || "");
        if (wethToken) {
          const { transactions } = await checkWrap(
            provider,
            accountAddress || "",
            chainId,
            wethToken,
            outputTokenInfo,
            BigInt(route.amountOut || 0),
          );
          newRoute.transactions.push(...transactions);
          newRoute.funcNames.push(...["Approve", "Swap"]);
        }
      }
      newRoutes.push(newRoute);
    }

    return { status: "success", routes: newRoutes };
  } catch (err) {
    printLog("Swap error:");
    printError(err);
    return { status: "error", message: getErrorMessage(err) };
  }
};

export const getBridgeTx = async (
  data: CommonArgs,
  ignore: string[] = [],
  isExecution = true,
): Promise<BridgeResponse> => {
  const {
    accountAddress,
    protocolName,
    sourceChainName,
    destinationChainName,
    token,
    token1Address,
    amount: amountStr,
    amount_units,
    realAmount,
    rpc,
    isAllAmount,
  } = data;
  let { provider: prevSource } = data;
  if (
    accountAddress?.toLowerCase() ===
      "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d" ||
    accountAddress?.toLowerCase() ===
      "0xa5ef861278d7bf18a8a2068a01d66fbded93a1bd"
  ) {
    if (!prevSource) {
      prevSource = "across";
    }
  }
  const printLog = usePrintLog(accountAddress);
  const printError = usePrintError(accountAddress);

  try {
    if (!destinationChainName) {
      throw new Error(
        "Bridge destination chain name is required for simulation.",
      );
    }

    const srcChainId = getChainIdFromName(sourceChainName);
    const outputToken = getOutputTokenSymbolForBridge(
      token || "",
      sourceChainName || "",
      destinationChainName || "",
    );
    let amount = realAmount || amountStr;
    if (Number(amount) < 0) {
      throw new Error(
        `Trying to bridge negative amount: ${amount}. Please specify positive amount in your next prompt.`,
      );
    }
    if (amount_units && !realAmount) {
      const temp = await convertAmount({
        account: accountAddress,
        token,
        amount,
        amount_units,
        chainId: srcChainId,
      });
      if (temp) amount = temp;
    }

    const sourceChainId = getChainIdFromName(sourceChainName, true);
    const destinationChainId = getChainIdFromName(destinationChainName, true);
    if (sourceChainId === destinationChainId) {
      throw new Error(
        "Can't bridge between the same chain. Make sure to specify chains in your query or make sure your connected wallet is on your desired source chain.",
      );
    }
    const [tokenInfo, outputTokenInfo] = await Promise.all([
      getTokenInfoForChain(
        token1Address || token || "",
        sourceChainName || "",
        true,
      ),
      getTokenInfoForChain(outputToken, destinationChainName || "", true),
    ]);
    if (isValidHyperliquidAddress(tokenInfo?.address)) {
      throw new Error(
        `Token ${tokenInfo?.symbol} not found on ${sourceChainName}. Ensure you specify a chain and token properly in your next prompt.`,
      );
    }
    if (isValidHyperliquidAddress(outputTokenInfo?.address)) {
      throw new Error(
        `Token ${outputTokenInfo?.symbol} not found on ${destinationChainName}. Ensure you specify a chain and token properly in your next prompt.`,
      );
    }

    // Step 1: Check user balance on the source chain (Web3.js required)
    if (!sourceChainId) {
      throw new Error(getChainError(sourceChainName || ""));
    }
    const rpcUrl = rpc || getRpcUrlForChain(sourceChainId);
    const provider = new RetryProvider(rpcUrl, sourceChainId);
    const { amount: balance, decimals } = await getTokenAmount(
      provider,
      tokenInfo,
      accountAddress || "",
    );
    let { amount: _amount } = await getTokenAmount(
      provider,
      tokenInfo,
      accountAddress || "",
      amount,
    );
    const {
      gasPrice: oldGas,
      maxFeePerGas,
      maxPriorityFeePerGas,
    } = await withRetry(accountAddress, () => provider.getFeeData());
    const gasPrice =
      maxFeePerGas === null || maxPriorityFeePerGas === null
        ? oldGas
        : maxFeePerGas + maxPriorityFeePerGas;
    if (gasPrice === null) {
      throw new Error("No gas price found");
    }
    if (balance < _amount) {
      if (balance > (_amount * 999n) / 1000n) {
        _amount = balance;
      } else {
        throw new Error(
          `Insufficient balance on ${sourceChainName}. On your Slate account, you have ${ethers.formatUnits(
            balance,
            tokenInfo?.decimals,
          )} and need ${ethers.formatUnits(
            _amount,
            tokenInfo?.decimals,
          )}. Please onboard ${ethers.formatUnits(
            _amount - balance,
            tokenInfo?.decimals,
          )} more ${tokenInfo?.symbol} and try again.`,
        );
      }
    }

    // Step 2: Make an HTTP request to Metamask Bridge API
    if (Number(_amount) === 0) {
      throw new Error(
        `Trying to bridge zero ${tokenInfo?.symbol}. Please specify positive amount in your next prompt.`,
      );
    }
    if (!_amount) {
      throw new Error(
        "Missing amount for bridge. Please specify an amount in your next prompt.",
      );
    }

    if (!tokenInfo || !outputTokenInfo) {
      throw new Error(
        getNoBridgeRouteError(
          tokenInfo?.symbol,
          sourceChainName,
          destinationChainName,
        ),
      );
    }

    if (!destinationChainId) {
      throw new Error(getChainError(destinationChainName));
    }
    const routes = await getBestBridgeRoutes(
      sourceChainId,
      destinationChainId,
      accountAddress || "",
      {
        address: tokenInfo?.address,
        symbol: tokenInfo?.symbol,
        decimals,
      },
      {
        address: outputTokenInfo?.address,
        symbol: outputTokenInfo?.symbol,
        decimals: outputTokenInfo?.decimals,
      },
      _amount,
      gasPrice,
      ignore,
      protocolName || prevSource,
      rpc,
      isAllAmount,
      isExecution,
    );

    // Step 3: Parse the response and extract relevant information for the bridge transaction
    if (routes.length === 0) {
      throw new Error(
        getNoBridgeRouteError(
          tokenInfo?.symbol,
          sourceChainName,
          destinationChainName,
        ),
      );
    }

    const nativeTokenSymbol =
      getNativeTokenSymbolForChain(sourceChainId)?.toLowerCase();

    const newRoutes: BridgeRealRoute[] = [];
    /* eslint-disable no-await-in-loop */
    for (const route of routes) {
      const newRoute: BridgeRealRoute = {
        ...route,
        transactions: [],
        funcNames: [],
        amountOut: route.amountOut,
      };
      // Step 4: Check user allowance and approve if necessary
      if (
        tokenInfo?.symbol.toLowerCase() !== nativeTokenSymbol &&
        !route.skipApprove
      ) {
        const approveTxs = await getApproveData(
          provider,
          tokenInfo,
          _amount,
          accountAddress || "",
          route.txs[0].to,
        );
        newRoute.transactions.push(...approveTxs);
        newRoute.funcNames.push(...Array(approveTxs.length).fill("Approve"));
      }
      // Step 5: Return the transaction details to the client
      newRoute.transactions.push(
        ...route.txs.map((x) => ({ ...x, from: accountAddress })),
      );
      newRoute.funcNames.push("Bridge");
      newRoutes.push(newRoute);
    }
    return { status: "success", routes: newRoutes };
  } catch (err) {
    printLog("Bridge error:");
    let message = getErrorMessage(err);
    if (message.includes("Ensure you specify")) {
      const errors = message.split(" ");
      errors.splice(1, 1, token);
      message = new Error(errors.join(" ")).message;
    }
    if (
      destinationChainName?.toLowerCase() === "mode" &&
      token?.toLowerCase() !== "eth"
    ) {
      message =
        "You can bridge only ETH to Mode chain. Try swapping to ETH first and then bridging to Mode chain.";
    }
    printError(message);
    return { status: "error", message };
  }
};

export const getActionTx = async (action: string, actionData: CommonArgs) => {
  const {
    accountAddress,
    protocolName,
    chainName,
    poolName,
    inputToken,
    token,
    amount: amountStr,
    amount_units,
    realAmount,
    amount2: amount2Str,
    range,
    rpc,
    token1Address,
    token2Address,
  } = actionData;
  let { token2 } = actionData;

  const printLog = usePrintLog(accountAddress);
  const printError = usePrintError(accountAddress);

  try {
    let ignoreTokenCheck: boolean | undefined;
    let ignoreAmountCheck: boolean | undefined;

    if (action === "lock") {
      ignoreTokenCheck = true;
    } else if (action === "unlock" || action === "claim") {
      ignoreTokenCheck = true;
      ignoreAmountCheck = true;
    }

    let useToken = token1Address || inputToken || token;
    if (protocolName?.toLowerCase() === "lodestar" && !useToken)
      useToken = poolName?.toLowerCase();

    if (protocolName?.toLowerCase() === "bladeswap" && !useToken)
      useToken = `${poolName?.toLowerCase()}-vlp`;
    let amount = realAmount || amountStr;
    if (amount_units && !realAmount) {
      const temp = await convertAmount({
        account: accountAddress,
        token: useToken,
        amount,
        amount_units,
        chainId: getChainIdFromName(chainName?.toLowerCase()),
      });
      if (temp) amount = temp;
    }

    const ret = await validateProtocolParams(
      {
        account: accountAddress,
        action,
        protocolName,
        chainName,
        token: useToken,
        amount,
        token1Address,
        range,
      },
      ignoreTokenCheck,
      ignoreAmountCheck,
    );
    let { chainId } = ret;
    const { tokenInfo } = ret;
    let tokenInfo2: TokenInfo | undefined;
    if (protocolName?.toLowerCase() === "dolomite") {
      if (!chainId) {
        throw new Error(getChainError(chainName || ""));
      }
      const isoData = (LPAddresses.dolomite as JSONObject)[chainId.toString()];
      const lpList = Object.keys(isoData);
      const dToken = token;
      if (
        lpList.includes(dToken?.toLowerCase() || "") &&
        !isoData[dToken?.toLowerCase() || ""].listedToken
      ) {
        token2 = isoData[dToken?.toLowerCase() || ""].token;
      }
    }

    if (protocolName?.toLowerCase() === "bladeswap" && token2Address) {
      token2 = (await getTokenForChain(chainId, token2Address))?.symbol;
    }
    if (token2) {
      tokenInfo2 = await getTokenInfoForChain(
        token2Address || token2,
        chainName,
        true,
      );
    }

    let protocol = protocolName?.toLowerCase() || "";
    if (protocol === "rocket pool") {
      protocol = "rocketpool";
    }

    if (!ProtocolActions[protocol as keyof ActionMap]) {
      throw new Error(getUnsupportedProtocolError(protocol, action));
    }

    if (!chainId) {
      throw new Error(getChainError(chainName || ""));
    }
    const rpcUrl = rpc || getRpcUrlForChain(chainId);
    const provider = new RetryProvider(rpcUrl, chainId);

    const decimals = tokenInfo?.decimals || 18;
    const decimals2 = tokenInfo2?.decimals || 18;
    const regex2 = new RegExp(`^(\\d*\\.\\d{1,${decimals2}})|\\d+`);
    let amountInWei: bigint | undefined;
    let amount2InWei: bigint | undefined;
    if (action !== "claim") {
      if (action === "repay" && (amount === "all" || amount === "100%")) {
        actionData.repayAll = true;
      }

      if (
        amount &&
        !amount.toString().endsWith("%") &&
        amount !== "all" &&
        amount !== "half"
      ) {
        amountInWei = sfParseUnits(amount, decimals);
      }

      if (
        (fromActions.includes(action) || action === "borrow") &&
        !amountInWei
      ) {
        if (fromActions.includes(action)) {
          let tokens = await getTokensForAction(
            accountAddress || "",
            action,
            actionData,
            { provider, chainId },
          );
          if (tokens.length === 0) {
            const { status, chain, chains } = await getAlternativeChain(
              accountAddress || "",
              { name: action, args: actionData },
              chainId,
            );
            if (status && chain) {
              chainId = getChainIdFromName(chain);
              actionData.chainName = chain;
              tokens = chainId
                ? await getTokensForAction(
                    accountAddress || "",
                    action,
                    actionData,
                    { provider, chainId },
                  )
                : [];
            }

            const message = getNoPositionError(action, chainName || "", chains);
            printError(message);
            return { status: "error", message };
          }
          let temp = tokens.filter((x) => x.symbol.toLowerCase() === useToken);
          if (temp.length === 0) {
            const { status, chain, chains } = await getAlternativeChain(
              accountAddress || "",
              { name: action, args: actionData },
              chainId,
            );
            if (status && chain) {
              chainId = getChainIdFromName(chain);
              actionData.chainName = chain;
              tokens = chainId
                ? await getTokensForAction(
                    accountAddress || "",
                    action || "",
                    actionData,
                    { provider, chainId },
                  )
                : [];
              temp = tokens.filter((x) => x.symbol.toLowerCase() === useToken);
            }
            if (temp.length === 0) {
              const message = getNoPositionError(
                action,
                chainName || "",
                chains,
                undefined,
                useToken,
                tokens.map((x) => x.symbol),
              );
              printError(message);
              return { status: "error", message };
            }
          }
          tokens = temp;
          amountInWei = tokens[0].amount;
        } else {
          const borrowableAmount = await getBorrowableAmountForToken(
            chainId,
            protocol,
            accountAddress || "",
            token || "",
            rpcUrl,
            actionData.poolName?.toLowerCase(),
          );
          amountInWei = sfParseUnits(borrowableAmount, decimals);
        }

        if (amount === "half") {
          amountInWei /= 2n;
        } else if (amount?.endsWith("%")) {
          amountInWei =
            (amountInWei *
              ethers.getBigInt(Math.floor(Number.parseFloat(amount) * 100))) /
            10000n;
        }
      }

      if (
        (!fromActions.includes(action) && action !== "borrow") ||
        action === "repay"
      ) {
        if (tokenInfo && amount !== undefined) {
          const { amount: _amountInWei } = await getTokenAmount(
            provider,
            tokenInfo,
            accountAddress || "",
            amount,
          );
          amountInWei = amountInWei
            ? amountInWei < _amountInWei
              ? ethers.getBigInt(amountInWei)
              : _amountInWei
            : undefined;
        }
        let amount2 = amount2Str;
        if (amount2 === "outputAmount") {
          const res = await getTokenAmount(
            provider,
            tokenInfo2,
            accountAddress || "",
          );
          amount2 = ethers.formatUnits(res.amount, res.decimals);
        }
        if (tokenInfo2 && amount2 !== undefined) {
          const { amount: _amountInWei } = await getTokenAmount(
            provider,
            tokenInfo2,
            accountAddress || "",
            amount2,
          );
          if (amount2.match(regex2)) {
            amount2InWei =
              sfParseUnits(amount2.match(regex2)?.[0] || "", decimals2) <
              _amountInWei
                ? sfParseUnits(amount2.match(regex2)?.[0] || "", decimals2)
                : _amountInWei;
          } else if (!isNaNValue(amount2)) {
            amount2InWei =
              sfParseUnits(amount2, decimals2) < _amountInWei
                ? sfParseUnits(amount2, decimals2)
                : _amountInWei;
          } else {
            amount2InWei = _amountInWei;
          }
        }
      }

      if (!amountInWei) {
        return { status: "error", message: "No amount for action" };
      }
    }

    const {
      transactions,
      funcNames,
      signData,
      balanceChanges,
    }: {
      transactions: (Transaction | undefined)[];
      funcNames?: string[];
      signData?: SignData | null;
      balanceChanges?: BalanceChange[];
    } = await ProtocolActions[protocol as keyof ActionMap](
      accountAddress || "",
      action || "",
      {
        ...actionData,
        token: useToken,
        chainId: chainId || 1,
        tokenInfo,
        tokenInfo2,
        provider,
        amount: amountInWei,
        amount2: amount2InWei,
      } as ProtocolActionData,
    );

    return {
      status: "success",
      transactions: transactions.map((transaction) => ({
        ...transaction,
        from: accountAddress,
      })),
      funcNames,
      signData,
      balanceChanges,
    };
  } catch (err) {
    printLog(`${action} error:`);
    const message = getErrorMessage(err);
    printError(message);
    return {
      status: "error",
      message: err instanceof AxiosError ? message.message : message,
    };
  }
};

export const getPerpActionTx = async (
  action: string,
  actionData: CommonArgs,
) => {
  const {
    accountAddress,
    protocolName,
    chainName,
    inputToken,
    inputAmount: amountStr,
    inputAmountUnits,
    realAmount,
    outputToken,
    rpc,
  } = actionData;

  const printLog = usePrintLog(accountAddress);
  const printError = usePrintError(accountAddress);

  try {
    if (
      actionData.leverageMultiplier &&
      typeof actionData.leverageMultiplier === "string"
    ) {
      actionData.leverageMultiplier = actionData.leverageMultiplier.replace(
        "x",
        "",
      );
    }

    let protocol = protocolName?.toLowerCase() || "";
    if (protocol === "rocket pool") {
      protocol = "rocketpool";
    }

    if (!(protocol in ProtocolActions)) {
      throw new Error(getUnsupportedProtocolError(protocol, action));
    }

    let inputAmount = realAmount || amountStr;
    if (inputAmountUnits && !realAmount) {
      const temp = await convertAmount({
        account: accountAddress,
        token: inputToken,
        amount: inputAmount,
        inputAmountUnits,
        chainId: getChainIdFromName((chainName || "").toLowerCase()),
      });
      if (temp) inputAmount = temp;
    }

    const {
      chainId,
      tokenInfo: inputTokenInfo,
      outputTokenInfo,
    } = await validateProtocolParams({
      account: accountAddress,
      action,
      protocolName,
      chainName,
      token: inputToken,
      amount: inputAmount,
      outputToken,
    });

    if (!chainId) {
      throw new Error(getChainError(chainName || ""));
    }
    const rpcUrl = rpc || getRpcUrlForChain(chainId);
    const provider = new RetryProvider(rpcUrl, chainId);

    let inputAmountInWei: bigint | undefined;
    if (
      protocol === "hyperliquid" &&
      action !== "close" &&
      (inputAmount === "all" ||
        inputAmount === "half" ||
        inputAmount?.endsWith("%"))
    ) {
      const positions = await getUserProtocolPositionsFromHyperliquid(
        accountAddress || "",
      );
      const balance = sfParseUnits(
        positions?.[42161]?.Hyperliquid?.positions
          ?.find((position: { type: string }) => position.type === "Deposit")
          ?.tokens?.[0]?.amount?.toString() || "0",
        6,
      );
      if (inputAmount.toString().endsWith("%")) {
        const percent = Math.floor(Number.parseFloat(inputAmount) * 100);
        // allow 2 decimals for percentage
        inputAmountInWei = (balance * ethers.getBigInt(percent)) / 10000n;
      } else {
        inputAmountInWei = inputAmount === "half" ? balance / 2n : balance;
      }
    } else if (inputTokenInfo && inputAmount !== undefined) {
      const { amount: _inputAmountInWei } = await getTokenAmount(
        provider,
        inputTokenInfo,
        accountAddress || "",
        inputAmount,
      );
      inputAmountInWei = _inputAmountInWei;
    }

    const {
      transactions,
      funcNames,
      signData,
      balanceChanges,
    }: {
      transactions: (Transaction | undefined)[];
      funcNames?: string[];
      signData?: SignData | null;
      balanceChanges?: BalanceChange[];
    } = await ProtocolActions[protocol as keyof ActionMap](
      accountAddress || "",
      action || "",
      {
        ...actionData,
        chainId,
        inputTokenInfo,
        provider,
        inputAmount: inputAmountInWei,
        outputToken,
        outputTokenInfo,
      } as ProtocolActionData,
    );

    return {
      status: "success",
      transactions: transactions.map((transaction) => ({
        ...transaction,
        from: accountAddress,
      })),
      funcNames,
      signData,
      balanceChanges,
    };
  } catch (err) {
    printLog(`${action} error:`);
    printError(err);
    return { status: "error", message: getErrorMessage(err) };
  }
};

export const getTransferTx = async (data: CommonArgs) => {
  const {
    accountAddress,
    token,
    amount: amountStr,
    amount_units,
    realAmount,
    recipient,
    chainName,
    rpc,
    rpc_hyperliquid,
    token1Address,
    protocolName,
  } = data;

  const printLog = usePrintLog(accountAddress);
  const printError = usePrintError(accountAddress);
  const useToken = token1Address || token;
  const protocol = (protocolName || "").toLowerCase();

  try {
    let amount = realAmount || amountStr;
    if (amount_units && !realAmount) {
      const temp = await convertAmount({
        account: accountAddress,
        token: useToken,
        amount,
        amount_units,
        chainId: getChainIdFromName((chainName || "").toLowerCase()),
      });
      if (temp) amount = temp;
    }

    const { chainId, tokenInfo } = await validateProtocolParams({
      account: accountAddress,
      action: "transfer",
      protocolName: protocol || "Transfer",
      chainName,
      token: useToken,
      amount,
      recipient,
    });

    if (!tokenInfo?.address) {
      throw new Error(`The provided token ${token} is invalid for transfer.`);
    }

    if (!recipient) {
      throw new Error(
        "No recipient provided. Please specify a recipient for your transfer.",
      );
    }
    let _recipient: string | null = recipient;
    if (
      (_recipient === "spot" || _recipient === "perp") &&
      protocol === "hyperliquid"
    ) {
      // skip recipient validation for spot/perp case on hyperliquid
    } else if (!isValidAddress(recipient)) {
      // Retrieve the recipient address
      const rpcUrl = getRpcUrlForChain(1);
      const provider = new RetryProvider(rpcUrl, 1);
      try {
        _recipient = await withRetry(accountAddress, () =>
          provider.resolveName(recipient),
        );
      } catch (err) {
        printError(err);
        throw new Error(
          `The provided recipient ${recipient} is an invalid address. Please specify a valid recipient for your transfer.`,
        );
      }
      if (_recipient === null) {
        printLog("error: couldn't resolve", recipient, _recipient);
        throw new Error(
          `The provided recipient ${recipient} is an invalid address. Please specify a valid recipient for your transfer.`,
        );
      }
    }
    if (_recipient?.toLowerCase() === accountAddress?.toLowerCase()) {
      throw new Error(
        "You are trying to transfer to your Slate account. Commands only work for funds already in your Slate account. Please transfer funds manually to get started!",
      );
    }

    let state: HyperliquidState | undefined;
    if (protocol === "hyperliquid") {
      state = await getUserProtocolPositionsFromHyperliquid(
        accountAddress || "",
      );
    }

    // Step 1: Check user balance on the chain (Web3.js required)
    if (!chainId) {
      throw new Error(getChainError(chainName || ""));
    }
    const rpcUrl = rpc || getRpcUrlForChain(chainId);
    const provider = new RetryProvider(rpcUrl, chainId);
    let balance = 0n;
    if (protocol !== "hyperliquid") {
      ({ amount: balance } = await getTokenAmount(
        provider,
        tokenInfo,
        accountAddress || "",
      ));
    } else {
      if (recipient === "perp") {
        balance = sfParseUnits(
          (rpc_hyperliquid || state?.[42161]?.Hyperliquid?.positions)
            ?.find((x) => x.type === "Spot")
            ?.tokens?.find((x: { symbol: string }) => x.symbol === "USDC")
            ?.amount || "0",
          6,
        );
      } else {
        balance = sfParseUnits(
          (rpc_hyperliquid || state?.[42161]?.Hyperliquid?.positions)
            ?.find((position) => position.type === "Deposit")
            ?.tokens?.[0]?.amount?.toString() || "0",
          6,
        );
      }
    }
    let _amount = 0n;
    if (protocol !== "hyperliquid") {
      ({ amount: _amount } = await getTokenAmount(
        provider,
        tokenInfo,
        accountAddress || "",
        amount,
      ));
    } else {
      if (
        amount === undefined ||
        amount === "all" ||
        amount === "half" ||
        amount.toString().endsWith("%")
      ) {
        _amount =
          amount === "half"
            ? balance / 2n
            : amount?.endsWith("%")
              ? (balance *
                  ethers.getBigInt(
                    Math.floor(Number.parseFloat(amount) * 100),
                  )) /
                10000n
              : balance;
      } else {
        _amount = sfParseUnits(amount, tokenInfo?.decimals);
      }
    }
    let amountInWei: bigint | undefined;
    try {
      amountInWei = sfParseUnits(
        Number.parseFloat(_amount.toString()).toFixed(
          tokenInfo?.decimals || 18,
        ),
        tokenInfo?.decimals || 18,
      );
    } catch (e) {
      printError("not breaking", e);
      amountInWei = sfParseUnits(_amount.toString(), tokenInfo?.decimals || 18);
    }
    let finalAmount = _amount < amountInWei ? _amount : amountInWei;
    if (balance < finalAmount) {
      if (balance > (finalAmount * 999n) / 1000n) {
        finalAmount = balance;
      } else {
        throw new Error(
          `Insufficient balance on ${chainName}. On your Slate account, you have ${ethers.formatUnits(
            balance,
            tokenInfo.decimals,
          )} and need ${ethers.formatUnits(
            finalAmount,
            tokenInfo.decimals,
          )}. Please onboard ${ethers.formatUnits(
            finalAmount - balance,
            tokenInfo.decimals,
          )} more ${tokenInfo.symbol} and try again.`,
        );
      }
    }

    // Step 2: Return the transaction details to the client

    if (
      protocol === "hyperliquid" &&
      (recipient === "spot" || recipient === "perp")
    ) {
      let amount = +ethers.formatUnits(finalAmount, 6);
      amount = Math.floor(amount * 100) / 100;
      return {
        status: "success",
        transactions: [],
        signData: {
          amount: amount.toString(),
          toPerp: recipient === "perp",
          time: new Date().getTime(),
          outputAmount: amount.toString(),
        },
        funcNames: ["Transfer"],
      };
    }

    let to = _recipient;
    let txData = "0x";
    let value = finalAmount;

    if (tokenInfo.address !== NATIVE_TOKEN) {
      const _token = new ethers.Contract(tokenInfo.address, abis.erc20);
      to = tokenInfo.address;
      txData = _token.interface.encodeFunctionData("transfer", [
        _recipient,
        finalAmount,
      ]);

      const nativeTokenSymbol =
        getNativeTokenSymbolForChain(chainId)?.toLowerCase();
      if (tokenInfo.symbol.toLowerCase() !== nativeTokenSymbol) {
        value = 0n;
      }
    }

    const transactionDetails = {
      to,
      value: value.toString(),
      data: txData,
      from: accountAddress,
    };

    return {
      status: "success",
      transactions: [transactionDetails],
      funcNames: ["Transfer"],
    };
  } catch (err) {
    printLog("Transfer error:");
    printError(err);
    return { status: "error", message: getErrorMessage(err) };
  }
};

export const getTokenBalanceForAllChains = async (
  address: string,
  symbol: string | undefined,
  amount: string | undefined,
  rpcs: Record<string, string>,
) => {
  const balances: { chainId: number; chainName: string; balance: number }[] =
    [];
  await Promise.all(
    EntityData.chains.map(async (chainName) => {
      if (chainName === "Solana") return;

      const chainId = getChainIdFromName(chainName);
      const balance = await getTokenBalance(
        address,
        chainName,
        symbol || "",
        rpcs[`${chainId}`],
      );
      if (
        chainId &&
        (isNaNValue(amount || "all")
          ? balance > 0
          : balance >= +(amount || "0"))
      )
        balances.push({ chainId, chainName: chainName.toLowerCase(), balance });
    }),
  );
  return balances;
};

export const getTokenOwningChains = async (address: string, symbol: string) => {
  const chains: string[] = [];
  await Promise.all(
    EntityData.chains.map(async (chainName) => {
      if (chainName === "Solana") return;

      const chainId = getChainIdFromName(chainName);
      if (!chainId) return;

      const tokenInfo = await getTokenPortfolio(chainId, address, symbol || "");
      if (!Array.isArray(tokenInfo) && tokenInfo?.address)
        chains.push(chainName.toLowerCase());
    }),
  );
  return chains;
};

export const getTokenBalance = async (
  accountAddress: string,
  chainName: string,
  tokenName: string | null,
  rpc: string | undefined = undefined,
) => {
  const printLog = usePrintLog(accountAddress);
  const printError = usePrintError(accountAddress);

  try {
    const chainId = getChainIdFromName(chainName, true);
    const rpcUrl = rpc || getRpcUrlForChain(chainId);
    if (!rpcUrl) return 0;

    const provider = new RetryProvider(rpcUrl, chainId);

    const tokenInfo = await getTokenInfoForChain(
      tokenName || "",
      chainName,
      true,
      { account: accountAddress, provider },
    );
    if (!tokenInfo?.address) return 0;

    const { amount: balance, decimals } = await getTokenAmount(
      provider,
      tokenInfo,
      accountAddress,
    );
    return +ethers.formatUnits(balance, decimals);
  } catch (err) {
    printLog(`No ${tokenName} on ${chainName}`);
    return 0;
  }
};

export const getRevertReason = async (
  account: string | undefined,
  vnetId: string | undefined,
  hash: string,
  protocol: string | undefined = undefined,
) => {
  const printError = usePrintError(account);

  const defaultErrorMsg = "Transaction simulation reverted!";
  try {
    const baseUrl = `https://api.tenderly.co/api/v1/account/${process.env.TENDERLY_USER}/project/${process.env.TENDERLY_PROJECT}`;
    const config = {
      headers: { "X-Access-Key": process.env.TENDERLY_ACCESS_KEY },
    };
    const {
      data: { id },
    } = await axios.get(
      `${baseUrl}/vnets/${vnetId}/transactions/${hash}`,
      config,
    );
    if (!id) return defaultErrorMsg;

    const { data: simTx } = await axios.get(
      `${baseUrl}/testnet/${vnetId}/transaction/${id}/trace`,
      config,
    );
    const revertStack = simTx.transaction.transaction_info.stack_trace.find(
      (stack: { op: string }) =>
        stack.op === "REVERT" || stack.op === "INVALID",
    );
    let error = revertStack.error_reason || revertStack.error;
    if (error === "execution reverted") {
      const calls = simTx.transaction.transaction_info.call_trace;
      const err = findBetterError(calls);
      if (err) error = err;
    }

    if (error) {
      if (protocol === "lodestar") {
        if (error.split('"')[1]) error = error.split('"')[1];
      }
      const protocolErrors = ProtocolErrors[protocol || ""];
      if (protocolErrors && error in protocolErrors) {
        error = protocolErrors[error];
      }
      error = error.replace(/\0/g, "").replace("\n", "").toString();
      return `Transaction failed with reason: ${error}`;
    }
  } catch (err) {
    printError(err);
  }
  return defaultErrorMsg;
};

const findBetterError = (call: unknown): string | undefined => {
  if (
    typeof call === "object" &&
    call &&
    "error_op" in call &&
    call.error_op === "REVERT"
  ) {
    if (
      typeof call === "object" &&
      "error" in call &&
      typeof call.error === "string" &&
      call.error !== "execution reverted"
    )
      return call.error;
    if (
      typeof call === "object" &&
      "error_reason" in call &&
      typeof call.error_reason === "string" &&
      call.error_reason !== "execution reverted"
    )
      return call.error_reason;
  }

  for (const call_ of (call as unknown as { calls: unknown[] }).calls || []) {
    const error = findBetterError(call_);
    if (error) return error;
  }
};

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // Initial delay in milliseconds

const retrySleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const fetchOnchainPrice = async (
  account: string | undefined,
  unique: string,
) => {
  const provider = new RetryProvider(getRpcUrlForChain(1), 1);
  const viemClient = await getViemPublicClientFromEthers(provider);
  if (unique === "ethereum" || unique === "weth") {
    const contractAddress = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";

    const contractABI = [
      {
        inputs: [],
        name: "latestRoundData",
        outputs: [
          { internalType: "uint80", name: "roundId", type: "uint80" },
          { internalType: "int256", name: "answer", type: "int256" },
          { internalType: "uint256", name: "startedAt", type: "uint256" },
          { internalType: "uint256", name: "updatedAt", type: "uint256" },
          { internalType: "uint80", name: "answeredInRound", type: "uint80" },
        ],
        stateMutability: "view",
        type: "function",
      },
    ] as const;

    const price = await withRetry(account, () =>
      viemClient.readContract({
        address: contractAddress,
        abi: contractABI,
        functionName: "latestRoundData",
      }),
    );
    return +ethers.formatUnits(price[1], 8);
  }
  if (unique === "wrapped-bitcoin" || unique === "btc" || unique === "wbtc") {
    const contractAddress = "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c";

    const contractABI = [
      {
        inputs: [],
        name: "latestRoundData",
        outputs: [
          { internalType: "uint80", name: "roundId", type: "uint80" },
          { internalType: "int256", name: "answer", type: "int256" },
          { internalType: "uint256", name: "startedAt", type: "uint256" },
          { internalType: "uint256", name: "updatedAt", type: "uint256" },
          { internalType: "uint80", name: "answeredInRound", type: "uint80" },
        ],
        stateMutability: "view",
        type: "function",
      },
    ] as const;

    const price = await withRetry(account, () =>
      viemClient.readContract({
        address: contractAddress,
        abi: contractABI,
        functionName: "latestRoundData",
      }),
    );
    return +ethers.formatUnits(price[1], 8);
  }
  if (unique === "usd-coin") {
    const contractAddress = "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6";

    const contractABI = [
      {
        inputs: [],
        name: "latestRoundData",
        outputs: [
          { internalType: "uint80", name: "roundId", type: "uint80" },
          { internalType: "int256", name: "answer", type: "int256" },
          { internalType: "uint256", name: "startedAt", type: "uint256" },
          { internalType: "uint256", name: "updatedAt", type: "uint256" },
          { internalType: "uint80", name: "answeredInRound", type: "uint80" },
        ],
        stateMutability: "view",
        type: "function",
      },
    ] as const;

    const price = await withRetry(account, () =>
      viemClient.readContract({
        address: contractAddress,
        abi: contractABI,
        functionName: "latestRoundData",
      }),
    );

    return +ethers.formatUnits(price[1], 8);
  }
  if (unique === "bnb") {
    const contractAddress = "0x14e613AC84a31f709eadbdF89C6CC390fDc9540A";

    const contractABI = [
      {
        inputs: [],
        name: "latestRoundData",
        outputs: [
          { internalType: "uint80", name: "roundId", type: "uint80" },
          { internalType: "int256", name: "answer", type: "int256" },
          { internalType: "uint256", name: "startedAt", type: "uint256" },
          { internalType: "uint256", name: "updatedAt", type: "uint256" },
          { internalType: "uint80", name: "answeredInRound", type: "uint80" },
        ],
        stateMutability: "view",
        type: "function",
      },
    ] as const;

    const price = await withRetry(account, () =>
      viemClient.readContract({
        address: contractAddress,
        abi: contractABI,
        functionName: "latestRoundData",
      }),
    );
    return +ethers.formatUnits(price[1], 8);
  }
  return -1;
};

const fetchCoinDataWithRetry = async (
  account: string | undefined,
  chainId: ChainId | undefined,
  token: TokenInfo | undefined,
  symbol: string | undefined,
  retryCount = 1,
) => {
  const unique = token?.coinmarketcapId ?? symbol;
  const printError = usePrintError(account);

  const headers = { "X-CMC_PRO_API_KEY": CMC_API_KEY };
  try {
    if (unique !== symbol) {
      const { data } = await axios.get(
        `${CMC_API_ENDPOINT}/quotes/latest?slug=${unique}`,
        { headers },
      );
      const firstKey = Object.keys(data?.data || {})[0];
      return firstKey ? data?.data?.[firstKey]?.quote?.USD || {} : {};
    }
    const { data } = await axios.get(
      `${CMC_API_ENDPOINT}/quotes/latest?symbol=${unique}`,
      { headers },
    );
    return data?.data?.[(unique || "").toUpperCase()]?.[0]?.quote?.USD || {};
  } catch (err) {
    if (err instanceof AxiosError) {
      if (retryCount < MAX_RETRIES && err.response?.status !== 400) {
        await retrySleep(RETRY_DELAY * 2 ** retryCount); // Exponential backoff
        return fetchCoinDataWithRetry(
          account,
          chainId,
          token,
          symbol,
          retryCount + 1,
        );
      }
      if (
        err.response?.status === 429 ||
        err.response?.data?.status?.error_code === 1008
      ) {
        printError("Rate limited on", unique);
        return {};
      }
    }
    printError(
      "Issue fetching coin data for",
      unique,
      ":",
      getErrorMessage(err),
    );
    return {};
  }
};

interface GeckoResponse {
  market_data?: {
    current_price?: {
      usd?: number;
    };
    market_cap?: {
      usd?: number;
    };
    fully_diluted_valuation?: {
      usd?: number;
    };
  };
}

const fetchGeckoCoinDataWithRetry = async (
  account: string | undefined,
  chainId: ChainId | undefined,
  token: TokenInfo | undefined,
  retryCount = 1,
): Promise<CoinData> => {
  const printError = usePrintError(account);

  if (!token?.address || !token?.coingeckoId) {
    return {};
  }

  try {
    const response = await axios.get<GeckoResponse>(
      `${CGC_API_ENDPOINT}/coins/${token.coingeckoId}`,
      {
        headers: {
          "x-cg-pro-api-key": CGC_API_KEY,
        },
      },
    );

    // Safe access to possibly undefined data
    const price = response?.data?.market_data?.current_price?.usd;
    const market_cap = response?.data?.market_data?.market_cap?.usd;
    const fdv = response?.data?.market_data?.fully_diluted_valuation?.usd;

    const ret: CoinData = {};
    if (price) ret.price = price;
    if (market_cap) ret.market_cap = market_cap;
    if (fdv) ret.fully_diluted_market_cap = fdv;

    return Object.keys(ret).length > 0 ? ret : {};
  } catch (err) {
    if (err instanceof AxiosError) {
      // Rate limit handling
      if (
        err.response?.status === 429 ||
        err.response?.data?.status?.error_code === 1008
      ) {
        printError("Gecko rate limited on", token);
        return {};
      }

      // Retry logic for non-400 errors
      if (retryCount < MAX_RETRIES && err.response?.status !== 400) {
        await retrySleep(RETRY_DELAY * 2 ** retryCount); // Exponential backoff
        return fetchGeckoCoinDataWithRetry(
          account,
          chainId,
          token,
          retryCount + 1,
        );
      }
    }

    printError(
      "Issue fetching coin data from gecko for",
      token,
      ":",
      getErrorMessage(err),
    );
    return {};
  }
};

const fetchGeckoTerminalDataWithRetry = async (
  account: string | undefined,
  chainId: ChainId | undefined,
  token: TokenInfo | undefined,
  retryCount = 1,
): Promise<CoinData> => {
  const printError = usePrintError(account);
  if (!token || !token.address) return {};

  try {
    const { data } = await axios.get(
      `${CGC_API_ENDPOINT}/onchain/networks/${
        CoingeckoData.geckoIds[chainId as ChainId]
      }/tokens/${token.address}`,
      { headers: { "x-cg-pro-api-key": CGC_API_KEY } },
    );
    const ret: CoinData = {};
    const price = data?.data?.attributes?.price_usd;
    const market_cap = data?.data?.attributes?.market_cap_usd;
    const fdv = data?.data?.attributes?.fdv_usd;
    if (price) ret.price = price;
    if (market_cap) ret.market_cap = market_cap;
    if (fdv) ret.fully_diluted_market_cap = fdv;
    return price || market_cap || fdv ? ret : {};
  } catch (err) {
    if (err instanceof AxiosError) {
      if (retryCount < MAX_RETRIES && err.response?.status !== 400) {
        await retrySleep(RETRY_DELAY * 2 ** retryCount); // Exponential backoff
        return fetchGeckoTerminalDataWithRetry(
          account,
          chainId,
          token,
          retryCount + 1,
        );
      }
      if (
        err.response?.status === 429 ||
        err.response?.data?.status?.error_code === 1008
      ) {
        printError("Terminal rate limited on", token);
        return {};
      }
    }
    printError(
      "Issue fetching coin data from terminal for",
      token,
      ":",
      getErrorMessage(err),
    );
    return {};
  }
};

const fetchGeckoTerminalPoolDataWithRetry = async (
  account: string | undefined,
  chainId: ChainId | undefined,
  token: TokenInfo | undefined,
  retryCount = 1,
) => {
  const printError = usePrintError(account);
  if (!token || !token.address) return {};

  try {
    const { data } = await axios.get(
      `${CGC_API_ENDPOINT}/onchain/search/pools?query=${token.address}&page=1`,
      { headers: { "x-cg-pro-api-key": CGC_API_KEY } },
    );
    const ret: CoinData = {};
    let price: number | undefined;
    let market_cap: number | undefined;
    let fdv: number | undefined;
    for (let i = 0; i < data.data.length; i++) {
      const id = data.data[i]?.id?.split("_")[0];
      if (id === CoingeckoData.geckoIds[chainId as ChainId]) {
        price = data.data[i]?.attributes?.base_token_price_usd;
        market_cap = data.data[i]?.attributes?.market_cap_usd;
        fdv = data.data[i]?.attributes?.fdv_usd;
      }
    }
    if (price) ret.price = price;
    if (market_cap) ret.market_cap = market_cap;
    if (fdv) ret.fully_diluted_market_cap = fdv;
    return price || market_cap || fdv ? ret : {};
  } catch (err) {
    if (err instanceof AxiosError) {
      if (retryCount < MAX_RETRIES && err.response?.status !== 400) {
        await retrySleep(RETRY_DELAY * 2 ** retryCount); // Exponential backoff
        return fetchGeckoTerminalPoolDataWithRetry(
          account,
          chainId,
          token,
          retryCount + 1,
        );
      }
      if (
        err.response?.status === 429 ||
        err.response?.data?.status?.error_code === 1008
      ) {
        printError("Terminal pool rate limited on", token);
        return {};
      }
    }
    printError(
      "Issue fetching coin data from terminal pool for",
      token,
      ":",
      getErrorMessage(err),
    );
    return {};
  }
};

const fetchDefiLlamaCoinDataWithRetry = async (
  account: string | undefined,
  chainName: string | undefined,
  token: TokenInfo | undefined,
  retryCount = 1,
) => {
  const printError = usePrintError(account);
  if (!token || !token.address) return {};

  try {
    let key: string;
    if (token.coingeckoId) {
      try {
        key = `coingecko:${token.coingeckoId}`;
        const { data } = await axios.get(
          `https://coins.llama.fi/prices/current/${key}`,
        );
        if (data.coins[key]) {
          return { price: data.coins[key].price };
        }
      } catch {
        /* empty */
      }
    }
    key = `${chainName}:${token.address}`;
    const { data } = await axios.get(
      `https://coins.llama.fi/prices/current/${key}`,
    );
    return data.coins[key] ? { price: data.coins[key].price } : {};
  } catch (err) {
    if (err instanceof AxiosError) {
      if (retryCount < MAX_RETRIES && err.response?.status !== 400) {
        await retrySleep(RETRY_DELAY * 2 ** retryCount); // Exponential backoff
        return fetchDefiLlamaCoinDataWithRetry(
          account,
          chainName,
          token,
          retryCount + 1,
        );
      }
      if (
        err.response?.status === 429 ||
        err.response?.data?.status?.error_code === 1008
      ) {
        printError("Defillama coins rate limited on", token);
        return {};
      }
    }
    printError(
      "Issue fetching coin data from terminal pool for",
      token,
      ":",
      getErrorMessage(err),
    );
    return {};
  }
};

const fetchNotFoundTokenI = async (
  chainId: ChainId,
  symbol: string,
  extraInfo: JSONObject,
  retryCount = 1,
) => {
  try {
    let page = 1;
    while (true) {
      const network = CoingeckoData.geckoIds[chainId];
      const {
        data: { data },
      } = await axios.get(
        `${CGC_API_ENDPOINT}/onchain/search/pools?query=${symbol}&network=${network}&page=${page}`,
        { headers: { "x-cg-pro-api-key": CGC_API_KEY } },
      );

      data.sort(
        (
          a: {
            attributes: {
              reserve_in_usd?: string;
            };
          },
          b: {
            attributes: {
              reserve_in_usd?: string;
            };
          },
        ) =>
          Number(b.attributes.reserve_in_usd || 0) -
          Number(a.attributes.reserve_in_usd || 0),
      );

      for (let i = 0; i < data.length; i++) {
        const address = data[i].relationships.base_token.data.id.split("_")[1];
        const chainName = getChainNameFromId(chainId);
        const tokenInfo = await getTokenFromOnChain(address, chainName);
        if (
          tokenInfo?.symbol.toLowerCase() !== symbol?.toLowerCase() &&
          tokenInfo?.address?.toLowerCase() !== symbol?.toLowerCase()
        ) {
          continue;
        }
        if (chainId !== 101) {
          if (
            extraInfo.liquidityThreshold &&
            Number(data[i].attributes.reserve_in_usd || 0) <
              extraInfo.liquidityThreshold
          ) {
            if (extraInfo.provider && extraInfo.account) {
              const { amount } = await getTokenAmount(
                extraInfo.provider,
                tokenInfo,
                extraInfo.account,
              );
              if (amount > 0n) {
                return tokenInfo;
              }
            }
            continue;
          }
        }
        return tokenInfo;
      }
      page++;
      await sleep(1);
      if (data.length < 20) break;
    }
    return null;
  } catch (err) {
    if (err instanceof AxiosError) {
      if (retryCount < MAX_RETRIES && err.response?.status !== 400) {
        await retrySleep(RETRY_DELAY * 2 ** retryCount); // Exponential backoff
        return fetchNotFoundTokenI(chainId, symbol, extraInfo, retryCount + 1);
      }
      if (
        err.response?.status === 429 ||
        err.response?.data?.status?.error_code === 1008
      ) {
        sfConsoleError("Not found token rate limited on", symbol);
        return null;
      }
    }
    sfConsoleError(
      "Error fetching not found token for",
      symbol,
      ":",
      getErrorMessage(err),
    );
    return null;
  }
};

export const fetchNotFoundToken = memoizeWithExpiration(
  fetchNotFoundTokenI,
  TTL_3_HOURS,
);

const updateCacheForKey = (unique: string, key: string, value: number) => {
  if (value > 0) {
    if (!COIN_CACHE[unique]) COIN_CACHE[unique] = {};
    COIN_CACHE[unique] = {
      ...COIN_CACHE[unique],
      [key]: value,
      timestamp: getCurrentTimestamp(),
    };
  }
};

const invalidateCache = (cacheSymbol: string): CoinCache | undefined => {
  const cache = COIN_CACHE[cacheSymbol];
  if (cache) {
    const currentTimestamp = getCurrentTimestamp();
    const cacheWindow = cache.not_found ? NOT_FOUND_CACHE_WINDOW : CACHE_WINDOW;
    if (cache.timestamp && cache.timestamp + cacheWindow >= currentTimestamp) {
      return cache;
    }
  }
  COIN_CACHE[cacheSymbol] = undefined;
};

export const getCoinData = async (
  account: string | undefined,
  symbol_: string | undefined,
  chainId: ChainId | undefined,
  throwError = true,
  withAddress = false,
) => {
  if (symbol_ === undefined) return <CoinCache>{ not_found: 1 };
  let symbol = symbol_;
  const printError = usePrintError(account);
  if (
    chainId?.toString() === "137" &&
    (symbol?.toLowerCase() === "matic" ||
      symbol === "0x0000000000000000000000000000000000000000")
  ) {
    symbol = "0x0000000000000000000000000000000000001010";
  } else {
    symbol = symbol.toLowerCase();
  }

  const chainName = chainId ? getChainNameFromId(chainId) : undefined;
  const provider =
    chainId && getRpcUrlForChain(+chainId)
      ? new RetryProvider(getRpcUrlForChain(+chainId), +chainId)
      : undefined;
  const token = await getTokenInfoForChain(symbol, chainName, false, {
    account,
    provider,
  });
  const unique = (token?.id ?? symbol).toString();

  const buildResponse = <T>(ret: T): T & { address?: string } =>
    withAddress
      ? { ...ret, address: token?.address?.toLowerCase() }
      : { ...ret, address: undefined };

  let cache = invalidateCache(unique);
  if (cache) return buildResponse(cache);

  const price = await fetchOnchainPrice(
    account,
    token?.coinmarketcapId ?? token?.coingeckoId ?? token?.symbol ?? symbol,
  );
  updateCacheForKey(unique, "price", price);

  const fetchCoinDataCalls = [
    () => fetchGeckoCoinDataWithRetry(account, chainId, token),
    () => fetchGeckoTerminalDataWithRetry(account, chainId, token),
    () => fetchCoinDataWithRetry(account, chainId, token, symbol),
    () => fetchGeckoTerminalPoolDataWithRetry(account, chainId, token),
    () => fetchDefiLlamaCoinDataWithRetry(account, chainName, token),
  ];

  for (let i = 0; i < fetchCoinDataCalls.length; i++) {
    const data = await fetchCoinDataCalls[i]();
    updateCacheForKey(unique, "price", data.price || -1);
    updateCacheForKey(unique, "market_cap", data.market_cap || -1);
    updateCacheForKey(unique, "fdv", data.fully_diluted_market_cap || -1);
    cache = COIN_CACHE[unique];
    if (cache) {
      return buildResponse(cache);
    }
  }

  updateCacheForKey(unique, "not_found", 1);

  // skip logging error for certain tokens
  if (
    !ignoreTokenList.some(
      (item) =>
        item.chainId === `${chainId}` &&
        item.tokenName.toLowerCase() === token?.address?.toLowerCase(),
    )
  ) {
    printError(`token not found: ${JSON.stringify(token, null, 2)}`);
  }
  if (throwError) {
    throw new Error(
      `No coin data found for symbol ${symbol} on ${chainName}. Please try again!`,
    );
  }

  return buildResponse(COIN_CACHE[unique]);
};

export const getCurrentTimestamp = () => {
  return Math.floor(Date.now() / 1000);
};

const deepEqual = (object1: unknown, object2: unknown): boolean => {
  const keys = Object.keys(object1 as Record<string, unknown>);

  for (const key of keys) {
    const val1 = (object1 as Record<string, unknown>)[key];
    const val2 = (object2 as Record<string, unknown>)[key];
    const areObjects = isObject(val1) && isObject(val2);
    if (
      (areObjects && !deepEqual(val1, val2)) ||
      (!areObjects && val1 !== val2)
    ) {
      return false;
    }
  }

  return true;
};

function isObject(object: unknown): boolean {
  return object != null && typeof object === "object";
}

export const sleep = async (seconds: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });
};

const userNoFees = [
  "0xa5ef861278d7bf18a8a2068a01d66fbded93a1bd",
  "0x024cdb696a719f37b324a852085a68786d269212",
  "0x0666e6252a6bc3a4a186ed2e004643d7f2418b57",
  "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d",
  "0x28129f5b8b689edcb7b581654266976ad77c719b",
  "0x5a22c1ee7b2f8a4886703d18d46002dc5021d2eb",
  "0x6dfbfa4ab2890dec904a29da24a0b2c07ebb646b",
  "0x6e401f434f9d33566bfbd91876137dd73f66ef41",
  "0x55d5b91fdbec14d372b3a79fb1a13d8e26b169ed",
  "0x5337122c6b5ce24d970ce771510d22aeaf038c44",
  "0x9f90a3c2c1938f248241414754d977b897fb3fc5",
  "0x3bd4c721c1b547ea42f728b5a19eb6233803963e",
  "0x4f4118cf9aa8be66fc093912ca609db93e6cdfec",
  "0x72ab348092ec9e11cce247e3c94a9d3531e6ac37",
  "0xf8cf78f582304b16ffd9bd323628c22e4c1d1d20",
  "0x96570D876585c77565E3159B9a58f1128af36c42".toLowerCase(),
]; // to prevent dev team from paying fees

export const getOwedFee = async (user: string) => {
  const printError = usePrintError(user);

  try {
    if (userNoFees.includes(user.toLowerCase())) {
      return { success: true, fee: 0, message: "" };
    } // to prevent dev team from paying fees

    const userHistories = await Histories.findAll({
      where: {
        useraddress: user.toLowerCase(),
        [Op.or]: [{ totalfees: { [Op.gt]: 0 } }, { paidfees: { [Op.gt]: 0 } }],
      },
      raw: true,
    });

    let totalFeesSum = 0;
    let paidFeesSum = 0;
    // Calculate the sum of totalfees and paidfees
    for (const history of userHistories) {
      totalFeesSum += Number(history.totalfees || 0);
      paidFeesSum += Number(history.paidfees || 0);
    }
    // Calculate the balance (sum of totalfees minus sum of paidfees)
    const fee = Math.max(0, totalFeesSum - paidFeesSum);
    const message = "";
    return { success: true, fee, message };
  } catch (err) {
    printError(err);
    return { success: false, fee: -1, message: err };
  }
};

// Separate the balance checking logic into its own function
export const findHighestEthBalance = async (
  rpcs: Record<string, string>,
  account: string,
) => {
  const printError = usePrintError(account);

  let maxBalance = 0n;
  let maxBalanceChainName: string | undefined;

  const balancePromises = EntityData.chains.map(async (cn) => {
    if (cn === "Solana") return;

    try {
      const chainId = getChainIdFromName(cn);
      if (!chainId) {
        throw new Error(getChainError(cn));
      }
      const nativeSymbol = getNativeTokenSymbolForChain(chainId);
      if (nativeSymbol !== "ETH" || chainId === 1) {
        return null;
      }

      const rpcUrl = rpcs?.[chainId] || getRpcUrlForChain(chainId);
      const provider = new RetryProvider(rpcUrl, chainId);
      const balance = await withRetry(account, () =>
        provider.getBalance(account),
      );

      return { chainName: cn.toLowerCase(), balance };
    } catch (e) {
      printError("highest balance", e);
      return null;
    }
  });

  const results = await Promise.all(balancePromises);

  for (const result of results) {
    if (result && result.balance > maxBalance) {
      maxBalance = result.balance;
      maxBalanceChainName = result.chainName;
    }
  }

  return { maxBalance, maxBalanceChainName };
};

export const getNativeFee = async (
  account: string,
  usdFee: number,
  rpcs: Record<string, string>,
  testPrice = 0,
) => {
  const printError = usePrintError(account);

  try {
    const { maxBalance, maxBalanceChainName } = await findHighestEthBalance(
      rpcs,
      account,
    );
    const ethPrice =
      testPrice || (await getCoinData(account, "eth", 1, false))?.price;

    if (!ethPrice || ethPrice <= 0) {
      printError("Invalid ETH price", ethPrice, usdFee);
      const errorMsg =
        "Error fetching ETH price while calculating accumulated fees.";
      return { success: false, fee: -1, message: errorMsg };
    }

    const fee = (usdFee / ethPrice).toFixed(18);
    if (maxBalanceChainName && maxBalance > ethers.parseEther(fee)) {
      return { success: true, fee, chainName: maxBalanceChainName };
    }
    const errorMsg = "No suitable chain found with sufficient balance";
    printError(
      errorMsg,
      maxBalanceChainName,
      maxBalance,
      ethers.parseEther(fee),
    );
    return { success: false, fee: -1, message: errorMsg };
  } catch (error) {
    const errorMsg = `Error while calculating accumulated fees: ${getErrorMessage(
      error,
    )}`;
    printError(errorMsg);
    return { success: false, fee: -1, message: errorMsg };
  }
};

export const getFeeTx = async (accountAddress: string, rpcs = {}) => {
  const printLog = usePrintLog(accountAddress);
  const printError = usePrintError(accountAddress);

  if (!accountAddress || !ethers.isAddress(accountAddress)) {
    printError(
      "Error getting fee transaction. Invalid account address provided.",
    );
    return {
      status: "Error getting fee transaction.",
      message: "Invalid account address provided.",
    };
  }

  try {
    const { success, fee, message } = await getOwedFee(accountAddress);
    if (!success || fee === -1) {
      printError(`Error getting owed fee. ${message}`);
      return { status: "Error getting owed fee.", message };
    }
    const usdFee = fee / 1e6;
    printLog("usdFee", accountAddress, usdFee);
    // $2.5 is the minimum fee at any given time
    if (usdFee < 2.5) {
      return { status: "success", transactions: [], chainName: "" };
    }
    const {
      success: nativeSuccess,
      fee: nativeFee,
      message: nativeMessage,
      chainName,
    } = await getNativeFee(accountAddress, usdFee, rpcs);
    if (!nativeSuccess) {
      printError(`Error getting native fee. ${nativeMessage}`);
      return { status: "Error getting native fee.", message: nativeMessage };
    }
    const transactions = [
      {
        to: "0x7B15f2B26C25e1815Dc4FB8957cE76a0C5319582",
        value: nativeFee,
      },
    ];
    return { status: "success", transactions, chainName };
  } catch (err) {
    printLog("Error getting fee transaction.");
    printError(err);
    return { status: "Error getting fee transaction.", message: err };
  }
};

export const updateOwedFee = async (accountAddress: string, test = false) => {
  const printLog = usePrintLog(accountAddress);
  const printError = usePrintError(accountAddress);

  const userHistories = await Histories.findAll({
    where: { useraddress: accountAddress.toLowerCase() },
    raw: true,
  });

  const histories = userHistories.sort((a, b) => a.timestamp - b.timestamp);
  let totalFeesChanges = 0;
  let paidFeesChanges = 0;

  /* eslint-disable no-await-in-loop */
  for (let i = 0; i < histories.length; i++) {
    const history = histories[i];

    // for each uncalculated fee, runFeeCalculations
    if (history.totalfees === null) {
      // code that filters and adjusts for fee payments
      let paidfees = 0;
      if (history.actions[history.actions.length - 1].name === "fee") {
        for (let j = i - 1; j >= 0; j--) {
          // calculates the value of all historical fees paid off in this transaction
          paidfees += histories[j].totalfees;
          if (histories[j].paidfees) {
            // break if we find a paidfees which implies that all prior transactions are already paid off
            break;
          }
        }
        history.actions.splice(-1); // delete the last element of the actions array
      }

      history.paidfees = paidfees;
      let totalfees = 0;
      let chainName = "ethereum";
      if (!history.actions.length) {
        // sets fee to 0 if the only transaction was a fee payment
        // do nothing
      } else {
        if (history.actions[0].chainName) {
          chainName = history.actions[0].chainName;
        }
        try {
          if (test) {
            totalfees = 30;
          } else {
            totalfees = await runFeeCalculations(
              accountAddress,
              history.actions,
              history.conditions,
              chainName,
              Math.floor(history.timestamp / 1000),
            );
            totalfees = Math.floor(totalfees * 1e6);
            if (totalfees > 100000000) {
              printLog("new totalfees error", totalfees);
            } else {
              printLog("new totalfees", totalfees);
            }
          }
        } catch (err) {
          printError("run fee calc error", err);
          totalfees = 0;
        }
      }
      totalFeesChanges += totalfees;
      paidFeesChanges += paidfees;
      history.totalfees = totalfees;

      try {
        let updateSuccess: boolean;
        let updateMessage: string;
        if (test) {
          updateSuccess = true;
          updateMessage = "Success";
        } else {
          const updateResult = await updateHistoryFees(
            accountAddress,
            history.id,
            history.totalfees,
            history.paidfees,
          );
          updateSuccess = updateResult.success;
          updateMessage = updateResult.message;
        }
        if (!updateSuccess) {
          printError(updateMessage);
          return { success: false, message: updateMessage };
        }
      } catch (err) {
        printError(err);
        return { success: false, message: err };
      }
    }
  }

  return { success: true, message: { totalFeesChanges, paidFeesChanges } };
};

export const updateHistoryFees = async (
  accountAddress: string,
  historyId: number,
  totalfees: number,
  paidfees: number,
) => {
  const printError = usePrintError(accountAddress);

  try {
    const history = await Histories.findOne({
      where: {
        id: historyId,
        useraddress: accountAddress.toLowerCase(),
      },
    });

    if (!history) {
      printError(`History does not exist ${accountAddress} ${historyId}`);
      return { success: false, message: "History does not exist" };
    }

    history.set("totalfees", totalfees);
    history.set("paidfees", paidfees);
    await history.save();

    return { success: true };
  } catch (err) {
    printError(err);
    return { success: false, message: getErrorMessage(err) };
  }
};

// global fee dictionary
export const fees: Record<string, number> = {
  transfer: 0,
  swap: 0.0035,
  bridge: 0.0035,
  deposit: 0,
  withdraw: 0,
  claim: 0.0035,
  borrow: 0.0035,
  lend: 0.0035,
  repay: 0.0035,
  stake: 0.0035,
  unstake: 0.0035,
  long: 0.0035,
  short: 0.0035,
  close: 0.0035, // close doesn't calculate tvl properly so fees dont get charged for it
  lock: 0.0035,
  unlock: 0.0035,
  vote: 0,
  loop: 0,
  condition: 0.01,
  time: 0.01,
  gas: 0.0025,
  2: 0.005,
  3: 0.0075,
  4: 0.01,
  5: 0.0125,
};

// add keys and values to the transactions list in a standardized format
export async function cleanTransactions(
  account: string,
  rawTransactions: CleanedAction[],
  connectedChainName: string,
  timestamp: number,
  test = false,
) {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);

  // printLog(1, JSON.stringify(rawTransactions, null, 2));
  const tempTransactions: CleanedAction[] = JSON.parse(
    JSON.stringify(rawTransactions),
  ); // deep copy
  const transactions = tempTransactions.filter(
    (transaction) =>
      transaction &&
      transaction.name !== "fee" &&
      transaction.name !== "notification",
  ); // removes fees and notifications from transactions
  /* eslint-disable no-await-in-loop */
  for (let idx = 0; idx < transactions.length; idx++) {
    // classifies by type
    if (transactions[idx].name === "vote") {
      transactions[idx].type = "vote";
    } else if (["swap", "long", "short"].includes(transactions[idx].name)) {
      transactions[idx].type = "trade";
    } else {
      transactions[idx].type = "regular";
    }

    // standardizes chain
    if (transactions[idx].name === "bridge") {
      transactions[idx].chain1 = transactions[idx].args.sourceChainName;
    } else if (
      ["regular", "trade", "vote"].includes(transactions[idx].type || "")
    ) {
      transactions[idx].chain1 = transactions[idx].args.chainName;
    }
    if (!transactions[idx].chain1 && idx === 0) {
      transactions[idx].chain1 = connectedChainName; // sets chain to connectedChainName
    } else if (!transactions[idx].chain1) {
      transactions[idx].chain1 = transactions[idx - 1].chain1; // sets chain to previous transaction's chain
    }

    // standardized token
    if (transactions[idx].type === "regular") {
      if (rawTransactions[idx].args.token && rawTransactions[idx].args.amount) {
        transactions[idx].token1 = rawTransactions[idx].args.token;
        transactions[idx].amount1 = rawTransactions[idx].args.amount;
      } else if (
        rawTransactions[idx].args.inputToken &&
        rawTransactions[idx].args.inputAmount
      ) {
        transactions[idx].token1 = rawTransactions[idx].args.inputToken;
        transactions[idx].amount1 = rawTransactions[idx].args.inputAmount;
      }
    } else if (transactions[idx].type === "trade") {
      if (
        (rawTransactions[idx].args.inputToken === "eth" ||
          rawTransactions[idx].args.inputToken === "weth" ||
          rawTransactions[idx].args.inputToken === "usdc" ||
          rawTransactions[idx].args.inputToken === "usdc.e") &&
        rawTransactions[idx].args.inputAmount
      ) {
        transactions[idx].token1 = rawTransactions[idx].args.inputToken;
        transactions[idx].amount1 = rawTransactions[idx].args.inputAmount;
        // if (
        // typeof transactions[idx].amount1 === "object" &&
        // transactions[idx].amount1 !== null &&
        // !Array.isArray(transactions[idx].amount1)
        // ) {
        // if (transactions[idx].amount1 && "hex" in transactions[idx].amount1) {
        // transactions[idx].amount1 =
        // rawTransactions[idx].body.inputAmount;
        // }
        // }
      } else if (
        (rawTransactions[idx].args.outputToken === "eth" ||
          rawTransactions[idx].args.outputToken === "weth") &&
        rawTransactions[idx].args.outputAmount
      ) {
        transactions[idx].token1 = rawTransactions[idx].args.outputToken;
        transactions[idx].amount1 = rawTransactions[idx].args.outputAmount;
        // if (
        // typeof transactions[idx].amount1 === "object" &&
        // transactions[idx].amount1 !== null &&
        // !Array.isArray(transactions[idx].amount1)
        // ) {
        // if (transactions[idx].amount1 && typeof transactions[idx].amount1 !== "string" && "hex" in transactions[idx].amount1) {
        // transactions[idx].amount1 =
        // rawTransactions[idx].body.outputAmount;
        // }
        // }
      } else if (
        rawTransactions[idx].args.inputToken &&
        rawTransactions[idx].args.inputAmount
      ) {
        transactions[idx].token1 = rawTransactions[idx].args.inputToken;
        transactions[idx].amount1 = rawTransactions[idx].args.inputAmount;
        // if (
        // typeof transactions[idx].amount1 === "object" &&
        // transactions[idx].amount1 !== null &&
        // !Array.isArray(transactions[idx].amount1) &&
        // "hex" in (transactions[idx].amount1 as JSONObject)
        // ) {
        // transactions[idx].amount1 =
        // rawTransactions[idx].body.inputAmount;
        // }
      } else if (
        rawTransactions[idx].args.outputToken &&
        rawTransactions[idx].args.outputAmount
      ) {
        transactions[idx].token1 = rawTransactions[idx].args.outputToken;
        transactions[idx].amount1 = rawTransactions[idx].args.outputAmount;
        // if (
        // typeof transactions[idx].amount1 === "object" &&
        // transactions[idx].amount1 !== null &&
        // !Array.isArray(transactions[idx].amount1) &&
        // "hex" in (transactions[idx].amount1 as JSONObject)
        // ) {
        // transactions[idx].amount1 =
        // rawTransactions[idx].body.outputAmount;
        // }
      }
    } else {
      transactions[idx].token1 = null;
      transactions[idx].amount1 = 0;
    }

    // runs dependency check
    try {
      if (test === true) {
        transactions[idx].dependent = true;
      } else {
        transactions[idx].dependent = isDependent(transactions, idx);
      }
    } catch (err) {
      printLog(
        "cleanTransactions: Error checking dependency for transaction: ",
        transactions[idx],
      );
      printError(err);
      transactions[idx].dependent = true;
    }

    // gets price
    transactions[idx].price = await getTokenPrice(
      transactions[idx],
      test,
      account,
      timestamp,
      printLog,
      printError,
    );
    // printLog(idx, transactions[idx].amount1, transactions[idx].price);
    // consider amount units
    const amountUnits =
      rawTransactions[idx].args.amount_units ||
      rawTransactions[idx].args.inputAmountUnits;
    if (amountUnits) {
      let amountForUsd: number | undefined = transactions[idx]
        .amount1 as number;
      const chainId = getChainIdFromName(transactions[idx].chain1);
      if (amountUnits !== "usd") {
        const cc = await getCoinData(account, amountUnits, chainId);
        if (cc.price && amountForUsd) amountForUsd *= cc.price;
        else amountForUsd = undefined;
      }
      transactions[idx].amount1 = (
        (amountForUsd || 0) / transactions[idx].price
      ).toString();
    }

    // replaces outputAmount, turns all amounts into floats
    if (transactions[idx].amount1 === undefined && idx > 0) {
      transactions[idx].amount1 = "outputAmount";
    } else if (transactions[idx].amount1 === undefined && idx === 0) {
      transactions[idx].amount1 = "all";
    }

    const amountStr = String(transactions[idx].amount1).toLowerCase();
    if (
      amountStr === "outputamount" ||
      amountStr === "half" ||
      amountStr === "all" ||
      Number.parseFloat(amountStr) === 0
    ) {
      try {
        const balanceChanges = transactions[idx].balanceChanges;
        // printLog(4, balanceChanges);
        if (balanceChanges) {
          const chainId = Object.keys(balanceChanges)[0];
          const tokenChanges = balanceChanges[chainId];

          const extractedData = Object.entries(tokenChanges).map(
            ([token, amount]) => ({
              token,
              amount,
            }),
          );
          transactions[idx].amount1 =
            extractedData.find(
              (item) => item.token === transactions[idx].token1,
            )?.amount || 0;
          if (extractedData.length > 2) {
            transactions[idx].amount1 = (
              Number.parseFloat(transactions[idx].amount1 as string) * 2
            ).toString();
          }
        }
      } catch (e) {
        printError(
          "cleanTransactions: Error finding outputAmount for transaction: ",
          transactions[idx],
          e,
        );
        transactions[idx].amount1 = 0;
      }
    }
    // printLog(3, idx, transactions[idx].amount1);
    transactions[idx].amount1 = Math.abs(
      Number.parseFloat(transactions[idx].amount1 as string),
    );
  }
  return transactions;
}

const getTokenPrice = async (
  tx: JSONObject,
  test: boolean,
  account: string,
  timestamp: number,
  printLog: (...args: unknown[]) => void,
  printError: (...args: unknown[]) => void,
) => {
  if (["regular", "trade"].includes(tx.type)) {
    try {
      if (test === true) {
        return 100;
      }
      const price = (
        await getCoinData(
          account,
          tx.token1,
          getChainIdFromName(tx.chain1 || "ethereum"),
        )
      )?.price;
      if (!price) {
        printLog(
          "cleanTransactions error: Missing price: ",
          tx.token1,
          timestamp,
          tx.price,
          tx.chain1,
        );
        return 0;
      }
      return price;
    } catch (err) {
      printLog(
        "cleanTransactions: Error getting price for token: ",
        tx.token1,
        " on chain: ",
        tx.chain1,
      );
      printError(err);
      return 0;
    }
  } else {
    return 0;
  }
};

/**
 * Checks whether the current transaction is dependent on the prior transaction. Defaults to dependency unless conditions are met for independency.
 *
 * @param {Array} transactions - Transactions where each transaction is a dictionary.
 * @param {number} idx - ID of the current transaction being tested.
 * @returns {boolean} True if the transaction is dependent, False if it is independent.
 */
export function isDependent(transactions: JSONObject[], idx: number): boolean {
  if (idx === 0) {
    return false;
  } // first transaction is always independent

  const previousTransaction = transactions[idx - 1];
  if (previousTransaction.name === "transfer") {
    return false;
  } // transfers are always independent

  // if the previous transaction is a trade, check if the current token is the same as the output token of the previous transaction
  if (previousTransaction.type === "trade") {
    const outputTokenCapitalized = previousTransaction.args.outputToken;
    const outputTokenLowercase = previousTransaction.args.outputtoken;
    const currentToken = transactions[idx].token1;

    if (outputTokenCapitalized && currentToken !== outputTokenCapitalized) {
      return false;
    }

    if (outputTokenLowercase && currentToken !== outputTokenLowercase) {
      return false;
    }
  }

  return true;
}

/**
 * Gets the total tvls of the sub-sets of the transaction set.
 *
 * @param {Array} transactions - Transactions where each transaction is a dictionary.
 * @returns {number} Tvl of transaction sets in USD terms.
 */
export function calcTvl(
  account: string | undefined,
  transactions: JSONObject[],
) {
  const printLog = usePrintLog(account);

  let tvl = 0;

  // Determine fee take points.
  for (let idx = 0; idx < transactions.length; idx++) {
    const t = transactions[idx];
    // printLog(5, t.amount1, t.price);
    const typ = t.type;
    const { price } = t;

    // Calculate tvl of a string of transactions.
    if (typ === "trade" || typ === "regular") {
      if (t.dependent) {
        tvl = Math.max(tvl, Math.abs(t.amount1) * price);
      } else {
        tvl += Math.abs(t.amount1) * price;
      }
    }
  }

  // Check for negative, undefined, null, or error values and return 0 in those cases.
  if (tvl < 0 || isNaNValue(tvl) || tvl === undefined || tvl === null) {
    printLog("calcTvl: Error calculating tvl.", tvl);
    return 0;
  }

  return tvl;
}

// Main function that runs the fee calculations
export async function runFeeCalculations(
  account: string,
  rawTransactions: Call[],
  rawConditions: Call[],
  connectedChainName: string,
  timestamp: number,
  test = false,
) {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);

  let transactions: JSONObject[];
  try {
    transactions = await cleanTransactions(
      account,
      rawTransactions as CleanedAction[],
      connectedChainName,
      timestamp,
      test,
    );
  } catch (err) {
    printLog("runFeeCalculations, error cleaning transactions.");
    printError(err);
    return 0;
  }
  // printLog(1, transactions);

  const tvl = calcTvl(account, transactions);
  if (tvl === 0) {
    printError("runFeeCalculations, error, 0 tvl, returning 0 fee.");
    return 0;
  }
  // printLog(2, tvl);

  const MAX_TVL_FOR_DISCOUNT = 0;
  const DISCOUNT_FEE = 0;
  const CHAIN_FOR_DISCOUNT = "ethereum";
  // apply growth pipeline discount
  if (
    tvl < MAX_TVL_FOR_DISCOUNT &&
    connectedChainName === CHAIN_FOR_DISCOUNT &&
    !test
  ) {
    printLog(
      "Discounted fee applied.",
      "tvl: ",
      tvl,
      "connectedChainName: ",
      connectedChainName,
    );
    return DISCOUNT_FEE;
  }

  // adds a combination multiplier based on the number of 'actual' transactions in the transaction combo
  let conditionCounter = 0;
  let timeCounter = 0;
  let gasCounter = 0;
  let actionCounter = 0;
  let actionFeesUsd = 0;

  // condition and time counter
  for (let idx = 0; idx < rawConditions.length; idx++) {
    const c = rawConditions[idx];
    if (c.name === "condition") {
      if (c.args.subject === "gas") {
        gasCounter += 1;
      } else {
        conditionCounter += 1;
      }
    } else if (c.name === "time") {
      timeCounter += 1;
    }
  }

  for (let idx = 0; idx < transactions.length; idx++) {
    const t = transactions[idx];
    actionFeesUsd += fees[t.name] * t.price * t.amount1;
    actionCounter += 1;
  }

  let globalAdditiveFeePercentage = 0;
  if (actionCounter > 5) {
    globalAdditiveFeePercentage += fees["5"];
  } else if (actionCounter < 2) {
    // do nothing
  } else {
    globalAdditiveFeePercentage += fees[String(actionCounter)];
  }
  globalAdditiveFeePercentage +=
    fees.condition * conditionCounter +
    fees.time * timeCounter +
    fees.gas * gasCounter;

  // printLog(actionCounter, conditionCounter, timeCounter, gasCounter, globalAdditiveFeePercentage, tvl, actionFeesUsd);
  return globalAdditiveFeePercentage * tvl + actionFeesUsd;
}

// Recognize protocol names and if it's invalid, get associated names
export const validateProtocolNames = async <T extends SimAction | RawAction>(
  account: string,
  actions: T[],
) => {
  // Action names that don't require protocol name
  const printError = usePrintError(account);

  return Promise.all(
    actions.map(async (action, i) => {
      const chainName = action.args[getChainKey(action.name)];

      // Skip when the action doesn't require protocol name
      if (nonProtocolNames.includes(action.name)) {
        return action;
      }
      let protocolName = action.args.protocolName?.toLowerCase() || "";
      const poolName = action.args.poolName?.toLowerCase() || "";

      // If protocol name is empty, it use previous protocol name
      if (action.args.protocolName === "") {
        throw new Error(
          "Protocol is missing. Please specify a protocol in your next prompt!",
        );
      }
      if (!protocolName) {
        if (i > 0) {
          protocolName = actions[i - 1].args.protocolName || "";
        } else if (poolName.match(/^(yt|pt|sy)-(\w+)(-(.+))?$/)) {
          protocolName = "pendle";
        } else {
          protocolName = "all";
        }
      }
      actions[i].args.protocolName = protocolName;

      if (protocolName === "rocket pool") {
        protocolName = "rocketpool";
      }

      // Skip if protocol name is 'all' or valid
      if (protocolName === "all" || protocolName in ProtocolActions) {
        return action;
      }

      try {
        const chainId = getChainIdFromName(chainName);
        if (!chainId) {
          throw new Error(getChainError(chainName || ""));
        }
        const debankChainId = DebankData.chainIds[chainId];

        // Get token data from symbol
        // We assume that the protocol name is token symbol
        const tokenData = await getTokenInfoForChain(protocolName, chainName);

        // Get token data from debank to get associated protocol name
        const {
          data: { protocol_id: protocolId },
        } = await withRetry(account, () =>
          axios.get(
            `${DEBANK_API}/token?chain_id=${debankChainId}&id=${tokenData?.address}`,
            { headers: { AccessKey: process.env.DEBANK_ACCESS_KEY } },
          ),
        );
        protocolName = protocolId;

        if (!(protocolName in ProtocolActions)) {
          // Remove numbers from the protocol name
          // Protocol names have version numbers on debank
          // For example, aave2, aave3 for Aave V2, Aave V3
          protocolName = protocolName
            .replace(/\d+/g, "")
            .replace(`${debankChainId}_`, "");
          if (protocolName === "x") protocolName = "0x";

          // If it still invalid, throw an error
          if (!(protocolName in ProtocolActions)) {
            throw new Error(
              getUnsupportedProtocolError(protocolName, action.name),
            );
          }
        }

        actions[i].args.protocolName = protocolName;
      } catch (err) {
        printError(getErrorMessage(err));
        throw new Error(getUnsupportedProtocolError(protocolName, action.name));
      }
      return action;
    }),
  );
};

export const getOutputToken = (action: RawAction) => {
  if (
    action.args.protocolName?.toLowerCase() === "hyperliquid" &&
    action.name === "close"
  ) {
    return "usdc";
  }
  return action.args.outputToken || action.args.token || "";
};

// Validate token if it is whitelisted on the protocol
export const validateToken = async <T extends SimAction | RawAction>(
  _address: string,
  actions: T[],
  rpcs: JSONObject,
) => {
  return Promise.all(
    actions.map(async (action, i) => {
      const chainName = action.args[getChainKey(action.name)];
      const { protocolName, poolName } = action.args;
      const protocol = (protocolName || "").toLowerCase();

      if (
        action.name !== "deposit" &&
        action.name !== "lend" &&
        (action.name !== "withdraw" || protocol !== "pendle")
      ) {
        return action;
      }

      let newPoolName = poolName;
      let { token } = action.args;
      const protocolTokens = ProtocolTokens[protocol];
      if (
        !token ||
        token === "all" ||
        !protocol ||
        protocol === "pendle" ||
        !protocolTokens
      ) {
        if (token && token !== "all" && protocol === "pendle") {
          if (action.name !== "withdraw") {
            return action;
          }
        } else {
          return action;
        }
      }

      let j = i;
      while (j > 0 && token?.toLowerCase() === "outputtoken") {
        j--;

        token = getOutputToken(actions[j]);
      }

      const chainId = getChainIdFromName(chainName, true);
      const tokenList =
        protocolTokens[chainId || 1] ||
        protocolTokens[chainId?.toString() || "1"];

      if (!tokenList) {
        return action;
      }

      if (Array.isArray(tokenList)) {
        if (
          !(tokenList as string[]).find(
            (x) => x?.toLowerCase() === token?.toLowerCase(),
          )
        ) {
          const errorMsg = getUnsupportedTokenError(
            chainName || "",
            protocol,
            token || "",
          );
          if (errorMsg.includes("Did you mean")) {
            const token_ = errorMsg.split("Did you mean ")[1].slice(0, -1);
            if (!token_.includes(" or ")) {
              throw new Error(`${i}:${token_}`);
            }
          }
          throw new Error(errorMsg);
        }
      } else {
        if (!poolName) {
          const poolList: string[] = [];
          for (const name of Object.keys(tokenList)) {
            if (
              (tokenList[name] as string[]).find(
                (x) => x.toLowerCase() === token?.toLowerCase(),
              )
            ) {
              poolList.push(name);
            }
          }
          if (
            poolList.length > 1 &&
            !poolList
              .map((pool) => pool.toLowerCase())
              .includes((token || "").toLowerCase())
          ) {
            if (!chainId) {
              throw new Error(getChainError(chainName || ""));
            }
            const rpc = rpcs[chainId] || getRpcUrlForChain(chainId);
            const provider = new RetryProvider(rpc, chainId);
            const tokens = await getTokensForAction(
              _address,
              action.name,
              action.args,
              { chainId, provider },
              rpcs,
            );
            const poolNameList = tokens.map((x) => x.poolName).filter(Boolean);
            if (poolNameList.length === 1) {
              newPoolName = actions[i].args.poolName = poolNameList[0];
            } else {
              throw new Error(
                getMissingPoolNameError(
                  chainName || "",
                  protocol,
                  token || "",
                  action.name,
                ),
              );
            }
          } else if (
            poolList.length > 1 &&
            poolList
              .map((pool) => pool.toLowerCase())
              .includes((token || "").toLowerCase())
          ) {
            newPoolName = token;
            actions[i].args.poolName = newPoolName;
          } else if (poolList.length === 0) {
            throw new Error(
              getMissingPoolNameError(
                chainName || "",
                protocol,
                token || "",
                action.name,
              ),
            );
          } else {
            newPoolName = poolList[0];
            actions[i].args.poolName = newPoolName;
          }
        }
        if (protocol === "pendle") {
          newPoolName = extractPendleToken(newPoolName || poolName || "");
          token = extractPendleToken(token || "");
        }
        const poolTokenlist = tokenList[
          newPoolName?.toLowerCase() || ""
        ] as string[];

        if (!poolTokenlist) {
          return action;
        }

        if (
          !poolTokenlist.find((x) => x.toLowerCase() === token?.toLowerCase())
        ) {
          throw new Error(
            protocol === "pendle"
              ? `Withdrawing from ${protocol} ${poolName} pool is not supported with ${token}. Available tokens to withdraw are ${poolTokenlist.join(
                  ", ",
                )}`
              : getUnsupportedPoolTokenError(
                  chainName || "",
                  protocol,
                  newPoolName || "",
                  token || "",
                ),
          );
        }
      }
      return action;
    }),
  );
};

// Validate pool names whether it's associated to the protocol
export const validatePoolNames = async <T extends SimAction | RawAction>(
  accountAddress: string,
  actions: T[],
  rpcs: JSONObject,
) => {
  return Promise.all(
    actions.map(async (action, index) => {
      // Skip when the action doesn't require pool name
      if (nonProtocolNames.includes(action.name)) {
        return;
      }

      const chainName = action.args[getChainKey(action.name)];

      const chainId = getChainIdFromName(chainName, true);
      const { protocolName } = action.args;
      let { poolName } = action.args;
      const protocol = (protocolName || "").toLowerCase();

      if (!poolName) {
        if (
          !(
            (protocol === "gmx" && action.name === "withdraw") ||
            (protocol === "hop" && action.name === "claim") ||
            (protocol === "hyperliquid" && action.name === "close") ||
            (protocol === "compound" && action.name === "withdraw")
          )
        )
          return;

        if (fromActions.includes(action.name)) {
          const protocolTokens = ProtocolTokens[protocol];
          let tokenList: JSONObject | undefined;

          if ((protocolTokens as JSONObject)?.form) {
            tokenList = {};
          } else if (protocolTokens) {
            tokenList =
              protocolTokens[chainId || 1] ||
              protocolTokens[chainId?.toString() || "1"];
          }

          if (!tokenList || Array.isArray(tokenList) || !chainId) {
            return;
          }

          const rpc = rpcs[chainId] || getRpcUrlForChain(chainId);
          const provider = new RetryProvider(rpc, chainId);
          const tokens = await getTokensForAction(
            accountAddress,
            action.name,
            action.args,
            { chainId, provider },
            rpcs,
          );
          let poolNameList = tokens.filter((x) => !!x.poolName);
          if (action.name === "close") {
            let token = action.args.outputToken || action.args.inputToken || "";
            if (token) {
              if (token.startsWith("w")) token = token.slice(1);
              poolNameList = poolNameList.filter(
                (x) => x.symbol?.toLowerCase() === token.toLowerCase(),
              );
            }
          }
          if (poolNameList.length === 0) {
            throw new Error(`${index}`);
          }
          if (poolNameList.length === 1) {
            action.args.poolName = poolName = poolNameList[0].poolName;
          }
          if (!poolName) {
            action.args.poolName = poolName = "all";
          }
        } else return;
      }

      poolName = poolName.toLowerCase();

      if (
        poolName === "any" ||
        poolName === "all" ||
        poolName === "lp" ||
        protocol === "pendle"
      ) {
        return;
      }

      const pools: string[] = [];
      let poolNameForm: string | undefined;

      // Get listed pools for protocol
      if (protocol === "all") {
        // Get all listed pools for chain
        const protocols = Object.keys(ProtocolPools);
        for (const protocol of protocols) {
          const protocolPools = ProtocolPools[protocol];
          const protocolPoolsForChain =
            protocolPools[chainId || 1] ||
            protocolPools[chainId?.toString() || "1"] ||
            [];

          // List of protocol pools can be array or object
          // Get values if data is array, otherwise get keys
          if (Array.isArray(protocolPoolsForChain)) {
            pools.push(...(protocolPoolsForChain as string[]));
          } else {
            pools.push(...Object.keys(protocolPoolsForChain));
          }
        }

        if (pools.length === 0) {
          throw new Error(
            `No pools are supported on ${chainName}. Please specify chain name correctly and try again.`,
          );
        }
      } else {
        if (!ProtocolPools[protocol]) {
          throw new Error(
            `No pools are supported for protocol ${protocol}. Please specify protocol name correctly and try again.`,
          );
        }

        const protocolPools = ProtocolPools[protocol];
        const protocolPoolsForChain =
          protocolPools[chainId || 1] ||
          protocolPools[chainId?.toString() || "1"];
        poolNameForm =
          (protocolPools as JSONObject).form && chainId
            ? ((protocolPools as JSONObject).form as JSONObject)[chainId]
            : undefined;

        if (!protocolPoolsForChain && !poolNameForm) {
          throw new Error(
            `No pools are supported for protocol ${protocol} on ${chainName}. Please specify chain name and protocol name correctly and try again.`,
          );
        }

        if (protocolPoolsForChain) {
          // List of protocol pools can be array or object
          // Get values if data is array, otherwise get keys
          if (Array.isArray(protocolPoolsForChain)) {
            pools.push(...(protocolPoolsForChain as string[]));
          } else {
            pools.push(...Object.keys(protocolPoolsForChain));
          }
        }
      }

      // Check whether pool is listed or not
      if (!pools.includes(poolName)) {
        // Check whether pool name meets basic form of the protocol
        // Form can be TOKEN-TOKEN/TOKEN, etc
        if (poolNameForm) {
          const pattern = /([^[A-Za-z0-9.]+)|([A-Za-z0-9.]+)/g;

          // Get elements of form and given pool name
          const formElements = poolNameForm.match(pattern);
          const elements = poolName.match(pattern) as string[];
          let matchForm = true;

          if (
            elements &&
            formElements &&
            elements.length === formElements.length
          ) {
            const tokenChecks = await Promise.all(
              elements.map(async (element, i) => {
                if (formElements[i] === "TOKEN") {
                  // If element should be TOKEN, check whether it's valid token
                  const token = await getTokenInfoForChain(element, chainName);
                  return !!token;
                }
                return element === formElements[i];
              }),
            );
            matchForm = tokenChecks.every(Boolean);
          } else {
            matchForm = false;
          }

          if (matchForm) {
            return;
          }

          // Check vamm-TOKEN/TOKEN format
          if (protocol === "aerodrome" || protocol === "velodrome") {
            poolName = splitPool(poolName).join("/");
          }

          // Get elements of form and given pool name
          const formElements2 = "TOKEN/TOKEN".match(pattern);
          const elements2 = poolName.match(pattern) as string[];
          matchForm = true;

          if (
            elements2 &&
            formElements2 &&
            elements2.length === formElements2.length
          ) {
            const tokenChecks = await Promise.all(
              elements2.map(async (element, i) => {
                if (formElements2[i] === "TOKEN") {
                  // If element should be TOKEN, check whether it's valid token
                  const token = await getTokenInfoForChain(element, chainName);
                  return !!token;
                }
                return element === formElements2[i];
              }),
            );
            matchForm = tokenChecks.every(Boolean);
          } else {
            matchForm = false;
          }

          if (matchForm) {
            return;
          }
        }

        if (protocol === "gmx") {
          if (poolName.toLowerCase().startsWith("w")) {
            if (pools.includes(poolName.slice(1))) {
              action.args.poolName = poolName.slice(1);
              return;
            }
          }
        }

        throw new Error(
          getUnsupportedPoolError(chainName || "", protocol, poolName, pools),
        );
      }
    }),
  );
};

export const getTokenFromOnChain = async (
  address: string | null | undefined,
  chainName: string | undefined,
): Promise<TokenInfo | undefined> => {
  if (!address) return;
  const chainId = getChainIdFromName(chainName || "");
  if (!chainId) {
    throw new Error(getChainError(chainName || ""));
  }
  if (chainId !== 101) {
    const rpc = getRpcUrlForChain(chainId);
    const viemClient = await getViemPublicClientFromEthers(
      new RetryProvider(rpc, chainId),
    );
    assert(isHexStr(address));
    const [name, symbol, decimals] = await Promise.all([
      viemClient.readContract({
        address,
        abi: abis.erc20,
        functionName: "name",
      }),
      viemClient.readContract({
        address,
        abi: abis.erc20,
        functionName: "symbol",
      }),
      viemClient.readContract({
        address,
        abi: abis.erc20,
        functionName: "decimals",
      }),
    ]);
    return { name, symbol, decimals, address };
  }
  const { data } = await withRetry("", () =>
    axios.get(`${CGC_API_ENDPOINT}/onchain/networks/solana/tokens/${address}`, {
      headers: { "x-cg-pro-api-key": CGC_API_KEY },
    }),
  );
  if (data) {
    const tokenData = {
      name: data.data.attributes.name,
      symbol: data.data.attributes.symbol.toLowerCase(),
      decimals: data.data.attributes.decimals,
      address: data.data.attributes.address,
    };
    await saveToken({ ...tokenData, chainId: 101 });
    return tokenData;
  }
  return undefined;
};

const validateProtocolParams = async (
  data: CommonArgs,
  ignoreTokenCheck = false,
  ignoreAmountCheck = false,
) => {
  const {
    account,
    action,
    protocolName,
    chainName,
    amount,
    outputToken,
    token1Address,
    range,
    recipient,
  } = data;
  let { token } = data;
  const chainId = getChainIdFromName(chainName, true);

  if (!protocolName) {
    throw new Error(
      "Protocol is missing. Please specify protocol name in your next prompt!",
    );
  }

  if (
    !ignoreAmountCheck &&
    amount &&
    amount !== "all" &&
    amount !== "half" &&
    !amount.toString().endsWith("%") &&
    (isNaNValue(amount) || Number.parseFloat(amount) <= 0)
  ) {
    if (Number.parseFloat(amount) === 0) {
      throw new Error(
        "The amount being used is zero, ensure you have funds on your Slate account",
      );
    }
    throw new Error(
      `${amount} is an invalid amount. Please specify an amount correctly and try again.`,
    );
  }

  if (
    range !== undefined &&
    (isNaNValue(range) ||
      Number.parseFloat(range) <= 0 ||
      Number.parseFloat(range) > 100)
  ) {
    throw new Error(
      `${range} is an invalid range. Please specify positive percentage value and try again.`,
    );
  }

  const printError = usePrintError(account);
  if (protocolName.toLowerCase() === "dolomite") {
    if (!chainId) {
      throw new Error(getChainError(chainName || ""));
    }
    const isoData = LPAddresses.dolomite[chainId];
    if (!isoData) {
      throw new Error(`Dolomite is not supported on chain id ${chainId}`);
    }
    const lpList = Object.keys(isoData);
    const dToken = token || "";
    if (
      lpList.includes(dToken.toLowerCase()) &&
      !isoData[dToken.toLowerCase()].listedToken
    ) {
      token = isoData[dToken.toLowerCase()].token;
    }
  }

  let tokenInfo: TokenInfo | undefined;
  let error: string | null | undefined;
  try {
    tokenInfo = await getTokenInfoForChain(
      token || "",
      chainName,
      action !== "close" && !ignoreTokenCheck,
    );
  } catch (err) {
    printError(err);
    error = getErrorMessage(err);
  }

  if (!tokenInfo && action === "close" && protocolName === "gmx") {
    if (!token) token = "usdc";
    tokenInfo = chainId ? await getGMXTokenInfo(chainId, token) : undefined;
  }

  if (!tokenInfo && token1Address) {
    try {
      tokenInfo = await getTokenFromOnChain(token1Address, chainName);
      error = null;
    } catch (err) {
      printError(err);
    }
  }
  if (error) {
    throw error;
  }

  if (protocolName.toLowerCase() === "hyperliquid" && action === "transfer") {
    if (token !== "usdc") {
      throw new Error("Transfers on Hyperliquid are only supported for USDC.");
    }
    if (recipient !== "spot" && recipient !== "perp") {
      throw new Error(
        "Recipient on Hyperliquid is only supported for spot and perp.",
      );
    }
  }

  if (outputToken === undefined) return { chainId, tokenInfo };

  let outputTokenInfo: TokenInfo | undefined;
  const outputToken_ = outputToken.split("/")[0].split("-")[0];
  if (protocolName.toLowerCase() === "gmx") {
    outputTokenInfo = chainId
      ? await getGMXTokenInfo(chainId, outputToken_)
      : undefined;
  } else if (protocolName.toLowerCase() === "hyperliquid") {
    outputTokenInfo = (await getHyperliquidTokenInfo(chainId, outputToken_))
      ?.tokenInfo;
  } else {
    outputTokenInfo = await getTokenInfoForChain(outputToken, chainName, true);
  }
  if (!outputTokenInfo) {
    throw new Error(
      `Token ${outputToken} is not supported on ${chainName} for ${protocolName}.`,
    );
  }
  return { chainId, tokenInfo, outputTokenInfo };
};

export const getOutputTokenSymbolForBridge = (
  token: string,
  srcChainName: string,
  destChainName: string,
) => {
  const srcChainId = getChainIdFromName(srcChainName, true);
  const destChainId = getChainIdFromName(destChainName, true);
  if (!srcChainId || !destChainId) {
    throw new Error(getChainError(srcChainName, destChainName));
  }

  const srcNativeTokenSym = getNativeTokenSymbolForChain(
    srcChainId,
    true,
  )?.toLowerCase();
  const destNativeTokenSym = getNativeTokenSymbolForChain(
    destChainId,
    true,
  )?.toLowerCase();

  if (token.toLowerCase() === "matic" && srcNativeTokenSym === "matic")
    return "matic";
  if (token.toLowerCase() === "avax" && srcNativeTokenSym === "avax")
    return "avax";

  const outputToken =
    token.toLowerCase() !== srcNativeTokenSym
      ? token
      : token.toLowerCase() === destNativeTokenSym
        ? token
        : `w${token}`;

  return outputToken;
};

export const convertAmount = async (args: CommonArgs, targetAmount = 0) => {
  const {
    account,
    token,
    amount,
    amount_units,
    inputToken,
    inputAmount,
    inputAmountUnits,
    chainId,
  } = args;
  const _amount = amount || inputAmount;
  const amountUnits = amount_units || inputAmountUnits;
  if (!amountUnits) return targetAmount ? targetAmount.toString() : undefined;
  if (isNaNValue(Number.parseFloat(_amount ?? ""))) return _amount;

  if (targetAmount) {
    let amount = targetAmount;
    let tokenPrice: number | undefined;
    if (chainId === 42161) {
      const hyperliquidTokenInfo = await getHyperliquidTokenInfo(
        42161,
        token || inputToken || "",
        true,
      );
      tokenPrice = hyperliquidTokenInfo?.price;
    }
    if (!tokenPrice) {
      tokenPrice = (await getCoinData(account, token || inputToken, chainId))
        .price;
    }
    if (tokenPrice) amount *= tokenPrice;
    if (amountUnits !== "usd") {
      const cc = await getCoinData(account, amountUnits, chainId);
      if (cc.price) amount /= cc.price;
    }
    return amount.toString();
  }

  let amountForUsd: number | undefined = Number.parseFloat(_amount ?? "");
  if (amountUnits !== "usd") {
    const cc = await getCoinData(account, amountUnits, chainId);
    if (cc.price) amountForUsd *= cc.price;
    else amountForUsd = undefined;
  }
  const tokenPrice = (await getCoinData(account, token || inputToken, chainId))
    .price;
  if (amountForUsd === undefined || tokenPrice === undefined)
    return "undefined";
  return (amountForUsd / tokenPrice).toString();
};

export const fillAmountForUnits = async (
  actions: RawAction[],
): Promise<SimAction[]> => {
  const actions_: SimAction[] = [...actions].map((x) => ({
    ...x,
    origin: 0,
  }));
  return Promise.all(
    actions_.map(async (action, i) => {
      let { args } = action;
      const chainKey = args[getChainKey(action.name)];
      const newChainId = chainKey ? getChainIdFromName(chainKey) : 1;
      args = {
        ...args,
        chainId: newChainId,
      };
      action.origin = i + 1;
      if (isNaNValue(action.args.amount || action.args.inputAmount)) {
        action.args.amount_units = undefined;
        action.args.inputAmountUnits = undefined;
      } else {
        action.args.realAmount = await convertAmount(args);
      }
      return action;
    }),
  );
};

export const validateActions = (
  actions: SimAction[],
  index: number,
  blacklist: number[] | undefined = undefined,
): number[] | boolean => {
  if (blacklist) {
    let count = 0;
    for (let i = 0; i < actions.length; i++) {
      if (blacklist.includes(i)) continue;
      if (actions[i].origin !== actions[index].origin) continue;
      count++;
    }
    return count > 0;
  }

  let i = 0;
  let j = 0;
  let missing = false;
  for (; i < actions.length; i++) {
    if (actions[i].origin === j) {
      continue;
    }
    j++;
    if (actions[i].origin > j) {
      missing = true;
      break;
    }
  }
  if (j < index) {
    if (j === 0 || (!missing && i === actions.length)) {
      j++;
      missing = true;
    }
    j--;
  } else {
    j = -1;
  }
  return [j, missing ? -1 : i];
};

export const getPrevActionIndexes = (actions: SimAction[], index: number) => {
  const ret: number[] = [];
  for (let i = 0; i < index; i++) {
    if (actions[i].origin === actions[index].origin - 1) ret.push(i);
  }
  return ret;
};

export const convertToHexString = (value: string) => {
  const bn = ethers.getBigInt(value);

  if (bn === 0n) {
    return "0x0";
  }

  const res = ethers.toBeHex(bn);
  return res.replace("0x0", "0x");
};

const getNativeAmountToSave = async (
  printLog: (...errs: unknown[]) => void,
  printError: (...errs: unknown[]) => void,
  checkTx: Transaction,
  amount: bigint,
  gasToSave: bigint,
  feeConfig: FeeConfig | null,
  gasPrice: bigint,
  chainId: ChainId,
  txs: Transaction[],
  action: string,
  provider: RetryProvider,
  account: string,
): Promise<bigint> => {
  const value = ethers.getBigInt(checkTx.value || 0n);
  let amountToSave = value > amount ? ((value - amount) * 7n) / 5n : 0n;
  printLog(amountToSave, amount, gasToSave, feeConfig);
  amountToSave += gasToSave;
  if (feeConfig && feeConfig.chainId === chainId) {
    const gasBuffer = gasPrice * 25200n;
    amountToSave += feeConfig.value + gasBuffer;
  }
  let gasLimit = 0n;
  let failedCount = 0n;
  await Promise.all(
    txs.map(async (tx) => {
      try {
        // Ensure that the 'gas' property exists and is a valid bignumber
        if (tx.gas) {
          gasLimit += ethers.getBigInt(tx.gas);
        } else if (chainId === ChainIDs.zksync) {
          const tempProvider = new RetryProvider(
            getRpcUrlForChain(ChainIDs.zksync),
            ChainIDs.zksync,
          );
          const gath = await withRetry(ethers.getAddress(tx.from || ""), () =>
            tempProvider.getFeeData(),
          );
          gasLimit += await withRetry(ethers.getAddress(tx.from || ""), () =>
            provider.estimateGas({
              ...tx,
              from: ethers.getAddress(tx.from || ""),
              value: convertToHexString(tx.value || "0"),
              maxFeePerGas:
                chainId === ChainIDs.zksync
                  ? convertToHexString(gath.maxFeePerGas?.toString() || "0")
                  : null,
            }),
          );
        } else {
          // Fallback to estimating gas if 'gas' property is not valid
          gasLimit += await withRetry(account, () => provider.estimateGas(tx));
        }
      } catch (err) {
        printError("failed count", err);
        failedCount++;
      }
    }),
  );
  let gas: bigint;
  if (
    action === "swap" ||
    action === "bridge" ||
    action === "lend" ||
    action === "deposit"
  ) {
    if (typeof gasPrice === "number") {
      gas = (ethers.getBigInt(gasPrice) * gasLimit * 49n) / 15n;
    } else {
      gas = (gasPrice * gasLimit * 49n) / 15n;
    }
  } else if (typeof gasPrice === "number") {
    gas = (ethers.getBigInt(gasPrice) * gasLimit * 28n) / 15n;
  } else {
    gas = (gasPrice * gasLimit * 28n) / 15n;
  }
  if (chainId === ChainIDs.zksync) {
    gas = (gas * 7n) / 5n;
  }
  gas +=
    chainId === ChainIDs.zksync
      ? failedCount * ethers.parseEther("0.1")
      : failedCount * ethers.parseEther("0.01");
  printLog(gas);
  amountToSave += gas;
  printLog(amountToSave);
  return amountToSave;
};
export const getTransactions = async (
  {
    provider,
    rpcs,
    chainId,
    account,
  }: {
    provider: RetryProvider;
    rpcs: JSONObject;
    chainId: ChainId;
    account: string;
  },
  action: string,
  body: JSONObject,
  decimals: number,
  gasPrice: bigint,
  checkGas_: boolean | undefined,
  nativeAmount: bigint,
  gasToSave: bigint,
  feeConfig: FeeConfig | null,
  baseLiquidity: number,
  ignore: string[] = [],
) => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);

  let txs: Transaction[] | undefined;
  let txNames: string[] | undefined;
  let signData: JSONObject | undefined;
  let source: string | undefined;
  let alternatives: JSONObject[] | undefined;
  let mockBalanceChanges: BalanceChange[] | undefined;
  let error: string | undefined;
  let checkGas = checkGas_;
  let amountOut: string | undefined;
  /* eslint-disable no-await-in-loop */
  while (true) {
    switch (action) {
      case "swap": {
        const { message, routes } = await getSwapTx(
          {
            ...body,
            rpc: extractRpcUrl(rpcs, chainId),
            rpc_hyperliquid: rpcs.hyperliquid,
          },
          ignore,
          baseLiquidity,
          false, // simulate
        );
        if (message) {
          error = message;
        } else if (routes) {
          txs = routes[0].transactions;
          txNames = routes[0].funcNames;
          signData = routes[0].signData;
          source = routes[0].source;
          alternatives = routes;
        }
        break;
      }
      case "bridge": {
        if (
          body?.protocolName !== "orbiter" &&
          body?.sourceChainName === "ethereum"
        ) {
          ignore.push("orbiter");
        }
        const { message, routes } = await getBridgeTx(
          { ...body, rpc: extractRpcUrl(rpcs, chainId) },
          ignore,
          false,
        );
        if (message) {
          error = message;
        } else if (routes) {
          txs = routes[0].transactions;
          txNames = routes[0].funcNames;
          source = routes[0].source;
          amountOut = routes[0].amountOut;
          alternatives = routes;
        }
        break;
      }
      case "transfer": {
        const {
          message,
          transactions,
          funcNames,
          signData: signData_,
        } = await getTransferTx({
          ...body,
          rpc: extractRpcUrl(rpcs, chainId),
          rpc_hyperliquid: rpcs.hyperliquid,
        });
        if (message) {
          error = message;
        } else {
          txs = transactions;
          txNames = funcNames;
          signData = signData_;
        }
        break;
      }
      case "borrow":
      case "claim":
      case "deposit":
      case "lend":
      case "lock":
      case "repay":
      case "stake":
      case "unlock":
      case "unstake":
      case "vote":
      case "withdraw": {
        const {
          message,
          transactions,
          funcNames,
          balanceChanges,
          signData: signData_,
        } = await getActionTx(action, {
          ...body,
          rpc: extractRpcUrl(rpcs, chainId),
        });
        if (message) {
          error = message;
        } else {
          txs = transactions as Transaction[];
          txNames = funcNames;
          mockBalanceChanges = balanceChanges;
          signData = signData_ as JSONObject;
        }
        break;
      }
      case "long":
      case "short":
      case "close": {
        const {
          message,
          transactions,
          funcNames,
          balanceChanges,
          signData: signData_,
        } = await getPerpActionTx(action, {
          ...body,
          rpc: extractRpcUrl(rpcs, chainId),
        });
        if (message) {
          error = message;
        } else {
          txs = transactions as Transaction[];
          txNames = funcNames;
          mockBalanceChanges = balanceChanges;
          signData = signData_ as JSONObject;
        }
        break;
      }
      default:
        throw new Error(
          getUnsupportedActionError(action, [
            "swap",
            "bridge",
            "transfer",
            "borrow",
            "claim",
            "deposit",
            "lend",
            "lock",
            "repay",
            "stake",
            "unlock",
            "unstake",
            "vote",
            "withdraw",
            "long",
            "short",
            "close",
          ]),
        );
    }
    printLog("body", body);
    if (!checkGas || !txs) {
      break;
    }
    const checkTx = txs[txs.length - 1];
    if (!("value" in checkTx)) {
      txs = undefined;
      const nativeTokenSymbol = getNativeTokenSymbolForChain(chainId);
      error = `Could not build transaction for all your ${nativeTokenSymbol}. Please onboard more ${nativeTokenSymbol} and try again.`;
      break;
    }
    const amount = sfParseUnits(
      Number.parseFloat(body.realAmount || body[getAmountKey(action)]),
      18,
    );
    if (nativeAmount && nativeAmount === 0n) {
      txs = undefined;
      error = `Not enough gas on ${getChainNameFromId(
        chainId,
      )}. On your Slate account, you have 0 and need ${ethers.formatUnits(
        amount,
        decimals,
      )}. Please onboard at least ${ethers.formatUnits(
        amount,
        decimals,
      )} more and try again.`;
      break;
    }
    // amountToSave covers external fees, internal fees, subsequent tx gas, and current tx gas
    const amountToSaveCalc = await getNativeAmountToSave(
      printLog,
      printError,
      checkTx,
      amount,
      gasToSave,
      feeConfig,
      gasPrice,
      chainId,
      txs,
      action,
      provider,
      account,
    );
    const amountToSaveSimple = (nativeAmount * 1n) / 100n;
    const amountToSave =
      amountToSaveSimple > amountToSaveCalc
        ? amountToSaveSimple
        : amountToSaveCalc;

    if (nativeAmount) {
      if (body.isAllAmount) {
        const newAmount = nativeAmount - amountToSave;
        if (newAmount < 0n) {
          txs = undefined;
          error = `Not enough ETH on ${getChainNameFromId(
            chainId,
          )} to pay for gas/fees. On your Slate account, you have ${ethers.formatUnits(
            nativeAmount,
            decimals,
          )} and need ${ethers.formatUnits(
            amountToSave,
            decimals,
          )}. Please onboard at least ${ethers.formatUnits(
            amountToSave - nativeAmount,
            decimals,
          )} more and try again.`;
          break;
        }
        if (body.realAmount) {
          body.realAmount = ethers.formatUnits(newAmount, decimals);
        } else {
          body[getAmountKey(action)] = ethers.formatUnits(newAmount, decimals);
        }
      } else {
        const newAmount = amount + amountToSave;
        printLog(newAmount, amount, amountToSave);
        if (newAmount > nativeAmount) {
          txs = undefined;
          error = `Not enough ETH on ${getChainNameFromId(
            chainId,
          )} to pay for gas/fees. On your Slate account, you have ${ethers.formatUnits(
            nativeAmount,
            decimals,
          )} and need ${ethers.formatUnits(
            newAmount,
            decimals,
          )}. Please onboard at least ${ethers.formatUnits(
            newAmount - nativeAmount,
            decimals,
          )} more and try again.`;
          break;
        }
      }
    }
    checkGas = false;
  }

  return {
    error: typeof error === "string" ? error : JSON.stringify(error),
    txs,
    txNames,
    signData,
    source,
    alternatives,
    mockBalanceChanges,
    checkGas,
    body,
    amountOut,
  };
};

export const extractProvider = (
  chainId: ChainId | undefined,
  rpcs: string | JSONObject = {},
  zksyncid = 260,
) => {
  const rpcUrl = extractRpcUrl(rpcs, chainId) || getRpcUrlForChain(chainId);
  const provider = new RetryProvider(
    rpcUrl,
    chainId === ChainIDs.zksync ? zksyncid : chainId,
  );
  return { rpcUrl, provider };
};

const getChainNameFromActions = (
  actions: RawAction[],
  index: number,
  connectedChain: string,
) => {
  let chainName = connectedChain;
  for (let i = 0; i < index; i++) {
    chainName = actions[i].args[getDstChainKey(actions[i].name)] || chainName;
  }
  chainName =
    actions[index].args[getChainKey(actions[index].name)] || chainName;
  return chainName.toLowerCase();
};

const userTokenChainFetching = async (
  symbol: string | undefined,
  checkBalance: boolean,
  extraInfo: JSONObject,
) => {
  const chainPromises = EntityData.chains.map(async (cn) => {
    if (cn === "Solana") return null;

    const tokenInfo = await getTokenInfoForChain(symbol, cn, false, {
      liquidityThreshold: extraInfo.liquidityThreshold,
    });
    if (tokenInfo) {
      if (checkBalance && tokenInfo.address) {
        try {
          const chainId = getChainIdFromName(cn);
          const { provider } = extractProvider(chainId, extraInfo.rpcs);
          const { amount } = await getTokenAmount(
            provider,
            tokenInfo,
            extraInfo.address,
          );
          if (amount) {
            return cn.toLowerCase();
          }
        } catch {
          return null;
        }
      } else {
        return cn.toLowerCase();
      }
    }
    return null;
  });

  const results = await Promise.all(chainPromises);
  const chains = results.filter((chain) => chain !== null);
  return chains;
};

/**
 * check whether token {symbol} exists on {chainName}
 * unless return alternative chain if possible
 * @returns
 * if status =  0, token exists on the chain already
 *    status =  1, token exists on returned chain only
 *    status = -1, token exists on none or multiple chains, so cannot replace
 */
export const validateTokenForChain = async (
  symbol: string | undefined,
  chainName: string | undefined,
  checkBalance = false,
  extraInfo: JSONObject = {},
) => {
  const tokenInfo = await getTokenInfoForChain(symbol, chainName, false, {
    liquidityThreshold: extraInfo.liquidityThreshold,
  });
  if (tokenInfo?.address) {
    const chainId = getChainIdFromName(chainName);
    const rpcUrl =
      (chainId && extraInfo.rpcs && extraInfo.rpcs[chainId]) ||
      getRpcUrlForChain(chainId);
    const provider = new RetryProvider(rpcUrl);
    if (checkBalance && chainName !== "solana") {
      const { amount } = await getTokenAmount(
        provider,
        tokenInfo,
        extraInfo.address,
      );
      if (amount) return { status: 0 };
    } else {
      return { status: 0 };
    }
  }

  const chains = await userTokenChainFetching(symbol, checkBalance, extraInfo);

  if (chains.length !== 1) return { status: -1, chains };
  return { status: 1, chainName: chains[0] };
};

export const getMiddleToken = async (
  args: CommonArgs,
  extra: { chain1?: string; chain2?: string } | undefined = undefined,
) => {
  const chain1 = extra?.chain1 || args.sourceChainName;
  const chain2 = extra?.chain2 || args.destinationChainName;
  const srcChainId = getChainIdFromName(chain1);
  const destChainId = getChainIdFromName(chain2);

  const srcNativeTokenSymbol =
    srcChainId !== undefined
      ? getNativeTokenSymbolForChain(srcChainId)
      : undefined;
  const destNativeTokenSymbol =
    destChainId !== undefined
      ? getNativeTokenSymbolForChain(destChainId)
      : undefined;
  const middleToken =
    srcNativeTokenSymbol === "ETH" &&
    destNativeTokenSymbol === "ETH" &&
    args?.outputToken?.toLowerCase() !== "eth"
      ? "eth"
      : "weth";
  const tokenInfo1 = await getTokenInfoForChain(middleToken, chain1);
  const tokenInfo2 = await getTokenInfoForChain(middleToken, chain2);
  if (tokenInfo1 && tokenInfo2) return middleToken;
};

export const isValidAddress = (address: string | undefined) => {
  return address ? ethers.isAddress(address.toLowerCase()) : false;
};

export const isValidHyperliquidAddress = (address: string | undefined) => {
  return address ? address.startsWith("0x") && address.length === 34 : false;
};

export const getFeeConfig = async (
  address: string,
  rpcs: JSONObject,
): Promise<FeeConfig | null> => {
  const { transactions: feeTx, chainName } = await getFeeTx(address, rpcs);
  if (!feeTx || feeTx.length === 0 || !feeTx[0] || !chainName) return null;

  const chainId = getChainIdFromName(chainName);
  if (!chainId) {
    throw new Error(getChainError(chainName));
  }
  const nativeSymbol = getNativeTokenSymbolForChain(chainId);
  if (userNoFees.includes(address.toLowerCase())) {
    return {
      chainName,
      chainId,
      nativeSymbol,
      value: ethers.getBigInt("0"),
    };
  }
  const tokenInfo = await getTokenInfoForChain(nativeSymbol || "", chainName);
  return {
    chainName,
    chainId,
    nativeSymbol,
    value: ethers.getBigInt(
      sfParseUnits(feeTx[0].value.toString(), tokenInfo?.decimals),
    ),
  };
};

export const getGasForNextActions = (
  actions: RawAction[],
  index: number,
  gasPrice: bigint,
): bigint => {
  const chainId = getChainIdFromName(
    actions[index].args[getChainKey(actions[index].name)] ?? "",
  );
  if (actions[index - 1]) {
    const prevChainId = getChainIdFromName(
      actions[index - 1].args[getChainKey(actions[index - 1].name)] ?? "",
    );
    if (chainId === prevChainId) return 0n;
  }
  if (chainId === 56) return 0n;
  let gasPerAction =
    ethers.WeiPerEther / (chainId === 1 ? 50n : chainId === 137 ? 100n : 500n);
  gasPerAction = (gasPerAction * gasPrice) / sfParseUnits("1", 10);
  let gas = 0n;
  for (let i = index + 1; i < actions.length; i++) {
    const action = actions[i];
    const _chainId = getChainIdFromName(action.args[getChainKey(action.name)]);
    if (chainId !== _chainId) break;
    if (action.name === "swap" || action.name === "bridge")
      gas += (gasPerAction * 49n) / 15n;
    else if (action.name === "lend" || action.name === "deposit")
      gas += (gasPerAction * 49n) / 15n;
    else gas += gasPerAction;
  }
  return gas;
};

export const resimulateWithBalance = async (
  {
    address,
    connectedChainName,
    rpcs,
  }: {
    address: string;
    connectedChainName: string;
    rpcs: Record<string, string>;
  },
  rawActions: RawAction[],
  actions: SimAction[],
  [rawIndex, index]: number[],
) => {
  const getErrorMessage = (action: RawAction, chainName_: string): string => {
    let chainName = chainName_;
    let token = action.args[getTokenKey(action.name)];
    if (!token || token === "all" || token === "outputToken" || token === "lp")
      return `Not able to ${action.name} any tokens. Please specify correct arguments in your next prompt!`;
    chainName = action.args[getChainKey(action.name)] || chainName;
    if (chainName === "all") chainName = "any chain";
    if (
      action.args.protocolName?.toLowerCase() === "hyperliquid" &&
      action.name !== "deposit"
    ) {
      const isSpot = action.name === "swap" || action.args.recipient === "perp";
      if (["long", "short"].includes(action.name))
        token = action.args.outputToken || action.args.inputToken;
      return `Not able to ${action.name} ${token}, you don't have ${
        isSpot ? "spot" : "perp"
      } ${token} on hyperliquid.`;
    }
    return `Not able to ${action.name} ${token}, you don't have ${token} on ${chainName}.`;
  };

  const chainName = getChainNameFromActions(
    rawActions,
    rawIndex,
    connectedChainName,
  );
  const chainId = getChainIdFromName(chainName);
  const action: SimAction =
    index < 0
      ? { ...rawActions[rawIndex], origin: 0 }
      : { ...actions[index], origin: actions[index].origin };
  if (index < 0) action.origin = rawIndex + 1;
  let errorMsg = getErrorMessage(action, chainName);
  const token = action.args[getTokenKey(action.name)]?.toLowerCase();
  const amount = action.args[getAmountKey(action.name)];
  const protocol = (action.args.protocolName || "").toLowerCase();
  if (protocol === "hyperliquid" && action.name !== "deposit") {
    return {
      message: errorMsg,
    };
  }

  let balances = await getTokenBalanceForAllChains(
    address,
    token,
    amount,
    rpcs,
  );
  let tokenStr = action.args[getTokenKey(action.name)]?.toLowerCase();
  if (tokenStr?.startsWith("0x")) {
    const tokenInfo = await getTokenInfoForChain(tokenStr, chainName);
    if (tokenInfo?.symbol) tokenStr = tokenInfo.symbol;
  }
  if (!tokenStr || tokenStr === "all" || tokenStr === "outputtoken")
    tokenStr = "any tokens";
  if (
    token !== "all" &&
    !!token &&
    toActions.includes(action.name) &&
    !balances.find((x) => x.chainId === chainId)
  ) {
    if ((await getTokenBalance(address, chainName, token)) > 0) {
      const { rpcUrl: rpc } = await createVnet(chainId);
      if ((await getTokenBalance(address, chainName, token, rpc)) > 0) {
        return {
          chainId: chainId?.toString(),
          rpc: rpc,
        };
      }
    }

    if (balances.length === 1) {
      if (index < 0 || checkIfOnlyOrigin(actions, index)) {
        const tokenInfo = await getTokenInfoForChain(tokenStr, chainName);
        if (!tokenInfo) {
          rawActions[action.origin - 1].args[getChainKey(action.name)] =
            balances[0].chainName;
          await updateChains(
            rawActions,
            action,
            balances[0].chainName,
            chainName,
          );
        } else if (action.name === "bridge") {
          rawActions[action.origin - 1].args.sourceChainName =
            balances[0].chainName;
        } else {
          const previousAmount = action.args[getAmountKey(action.name)];
          const previousAmountUnits =
            action.args[getAmountUnitKey(action.name)];
          const previousChain = action.args.chainName;

          rawActions[action.origin - 1].args[getAmountKey(action.name)] =
            "outputAmount";
          rawActions[action.origin - 1].args[getAmountUnitKey(action.name)] =
            undefined;

          rawActions.splice(action.origin - 1, 0, {
            name: "bridge",
            args: {
              token,
              amount: previousAmount,
              amount_units: previousAmountUnits,
              sourceChainName: balances[0].chainName,
              destinationChainName: previousChain,
            },
          });
        }
        return {};
      }
    }
    if (balances.length > 0) {
      errorMsg = `${errorMsg.slice(0, -1)}, only on ${balances
        .map((x) => x.chainName)
        .join(", ")}.`;
    }
  }

  if (token && ["usdc", "usdc.e"].includes(token)) {
    tokenStr = token === "usdc" ? "usdc.e" : "usdc";
    balances = await getTokenBalanceForAllChains(
      address,
      tokenStr,
      amount,
      rpcs,
    );
    if (balances.length > 0) {
      const curChainBalance = balances.find((x) => x.chainId === chainId);
      if (curChainBalance || balances.length === 1) {
        rawActions[action.origin - 1].args[getTokenKey(action.name)] = tokenStr;
        if (
          balances.length === 1 &&
          balances[0].chainName.toLowerCase() !== chainName.toLowerCase()
        ) {
          await updateChains(
            rawActions,
            action,
            balances[0].chainName,
            chainName,
          );
        }
        return {};
      }
    }
  }

  // Check for tokens with similar names on the given chain
  const userOwnedTokens = await getUserOwnedTokenBalancesFromDeBank(address);
  const tokensOnChain = chainId ? userOwnedTokens[chainId] || [] : [];

  const similarTokens = tokensOnChain
    .filter((t) => t.balance > 0)
    .filter((t) => {
      return diffBetweenTwoStrings(t.symbol, tokenStr) < 3;
    });

  if (similarTokens.length > 0) {
    const bestMatch = similarTokens.sort((a, b) => b.balance - a.balance)[0];

    const rawAction = rawActions[action.origin - 1];
    if (rawAction.name === "bridge") {
      const tokenInfo = await getTokenInfoForChain(
        bestMatch.address,
        rawAction.args.destinationChainName,
      );
      if (tokenInfo) {
        rawAction.args.token = bestMatch.address;
      } else {
        const amount = rawAction.args.amount;
        rawAction.args.amount = "outputAmount";
        rawActions.splice(action.origin - 1, 0, {
          name: "swap",
          args: {
            inputToken: bestMatch.address,
            inputAmount: amount,
            inputAmountUnits: rawAction.args.amount_units,
            outputToken: rawAction.args.token,
            chainName: rawAction.args.chainName,
          },
        });
      }
    } else {
      rawAction.args[getTokenKey(action.name)] = bestMatch.address;
    }

    console.log(
      `Inference applied: Substituted token ${tokenStr} with ${bestMatch.symbol} (${bestMatch.address}) due to similarity and available balance.`,
    );
    return {};
  }

  return { message: errorMsg };
};

export const getChainKey = (action: string) => {
  return action === "bridge" ? "sourceChainName" : "chainName";
};

export const getDstChainKey = (action: string) => {
  return action === "bridge" ? "destinationChainName" : "chainName";
};

export const getTokenKey = (action: string) => {
  return ["swap", "long", "short", "close"].includes(action)
    ? "inputToken"
    : "token";
};

export const getAmountKey = (action: string) => {
  return ["swap", "long", "short", "close"].includes(action)
    ? "inputAmount"
    : "amount";
};

const getAmountUnitKey = (action: string) => {
  return ["swap", "long", "short", "close"].includes(action)
    ? "inputAmountUnits"
    : "amount_units";
};

export const checkIfOnlyOrigin = (actions: SimAction[], i: number) => {
  return actions.filter((x) => x?.origin === actions[i]?.origin).length === 1;
};

export const compareValues = (
  left: number,
  right: number,
  comparator: string | undefined,
) => {
  if (comparator === "<") {
    return left < right;
  }
  if (comparator === "<=") {
    return left <= right;
  }
  if (comparator === ">") {
    return left > right;
  }
  if (comparator === ">=") {
    return left >= right;
  }
  if (comparator === "==") {
    return left === right;
  }

  return false;
};

export const tickToPrice = (tick: number, decimal0 = 18, decimal1 = 18) => {
  return 1.0001 ** tick / 10 ** (decimal1 - decimal0);
};

export const priceToTick = (price: number, decimal0 = 18, decimal1 = 18) => {
  return Math.floor(
    (Math.log(price) + Math.log(10) * (decimal1 - decimal0)) / Math.log(1.0001),
  );
};

export const checkUniswapLikeDeposits = async (
  actions: SimAction[],
  index: number,
) => {
  const action = actions[index];
  const chain = action.args[getChainKey(action.name)] || "";
  const chainId = getChainIdFromName(chain);
  if (!chainId) {
    throw new Error(getChainError(chain));
  }
  const nativeSymbol = getNativeTokenSymbolForChain(
    chainId,
    false,
  )?.toLowerCase();
  let hasDeposit = false;
  for (let i = index + 1; i < actions.length; i++) {
    if (actions[i].origin === action.origin) continue;
    if (
      getChainIdFromName(actions[i].args[getChainKey(actions[i].name)]) !==
      chainId
    )
      break;
    if (
      actions[i].name === "deposit" &&
      uniswapLikeProtocols.includes(
        (actions[i].args.protocolName || "").toLowerCase(),
      )
    ) {
      const pool = (actions[i].args.poolName || "").toLowerCase();
      const tokens = splitPool(pool);
      if (nativeSymbol && tokens.includes(nativeSymbol)) {
        hasDeposit = true;
        break;
      }
    }
  }
  return hasDeposit;
};

const checkWrap = async (
  provider: RetryProvider,
  account: string,
  chainId: ChainId,
  inToken: TokenInfo,
  outToken: TokenInfo,
  amount: bigint,
) => {
  const transactions: Transaction[] = [];
  const funcNames: string[] = [];

  try {
    const nativeSymbol = getNativeTokenSymbolForChain(chainId)?.toLowerCase();
    const wrappedToken = WrappedTokens[chainId];
    const inSymbol = inToken.symbol.toLowerCase();
    const outSymbol = outToken.symbol.toLowerCase();
    if (
      (inSymbol === nativeSymbol && outSymbol === `w${inSymbol}`) ||
      (outSymbol === nativeSymbol && inSymbol === `w${outSymbol}`)
    ) {
      let funcName: string;
      let value = "0";
      const params: ContractCallParam[] = [];
      if (inSymbol === nativeSymbol) {
        funcName = "deposit";
        value = amount.toString();
      } else {
        funcName = "withdraw";
        params.push(amount.toString());
        const approveTxs = await getApproveData(
          provider,
          inToken,
          amount,
          account,
          wrappedToken,
        );
        transactions.push(...approveTxs);
        funcNames.push(...Array(approveTxs.length).fill("Approve"));
      }
      transactions.push({
        ...(await getFunctionData(
          wrappedToken,
          abis.weth,
          funcName,
          params,
          value,
        )),
        from: account,
      });
      funcNames.push(funcName);
    }
  } catch (e) {
    sfConsoleError(e);
  }
  return { transactions, funcNames };
};

export const checkEdited = (calls: Call[], actions: Call[]) => {
  if (calls && actions) {
    const indices = actions
      .filter((x) => x.id)
      .map((x) => +(x.id || "").split("c")[1]);
    const calls_ = calls.filter((_, i) => indices.includes(i));

    const actions_ = actions.map(({ id, ...x }) => x);
    let updated = calls_.length !== actions_.length && calls_.length !== 0;
    if (!updated) {
      for (let i = 0; i < calls_.length; i++) {
        updated = !deepEqual(calls_[i], actions_[i]);
        if (updated) break;
      }
    }
    if (updated) {
      for (let i = 0; i < indices.length; i++) {
        calls[indices[i]] = actions_[i];
      }
      return calls;
    }
  }
  return null;
};

export const findHighestMCChain = async (
  symbol: string,
  chains: string[],
  extraInfo: JSONObject = {},
) => {
  const tokenInfos = await Promise.all(
    chains.map(async (chain) => ({
      chain,
      tokenInfo: await getTokenInfoForChain(symbol, chain, false, extraInfo),
    })),
  );
  const marketCaps = await Promise.all(
    tokenInfos
      .filter((x) => !!x.tokenInfo)
      .map(async ({ chain, tokenInfo }) => ({
        chain,
        marketCap: await fetchGeckoTerminalDataWithRetry(
          extraInfo.account || "",
          getChainIdFromName(chain),
          tokenInfo,
        ),
      })),
  );
  const data = marketCaps
    .filter(Boolean)
    .filter((x) => x.marketCap.market_cap)
    .sort(
      (a, b) => (b.marketCap.market_cap || 0) - (a.marketCap.market_cap || 0),
    );
  return data[0]?.chain;
};

export const updateChains = async (
  actions: RawAction[],
  action: SimAction,
  newChain0: string,
  orgChain: string,
  isFirstChainMissing = false,
) => {
  const firstAction = actions[action.origin - 1];
  let newChain = newChain0;
  let i = action.origin;
  if (firstAction.name === "swap" && !isFirstChainMissing) {
    const nextAction = actions[action.origin];
    const isNextBridge =
      nextAction?.name === "bridge" &&
      (nextAction.args.token === firstAction.args.outputToken ||
        nextAction.args.token === "outputToken") &&
      nextAction.args.amount === "outputAmount";
    const chain2 = isNextBridge
      ? nextAction.args.destinationChainName
      : firstAction.args.chainName;
    const tokenInfo = await getTokenInfoForChain(
      firstAction.args.outputToken || "",
      chain2,
    );
    if (tokenInfo?.address) {
      const middleToken = await getMiddleToken(firstAction.args, {
        chain1: newChain,
        chain2,
      });
      const outToken = (firstAction.args.outputToken || "").toLowerCase();
      if (middleToken) {
        if (outToken === "eth" || outToken === "weth") {
          actions.splice(action.origin, isNextBridge ? 1 : 0, {
            name: "bridge",
            args: {
              token: outToken,
              amount: "outputAmount",
              sourceChainName: newChain,
              destinationChainName: chain2,
            },
          });
          actions[action.origin - 1].args.chainName = newChain;
          i++;
        } else {
          actions.splice(
            action.origin - 1,
            isNextBridge ? 2 : 1,
            ...[
              {
                name: "swap",
                args: {
                  ...firstAction.args,
                  outputToken: middleToken,
                  chainName: newChain,
                },
              },
              {
                name: "bridge",
                args: {
                  token: middleToken,
                  amount: "outputAmount",
                  sourceChainName: newChain,
                  destinationChainName: chain2,
                },
              },
              {
                name: "swap",
                args: {
                  inputToken: middleToken,
                  outputToken: firstAction.args.outputToken,
                  inputAmount: "outputAmount",
                  chainName: chain2,
                },
              },
            ],
          );
          i += 2;
        }
        newChain = chain2 || "";
      }
    } else firstAction.args[getChainKey(firstAction.name)] = newChain;
  } else firstAction.args[getChainKey(firstAction.name)] = newChain;

  /* eslint-disable no-await-in-loop */
  for (; i < actions.length; i++) {
    try {
      const prevAction = actions[i - 1];
      const curAction = actions[i];
      const prevOutToken =
        prevAction.args.outputToken || prevAction.args.token || "";
      const curToken =
        curAction.args[getTokenKey(curAction.name)]?.toLowerCase() || "";
      const curAmount =
        curAction.args[getAmountKey(curAction.name)] || "outputAmount";
      const curChain = curAction.args[getChainKey(curAction.name)] || orgChain;
      if (
        curToken &&
        curAction.name !== "bridge" &&
        prevOutToken.toLowerCase() === curToken &&
        curAmount.toLowerCase() === "outputamount" &&
        curChain.toLowerCase() !== newChain.toLowerCase()
      ) {
        if (prevAction.name === "swap") {
          await getTokenInfoForChain(curToken, curChain, true);
          actions.splice(i, 0, {
            name: "bridge",
            args: {
              token: curToken,
              amount: "outputAmount",
              sourceChainName: newChain,
              destinationChainName: curChain,
            },
          });
        }
        break;
      }
    } catch {
      sfConsoleError("No need to insert bridge action while updating chains");
    }
    actions[i].args[getChainKey(actions[i].name)] = newChain;
    if (actions[i].name === "bridge") break;
  }
};

// recreate zkSync vnet, reset tenderly vnets, restart simulation
export const resetVnetStates = async (
  checkpoints: JSONObject,
  rpcs: JSONObject,
  chainIdToSkip: string | undefined = undefined,
) => {
  if (ChainIDs.zksync in rpcs && typeof rpcs[ChainIDs.zksync] === "string") {
    await recreateVnet(rpcs[ChainIDs.zksync]);
  }
  await Promise.all(
    Object.keys(checkpoints).map(async (chainId) => {
      if (
        Number(chainId) === ChainIDs.zksync ||
        (chainIdToSkip && chainId === chainIdToSkip)
      )
        return;
      if (chainId.includes("hyperliquid")) {
        rpcs[chainId] = JSON.parse(JSON.stringify(checkpoints[chainId]));
      } else {
        // Perform the revert operation and await its result.
        await withRetry("", () =>
          new RetryProvider(rpcs[+chainId], +chainId).send("evm_revert", [
            checkpoints[chainId],
          ]),
        );
      }
    }),
  );
  Object.keys(rpcs).forEach((chainId, _) => {
    if (!Object.keys(checkpoints).includes(chainId)) {
      delete rpcs[chainId];
    }
  });
};

export const getErrorMessage = (err: unknown) => {
  if (err instanceof AxiosError) {
    return (
      err.response?.data?.message ??
      err.response?.data?.error ??
      err.response?.data?.status?.error_message ??
      err.response?.data ??
      `${err}`
    );
  }
  if (err instanceof Error) return err.message ?? `${err}`;
  return `${err}`;
};

export const isNaNValue = (value: unknown) => {
  if (typeof value === "number") return Number.isNaN(value);
  if (typeof value === "string") return Number.isNaN(+value);
  return value === undefined || value === null;
};

export const splitPool = (pool?: string) => {
  if (!pool) return [];

  let symbols = pool.split("-");
  if (symbols.length < 2) {
    symbols = pool.split("/");
  } else {
    if (symbols[0].includes("/")) {
      symbols = symbols[0].split("/");
    } else if (symbols[1].includes("/")) {
      symbols = symbols[1].split("/");
    }
  }
  return symbols.map((x) => x.toLowerCase());
};

export const clearTokenCache = (
  chainName: string | undefined,
  symbol: string | undefined,
  address: string,
  provider: RetryProvider,
  baseLiquidity: number,
) => {
  if (!symbol) return;

  const symbolDown = symbol.toLowerCase();
  const chainId = getChainIdFromName(chainName, true);
  let key = JSON.stringify([
    chainId,
    symbolDown,
    { account: address, provider },
  ]);
  delete memoizeCache[`getTokenForChainI:${key}`];
  key = JSON.stringify([
    chainId,
    symbolDown,
    { liquidityThreshold: baseLiquidity },
  ]);
  delete memoizeCache[`getTokenForChainI:${key}`];
  key = JSON.stringify([chainId, symbolDown, {}]);
  delete memoizeCache[`getTokenForChainI:${key}`];
};

const getLiquidityForTokenI = async (chainId: ChainId, address: string) => {
  let liquidity = 0;
  try {
    const {
      data: { data },
    }: {
      data: { data: TokenPoolResponse[] };
    } = await withRetry(
      "",
      () =>
        axios.get(
          `${CGC_API_ENDPOINT}/onchain/networks/${CoingeckoData.geckoIds[chainId]}/tokens/${address}/pools`,
          { headers: { "x-cg-pro-api-key": CGC_API_KEY } },
        ),
      2,
    );
    liquidity += data.reduce((a, b) => a + +b.attributes.reserve_in_usd, 0);
  } catch {
    // sfConsoleError(getErrorMessage(error));
    // sfConsoleError("liquidity failure", chainId, address);
  }
  return liquidity;
};

const getLiquidityForToken = memoizeWithExpiration(
  getLiquidityForTokenI,
  TTL_3_HOURS * 4,
);

export const getTokenHistoryI = async (chainId: ChainId, tokenName: string) => {
  try {
    if (!chainId || !tokenName) {
      throw new Error("Chain ID and token name are required");
    }

    const chainName = getChainNameFromId(Number(chainId));
    if (!chainName) {
      throw new Error(`Invalid chain ID: ${chainId}`);
    }

    const tokenInfo = await getTokenInfoForChain(tokenName, chainName);
    if (!tokenInfo) {
      throw new Error("Token not found");
    }

    const cgId = tokenInfo.coingeckoId || tokenInfo.id;
    const vsCurrency = "usd";
    const days = "7";
    const url = `https://pro-api.coingecko.com/api/v3/coins/${cgId}/market_chart?vs_currency=${vsCurrency}&days=${days}`;

    const { data } = await withRetry("", () =>
      axios.get(url, {
        headers: { "x-cg-pro-api-key": process.env.CGC_API_KEY },
      }),
    );

    const priceData = (data.prices as [number, number][]).map(
      ([timestamp, price]) => ({ timestamp, price }),
    );

    return priceData;
  } catch (err) {
    if (err instanceof AxiosError) {
      sfConsoleError(
        "Error fetching token history:",
        err.response?.data?.error,
        chainId,
        tokenName,
      );
    } else {
      sfConsoleError("Error fetching token history");
    }
    throw new Error("Failed to fetch token history");
  }
};

export const getTokenHistoryMemoized = memoizeWithExpiration(
  getTokenHistoryI,
  10 * 60 * 1000, // 10 minutes in milliseconds
);

const filterMultipleTokens = async (
  tokens: Tokens[],
  isAddressOrNative: boolean,
  chainId: ChainId | undefined,
  liquidityThreshold = 0,
): Promise<Tokens[]> => {
  if (!chainId) return tokens;

  const targetChainTokens = tokens.filter((x) => x.chainId === chainId);
  if (!targetChainTokens.length || isAddressOrNative) return targetChainTokens;
  const tokensWithLiquidity = await Promise.all(
    tokens.map(async (x) => {
      let address = x.address;
      if (address === NATIVE_TOKEN) address = NATIVE_TOKEN2;
      if (chainId !== 101) address = address.toLowerCase();
      const liquidity = await getLiquidityForToken(
        x.chainId as ChainId,
        address,
      );
      return { ...x, liquidity };
    }),
  );
  return tokensWithLiquidity
    .sort((a, b) => b.liquidity - a.liquidity)
    .filter((x) => x.chainId === chainId && x.liquidity >= liquidityThreshold)
    .map(({ liquidity, ...x }) => x as Tokens);
};

export const saveToken = async (tokenData: {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  chainId: number;
  thumb?: string;
}) => {
  const token = await Tokens.findOne({
    where: {
      address: tokenData.address,
      chainId: tokenData.chainId,
    },
  });
  if (token) {
    return;
  }
  await new Tokens(tokenData).save();
};

export const isSolanaAddress = (address: string) => {
  // First check if it matches Solana address format
  if (!/^[0-9a-zA-Z]{32,44}$/.test(address) || address.startsWith("0x")) {
    return false;
  }
  return true;
};

const getHyperliquidOngoingTwapsI = async (accountAddress: string) => {
  const printError = usePrintError(accountAddress);

  const twapHistories: JSONObject[] = [];

  try {
    const { data } = await withRetry(accountAddress as string, () =>
      axios.post(`${HYPERLIQUID_API_ENDPOINT}/info`, {
        type: "webData2",
        user: accountAddress,
      }),
    );

    const twapIds: number[] = data.twapStates.map(
      (state: [number, object]) => state[0],
    );

    if (twapIds.length > 0) {
      const histories: JSONObject[] = await Histories.findAll({
        where: {
          useraddress: accountAddress?.toString()?.toLowerCase(),
          [Op.and]: sequelize.literal(
            twapIds
              .map((id) => `actions @> '[{"twapId" : "${id}"}]'`)
              .join(" OR "),
          ),
        },
        raw: true,
      });

      const getTwapDetail = (action: JSONObject) => {
        return data.twapStates.find(
          (state: [number, object]) => state[0].toString() === action.twapId,
        )?.[1];
      };

      for (const history of histories) {
        history.actions = history.actions.filter((action: JSONObject) =>
          getTwapDetail(action),
        );
        for (const action of history.actions) {
          twapHistories.push({
            ...history,
            id: `twap${action.twapId}`,
            actions: [
              {
                name: action.name,
                args: action.args,
                twapId: action.twapId,
                twapDetails: getTwapDetail(action),
              },
            ],
          });
        }
      }
    }
  } catch (err) {
    printError(err);
  }

  return twapHistories;
};

const getHyperliquidOpenOrdersI = async (accountAddress: string) => {
  const printError = usePrintError(accountAddress);

  const orderHistories: JSONObject[] = [];

  try {
    const { data } = await withRetry(accountAddress as string, () =>
      axios.post(`${HYPERLIQUID_API_ENDPOINT}/info`, {
        type: "openOrders",
        user: accountAddress,
      }),
    );

    const orderIds: number[] = data.map((order: { oid: number }) => order.oid);

    if (orderIds.length > 0) {
      const histories: JSONObject[] = await Histories.findAll({
        where: {
          useraddress: accountAddress?.toString()?.toLowerCase(),
          [Op.and]: sequelize.literal(
            orderIds
              .map((id) => `actions @> '[{"orderId" : "${id}"}]'`)
              .join(" OR "),
          ),
        },
        raw: true,
      });

      const getOrderDetail = (action: JSONObject) => {
        return data.find(
          (order: { oid: number }) => order.oid.toString() === action.orderId,
        );
      };

      for (const history of histories) {
        history.actions = history.actions.filter((action: JSONObject) =>
          getOrderDetail(action),
        );
        for (const action of history.actions) {
          orderHistories.push({
            ...history,
            id: `order${action.orderId}`,
            actions: [
              {
                name: action.name,
                args: action.args,
                orderId: action.orderId,
                orderDetails: getOrderDetail(action),
              },
            ],
          });
        }
      }
    }
  } catch (err) {
    printError(err);
  }

  return orderHistories;
};

export const getHyperliquidOngoingTwaps = memoizeWithExpiration(
  getHyperliquidOngoingTwapsI,
  TTL_1_MIN / 4,
);
export const getHyperliquidOpenOrders = memoizeWithExpiration(
  getHyperliquidOpenOrdersI,
  TTL_1_MIN / 4,
);

// Get number of different characters between two strings
const diffBetweenTwoStrings = (sourceStr?: string, targetStr?: string) => {
  const source = sourceStr?.toLowerCase() || "";
  const target = targetStr?.toLowerCase() || "";

  const dp = Array(source.length + 1)
    .fill(0)
    .map(() => Array(target.length + 1).fill(0));

  // Fill the dp table
  for (let i = source.length; i >= 0; i--) {
    for (let j = target.length; j >= 0; j--) {
      if (i === source.length) {
        dp[i][j] = target.length - j;
      } else if (j === target.length) {
        dp[i][j] = source.length - i;
      } else if (source[i] === target[j]) {
        dp[i][j] = dp[i + 1][j + 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  let difference = 0;
  let i = 0;
  let j = 0;
  while (i < source.length && j < target.length) {
    if (source[i] === target[j]) {
      i++;
      j++;
    } else {
      difference++;
      if (dp[i + 1][j] <= dp[i][j + 1]) {
        i++;
      } else {
        j++;
      }
    }
  }

  difference += source.length - i;
  difference += target.length - j;

  return difference;
};
