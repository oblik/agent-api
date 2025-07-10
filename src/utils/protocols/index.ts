import axios from "axios";
import ProtocolActionTokens from "../../config/actionToken.js";
import ProtocolAddresses from "../../config/addresses.js";
import DebankData from "../../config/common/debank.js";
import ProtocolPools from "../../config/pools.js";
import {
  HYPERLIQUID_API_ENDPOINT,
  getChainNameFromId,
  getCoinData,
  getNativeTokenSymbolForChain,
  getRpcUrlForChain,
  getTokenAmount,
  getTokenInfoForChain,
  sfParseUnits,
  splitPool,
  uniswapLikeProtocols,
  withRetry,
} from "../index.js";
import { getErrorMessage } from "../index.js";
import { sfConsoleError, usePrintError, usePrintLog } from "../log.js";
import { RetryProvider } from "../retryProvider.js";
import type {
  ChainId,
  CommonArgs,
  DebankPoolInfo,
  DebankPositionInfo,
  DebankProtocolInfo,
  DebankTokenInfo,
  JSONObject,
  Portfolio,
  PortfolioPosition,
  PortfolioToken,
  RawAction,
} from "../types.js";
import { assert, isChainId, isDefined } from "../types.js";
import aave, { getBorrowableAmountFromAave } from "./aave.js";
import aerodrome from "./aerodrome.js";
import ambient from "./ambient.js";
import bladeswap from "./bladeswap.js";
import camelot from "./camelot.js";
import compound, { getBorrowableAmountFromCompound } from "./compound.js";
import curve from "./curve.js";
import dolomite from "./dolomite.js";
// import dopex from "./dopex.js";
import eigenlayer from "./eigenlayer.js";
import ethena from "./ethena.js";
import etherfi from "./etherfi.js";
import gmx, { getGMXMarket, getGMXTokensToClose } from "./gmx.js";
import hop from "./hop.js";
import hyperliquid, { getHyperliquidTokensToClose } from "./hyperliquid.js";
import jonesdao from "./jonesdao.js";
import juice, { getBorrowableAmountFromJuice } from "./juice.js";
import kelpdao from "./kelpdao.js";
import kwenta from "./kwenta.js";
import lido from "./lido.js";
import lodestar, { getBorrowableAmountFromLodestar } from "./lodestar.js";
import pendle, { extractPendleToken } from "./pendle.js";
import plutus from "./plutus.js";
import renzo from "./renzo.js";
import rocketpool from "./rocketpool.js";
// import rodeo from "./rodeo.js";
import stargate from "./stargate.js";
import swell from "./swell.js";
import synapse from "./synapse.js";
import thena from "./thena.js";
import thruster from "./thruster.js";
import uniswap from "./uniswap.js";
import velodrome from "./velodrome.js";

const poolRequireProtocols = [
  "curve",
  "gmx",
  "pendle",
  "uniswap",
  "camelot",
  "velodrome",
  "aerodrome",
  "thruster",
];
export const protocolValidActions = [
  "claim",
  "withdraw",
  "unstake",
  "unlock",
  "repay",
  "close",
];

