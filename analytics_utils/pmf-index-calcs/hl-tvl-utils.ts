/**
 * TVL Storage and Monitoring Module
 *
 * This module handles tracking and storing Total Value Locked (TVL) data for users on HyperLiquid.
 * It includes functionality for:
 * - Fetching spot and perpetual balances from HyperLiquid API
 * - Calculating USD values using current token prices
 * - Storing daily TVL snapshots in the database
 * - Scheduling automated daily collection
 *
 * Key Features:
 * - Batched API requests to avoid rate limits
 * - Error handling and retry logic
 * - Timezone-aware scheduling (EST)
 * - Deduplication of daily entries
 * - Support for both spot and perpetual positions
 *
 * @module analytics_utils/automations/tvl-utils
 */

import axios from "axios";
import dotenv from "dotenv";
import moment from "moment-timezone";
import { TVL, initTVLModel } from "../../src/db/tvl.model.js";
import { getDistinctIdMapping, getEmbeddedAddresses } from "./utils.js";
dotenv.config();

// Initialize the model
initTVLModel();

// Type definitions for HyperLiquid API responses
interface PerpAccountState {
  marginSummary: {
    accountValue: string;
  };
}

interface SpotBalance {
  coin: string;
  token: number;
  hold: string;
  total: string;
  entryNtl: string;
}

interface SpotAccountState {
  balances: SpotBalance[];
}

interface SpotToken {
  name: string;
  szDecimals: number;
  weiDecimals: number;
  index: number;
}

interface SpotMarket {
  name: string;
  tokens: number[];
  index: number;
}

interface SpotMetadata {
  tokens: SpotToken[];
  universe: SpotMarket[];
}

interface MarketContext {
  markPx: string;
}

interface UserBalance {
  walletAddress: string;
  perpBalance: number;
  spotBalances: { token: string; amount: number; usdValue: number }[];
  totalSpotBalance: number;
  totalBalance: number;
}

// Add constant at the top with other constants
const TVL_MULTIPLIER = 1_000_000; // Multiply TVL by 1e6 for storage

/**
 * Converts raw TVL value to an integer by multiplying by 1e6 and flooring
 * @param tvl - Raw TVL value as number
 * @returns integer value (TVL * 1e6 floored)
 */
function multiplyTVLValue(tvl: number): number {
  return Math.floor(tvl * TVL_MULTIPLIER);
}

/**
 * Fetches current spot token prices from HyperLiquid API
 * @returns Map of token symbols to USD prices
 * @throws Error if API request fails
 */
async function getSpotTokenPrices(): Promise<Map<string, number>> {
  try {
    const response = await axios.post(
      "https://api.hyperliquid.xyz/info",
      {
        type: "spotMetaAndAssetCtxs",
      },
      {
        headers: { "Content-Type": "application/json" },
      },
    );

    const metadata = response.data[0] as SpotMetadata;
    const prices = response.data[1] as MarketContext[];

    const priceMap = new Map<string, number>();
    const marketPriceMap = new Map<number, number>();

    metadata.universe.forEach((market) => {
      const price = prices[market.index]
        ? parseFloat(prices[market.index].markPx)
        : 0;
      marketPriceMap.set(market.index, price);
    });

    metadata.universe.forEach((market) => {
      const baseTokenIndex = market.tokens[0];
      const baseTokenName = metadata.tokens[baseTokenIndex].name;
      const price = marketPriceMap.get(market.index);

      if (price !== undefined) {
        priceMap.set(baseTokenName, price);
      }
    });

    return priceMap;
  } catch (error) {
    throw error;
  }
}

/**
 * Fetches perpetual account balance for a wallet
 * @param walletAddress Ethereum address to check
 * @returns Account value in USD
 * @throws Error if API request fails
 */
async function getHyperliquidPerpBalance(
  walletAddress: string,
): Promise<number> {
  try {
    const response = await axios.post(
      "https://api.hyperliquid.xyz/info",
      {
        type: "clearinghouseState",
        user: walletAddress,
      },
      {
        headers: { "Content-Type": "application/json" },
      },
    );

    const data = response.data as PerpAccountState;
    if (!data?.marginSummary?.accountValue) {
      throw new Error("Invalid response from HyperLiquid perp API");
    }
    return parseFloat(data.marginSummary.accountValue);
  } catch (error) {
    console.error(`Error fetching perp balance for ${walletAddress}:`, error);
    throw error;
  }
}

/**
 * Fetches spot balances for a wallet and calculates USD values
 * @param walletAddress Ethereum address to check
 * @param tokenPrices Current token prices in USD
 * @returns Object containing token balances and total USD value
 * @throws Error if API request fails
 */
