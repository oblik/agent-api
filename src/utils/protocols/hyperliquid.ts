import axios from "axios";
import CCXT, { type Market } from "ccxt";
import { ethers } from "ethers";
import { abis } from "../../config/abis.js";
import { getUnsupportedActionError } from "../error.js";
import {
  HYPERLIQUID_API_ENDPOINT,
  getCoinData,
  getFunctionData,
  getProtocolAddressForChain,
  withRetry,
} from "../index.js";
import { usePrintError } from "../log.js";
import type {
  BalanceChange,
  ChainId,
  HyperliquidSpotTokenR,
  PortfolioToken,
  ProtocolActionData,
  TokenInfo,
  Transaction,
} from "../types.js";

export type SignData = {
  market?: string;
  side?: "buy" | "sell";
  price?: number;
  destination?: string;
  time?: number;
  amount?: number;
  leverageMultiplier?: number;
  outputAmount?: number;
};

let cachedMarkets: Market[];
let lastFetchTime = 0;
const CACHE_TTL = 30000; // 30 seconds in milliseconds

async function getMarkets(accountAddress: string): Promise<Market[]> {
  const now = Date.now();

  // Return cached data if it's less than 30 seconds old
  if (cachedMarkets && now - lastFetchTime < CACHE_TTL) {
    return cachedMarkets;
  }

  // Fetch fresh data
  const wallet = ethers.Wallet.createRandom();
  const exchange = new CCXT.hyperliquid({
    privateKey: wallet.privateKey,
    walletAddress: accountAddress,
  });
  if (HYPERLIQUID_API_ENDPOINT.includes("testnet")) {
    exchange.setSandboxMode(true);
  }

  cachedMarkets = await exchange.fetchMarkets();
  lastFetchTime = now;
  return cachedMarkets;
}

async function getMarketPrice(accountAddress: string, poolName: string) {
  let price = 0;
  const marketData = await getMarkets(accountAddress);
  const poolData = marketData.filter(
    (item) => item?.symbol.toLowerCase() === poolName.toLowerCase(),
  );

  if (poolData && poolData.length > 0) {
    price = Number.parseFloat(poolData[0]?.info.oraclePx);
  }

  return price;
}