export const getTokensForAction = async (
  account: string,
  actionName: string,
  { protocolName, poolName, range }: CommonArgs,
  { provider, chainId }: { provider: RetryProvider; chainId: ChainId },
  rpcs?: JSONObject,
) => {
  if (!protocolValidActions.includes(actionName)) {
    return [];
  }

  if (actionName === "close" && protocolName === "gmx") {
    return await getGMXTokensToClose(account, chainId, provider);
  }
  if (actionName === "close" && protocolName === "hyperliquid") {
    if (rpcs?.hyperliquid) {
      return rpcs.hyperliquid
        .filter(
          (position: DebankPositionInfo) => position.type === "Perpetuals",
        )
        .map((position: DebankPositionInfo) => {
          const token = position.tokens[0].symbol;
          return {
            poolName: token,
            symbol: token,
            amount: sfParseUnits(position.tokens[1].amount || "0", 6),
          };
        }) as PortfolioToken[];
    }
    return await getHyperliquidTokensToClose(account);
  }

  const printError = usePrintError(account);

  try {
    if (!protocolName) throw new Error("No protocol name specified");
    let protocols = await getUserPositions(
      chainId,
      account,
      protocolName,
      null,
      range && protocolName === "camelot" ? "2" : "",
    );
    const tokens: PortfolioToken[] = [];
    if (
      poolName &&
      poolName !== "all" &&
      protocolName &&
      poolRequireProtocols.includes(protocolName)
    ) {
      protocols = protocols
        .filter((x) => x.name === protocolName)
        .map((x) => ({
          name: x.name,
          positions: x.positions.filter((y: PortfolioPosition) => {
            if (
              uniswapLikeProtocols.includes(protocolName) ||
              protocolName === "ambient"
            ) {
              if (
                y.poolName === poolName ||
                y.poolName?.split("-").reverse().join("-") === poolName
              ) {
                return true;
              }
              const poolTokens1 = y.poolName?.split("-");
              const poolTokens2 = poolName.split("-");
              for (let i = 0; i < 2; i++) {
                if (poolTokens1?.[i] === "weth") poolTokens1[i] = "eth";
                if (poolTokens2[i] === "weth") poolTokens2[i] = "eth";
              }
              return (
                poolTokens1?.join("-") === poolTokens2.join("-") ||
                poolTokens1?.reverse().join("-") === poolTokens2.join("-")
              );
            }
            return comparePool(
              protocolName,
              chainId,
              y.poolName || "",
              poolName,
            );
          }),
        }))
        .filter((x) => x.positions.length > 0);
    }

    const keys = getKeysForAction(actionName);
    if (protocolName === "pendle" && actionName === "withdraw") {
      keys.push("Staked");
    }
    for (const protocol of protocols) {
      for (const {
        poolName,
        name,
        positionIndex,
        lowerTick,
        upperTick,
        supply,
        borrow,
        reward,
      } of protocol.positions.filter(
        (x) => protocolName !== "ambient" || (x.lowerTick && x.upperTick),
      )) {
        if (actionName !== "repay") {
          if (supply && supply.length > 0 && keys?.includes(name)) {
            tokens.push(
              ...supply.map((x) => ({
                ...x,
                poolName,
                positionIndex,
                lowerTick,
                upperTick,
              })),
            );
          } else if (actionName === "claim" && reward && reward.length > 0) {
            tokens.push(
              ...reward.map((x) => ({ ...x, poolName, positionIndex })),
            );
          }
        } else if (borrow && borrow.length > 0) {
          tokens.push(
            ...borrow.map((x) => ({ ...x, poolName, positionIndex })),
          );
        }
      }
    }

    return tokens;
  } catch (err) {
    printError(err);
    return [];
  }
};

export const getTokensForDeposit = (
  { protocolName, poolName }: CommonArgs,
  chainId: ChainId,
): string[] => {
  const tokens0 =
    typeof protocolName === "string"
      ? ProtocolActionTokens[protocolName.toLowerCase()]
      : undefined;
  if (!tokens0) return [];
  const tokens1 = tokens0[chainId];
  if (!tokens1) return [];
  const tokens = tokens1.deposit;
  if (!tokens) return [];

  if (Array.isArray(tokens)) {
    return tokens;
  }

  if ((tokens as { form: string }).form) {
    return splitPool(poolName);
  }

  const pools = Object.keys(tokens);
  const poolIdx = pools.findIndex(
    (pool) => pool.toLowerCase() === poolName?.toLowerCase(),
  );
  if (poolIdx < 0) {
    return [];
  }
  const tkns = tokens[pools[poolIdx]];
  return Array.isArray(tkns)
    ? (tkns as string[]).map((token) => token.toLowerCase())
    : [];
};

