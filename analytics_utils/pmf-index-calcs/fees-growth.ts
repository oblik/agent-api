/**
 * This module calculates user fee growth metrics by analyzing historical fee data.
 * It compares recent fee activity (14 days) to longer-term activity (60 days) to determine growth trends.
 * The growth calculation incorporates both the ratio of recent to historical fees and the trend slope.
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../../src/db/index.js";
import { getDistinctIdMapping, getEmbeddedAddresses } from "./utils.js";

/**
 * Statistics for a user's fee growth metrics
 */
interface UserFeeStats {
  username: string;
  address: string;
  shortAverage: number;
  longAverage: number;
  feeGrowthRatio: number;
  normalizedSlope: number;
  feeGrowth: number;
  daysSinceSignUp: number;
  ageDiscount: number;
  adjustedFeeGrowth: number;
}

/**
 * Simplified fee growth metrics for a user
 */
interface SimpleFeeGrowth {
  distinctId: string;
  adjustedFeeGrowth: number;
}

/**
 * Raw growth data for a user before adjustments
 */
interface UserGrowthData {
  distinctId: string;
  rawGrowth: number;
}

/**
 * Calculates fee statistics for a user over a given time period
 * @param userAddress - Ethereum address of the user
 * @param daysToLookBack - Number of days to analyze
 * @returns Object containing total fees, daily average, and daily fee volumes
 */
async function calculateUserFeeStats(
  userAddress: string,
  daysToLookBack: number,
): Promise<{
  totalFees: number;
  dailyAverage: number;
  dailyVolumes: number[];
}> {
  const result = await sequelize.query<{ daily_fees: string; day: Date }>(
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
      COALESCE(SUM(CASE WHEN h.totalfees IS NULL THEN 0 ELSE h.totalfees END), 0) as daily_fees
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

  const dailyVolumes = result.map((r) => Number(r.daily_fees));
  const totalFees = dailyVolumes.reduce((sum, vol) => sum + vol, 0);
  const dailyAverage = totalFees / daysToLookBack;

  return { totalFees, dailyAverage, dailyVolumes };
}

/**
 * Calculates the slope of the trend line for a series of values
 * @param volumes - Array of daily volume values
 * @returns Slope of the trend line
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
 * Main analysis function that calculates fee growth metrics for all users
 * @returns Object containing adjusted and raw fee growth metrics
 */
async function analyzeFees(): Promise<{
  adjustedFeesGrowth: SimpleFeeGrowth[];
  rawFeesGrowth: UserGrowthData[];
}> {
  const stats: UserFeeStats[] = [];
  const rawFeesGrowth: UserGrowthData[] = [];
  const w_r = 0.6; // Weight for ratio
  const w_s = 0.4; // Weight for slope

  const distinctIdMapping = await getDistinctIdMapping();
  const userIds = Object.values(distinctIdMapping)
    .map((profile) => profile.user_id)
    .filter((id) => id !== null);
  const addressMapping = await getEmbeddedAddresses(userIds);

  // Calculate baseline growth from valid users
  const validAdjustedGrowths: number[] = [];
  for (const [distinctId, profile] of Object.entries(distinctIdMapping)) {
    if (!profile.user_id) continue;

    const addresses = addressMapping.get(profile.user_id) || [];
    if (addresses.length === 0) continue;

    for (const address of addresses) {
      const lowercaseAddress = address.toLowerCase();
      const shortStats = await calculateUserFeeStats(lowercaseAddress, 14);
      const longStats = await calculateUserFeeStats(lowercaseAddress, 60);

      if (longStats.dailyAverage > 0) {
        const ratio = shortStats.dailyAverage / longStats.dailyAverage - 1;
        const slope = calculateSlope(longStats.dailyVolumes);
        const normalizedSlope = slope / longStats.dailyAverage;
        const feeGrowth = w_r * ratio + w_s * normalizedSlope;
        validAdjustedGrowths.push(feeGrowth);
      }
    }
  }

  const baselineGrowth = Math.min(...validAdjustedGrowths);

  // Process all users
  for (const [distinctId, profile] of Object.entries(distinctIdMapping)) {
    if (!profile.user_id) continue;

    const addresses = addressMapping.get(profile.user_id) || [];

    if (addresses.length === 0) {
      stats.push({
        username: profile.name,
        address: "",
        shortAverage: 0,
        longAverage: 0,
        feeGrowthRatio: 0,
        normalizedSlope: 0,
        feeGrowth: baselineGrowth,
        daysSinceSignUp: 0,
        ageDiscount: 0,
        adjustedFeeGrowth: baselineGrowth,
      });
      continue;
    }

    for (const address of addresses) {
      const lowercaseAddress = address.toLowerCase();
      const shortStats = await calculateUserFeeStats(lowercaseAddress, 14);
      const longStats = await calculateUserFeeStats(lowercaseAddress, 60);
      const daysSinceSignUp = await getDaysSinceSignUp(lowercaseAddress);

      let feeGrowthRatio = 0;
      let adjustedFeeGrowth = baselineGrowth;

      if (longStats.dailyAverage > 0) {
        feeGrowthRatio = shortStats.dailyAverage / longStats.dailyAverage - 1;
        const slope = calculateSlope(longStats.dailyVolumes);
        const normalizedSlope = slope / longStats.dailyAverage;
        const feeGrowth = w_r * feeGrowthRatio + w_s * normalizedSlope;
        const ageDiscount = Math.min(1, daysSinceSignUp / 60);
        adjustedFeeGrowth =
          baselineGrowth + (feeGrowth - baselineGrowth) * ageDiscount;
      }

      if (adjustedFeeGrowth !== baselineGrowth) {
        rawFeesGrowth.push({
          distinctId,
          rawGrowth: adjustedFeeGrowth,
        });
      }

      stats.push({
        username: profile.name,
        address: lowercaseAddress,
        shortAverage: shortStats.dailyAverage,
        longAverage: longStats.dailyAverage,
        feeGrowthRatio,
        normalizedSlope:
          longStats.dailyAverage > 0
            ? calculateSlope(longStats.dailyVolumes) / longStats.dailyAverage
            : 0,
        feeGrowth: adjustedFeeGrowth,
        daysSinceSignUp,
        ageDiscount: Math.min(1, daysSinceSignUp / 60),
        adjustedFeeGrowth,
      });
    }
  }

  rawFeesGrowth.sort((a, b) => b.rawGrowth - a.rawGrowth);

  return {
    adjustedFeesGrowth: stats
      .sort((a, b) => b.adjustedFeeGrowth - a.adjustedFeeGrowth)
      .map(({ username, adjustedFeeGrowth }) => ({
        distinctId:
          Object.keys(distinctIdMapping).find(
            (key) => distinctIdMapping[key].name === username,
          ) || "",
        adjustedFeeGrowth,
      })),
    rawFeesGrowth,
  };
}

export { analyzeFees };
