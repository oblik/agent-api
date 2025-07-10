/**
 * Volume Analysis Module
 *
 * This module analyzes transaction volumes for users in Mixpanel cohorts by:
 * 1. Matching Mixpanel distinct_ids with user_ids and embedded wallet addresses
 * 2. Calculating transaction volumes from on-chain activity data
 * 3. Storing and aggregating volume metrics per user
 * 4. Calculating 30-day peak volume windows per user
 *
 * Key Features:
 * - Processes transaction histories to calculate volumes
 * - Handles multi-chain transactions (Ethereum, etc)
 * - Validates volumes with sanity checks
 * - Tracks and reports problematic entries
 * - Identifies peak 30-day volume periods for each user
 *
 * @module analytics_utils/pmf_index_calcs/volume
 */

import dotenv from "dotenv";
import { Op } from "sequelize";
import { Histories, initModels, sequelize } from "../../src/db/index.js";
import { calcTvl, cleanTransactions } from "../../src/utils/index.js";
import type { CleanedAction } from "../../src/utils/types.js";
import { getDistinctIdMapping, getEmbeddedAddresses } from "./utils.js";

dotenv.config();

interface AddressStats {
  maxVolume: number;
  startDate: Date;
  endDate: Date;
}

/**
 * Calculates and stores volume metrics for transaction histories that don't have them yet.
 */
