/**
 * Ethereum Wallet TVL Analysis Module
 *
 * This module provides functionality to track Total Value Locked (TVL) for Ethereum wallets
 * using the DeBank API. It's designed to run daily, collecting and storing TVL data for
 * each tracked wallet address.
 *
 * Key features:
 * - Daily TVL tracking for multiple wallets
 * - Deduplication to prevent multiple entries per day
 * - Automatic wallet discovery from user data
 */

import axios from "axios";
import dotenv from "dotenv";
import { TVL } from "../../src/db/tvl.model.js";
import { getErrorMessage } from "../../src/utils/index.js";
import { getDistinctIdMapping, getEmbeddedAddresses } from "./utils.js";
dotenv.config();

// API configuration
const debankAPIKey = process.env.DEBANK_ACCESS_KEY;
const API_BASE_URL = "https://pro-openapi.debank.com";

// Types
type WalletData = {
  user_id: string;
  address: string;
  tvl: string;
  date: Date;
  hl_tvl?: string; // Optional hyperliquid TVL
};

// Constants
const TVL_MULTIPLIER = 1_000_000; // Multiply TVL by 1e6 for storage

/**
 * Converts raw TVL value to an integer by multiplying by 1e6 and flooring
 * @param tvl - Raw TVL value as string
 * @returns integer value (TVL * 1e6 floored)
 */
function multiplyTVLValue(tvl: string): number {
  return Math.floor(parseFloat(tvl) * TVL_MULTIPLIER);
}

/**
 * Fetches ethereum addresses with their user_ids from the database.
 * Filters for valid Ethereum addresses (0x prefixed, 42 characters long).
 *
 * @returns Map where keys are user_ids and values are arrays of ethereum addresses
 */
async function getEthereumAddressesWithIds(): Promise<Map<string, string[]>> {
  try {
    // Get mapping of user_ids to usernames
    const userMapping = await getDistinctIdMapping();

    // Extract user IDs
    const userIds = Object.keys(userMapping);

    // Get embedded addresses for these users
    const addressMap = await getEmbeddedAddresses(userIds);

    // Create a map of user_ids to their addresses
    const userIdToAddresses = new Map<string, string[]>();

    addressMap.forEach((addresses, userId) => {
      if (addresses && addresses.length > 0) {
        // Filter valid addresses
        const validAddresses = addresses.filter(
          (addr) => addr && addr.startsWith("0x") && addr.length === 42,
        );
        if (validAddresses.length > 0) {
          userIdToAddresses.set(userId, validAddresses);
        }
      }
    });

    console.log(
      `Found ${userIdToAddresses.size} users with valid ethereum addresses`,
    );
    return userIdToAddresses;
  } catch (error) {
    console.error("Error fetching ethereum addresses:", getErrorMessage(error));
    return new Map();
  }
}

/**
 * Verifies if a TVL entry already exists for the given wallet on the specified date.
 *
 * @param user_id - The user identifier
 * @param address - The Ethereum wallet address
 * @param today - The date to check for
 * @returns boolean indicating if an entry exists
 */
async function hasTodayTVL(
  user_id: string,
  address: string,
  today: Date,
): Promise<boolean> {
  const existingEntry = await TVL.findOne({
    where: {
      user_id,
      user_address: address,
      date: today,
    },
  });

  return existingEntry !== null;
}

/**
 * Fetches current TVL data for a specific wallet using the DeBank API.
 * Throws an error if the API call fails or returns invalid data.
 * TVL values are returned as strings to maintain precision.
 *
 * @param user_id - The user identifier (must be a valid UUID)
 * @param address - The Ethereum wallet address
 * @param date - The date for which to record the TVL
 * @returns WalletData object containing the TVL information
 * @throws Error if API call fails
 */