export default async (
  accountAddress: string,
  action: string,
  actionData: ProtocolActionData,
): Promise<{
  transactions: Transaction[];
  funcNames: string[];
}> => {
  const {
    inputToken,
    inputAmount,
    chainId,
    inputTokenInfo,
    tokenInfo,
    token,
    amount,
    outputToken,
    limitPrice,
    leverageMultiplier: levMul,
  } = actionData;
  const outputToken_ = (outputToken || "").split("/")[0].split("-")[0];

  if (
    ((action === "deposit" || action === "withdraw") &&
      token &&
      token.toLowerCase() !== "usdc") ||
    (["long", "short"].includes(action) &&
      inputToken &&
      inputToken.toLowerCase() !== "usdc")
  ) {
    throw new Error(
      `Token ${
        token || inputToken
      } is not supported to ${action} on Hyperliquid. Only USDC is supported.`,
    );
  }

  const hyperliquidPools = await getHyperliquidPools();
  const supportedTokens = Object.keys(hyperliquidPools);

  let poolName = `${outputToken_.toUpperCase()}/USDC:USDC`;
  const outputTokenLowerCase = outputToken_.toLowerCase();

  if (outputTokenLowerCase === "kpepe") {
    poolName = "kPEPE/USDC:USDC";
  } else if (outputTokenLowerCase === "kbonk") {
    poolName = "kBONK/USDC:USDC";
  } else if (outputTokenLowerCase === "kfloki") {
    poolName = "kFLOKI/USDC:USDC";
  } else if (outputTokenLowerCase === "klunc") {
    poolName = "kLUNC/USDC:USDC";
  } else if (outputTokenLowerCase === "kneiro") {
    poolName = "kNEIRO/USDC:USDC";
  } else if (outputTokenLowerCase === "kshib") {
    poolName = "kSHIB/USDC:USDC";
  } else if (outputTokenLowerCase === "kdogs") {
    poolName = "kDOGS/USDC:USDC";
  }
  let signData: SignData | undefined;
  const value = 0;
  const ret: {
    transactions: Transaction[];
    funcNames: string[];
    balanceChanges: BalanceChange[];
    signData?: SignData;
  } = {
    transactions: [],
    funcNames: [],
    balanceChanges: [],
  };

  switch (action) {
    case "deposit": {
      const bridgeAddr = getProtocolAddressForChain(
        "hyperliquid",
        chainId,
        "bridge",
      );
      ret.transactions.push(
        await getFunctionData(
          tokenInfo?.address,
          abis.erc20,
          "transfer",
          [bridgeAddr, amount],
          value.toString(),
        ),
      );
      ret.funcNames.push("Transfer");
      break;
    }
    case "withdraw": {
      signData = {
        destination: accountAddress,
        time: new Date().getTime(),
        amount: +ethers.formatUnits(amount || 0n, tokenInfo?.decimals),
      };
      ret.balanceChanges = [
        {
          symbol: "USDC",
          address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
          amount: +ethers.formatUnits(amount || 0n, tokenInfo?.decimals) - 1, // Exclude 1 USDC as fee.
        },
      ];
      break;
    }
    case "long":
    case "short": {
      signData = { market: poolName };

      const positions = await getHyperliquidPositions(
        accountAddress,
        outputTokenLowerCase,
      );

      if (levMul) {
        signData.leverageMultiplier = Number.parseFloat(levMul.toString());

        const poolIdx = supportedTokens.findIndex(
          (supported) =>
            outputToken_ &&
            supported.toLowerCase() === outputToken_.toLowerCase(),
        );
        const maxLev = hyperliquidPools[supportedTokens[poolIdx]];

        if (signData.leverageMultiplier > maxLev) {
          throw new Error(
            `Leverage multiplier out of range. Max leverage allowed is ${maxLev}.`,
          );
        }
        if (
          positions.length > 0 &&
          signData.leverageMultiplier < positions[0]?.leverageMultiplier
        ) {
          throw new Error("Cannot decrease leverage with open position.");
        }
      }

      let price = Number(limitPrice || 0);

      if (!price) {
        price = await getMarketPrice(accountAddress, poolName);
      }

      const formatAmount =
        Number.parseFloat(
          ethers.formatUnits(inputAmount ?? 0, inputTokenInfo?.decimals),
        ) *
        (signData.leverageMultiplier || positions[0]?.leverageMultiplier || 1);
      signData.price = price;
      signData.amount = formatAmount / price;

      const usdcPrice =
        (await getCoinData(accountAddress, "usdc", chainId, false)).price || 1;
      if (formatAmount * usdcPrice < 10) {
        console.error(inputAmount, formatAmount, usdcPrice);
        throw new Error(
          `Hyperliquid only supports ${action} of at least $10. Please ensure your input amount is properly set and try again.`,
        );
      }
      break;
    }
    case "close": {
      const positions = await getHyperliquidPositions(
        accountAddress,
        outputTokenLowerCase,
      );

      const percentReduction = actionData.percentReduction
        ?.toString()
        ?.toLowerCase();
      const percent =
        percentReduction === "half"
          ? 50
          : Number.parseFloat(percentReduction || "100");
      const size =
        (Number.parseFloat(positions[0]?.amount || "0") * percent) / 100;

      let price = Number(limitPrice || 0);

      if (!price) {
        price = await getMarketPrice(accountAddress, poolName);
      }

      if (!size) {
        throw new Error(
          "Invalid size for this Hyperliquid order, please try again with a more clear prompt.",
        );
      }

      signData = {
        market: poolName,
        amount: size,
        price,
        leverageMultiplier: Number.parseFloat(
          positions[0]?.leverageMultiplier || "0",
        ),
      };
      break;
    }
    default: {
      throw new Error(
        getUnsupportedActionError(
          action,
          ["deposit", "withdraw", "long", "short", "close"],
          "Hyperliquid",
        ),
      );
    }
  }

  if (signData) {
    ret.signData = signData;
  }

  return ret;
};

export const getHyperliquidTokenInfo = async (
  chainId: ChainId | undefined,
  token: string,
  checkSpot = false,
) => {
  if (chainId !== 42161) return;
  const printError = usePrintError("");
  try {
    if (checkSpot) {
      const markets = await fetchHyperliquidSpotMarkets();
      const market = markets?.find(
        (x) => x?.base?.toLowerCase() === token.toLowerCase(),
      );
      if (market) {
        const tokenInfo = await getHyperliquidSpotToken(token);
        return { tokenInfo, price: Number(market.info.markPx) };
      }
      if (token.toUpperCase() === "USDC") {
        return {
          tokenInfo: {
            symbol: "USDC",
            decimals: 6,
            thumb:
              "https://static.debank.com/image/arb_token/logo_url/0xaf88d065e77c8cc2239327c5edb3a432268e5831/fffcd27b9efff5a86ab942084c05924d.png",
          },
          price: 1,
        };
      }
      return undefined;
    }

    const hyperliquidPools = await getHyperliquidPools();
    const supported = Object.keys(hyperliquidPools);
    const index = supported?.findIndex(
      (tkn) => tkn.toLowerCase() === token.toLowerCase(),
    );
    if (index > -1) {
      return {
        tokenInfo: { symbol: supported[index], decimals: 18 },
        price: 1,
      };
    }
  } catch (err) {
    printError("hyperliquid token info error");
    printError(err);
    return undefined;
  }
};

