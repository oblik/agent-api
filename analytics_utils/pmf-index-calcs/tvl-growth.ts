import { QueryTypes } from "sequelize";
import { sequelize } from "../../src/db/index.js";
import { getDistinctIdMapping, getEmbeddedAddresses } from "./utils.js";

interface UserTVLStats {
  username: string;
  address: string;
  sevenDayAverage: number;
  thirtyDayAverage: number;
  tvlGrowthRatio: number;
  normalizedSlope: number;
  tvlGrowth: number;
  daysSinceSignUp: number;
  ageDiscount: number;
  adjustedTVLGrowth: number;
}

interface SimpleTVLGrowth {
  username: string;
  adjustedTVLGrowth: number;
}

interface UserGrowthData {
  username: string;
  rawGrowth: number;
}

async function calculateUserTVLStats(
  userAddress: string,
  daysToLookBack: number,
): Promise<{
  totalTVL: number;
  dailyAverage: number;
  dailyTVLs: number[];
}> {
  // First, let's check if we have any data for this user at all
  //   const checkData = await sequelize.query<{ count: number }>(
  //     `
  //     SELECT COUNT(*) as count
  //     FROM histories
  //     WHERE LOWER("useraddress") = :userAddress
  //     `,
  //     {
  //       replacements: {
  //         userAddress: userAddress.toLowerCase(),
  //       },
  //       type: QueryTypes.SELECT,
  //     }
  //   );

  //   console.log(`\nTotal records for ${userAddress}: ${checkData[0].count}`);

  // Let's also see the date range of their activity
  //   const dateRange = await sequelize.query<{ min_date: Date, max_date: Date }>(
  //     `
  //     SELECT
  //       MIN(to_timestamp("timestamp"/1000)) as min_date,
  //       MAX(to_timestamp("timestamp"/1000)) as max_date
  //     FROM histories
  //     WHERE LOWER("useraddress") = :userAddress
  //     `,
  //     {
  //       replacements: {
  //         userAddress: userAddress.toLowerCase(),
  //       },
  //       type: QueryTypes.SELECT,
  //     }
  //   );

  //   console.log(`Activity range: ${dateRange[0].min_date} to ${dateRange[0].max_date}`);

  // Now get the daily TVL with fixed interval syntax
  const result = await sequelize.query<{ daily_total_tvl: string; day: Date }>(
    `
    WITH days AS (
      SELECT generate_series(
        date_trunc('day', NOW() - INTERVAL '1 day' * :days),
        date_trunc('day', NOW()),
        '1 day'
      )::date as day
    )
    SELECT 
      days.day,
      COALESCE(SUM(CASE 
        WHEN t.daily_tvl IS NULL AND t.hl_tvl IS NULL THEN 0 
        ELSE COALESCE(t.daily_tvl, 0) + COALESCE(t.hl_tvl, 0) 
      END), 0) as daily_total_tvl
    FROM days
    LEFT JOIN tvl_tracking t ON 
      LOWER(t.user_address) = :userAddress AND
      t.date = days.day
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

  const dailyTVLs = result.map((r) => Number(r.daily_total_tvl));

  //console.log('Daily TVLs:', dailyTVLs);

  const totalTVL = dailyTVLs.reduce((sum, vol) => sum + vol, 0);
  const dailyAverage = totalTVL / daysToLookBack;

  return { totalTVL, dailyAverage, dailyTVLs };
}

function calculateSlope(tvls: number[]): number {
  const n = tvls.length;
  if (n === 0) return 0;

  const days = Array.from({ length: n }, (_, i) => i + 1);
  const xMean = (n + 1) / 2;
  const yMean = tvls.reduce((sum, y) => sum + y, 0) / n;

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    numerator += (days[i] - xMean) * (tvls[i] - yMean);
    denominator += Math.pow(days[i] - xMean, 2);
  }

  return denominator === 0 ? 0 : numerator / denominator;
}

async function getDaysSinceSignUp(userAddress: string): Promise<number> {
  const result = await sequelize.query<{ first_activity: Date }>(
    `
    SELECT MIN(date) as first_activity
    FROM tvl_tracking
    WHERE LOWER(user_address) = :userAddress
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
    SELECT MAX(date) as last_activity 
    FROM tvl_tracking
    WHERE LOWER(user_address) = :userAddress
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

async function analyzeTVL(): Promise<{
  adjustedTVLGrowth: SimpleTVLGrowth[];
  rawTVLGrowth: UserGrowthData[];
}> {
  const stats: UserTVLStats[] = [];
  const rawTVLGrowth: UserGrowthData[] = [];
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

  // Process all users
  for (const [distinctId, profile] of Object.entries(distinctIdMapping)) {
    if (profile.user_id) {
      const addresses = addressMapping.get(profile.user_id) || [];
      const username = profile.name || distinctId;

      for (const address of addresses) {
        const lowercaseAddress = address.toLowerCase();
        const sevenDayStats = await calculateUserTVLStats(lowercaseAddress, 7);
        const thirtyDayStats = await calculateUserTVLStats(
          lowercaseAddress,
          30,
        );
        const daysSinceSignUp = await getDaysSinceSignUp(lowercaseAddress);

        // Calculate growth metrics
        let tvlGrowthRatio = 0;
        if (thirtyDayStats.dailyAverage > 0) {
          tvlGrowthRatio =
            sevenDayStats.dailyAverage / thirtyDayStats.dailyAverage - 1;
        }

        const slope = calculateSlope(thirtyDayStats.dailyTVLs);
        const normalizedSlope =
          thirtyDayStats.dailyAverage === 0
            ? 0
            : slope / thirtyDayStats.dailyAverage;

        const tvlGrowth = w_r * tvlGrowthRatio + w_s * normalizedSlope;
        const ageDiscount = Math.min(1, daysSinceSignUp / 30);
        const adjustedTVLGrowth = tvlGrowth * ageDiscount;

        // Track users with non-zero raw action growth
        if (tvlGrowth !== 0) {
          rawTVLGrowth.push({
            username,
            rawGrowth: tvlGrowth,
          });
        }

        stats.push({
          username,
          address: lowercaseAddress,
          sevenDayAverage: sevenDayStats.dailyAverage,
          thirtyDayAverage: thirtyDayStats.dailyAverage,
          tvlGrowthRatio,
          normalizedSlope,
          tvlGrowth,
          daysSinceSignUp,
          ageDiscount,
          adjustedTVLGrowth: adjustedTVLGrowth < 0 ? 0 : adjustedTVLGrowth,
        });
      }
    }
  }

  // Sort raw growth users by their raw growth in descending order
  rawTVLGrowth.sort((a, b) => b.rawGrowth - a.rawGrowth);

  // Return both the original adjusted actions growth and the raw actions growth users
  return {
    adjustedTVLGrowth: stats
      .sort((a, b) => b.adjustedTVLGrowth - a.adjustedTVLGrowth)
      .map(({ username, adjustedTVLGrowth }) => ({
        username,
        adjustedTVLGrowth,
      })),
    rawTVLGrowth,
  };
}

// Export the analyzeActions function instead of running it
export { analyzeTVL };

// Add this code to print the results
// analyzeTVL().then((results) => {
// console.log(JSON.stringify(results, null, 2));
// }).catch((error) => {
// console.error('Error analyzing TVL:', error);
// });