async function getWalletData(
  user_id: string,
  address: string,
  date: Date,
): Promise<WalletData> {
  const totalBalanceUrl = `${API_BASE_URL}/v1/user/total_balance?id=${address}`;

  try {
    const totalBalanceResponse = await axios.get(totalBalanceUrl, {
      headers: { Accept: "application/json", AccessKey: debankAPIKey },
    });

    if (
      !totalBalanceResponse.data ||
      totalBalanceResponse.data.total_usd_value === undefined
    ) {
      throw new Error("Invalid response from DeBank API");
    }

    const tvl = totalBalanceResponse.data.total_usd_value.toString();

    return {
      user_id,
      address,
      tvl,
      date,
    };
  } catch (error) {
    console.error(`Error fetching data for address ${address}: `, error);
    throw error;
  }
}

/**
 * Stores wallet TVL data in the database.
 * TVL values are multiplied by 1e6 for storage to maintain precision.
 *
 * @param data - WalletData object containing TVL information to store
 */
async function storeTVLData(data: WalletData): Promise<void> {
  try {
    const [tvlRecord, created] = await TVL.findOrCreate({
      where: {
        user_id: data.user_id,
        user_address: data.address,
        date: data.date,
      },
      defaults: {
        user_id: data.user_id,
        user_address: data.address,
        daily_tvl: multiplyTVLValue(data.tvl),
        date: data.date,
        created_at: new Date(),
      },
    });

    if (!created) {
      // Update existing record with new TVL
      await tvlRecord.update({
        daily_tvl: multiplyTVLValue(data.tvl),
      });
      console.log(
        `Updated TVL data for ${data.address} (${data.user_id}) on ${data.date.toISOString().split("T")[0]} (TVL: ${data.tvl})`,
      );
    } else {
      console.log(
        `Stored TVL data for ${data.address} (${data.user_id}) on ${data.date.toISOString().split("T")[0]} (TVL: ${data.tvl})`,
      );
    }
  } catch (error) {
    console.error(
      `Error storing TVL data for ${data.address}:`,
      getErrorMessage(error),
    );
  }
}

/**
 * Generates and logs a summary of TVL data for a specific date.
 * Divides stored values by 1e6 for display.
 *
 * @param date - The date for which to generate the summary
 */
async function getTVLSummary(date: Date): Promise<void> {
  const entries = await TVL.findAll({
    where: {
      date: date,
    },
  });

  const total = entries.reduce((sum, entry) => {
    const tvlValue = entry.daily_tvl || 0;
    return sum + Number(tvlValue);
  }, 0);

  // Convert back for display
  const displayTotal = (total / TVL_MULTIPLIER).toFixed(2);
  console.log(`\nTVL Summary for ${date.toISOString().split("T")[0]}:`);
  console.log(`Total: $${displayTotal} (${entries.length} entries)`);
}

/**
 * Main function to analyze and store TVL data for all tracked wallets.
 * This function is designed to be called once per day to:
 * 1. Discover all tracked Ethereum wallets
 * 2. Check current TVL for each wallet
 * 3. Store the TVL data if not already recorded for today
 * 4. Generate a summary of the day's TVL data
 */
export async function analyzeWallets() {
  // Set up date at day granularity (midnight UTC)
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Get all user_ids and their addresses
  const userIdAddressMap = await getEthereumAddressesWithIds();

  if (userIdAddressMap.size === 0) {
    console.log("No ethereum addresses found to analyze");
    return;
  }

  console.log(`Analyzing TVL for ${today.toISOString().split("T")[0]}`);

  for (const [userId, addresses] of userIdAddressMap) {
    for (const address of addresses) {
      try {
        // Check if we already have today's TVL
        const hasToday = await hasTodayTVL(userId, address, today);

        if (!hasToday) {
          console.log(`Fetching TVL for ${address} (${userId})`);
          const data = await getWalletData(userId, address, today);
          await storeTVLData(data);
        } else {
          console.log(
            `TVL entry already exists for ${address} (${userId}) for today`,
          );
        }
      } catch (error) {
        console.error(
          `Skipping TVL storage for ${address} due to error:`,
          error,
        );
        continue;
      }
    }
  }

  // Print summary for today
  await getTVLSummary(today);
}