export const getUserPositions = async (
  chainId: ChainId,
  account: string,
  protocolName: string | undefined = undefined,
  actionName: string | null = null,
  suffix = "",
): Promise<Portfolio[]> => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);

  let chain_id = DebankData.chainIds[chainId];
  let protocolsData: DebankProtocolInfo[] = [];
  let protocol_id = protocolName || "";

  try {
    if (protocolName?.toLowerCase() === "hyperliquid") {
      const { data } = await withRetry(account, () =>
        axios.post(`${HYPERLIQUID_API_ENDPOINT}/info`, {
          type: "clearinghouseState",
          user: account,
        }),
      );

      if (Number.parseFloat(data.withdrawable)) {
        return [
          {
            name: "hyperliquid",
            positions: [
              {
                name: "Deposit",
                poolName: "USDC",
                supply: [
                  {
                    symbol: "USDC",
                    amount: sfParseUnits(data.withdrawable, 6),
                    decimals: 6,
                  },
                ],
              },
            ],
          },
        ];
      }
    } else if (!protocol_id || protocol_id === "all") {
      const queryParams = new URLSearchParams({ id: account, chain_id });
      const { data } = await withRetry(account, () =>
        axios.get(
          `https://pro-openapi.debank.com/v1/user/complex_protocol_list?${queryParams}`,
          { headers: { AccessKey: process.env.DEBANK_ACCESS_KEY } },
        ),
      );
      protocolsData = data;
    } else {
      if (!chain_id) {
        chain_id =
          DebankData.chainIds[
            Object.keys(ProtocolAddresses[protocol_id]).sort()[0]
          ];
      }
      if (protocolName) {
        protocol_id =
          DebankData.reversed_protocols[protocolName] || protocolName;
      }
      if (chain_id !== "eth") {
        protocol_id = `${chain_id}_${protocol_id}`;
      }

      protocol_id += suffix;

      const queryParams = new URLSearchParams({ id: account, protocol_id });
      const { data } = await withRetry(account, () =>
        axios.get(
          `https://pro-openapi.debank.com/v1/user/protocol?${queryParams}`,
          { headers: { AccessKey: process.env.DEBANK_ACCESS_KEY } },
        ),
      );
      protocolsData = [data];
    }
  } catch (err) {
    printLog("Failed to get user's positions from Debank");
    printError(getErrorMessage(err));
  }

  const protocols: Portfolio[] = [];
  await Promise.all(
    protocolsData.map(async (protocol) => {
      const { id, chain, portfolio_item_list } = protocol;
      let name = id.replace(`${chain}_`, "");
      name = DebankData.protocols[name] || name;
      if (/\d/.test(name)) {
        return;
      }

      let portfolios = portfolio_item_list;
      if (actionName) {
        portfolios = portfolios.filter((x) => x.name === actionName);
        if (portfolios.length === 0) {
          return;
        }
      }

      const positions: PortfolioPosition[] = [];
      await Promise.all(
        portfolios.map(async (portfolio: DebankPositionInfo) => {
          const { description, health_rate } = portfolio.detail;
          const data: PortfolioPosition = { name: portfolio.name };
          const tokenData = await extractTokenInfo(
            name,
            portfolio.detail,
            account,
          );
          data.supply = tokenData.supply;
          data.borrow = tokenData.borrow;
          data.reward = tokenData.reward;
          data.healthRate = health_rate;

          if (name === "curve") {
            data.poolName =
              DebankData.pools[description.toLowerCase()] ||
              description.toLowerCase();
          } else if (name === "gmx" || name === "pendle") {
            const protocolAddresses = ProtocolAddresses[name];
            const addresses =
              protocolAddresses[chainId] ||
              protocolAddresses[chainId.toString()];
            const position = (portfolio.position_index || "").split("_");
            const pool = Object.entries(
              addresses as Record<string, string>,
            ).find(
              ([, value]) =>
                value?.toLowerCase() === portfolio.pool.id?.toLowerCase() ||
                position?.includes(value?.toLowerCase()),
            );
            if (pool) {
              data.poolName = pool[0];
            }
          } else if (name === "ambient") {
            const parts = portfolio.position_index?.split("_") || [];
            data.lowerTick = Number.parseFloat(parts[3]);
            data.upperTick = Number.parseFloat(parts[4]);
            if (data.supply?.[0] && data.supply?.[1]) {
              data.poolName =
                `${data.supply[0].symbol}-${data.supply[1].symbol}`.toLowerCase();
            }
          } else if (uniswapLikeProtocols.includes(name)) {
            const positionIndex = portfolio.position_index;
            if (positionIndex) {
              if (positionIndex.startsWith("0x") && positionIndex.includes(":"))
                data.positionIndex = positionIndex.split(":")[1];
              else data.positionIndex = positionIndex;
            }
            if (data.supply?.[0] && data.supply?.[1]) {
              data.poolName =
                `${data.supply[0].symbol}-${data.supply[1].symbol}`.toLowerCase();
            }
          } else if (name === "compound") {
            if (portfolio.pool) {
              const compoundAddresses = ProtocolAddresses.compound[chainId];
              data.poolName = Object.keys(compoundAddresses).find(
                (pool) =>
                  compoundAddresses[pool].toLowerCase() ===
                  portfolio.pool.controller?.toLowerCase(),
              );
            }
            if (!data.poolName && data.supply?.[0]) {
              data.poolName = data.supply[0].symbol.toLowerCase();
            }
          }
          if (poolRequireProtocols.includes(name) && !data.poolName) {
            return;
          }
          positions.push(data);
        }),
      );
      protocols.push({ name, positions });
    }),
  );
  return protocols;
};

