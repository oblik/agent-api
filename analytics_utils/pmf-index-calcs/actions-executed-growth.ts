/**
 * This module calculates user action growth metrics by analyzing historical user activity.
 * It compares recent activity (14 days) to longer-term activity (60 days) to determine growth trends.
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../../src/db/index.js";
import { getDistinctIdMapping, getEmbeddedAddresses } from "./utils.js";

/**
 * Statistics for a user's action growth metrics
 */
interface UserActionStats {
  distinctId: string;
  address: string;
  shortAverage: number;
  longAverage: number;
  actionGrowthRatio: number;
  normalizedSlope: number;
  actionGrowth: number;
  daysSinceSignUp: number;
  ageDiscount: number;
  adjustedActionGrowth: number;
}

/**
 * Simplified action growth metrics for a user
 */
interface SimpleActionGrowth {
  distinctId: string;
  adjustedActionGrowth: number;
}

/**
 * Raw growth data for a user before adjustments
 */
interface UserGrowthData {
  distinctId: string;
  rawGrowth: number;
}

/**
 * Calculates action statistics for a user over a given time period
 * @param userAddress - Ethereum address of the user
 * @param daysToLookBack - Number of days to analyze
 * @returns Object containing total actions, daily average, and daily action volumes
 */
async function calculateUserActionStats(
  userAddress: string,
  daysToLookBack: number,
): Promise<{
  totalActions: number;
  dailyAverage: number;
  dailyVolumes: number[];
}> {
  const result = await sequelize.query<{ daily_actions: string; day: Date }>(
    `
    WITH days AS (
      SELECT generate_series(
        date_trunc('day', NOW() - INTERVAL '1 day' * :days),
        date_trunc('day', NOW()),
        '1 day'
      ) as day
    )
    SELECT 
      days.day,
      COALESCE(COUNT(h.timestamp), 0) as daily_actions
    FROM days
    LEFT JOIN histories h ON 
      LOWER(h."useraddress") = :userAddress AND
      date_trunc('day', to_timestamp(h."timestamp"/1000)) = days.day
    GROUP BY days.day
    ORDER BY days.day
    `,
    {
      replacements: {
        userAddress: userAddress.toLowerCase(),
        days: daysToLookBack,
      },
      type: QueryTypes.SELECT,
    },
  );

  const dailyVolumes = result.map((r) => Number(r.daily_actions));
  const totalActions = dailyVolumes.reduce((sum, vol) => sum + vol, 0);
  const dailyAverage = totalActions / daysToLookBack;

  return { totalActions, dailyAverage, dailyVolumes };
}

/**
 * Calculates the slope of a line fitted to the daily action volumes
 * @param volumes - Array of daily action counts
 * @returns Slope value indicating trend direction and magnitude
 */
function calculateSlope(volumes: number[]): number {
  const n = volumes.length;
  if (n === 0) return 0;

  const days = Array.from({ length: n }, (_, i) => i + 1);
  const xMean = (n + 1) / 2;
  const yMean = volumes.reduce((sum, y) => sum + y, 0) / n;

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    numerator += (days[i] - xMean) * (volumes[i] - yMean);
    denominator += Math.pow(days[i] - xMean, 2);
  }

  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Calculates the number of days since a user's first activity
 * @param userAddress - Ethereum address of the user
 * @returns Number of days since first activity
 */
async function getDaysSinceSignUp(userAddress: string): Promise<number> {
  const result = await sequelize.query<{ first_activity: Date }>(
    `
    SELECT to_timestamp(MIN("timestamp")) as first_activity
    FROM histories
    WHERE LOWER("useraddress") = :userAddress
    `,
    {
      replacements: {
        userAddress: userAddress.toLowerCase(),
      },
      type: QueryTypes.SELECT,
    },
  );

  if (!result[0]?.first_activity) {
    return 0;
  }

  const firstActivity = new Date(result[0].first_activity);
  const lastActivity = await sequelize.query<{ last_activity: Date }>(
    `
    SELECT to_timestamp(MAX("timestamp")) as last_activity 
    FROM histories
    WHERE LOWER("useraddress") = :userAddress
    `,
    {
      replacements: {
        userAddress: userAddress.toLowerCase(),
      },
      type: QueryTypes.SELECT,
    },
  );

  const daysSinceSignUp = Math.floor(
    (new Date(lastActivity[0].last_activity).getTime() -
      firstActivity.getTime()) /
      (1000 * 60 * 60 * 24),
  );

  return daysSinceSignUp;
}

