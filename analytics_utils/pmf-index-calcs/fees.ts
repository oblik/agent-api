/**
 * This module analyzes user transaction fees over time to identify peak fee periods.
 * It queries the database for fee data and user information, then calculates
 * the highest fee totals within 30-day windows for each user address.
 * Results are exported to a dated CSV file.
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../../src/db/index.js";

/**
 * Represents a single fee transaction record from the database
 */
interface FeeResult {
  useraddress: string;
  fee: number;
  timestamp: number;
}

/**
 * Represents user identification data from analytics_users table
 */
interface UserResult {
  embeddedAddresses: string[];
  discord_id: string;
  user_id: string;
}

/**
 * Main function to analyze and return fee statistics per user
 *
 * @returns Array of objects containing user fee statistics
 */
export async function getFeesByUser() {
  // Get individual fee entries with timestamps
  const feeEntries = await sequelize.query<FeeResult>(
    `
    SELECT useraddress, totalfees as fee, timestamp
    FROM histories 
    WHERE useraddress IS NOT NULL
    ORDER BY timestamp
    `,
    {
      type: QueryTypes.SELECT,
    },
  );

  // Get user information from analytics_users
  const userResults = await sequelize.query<UserResult>(
    `
    SELECT DISTINCT "embeddedAddresses", discord_id, user_id
    FROM analytics_users 
    WHERE "embeddedAddresses" && $1
    `,
    {
      bind: [Array.from(new Set(feeEntries.map((row) => row.useraddress)))],
      type: QueryTypes.SELECT,
    },
  );

  // Create lookup maps for user identification
  const userMap = new Map<string, { discord_id: string; user_id: string }>();
  userResults.forEach((row) => {
    if (row.embeddedAddresses) {
      row.embeddedAddresses.forEach((address) => {
        userMap.set(address, {
          discord_id: row.discord_id,
          user_id: row.user_id,
        });
      });
    }
  });

  // Track highest 30-day fee period stats per address
  const addressStats = new Map<
    string,
    {
      maxFees: number;
      startDate: Date;
      endDate: Date;
    }
  >();

  // Group all fee entries by wallet address
  const feesByAddress = new Map<string, FeeResult[]>();
  feeEntries.forEach((entry) => {
    if (!feesByAddress.has(entry.useraddress)) {
      feesByAddress.set(entry.useraddress, []);
    }
    feesByAddress.get(entry.useraddress)?.push({
      ...entry,
      fee: entry.fee / 1e6,
      timestamp: parseInt(entry.timestamp as unknown as string),
    });
  });

  // Calculate optimal 30-day windows for each address
  feesByAddress.forEach((entries, address) => {
    let maxFees = 0;
    let maxStartDate: Date = new Date(0);
    let maxEndDate: Date = new Date(0);

    entries.sort((a, b) => a.timestamp - b.timestamp);

    for (let i = 0; i < entries.length; i++) {
      // Timestamps are already in milliseconds
      const startDate = new Date(entries[i].timestamp);
      const endDate = new Date(entries[i].timestamp + 30 * 24 * 60 * 60 * 1000);

      const windowFees = entries
        .filter(
          (entry) =>
            entry.timestamp >= entries[i].timestamp &&
            entry.timestamp <= entries[i].timestamp + 30 * 24 * 60 * 60 * 1000,
        )
        .reduce((sum, entry) => sum + entry.fee, 0);

      if (windowFees > maxFees) {
        maxFees = windowFees;
        maxStartDate = startDate;
        maxEndDate = endDate;
      }
    }

    addressStats.set(address, {
      maxFees,
      startDate: maxStartDate,
      endDate: maxEndDate,
    });
  });

  // Convert results to array of objects with desired format
  const results: {
    distinctId: string;
    maxFees: number;
    startDate: Date | null;
    endDate: Date | null;
  }[] = [];

  addressStats.forEach((stats, address) => {
    const userInfo = userMap.get(address);
    if (userInfo?.user_id) {
      results.push({
        distinctId: userInfo.user_id,
        maxFees: stats.maxFees,
        startDate: stats.maxFees === 0 ? null : stats.startDate,
        endDate: stats.maxFees === 0 ? null : stats.endDate,
      });
    }
  });

  return results.sort((a, b) => b.maxFees - a.maxFees);
}

// Call and print the results
// getFeesByUser().then(results => {
//   console.log('getFeesByUser results:', JSON.stringify(results, null, 2));
// }).catch(console.error);