export const getAlternativeChain = async (
  account: string,
  action: RawAction,
  excludeChainId?: ChainId,
  rpcs: Record<number, string> = {},
) => {
  const protocol = (action.args.protocolName || "").toLowerCase();
  const token = action.args.token || "";
  const allChains = Object.keys(ProtocolAddresses[protocol]);
  const chains: string[] = [];
  const chainPromises = allChains
    .filter((chain) => chain && +chain !== +(excludeChainId || -1))
    .map(async (chain) => {
      const chainId = +chain;
      if (!isChainId(chainId)) {
        console.log(`protocols: ${chainId} chainId is not valid`);
        return;
      }
      const nativeToken = getNativeTokenSymbolForChain(+chain)?.toLowerCase();
      const rpc = rpcs[+chain] || getRpcUrlForChain(+chain);
      const provider = new RetryProvider(rpc, +chain);
      const tokens = await getTokensForAction(
        account,
        action.name,
        action.args,
        { chainId, provider },
        rpcs,
      );
      if (tokens.length === 0) return null;

      const tokenStr =
        action.name === "close" &&
        protocol === "gmx" &&
        token.toLowerCase().startsWith("w")
          ? token.slice(1).toLowerCase()
          : token.toLowerCase();

      const temp = tokens.filter(
        (x) =>
          token === "all" ||
          token === "liquidity" ||
          token === "" ||
          protocol === "pendle" ||
          x.symbol.toLowerCase() === tokenStr.toLowerCase(),
      );

      if (temp.length > 0) return chain;
      if (
        (tokenStr === nativeToken &&
          tokens.find((x) => x.symbol.toLowerCase() === `w${tokenStr}`)) ||
        (tokenStr === `w${nativeToken}` &&
          tokens.find((x) => x.symbol.toLowerCase() === tokenStr.slice(1)))
      ) {
        return chain;
      }

      return null;
    });
  const results = await Promise.all(chainPromises);
  chains.push(...results.filter((chain): chain is string => chain !== null));
  if (chains.length === 1)
    return { status: 1, chain: getChainNameFromId(chains[0]) };
  return { status: 0, chains: chains.map(getChainNameFromId) };
};

export const getPoolsForProtocol = (
  account: string,
  protocol: string | undefined,
  chainId: ChainId,
) => {
  const printError = usePrintError(account);

  const protocolName = protocol?.toLowerCase();
  const protocolAddresses = ProtocolAddresses[protocolName || ""];
  const protocolPools = ProtocolPools[protocolName || ""];
  try {
    switch (protocolName) {
      case "jonesdao":
      case "lodestar":
      case "plutus":
      case "etherfi":
      case "aave":
      case "camelot":
      case "dolomite":
      case "dopex":
      case "eigenlayer":
      case "ethena":
      case "kelpdao":
      case "kwenta":
      case "lido":
      case "renzo":
      case "rocketpool":
      case "rodeo":
      case "swell":
      case "synapse":
      case "thena":
        return ["any"];
      case "compound":
        return Object.keys(
          protocolAddresses[chainId] ||
            protocolAddresses[chainId.toString()] ||
            {},
        )
          .filter((x) => !x.includes("rewards"))
          .filter((x) => !x.includes("bridge"))
          .filter((x) => !x.includes("Swap"))
          .filter((x) => !x.includes("staking"))
          .filter((x) => !x.includes("router"))
          .filter((x) => !x.includes("factory"));
      case "stargate":
        return Object.keys(
          protocolPools[chainId] || protocolPools[chainId.toString()] || {},
        ).filter((x) => x.includes("*"));
      default:
        return [];
    }
  } catch (err) {
    printError(err);
    return [];
  }
};