/**
 * Main analysis function that calculates growth metrics for all users
 * @returns Object containing adjusted and raw growth metrics for all users
 */
export async function analyzeGrowthActions(): Promise<{
  adjustedActionsGrowth: SimpleActionGrowth[];
  rawActionsGrowth: UserGrowthData[];
}> {
  const stats: UserActionStats[] = [];
  const rawActionsGrowth: UserGrowthData[] = [];
  const w_r = 0.6; // Weight for ratio
  const w_s = 0.4; // Weight for slope

  // Get user mappings and addresses
  const distinctIdMapping = await getDistinctIdMapping();
  const addressMap = await getEmbeddedAddresses(Object.keys(distinctIdMapping));

  // Calculate baseline growth from valid users
  const validAdjustedGrowths: number[] = [];
  const validGrowthRatios: number[] = [];

  for (const [distinctId, addresses] of addressMap.entries()) {
    if (!addresses || addresses.length === 0) continue;

    for (const address of addresses) {
      const lowercaseAddress = address.toLowerCase();
      const shortStats = await calculateUserActionStats(lowercaseAddress, 14);
      const longStats = await calculateUserActionStats(lowercaseAddress, 60);

      if (longStats.dailyAverage > 0) {
        const ratio = shortStats.dailyAverage / longStats.dailyAverage - 1;
        validGrowthRatios.push(ratio);

        const slope = calculateSlope(longStats.dailyVolumes);
        const normalizedSlope = slope / longStats.dailyAverage;
        const actionGrowth = w_r * ratio + w_s * normalizedSlope;
        validAdjustedGrowths.push(actionGrowth);
      }
    }
  }

  const baselineGrowth = Math.min(...validAdjustedGrowths);

  // Process all users, including those without addresses
  for (const distinctId of Object.keys(distinctIdMapping)) {
    const addresses = addressMap.get(distinctId) || [];

    if (addresses.length === 0) {
      stats.push({
        distinctId,
        address: "",
        shortAverage: 0,
        longAverage: 0,
        actionGrowthRatio: 0,
        normalizedSlope: 0,
        actionGrowth: baselineGrowth,
        daysSinceSignUp: 0,
        ageDiscount: 0,
        adjustedActionGrowth: baselineGrowth,
      });
      continue;
    }

    // Calculate metrics for each address
    for (const address of addresses) {
      const lowercaseAddress = address.toLowerCase();
      const shortStats = await calculateUserActionStats(lowercaseAddress, 14);
      const longStats = await calculateUserActionStats(lowercaseAddress, 60);
      const daysSinceSignUp = await getDaysSinceSignUp(lowercaseAddress);

      let actionGrowthRatio = 0;
      let adjustedActionGrowth = baselineGrowth;

      if (longStats.dailyAverage > 0) {
        actionGrowthRatio =
          shortStats.dailyAverage / longStats.dailyAverage - 1;
        const slope = calculateSlope(longStats.dailyVolumes);
        const normalizedSlope = slope / longStats.dailyAverage;
        const actionGrowth = w_r * actionGrowthRatio + w_s * normalizedSlope;
        const ageDiscount = Math.min(1, daysSinceSignUp / 60);
        adjustedActionGrowth =
          baselineGrowth + (actionGrowth - baselineGrowth) * ageDiscount;
      }

      if (adjustedActionGrowth !== baselineGrowth) {
        rawActionsGrowth.push({
          distinctId,
          rawGrowth: adjustedActionGrowth,
        });
      }

      stats.push({
        distinctId,
        address: lowercaseAddress,
        shortAverage: shortStats.dailyAverage,
        longAverage: longStats.dailyAverage,
        actionGrowthRatio,
        normalizedSlope:
          longStats.dailyAverage > 0
            ? calculateSlope(longStats.dailyVolumes) / longStats.dailyAverage
            : 0,
        actionGrowth: adjustedActionGrowth,
        daysSinceSignUp,
        ageDiscount: Math.min(1, daysSinceSignUp / 30),
        adjustedActionGrowth,
      });
    }
  }

  rawActionsGrowth.sort((a, b) => b.rawGrowth - a.rawGrowth);

  return {
    adjustedActionsGrowth: stats
      .sort((a, b) => b.adjustedActionGrowth - a.adjustedActionGrowth)
      .map(({ distinctId, adjustedActionGrowth }) => ({
        distinctId,
        adjustedActionGrowth,
      })),
    rawActionsGrowth,
  };
}