const getHyperliquidPositions = async (
  account: string,
  positionToken?: string,
) => {
  const { data } = await withRetry(account, () =>
    axios.post(`${HYPERLIQUID_API_ENDPOINT}/info`, {
      type: "clearinghouseState",
      user: account,
    }),
  );

  const tokens = [];
  for (const pos of data.assetPositions) {
    if (
      !positionToken ||
      pos.position.coin.toLowerCase() === positionToken.toLowerCase()
    ) {
      tokens.push({
        poolName: pos.position.coin,
        symbol: pos.position.coin,
        amount: pos.position.szi,
        leverageMultiplier: pos.position.leverage.value,
      });
    }
  }

  return tokens;
};

export const getHyperliquidTokensToClose = async (account: string) => {
  const tokens = await getHyperliquidPositions(account);
  for (const token of tokens) {
    token.amount = 10n;
  }
  return tokens as PortfolioToken[];
};

let cachedPools: Record<string, number>;
let cachedSpotMarkets: Market[];
let lastPoolFetchTime = 0;
let lastSpotMarketFetchTime = 0;
let spotTokens: Record<string, TokenInfo>;

// Cache duration (5 minutes in milliseconds)
const CACHE_DURATION = 5 * 60 * 1000;

export const getHyperliquidPools = async (): Promise<
  Record<string, number>
> => {
  const now = Date.now();

  // Return cached data if it's less than 1 hour old
  if (cachedPools && now - lastPoolFetchTime < CACHE_DURATION) {
    return cachedPools;
  }

  if (!cachedPools) cachedPools = {};
  try {
    const {
      data: { universe },
    }: {
      data: {
        universe: {
          name: string;
          maxLeverage: number;
        }[];
      };
    } = await withRetry("hyperliquid", () =>
      axios.post(`${HYPERLIQUID_API_ENDPOINT}/info`, { type: "meta" }),
    );
    for (const pool of universe) {
      cachedPools[pool.name] = pool.maxLeverage;
    }
    lastPoolFetchTime = now;
  } catch (err) {
    console.error("Error fetching pools", err);
  }
  return cachedPools;
};

export const fetchHyperliquidSpotMarkets = async (): Promise<Market[]> => {
  const now = Date.now();

  // Return cached data if it's less than 1 hour old
  if (cachedSpotMarkets && now - lastSpotMarketFetchTime < CACHE_DURATION) {
    return cachedSpotMarkets;
  }

  try {
    const wallet = ethers.Wallet.createRandom();
    const exchange = new CCXT.hyperliquid({
      privateKey: wallet.privateKey,
      walletAddress: wallet.address,
    });
    if (HYPERLIQUID_API_ENDPOINT.includes("testnet")) {
      exchange.setSandboxMode(true);
    }

    cachedSpotMarkets = await exchange.fetchSpotMarkets();
    lastSpotMarketFetchTime = now;
  } catch (err) {
    console.error("Error fetching spot markets", err);
  }
  return cachedSpotMarkets;
};

const getHyperliquidSpotToken = async (token0: string) => {
  const token = token0.toLowerCase();
  if (!spotTokens) spotTokens = {};

  if (spotTokens[token]) return spotTokens[token];

  try {
    const { data } = await withRetry("", () =>
      axios.post(`${HYPERLIQUID_API_ENDPOINT}/info`, {
        type: "spotMetaAndAssetCtxs",
      }),
    );
    const tokens = data[0].tokens as HyperliquidSpotTokenR[];
    for (const tkn of tokens) {
      spotTokens[tkn.name.toLowerCase()] = {
        name: tkn.name,
        symbol: tkn.name,
        decimals: tkn.szDecimals,
        address: tkn.tokenId,
        thumb:
          tkn.name !== "USDC"
            ? `https://app.hyperliquid.xyz/coins/${tkn.name}_USDC.svg`
            : "https://assets.coingecko.com/coins/images/6319/thumb/usdc.png?1696506694",
      };
    }
  } catch (err) {
    console.error("Error fetching spot markets", err);
  }
  return spotTokens[token];

  // return `https://app.hyperliquid.xyz/explorer/token/${token}`;
};