const extractTokenInfo = async (
  protocolName: string,
  portfolio: DebankPoolInfo,
  account: string,
) => {
  const { supply_token_list, borrow_token_list, reward_token_list } = portfolio;
  const supply: PortfolioToken[] = [];
  const borrow: PortfolioToken[] = [];
  const reward: PortfolioToken[] = [];

  const getTokenData = async (
    debankTokenInfo: DebankTokenInfo,
  ): Promise<PortfolioToken | undefined> => {
    let chainName: string | undefined;
    let chainId: string | undefined;
    try {
      chainId = Object.entries(DebankData.chainIds).find(
        ([, value]) => value === debankTokenInfo.chain,
      )?.[0];
      if (!chainId) return;
      chainName = getChainNameFromId(chainId);
    } catch (err) {
      /* error fetching chain name from debank chain info */
      console.log(err);
    }
    const tokenInfo = await getTokenInfoForChain(
      debankTokenInfo.id !== debankTokenInfo.chain
        ? debankTokenInfo.id
        : debankTokenInfo.symbol,
      chainName,
    );
    if (!tokenInfo) return;
    let tokenBalance: bigint | undefined = undefined;
    let decimals = tokenInfo.decimals || 18;
    if (chainId) {
      const rpcUrl = getRpcUrlForChain(+chainId);
      const provider = new RetryProvider(rpcUrl, +chainId);
      const tokenAmount = await getTokenAmount(provider, tokenInfo, account);
      tokenBalance = tokenAmount.amount;
      decimals = tokenAmount.decimals;
    }
    const debankBalance = sfParseUnits(debankTokenInfo.amount, decimals);
    return {
      symbol: tokenInfo.symbol,
      amount:
        protocolName === "pendle" &&
        tokenBalance &&
        tokenBalance < debankBalance
          ? tokenBalance
          : debankBalance,
      decimals,
    };
  };

  await Promise.all([
    ...(supply_token_list || []).map(async (token) => {
      const tokenData = await getTokenData(token);
      if (tokenData) supply.push(tokenData);
    }),
    ...(borrow_token_list || []).map(async (token) => {
      const tokenData = await getTokenData(token);
      if (tokenData) borrow.push(tokenData);
    }),
    ...(reward_token_list || []).map(async (token) => {
      const tokenData = await getTokenData(token);
      if (tokenData) reward.push(tokenData);
    }),
  ]);

  return { supply, borrow, reward };
};

export const getLoanValueForProtocol = async (
  account: string,
  protocol: string,
  mode: boolean,
) => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);

  const chainIds = Object.keys(ProtocolAddresses[protocol])
    .map((x) => DebankData.chainIds[x])
    .filter(Boolean);
  const protocolsData: JSONObject[] = [];

  await Promise.all(
    chainIds.map(async (chain_id) => {
      try {
        let protocol_id = DebankData.reversed_protocols[protocol] || protocol;
        if (chain_id !== "eth") {
          protocol_id = `${chain_id}_${protocol_id}`;
        }

        const queryParams = new URLSearchParams({ id: account, protocol_id });
        const { data } = await withRetry(account, () =>
          axios.get(
            `https://pro-openapi.debank.com/v1/user/protocol?${queryParams}`,
            { headers: { AccessKey: process.env.DEBANK_ACCESS_KEY } },
          ),
        );
        protocolsData.push(data);
      } catch (err) {
        printLog("Failed to get user's positions from Debank");
        printError(getErrorMessage(err));
      }
    }),
  );

  let ret: number | undefined;
  for (const protocol of protocolsData) {
    const { id, chain, portfolio_item_list } = protocol;
    let name = id.replace(`${chain}_`, "");
    name = DebankData.protocols[name] || name;
    if (/\d/.test(name)) {
      continue;
    }

    for (const portfolio of portfolio_item_list) {
      const { detail, stats } = portfolio;
      const value = mode
        ? detail.health_rate
        : stats.asset_usd_value > 0
          ? stats.debt_usd_value / stats.asset_usd_value
          : 0;
      if (value) {
        if (!ret || ret > value) ret = value;
      }
    }
  }
  return ret;
};

export const getBorrowableAmountForToken = async (
  chainId: ChainId,
  protocol: string | undefined,
  account: string,
  symbol: string | undefined,
  rpc: string | undefined = undefined,
  pool: string | undefined = undefined,
) => {
  const rpcUrl = rpc || getRpcUrlForChain(chainId);
  const provider = new RetryProvider(rpcUrl, chainId);
  const tokenInfo = await getTokenInfoForChain(
    symbol,
    getChainNameFromId(chainId),
    false,
    { account, provider },
  );
  let collateral = 0;
  try {
    if (protocol === "aave") {
      collateral = await getBorrowableAmountFromAave(
        chainId,
        account,
        symbol,
        provider,
      );
    } else if (protocol === "compound") {
      collateral = await getBorrowableAmountFromCompound(
        chainId,
        account,
        symbol,
        provider,
      );
    } else if (protocol === "lodestar" && tokenInfo) {
      collateral = await getBorrowableAmountFromLodestar(
        chainId,
        account,
        tokenInfo,
        provider,
      );
    } else if (protocol === "juice" && tokenInfo) {
      collateral = await getBorrowableAmountFromJuice(
        chainId,
        account,
        tokenInfo,
        provider,
        pool,
      );
    }
  } catch (err) {
    sfConsoleError(err);
  }
  if (collateral === 0) return 0;

  let { price } = await getCoinData(account, tokenInfo?.symbol, chainId);
  if (protocol === "lodestar") price = 1;
  assert(isDefined(price));
  return collateral / price;
};

