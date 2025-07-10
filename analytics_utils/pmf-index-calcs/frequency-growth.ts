/**
 * This module calculates user frequency growth metrics by analyzing historical activity patterns.
 * It compares recent activity (14 days) to longer-term activity (60 days) to determine growth trends.
 * The growth calculation incorporates both the ratio of recent to historical frequency and the trend slope.
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../../src/db/index.js";
import { getDistinctIdMapping, getEmbeddedAddresses } from "./utils.js";

/**
 * Statistics for a user's frequency growth metrics
 */
interface UserFrequencyStats {
  username: string;
  address: string;
  shortAverage: number;
  longAverage: number;
  frequencyGrowthRatio: number;
  normalizedSlope: number;
  frequencyGrowth: number;
  daysSinceSignUp: number;
  ageDiscount: number;
  adjustedFrequencyGrowth: number;
}

/**
 * Simplified frequency growth metrics for a user
 */
interface SimpleFrequencyGrowth {
  distinctId: string;
  adjustedFrequencyGrowth: number;
}

/**
 * Raw growth data for a user before adjustments
 */
interface UserGrowthData {
  distinctId: string;
  rawGrowth: number;
}

/**
 * Calculates frequency statistics for a user over a given time period
 * @param userAddress - Ethereum address of the user
 * @param daysToLookBack - Number of days to analyze
 * @returns Object containing total frequency, daily average, and daily frequencies
 */
async function calculateUserActionStats(
  userAddress: string,
  daysToLookBack: number,
): Promise<{
  totalFrequency: number;
  dailyFrequencyAverage: number;
  dailyFrequencies: number[];
}> {
  const result = await sequelize.query<{ daily_frequency: string; day: Date }>(
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
      CASE 
        WHEN COUNT(DISTINCT date_trunc('day', to_timestamp(h."timestamp"/1000))) > 0 
        THEN 1 
        ELSE 0 
      END as daily_frequency
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

  const dailyFrequencies = result.map((r) => Number(r.daily_frequency));
  const totalFrequency = dailyFrequencies.reduce((sum, freq) => sum + freq, 0);
  const dailyFrequencyAverage = totalFrequency / daysToLookBack;

  return { totalFrequency, dailyFrequencyAverage, dailyFrequencies };
}

/**
 * Calculates the slope of a linear regression line through the data points
 * @param volumes - Array of numeric values to calculate slope for
 * @returns Slope of the regression line
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
 * Gets the number of days between a user's first and last activity
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
 * Main analysis function that calculates frequency growth metrics for all users
 * @returns Object containing adjusted and raw frequency growth metrics
 */
async function analyzeFrequency(): Promise<{
  adjustedFrequencyGrowth: SimpleFrequencyGrowth[];
  rawFrequencyGrowth: UserGrowthData[];
}> {
  const stats: UserFrequencyStats[] = [];
  const rawFrequencyGrowth: UserGrowthData[] = [];
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
      const shortStats = await calculateUserActionStats(lowercaseAddress, 14);
      const longStats = await calculateUserActionStats(lowercaseAddress, 60);

      if (longStats.dailyFrequencyAverage > 0) {
        const ratio =
          shortStats.dailyFrequencyAverage / longStats.dailyFrequencyAverage -
          1;
        const slope = calculateSlope(longStats.dailyFrequencies);
        const normalizedSlope = slope / longStats.dailyFrequencyAverage;
        const frequencyGrowth = w_r * ratio + w_s * normalizedSlope;
        validAdjustedGrowths.push(frequencyGrowth);
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
        frequencyGrowthRatio: 0,
        normalizedSlope: 0,
        frequencyGrowth: baselineGrowth,
        daysSinceSignUp: 0,
        ageDiscount: 0,
        adjustedFrequencyGrowth: baselineGrowth,
      });
      continue;
    }

    // Process users with addresses
    for (const address of addresses) {
      const lowercaseAddress = address.toLowerCase();
      const shortStats = await calculateUserActionStats(lowercaseAddress, 14);
      const longStats = await calculateUserActionStats(lowercaseAddress, 60);
      const daysSinceSignUp = await getDaysSinceSignUp(lowercaseAddress);

      // Calculate growth metrics for frequency
      let frequencyGrowthRatio = 0;
      let adjustedFrequencyGrowth = baselineGrowth; // Default to minimum adjusted growth

      if (longStats.dailyFrequencyAverage > 0) {
        frequencyGrowthRatio =
          shortStats.dailyFrequencyAverage / longStats.dailyFrequencyAverage -
          1;
        const slope = calculateSlope(longStats.dailyFrequencies);
        const normalizedSlope = slope / longStats.dailyFrequencyAverage;
        const frequencyGrowth =
          w_r * frequencyGrowthRatio + w_s * normalizedSlope;
        const ageDiscount = Math.min(1, daysSinceSignUp / 60);
        adjustedFrequencyGrowth =
          baselineGrowth + (frequencyGrowth - baselineGrowth) * ageDiscount;
      }

      // Track users with non-zero raw frequency growth
      if (adjustedFrequencyGrowth !== baselineGrowth) {
        rawFrequencyGrowth.push({
          distinctId,
          rawGrowth: adjustedFrequencyGrowth,
        });
      }

      stats.push({
        username: profile.name,
        address: lowercaseAddress,
        shortAverage: shortStats.dailyFrequencyAverage,
        longAverage: longStats.dailyFrequencyAverage,
        frequencyGrowthRatio,
        normalizedSlope:
          longStats.dailyFrequencyAverage > 0
            ? calculateSlope(longStats.dailyFrequencies) /
              longStats.dailyFrequencyAverage
            : 0,
        frequencyGrowth: adjustedFrequencyGrowth,
        daysSinceSignUp,
        ageDiscount: Math.min(1, daysSinceSignUp / 60),
        adjustedFrequencyGrowth,
      });
    }
  }

  rawFrequencyGrowth.sort((a, b) => b.rawGrowth - a.rawGrowth);

  return {
    adjustedFrequencyGrowth: stats
      .sort((a, b) => b.adjustedFrequencyGrowth - a.adjustedFrequencyGrowth)
      .map(({ username, adjustedFrequencyGrowth }) => ({
        distinctId:
          Object.keys(distinctIdMapping).find(
            (key) => distinctIdMapping[key].name === username,
          ) || "",
        adjustedFrequencyGrowth,
      })),
    rawFrequencyGrowth,
  };
}

export { analyzeFrequency };