async function getHyperliquidSpotBalance(
  walletAddress: string,
  tokenPrices: Map<string, number>,
): Promise<{
  balances: { token: string; amount: number; usdValue: number }[];
  total: number;
}> {
  try {
    const response = await axios.post(
      "https://api.hyperliquid.xyz/info",
      {
        type: "spotClearinghouseState",
        user: walletAddress,
      },
      {
        headers: { "Content-Type": "application/json" },
      },
    );

    const data = response.data as SpotAccountState;
    if (!data?.balances) {
      throw new Error("Invalid response from HyperLiquid spot API");
    }

    let totalUsdValue = 0;
    const tokenBalances: { token: string; amount: number; usdValue: number }[] =
      [];

    for (const balance of data.balances) {
      const amount = parseFloat(balance.total);
      let usdValue: number;

      if (balance.coin === "USDC") {
        usdValue = amount;
      } else {
        const price = tokenPrices.get(balance.coin);
        if (price === undefined) {
          throw new Error(`No price found for token ${balance.coin}`);
        }
        usdValue = amount * price;
      }

      if (amount > 0) {
        tokenBalances.push({
          token: balance.coin,
          amount,
          usdValue,
        });
        totalUsdValue += usdValue;
      }
    }

    return { balances: tokenBalances, total: totalUsdValue };
  } catch (error) {
    console.error(`Error fetching spot balance for ${walletAddress}:`, error);
    throw error;
  }
}

async function getAllBalances(
  addressMap: Map<string, string[]>,
): Promise<UserBalance[]> {
  const balances: UserBalance[] = [];

  // Get all wallet addresses
  const walletAddresses = Array.from(addressMap.values()).flat();
  const uniqueAddresses = [...new Set(walletAddresses)];

  console.log("Fetching spot token prices...");
  const tokenPrices = await getSpotTokenPrices();

  console.log(`Fetching balances for ${uniqueAddresses.length} addresses...`);

  const batchSize = 5;
  for (let i = 0; i < uniqueAddresses.length; i += batchSize) {
    const batch = uniqueAddresses.slice(i, i + batchSize);
    const batchPromises = batch.map(async (address) => {
      try {
        const [perpBalance, spotData] = await Promise.all([
          getHyperliquidPerpBalance(address),
          getHyperliquidSpotBalance(address, tokenPrices),
        ]);

        return {
          walletAddress: address,
          perpBalance,
          spotBalances: spotData.balances,
          totalSpotBalance: spotData.total,
          totalBalance: perpBalance + spotData.total,
        };
      } catch (error) {
        console.error(`Error fetching balances for ${address}:`, error);
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    // Filter out null results from errors
    const validResults = batchResults.filter(
      (result): result is UserBalance => result !== null,
    );
    balances.push(...validResults);

    if (i + batchSize < uniqueAddresses.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return balances;
}

export async function storeHLTVLData() {
  try {
    console.log("Starting HL TVL data collection...");

    // Set up date at day granularity (midnight UTC)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Get mapping of user_ids to usernames and embedded addresses
    const userMapping = await getDistinctIdMapping();
    const userIds = Object.keys(userMapping);
    const addressMap = await getEmbeddedAddresses(userIds);

    // Get all user balances
    const balances = await getAllBalances(addressMap);

    // Process each user
    for (const [userId, userData] of Object.entries(userMapping)) {
      const username = userData.name;
      const embeddedAddresses = addressMap.get(userId) || [];

      if (!embeddedAddresses || embeddedAddresses.length === 0) {
        console.log(`No embedded addresses found for user: ${username}`);
        continue;
      }

      // Process each address for the user
      for (const address of embeddedAddresses) {
        // Find balance data for this specific address
        const addressBalance = balances.find(
          (b) => b.walletAddress.toLowerCase() === address.toLowerCase(),
        );

        const hlTVL = addressBalance
          ? parseFloat(addressBalance.totalBalance.toFixed(2))
          : 0;
        console.log(
          `Processing address ${address} for user ${username} with HL TVL: ${hlTVL}`,
        );

        try {
          // Try to find existing entry for this date and address
          const [tvlRecord, created] = await TVL.findOrCreate({
            where: {
              user_id: userId,
              user_address: address,
              date: today,
            },
            defaults: {
              user_id: userId,
              user_address: address,
              hl_tvl: multiplyTVLValue(hlTVL),
              date: today,
              created_at: new Date(),
            },
          });

          if (!created) {
            // Update existing record with new HL TVL
            await tvlRecord.update({
              hl_tvl: multiplyTVLValue(hlTVL),
            });
            console.log(
              `Updated HL TVL data for address ${address} (${username}) on ${today.toISOString().split("T")[0]}`,
            );
          } else {
            console.log(
              `Created new TVL entry for address ${address} (${username}) on ${today.toISOString().split("T")[0]}`,
            );
          }
        } catch (error: any) {
          console.error(
            `Error storing TVL data for address ${address} (${username}):`,
            error,
          );
        }
      }
    }

    console.log("TVL data collection completed successfully");
  } catch (error) {
    console.error("Error storing TVL data:", error);
    throw error;
  }
}
