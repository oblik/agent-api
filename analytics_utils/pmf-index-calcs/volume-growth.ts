/**
 * This module calculates user volume growth metrics by analyzing historical transaction patterns.
 * It compares recent volume (14 days) to longer-term volume (60 days) to determine growth trends.
 * The growth calculation incorporates both the ratio of recent to historical volume and the trend slope.
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../../src/db/index.js";
import { getDistinctIdMapping, getEmbeddedAddresses } from "./utils.js";

/**
 * Statistics for a user's volume growth metrics
 */
interface UserVolumeStats {
  username: string;
  address: string;
  shortAverage: number;
  longAverage: number;
  volumeGrowthRatio: number;
  normalizedSlope: number;
  volumeGrowth: number;
  daysSinceSignUp: number;
  ageDiscount: number;
  adjustedVolumeGrowth: number;
}

/**
 * Simplified volume growth metrics for a user
 */
interface SimpleVolumeGrowth {
  distinctId: string;
  adjustedVolumeGrowth: number;
}

/**
 * Raw growth data for a user before adjustments
 */
interface UserGrowthData {
  distinctId: string;
  rawGrowth: number;
}

/**
 * Calculates volume statistics for a user over a given time period
 * @param userAddress - Ethereum address of the user
 * @param daysToLookBack - Number of days to analyze
 * @returns Object containing total volume, daily average, and daily volumes
 */
async function calculateUserVolumeStats(
  userAddress: string,
  daysToLookBack: number,
): Promise<{
  totalVolume: number;
  dailyAverage: number;
  dailyVolumes: number[];
}> {
  const result = await sequelize.query<{ daily_volume: string; day: Date }>(
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
      COALESCE(SUM(CASE WHEN h.volume IS NULL THEN 0 ELSE h.volume END), 0) as daily_volume
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

  const dailyVolumes = result.map((r) => Number(r.daily_volume));
  const totalVolume = dailyVolumes.reduce((sum, vol) => sum + vol, 0);
  const dailyAverage = totalVolume / daysToLookBack;

  return { totalVolume, dailyAverage, dailyVolumes };
}

/**
 * Calculates the slope of a linear regression line for a series of volume data points
 * @param volumes - Array of daily volume values
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
 * Gets the number of days since a user's first activity
 * @param userAddress - Ethereum address of the user
 * @returns Number of days between first and last activity
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
 * Analyzes volume growth patterns for all users
 * @returns Object containing adjusted and raw volume growth metrics for all users
 */
async function analyzeVolume(): Promise<{
  adjustedVolumeGrowth: SimpleVolumeGrowth[];
  rawVolumeGrowth: UserGrowthData[];
}> {
  const stats: UserVolumeStats[] = [];
  const rawVolumeGrowth: UserGrowthData[] = [];
  const w_r = 0.6; // Weight for ratio
  const w_s = 0.4; // Weight for slope

  // Get Mixpanel user mapping for Customers cohort
  const distinctIdMapping = await getDistinctIdMapping();

  // Extract user_ids
  const userIds = Object.values(distinctIdMapping)
    .map((profile) => profile.user_id)
    .filter((id) => id !== null);

  // Get embedded addresses for these users
  const addressMapping = await getEmbeddedAddresses(userIds);

  // First pass to calculate all valid growth ratios and adjusted growths
  const validAdjustedGrowths: number[] = [];

  for (const [distinctId, profile] of Object.entries(distinctIdMapping)) {
    if (!profile.user_id) continue;

    const addresses = addressMapping.get(profile.user_id) || [];
    if (addresses.length === 0) continue;

    for (const address of addresses) {
      const lowercaseAddress = address.toLowerCase();
      const shortStats = await calculateUserVolumeStats(lowercaseAddress, 14);
      const longStats = await calculateUserVolumeStats(lowercaseAddress, 60);

      if (longStats.dailyAverage > 0) {
        const ratio = shortStats.dailyAverage / longStats.dailyAverage - 1;
        const slope = calculateSlope(longStats.dailyVolumes);
        const normalizedSlope = slope / longStats.dailyAverage;
        const volumeGrowth = w_r * ratio + w_s * normalizedSlope;
        validAdjustedGrowths.push(volumeGrowth);
      }
    }
  }

  // Find minimum adjusted growth
  const baselineGrowth = Math.min(...validAdjustedGrowths);

  // Process all users, including those without addresses
  for (const [distinctId, profile] of Object.entries(distinctIdMapping)) {
    if (!profile.user_id) continue;

    const addresses = addressMapping.get(profile.user_id) || [];

    if (addresses.length === 0) {
      // User has no embedded addresses - assign baseline growth
      stats.push({
        username: profile.name,
        address: "",
        shortAverage: 0,
        longAverage: 0,
        volumeGrowthRatio: 0,
        normalizedSlope: 0,
        volumeGrowth: baselineGrowth,
        daysSinceSignUp: 0,
        ageDiscount: 0,
        adjustedVolumeGrowth: baselineGrowth,
      });
      continue;
    }

    // Process users with addresses
    for (const address of addresses) {
      const lowercaseAddress = address.toLowerCase();
      const shortStats = await calculateUserVolumeStats(lowercaseAddress, 14);
      const longStats = await calculateUserVolumeStats(lowercaseAddress, 60);
      const daysSinceSignUp = await getDaysSinceSignUp(lowercaseAddress);

      // Calculate growth metrics
      let volumeGrowthRatio = 0;
      let adjustedVolumeGrowth = baselineGrowth; // Default to minimum adjusted growth

      if (longStats.dailyAverage > 0) {
        volumeGrowthRatio =
          shortStats.dailyAverage / longStats.dailyAverage - 1;
        const slope = calculateSlope(longStats.dailyVolumes);
        const normalizedSlope = slope / longStats.dailyAverage;
        const volumeGrowth = w_r * volumeGrowthRatio + w_s * normalizedSlope;
        const ageDiscount = Math.min(1, daysSinceSignUp / 60);
        adjustedVolumeGrowth =
          baselineGrowth + (volumeGrowth - baselineGrowth) * ageDiscount;
      }

      // Track users with non-zero raw volume growth
      if (adjustedVolumeGrowth !== baselineGrowth) {
        rawVolumeGrowth.push({
          distinctId,
          rawGrowth: adjustedVolumeGrowth,
        });
      }

      stats.push({
        username: profile.name,
        address: lowercaseAddress,
        shortAverage: shortStats.dailyAverage,
        longAverage: longStats.dailyAverage,
        volumeGrowthRatio,
        normalizedSlope:
          longStats.dailyAverage > 0
            ? calculateSlope(longStats.dailyVolumes) / longStats.dailyAverage
            : 0,
        volumeGrowth: adjustedVolumeGrowth,
        daysSinceSignUp,
        ageDiscount: Math.min(1, daysSinceSignUp / 60),
        adjustedVolumeGrowth,
      });
    }
  }

  // Sort raw growth users by their raw growth in descending order
  rawVolumeGrowth.sort((a, b) => b.rawGrowth - a.rawGrowth);

  // Return both adjusted volume growth and raw volume growth metrics
  return {
    adjustedVolumeGrowth: stats
      .sort((a, b) => b.adjustedVolumeGrowth - a.adjustedVolumeGrowth)
      .map(({ username, adjustedVolumeGrowth }) => ({
        distinctId:
          Object.keys(distinctIdMapping).find(
            (key) => distinctIdMapping[key].name === username,
          ) || "",
        adjustedVolumeGrowth,
      })),
    rawVolumeGrowth,
  };
}

export { analyzeVolume };