async function populateHistoryVolumes(
  accountAddress: string,
  problemEntries: Array<{
    historyId: number;
    address: string;
    error: string;
    tvl?: number;
  }>,
): Promise<void> {
  const userHistories = await Histories.findAll({
    where: {
      useraddress: accountAddress.toLowerCase(),
      [Op.and]: [sequelize.where(sequelize.col("volume"), Op.is, null)],
    },
  });

  for (const history of userHistories) {
    let chainName = "ethereum";

    if (history.actions[0].chainName) {
      chainName = history.actions[0].chainName;
    }

    try {
      const transactions = await cleanTransactions(
        accountAddress,
        history.actions as CleanedAction[],
        chainName,
        Math.floor(history.timestamp / 1000),
      );

      const tvl = Math.floor(calcTvl(accountAddress, transactions) * 1e6);

      if (tvl === 0) {
        problemEntries.push({
          historyId: history.id,
          address: accountAddress,
          error: "Zero TVL",
          tvl,
        });
        continue;
      }

      if (tvl >= 1000000000000) {
        problemEntries.push({
          historyId: history.id,
          address: accountAddress,
          error: "TVL exceeds sanity check",
          tvl,
        });
        continue;
      }

      history.set("volume", tvl);
      await history.save();
    } catch (err) {
      problemEntries.push({
        historyId: history.id,
        address: accountAddress,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }
}

/**
 * Retrieves all volume entries for an address and calculates the optimal 30-day window
 * with highest total volume.
 */
async function getOptimalVolumeWindow(
  accountAddress: string,
): Promise<AddressStats> {
  const userHistories = await Histories.findAll({
    where: {
      useraddress: accountAddress.toLowerCase(),
      [Op.and]: [sequelize.where(sequelize.col("volume"), Op.not, null)],
    },
    attributes: ["volume", "timestamp"],
    raw: true,
  });

  let maxVolume = 0;
  let maxStartDate: Date = new Date(0);
  let maxEndDate: Date = new Date(0);

  const entries = userHistories
    .map((history) => ({
      volume: parseInt(history.volume.toString(), 10) / 1e6,
      timestamp: parseInt(history.timestamp.toString(), 10),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  for (let i = 0; i < entries.length; i++) {
    const startDate = new Date(entries[i].timestamp);
    const endDate = new Date(entries[i].timestamp + 30 * 24 * 60 * 60 * 1000);

    const windowVolume = entries
      .filter(
        (entry) =>
          entry.timestamp >= entries[i].timestamp &&
          entry.timestamp <= entries[i].timestamp + 30 * 24 * 60 * 60 * 1000,
      )
      .reduce((sum, entry) => sum + entry.volume, 0);

    if (windowVolume > maxVolume) {
      maxVolume = windowVolume;
      maxStartDate = startDate;
      maxEndDate = endDate;
    }
  }

  return {
    maxVolume: maxVolume,
    startDate: maxStartDate,
    endDate: maxEndDate,
  };
}

/**
 * Exportable function that returns volume statistics per distinctId
 */
export async function getVolumesByUser(): Promise<Map<string, AddressStats>> {
  await initModels();

  const distinctIdMapping = await getDistinctIdMapping();
  const userIds = Object.values(distinctIdMapping)
    .map((profile) => profile.user_id)
    .filter((id) => id !== null);
  const addressMapping = await getEmbeddedAddresses(userIds);

  // Track max volumes per distinctId instead of per address
  const distinctIdStats = new Map<string, AddressStats>();
  const problemEntries: Array<{
    historyId: number;
    address: string;
    error: string;
    tvl?: number;
  }> = [];

  for (const [distinctId, profile] of Object.entries(distinctIdMapping)) {
    if (profile.user_id) {
      const addresses = addressMapping.get(profile.user_id) || [];
      let maxUserVolume = 0;
      let bestStartDate: Date = new Date(0);
      let bestEndDate: Date = new Date(0);

      for (const address of addresses) {
        // First ensure volumes are populated
        await populateHistoryVolumes(address, problemEntries);

        // Then calculate optimal window
        const volumeStats = await getOptimalVolumeWindow(address);

        // Update best window if this address has higher volume
        if (volumeStats.maxVolume > maxUserVolume) {
          maxUserVolume = volumeStats.maxVolume;
          bestStartDate = volumeStats.startDate;
          bestEndDate = volumeStats.endDate;
        }
      }

      // Only store stats if we found any volume
      if (maxUserVolume > 0) {
        distinctIdStats.set(distinctId, {
          maxVolume: maxUserVolume,
          startDate: bestStartDate,
          endDate: bestEndDate,
        });
      }
    }
  }

  // console.log("\nExported Volume Statistics:");
  // console.log(JSON.stringify(Object.fromEntries(distinctIdStats), null, 2));

  return distinctIdStats;
}

/**
 * Main execution function that:
 * 1. Initializes database models
 * 2. Retrieves user mappings from Mixpanel
 * 3. Gets associated wallet addresses
 * 4. Processes transaction histories
 * 5. Calculates and stores volumes
 * 6. Identifies peak volume periods
 * 7. Generates summary reports
 */
async function main() {
  await initModels();

  const distinctIdMapping = await getDistinctIdMapping();
  const userIds = Object.values(distinctIdMapping)
    .map((profile) => profile.user_id)
    .filter((id) => id !== null);
  const addressMapping = await getEmbeddedAddresses(userIds);

  // [Rest of the tracking variables remain the same...]
  const problemEntries: Array<{
    historyId: number;
    address: string;
    error: string;
    tvl?: number;
  }> = [];

  let processedUsers = 0;
  let processedAddresses = 0;
  let processedHistories = 0;

  // Process all users
  const allEntries = Object.entries(distinctIdMapping);
  const totalUsers = allEntries.length;

  for (const [distinctId, profile] of allEntries) {
    processedUsers++;

    if (profile.user_id) {
      const addresses = addressMapping.get(profile.user_id) || [];

      if (addresses.length > 0) {
        for (const address of addresses) {
          processedAddresses++;

          const historiesBeforeCount = await Histories.count({
            where: {
              useraddress: address.toLowerCase(),
              [Op.and]: [sequelize.where(sequelize.col("volume"), Op.is, null)],
            },
          });

          await populateHistoryVolumes(address, problemEntries);
          processedHistories += historiesBeforeCount;
        }
      }
    }
  }

  // [Error reporting section remains the same...]
  const errorGroups = problemEntries.reduce(
    (acc, entry) => {
      acc[entry.error] = acc[entry.error] || [];
      acc[entry.error].push(entry);
      return acc;
    },
    {} as Record<string, typeof problemEntries>,
  );

  for (const [error, entries] of Object.entries(errorGroups)) {
    console.log(`\n⚠️  ${error} (${entries.length} entries):`);
    console.log(entries);
  }
}

if (import.meta.url.endsWith(process.argv[1])) {
  // This will only run if this file is executed directly
  main().catch(console.error);
}