export const getMarketInfoForProtocol = async (
  account: string,
  protocol: string,
  outToken: string,
  chainId: ChainId,
): Promise<{ funding?: number; interest?: number }> => {
  const printLog = usePrintLog(account);
  const printError = usePrintError(account);

  let ret = {};
  try {
    if (protocol.toLowerCase() === "gmx") {
      ret = await getGMXMarket(account, chainId, outToken);
    } else if (protocol.toLowerCase() === "hyperliquid") {
      const { data } = await withRetry(account, () =>
        axios.post(`${HYPERLIQUID_API_ENDPOINT}/info`, {
          type: "metaAndAssetCtxs",
        }),
      );
      const index = data[0].universe.findIndex(
        (x: { name: string }) => x.name.toLowerCase() === outToken,
      );
      ret = {
        funding: +data[1][index].funding,
        interest: +data[1][index].openInterest,
      };
    }
  } catch (err) {
    printLog(`Failed to get market ${outToken} info for protocol ${protocol}`);
    printError(getErrorMessage(err));
  }

  return ret;
};

export const getProtocolErrorMessage = (
  action: string,
  token: string | undefined,
  protocol: string | undefined,
  chainId: ChainId,
  pool: string | undefined = undefined,
) => {
  const chainName = getChainNameFromId(chainId);
  return `Performing a ${action.toLowerCase()} on the token ${token?.toLowerCase()} on protocol ${protocol?.toLowerCase()}${pool ? ` on the pool ${pool.toLowerCase()}` : ""} on chain ${(chainName || "unsupported chain").toLowerCase()} is not supported. Please try again.`;
};

export const getABIErrorMessage = (address: string, chainId: ChainId) => {
  const chainName = getChainNameFromId(chainId);
  return `ABI for contract ${address.toLowerCase()} on chain ${chainName?.toLowerCase()} is not supported. Please ask administrator.`;
};

export const getKeysForAction = (action: string) => {
  let keys: string[] = [];
  switch (action) {
    case "claim":
      keys = ["Staked", "Rewards"];
      break;
    case "withdraw":
      keys = ["Liquidity Pool", "Deposit", "Farming", "Lending", "Yield"];
      break;
    case "unstake":
      keys = ["Staked", "Yield", "Investment"];
      break;
    case "unlock":
      keys = ["Locked", "Vesting"];
      break;
    case "close":
      keys = ["Perpetuals"];
      break;
    default:
      keys = [];
  }
  return keys;
};

const comparePool = (
  protocol: string,
  chainId: ChainId,
  debankPool: string,
  pool: string,
) => {
  let debankPool_ = debankPool.toLowerCase();
  let pool_ = pool.toLowerCase();
  if (protocol === "pendle") {
    debankPool_ = extractPendleToken(debankPool_);
    pool_ = extractPendleToken(pool_);
    // if pool is lp or a non-specified type of pendle
    if (
      pool_ === pool.toLowerCase() ||
      pool_ === pool.toLowerCase().replace("-lp", "")
    ) {
      const marketKeys = Object.keys(ProtocolAddresses.pendle[chainId]).filter(
        (x) => x?.includes(`${pool_}`) && x?.endsWith("-lp"),
      );
      return marketKeys.some((marketKey) => debankPool === marketKey);
    }
    const prefix = pool.toLowerCase().split("-")[0];
    return debankPool_ === pool_ && debankPool.startsWith(prefix);
  }
  return debankPool_ === pool_;
};

const protocolActionMap = {
  aave,
  aerodrome,
  ambient,
  bladeswap,
  camelot,
  compound,
  curve,
  // dopex,
  dolomite,
  eigenlayer,
  ethena,
  etherfi,
  gmx,
  hop,
  hyperliquid,
  jonesdao,
  juice,
  kelpdao,
  kwenta,
  lido,
  lodestar,
  pendle,
  plutus,
  renzo,
  rocketpool,
  // rodeo,
  stargate,
  synapse,
  swell,
  thena,
  thruster,
  uniswap,
  velodrome,
};

export type ActionMap = typeof protocolActionMap;
export default protocolActionMap;
