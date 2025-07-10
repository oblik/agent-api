/**
 * PMF Index Calculator
 *
 * This module calculates a Product-Market Fit (PMF) index for users based on multiple metrics:
 * - Actions executed: Number of actions performed in a 30-day window
 * - Actions growth: Growth rate of actions over time
 * - Fees growth: Growth rate of fees generated
 * - Frequency growth: Growth in frequency of platform usage
 * - Max TVL: Maximum Total Value Locked
 * - Volume growth: Growth in trading volume
 *
 * The final PMF score is calculated using weighted normalized metrics.
 */

import fs from "fs";
import path from "path";
import moment from "moment";
import { analyzeGrowthActions } from "./actions-executed-growth.js";
import { analyzeEvents } from "./actions-executed.js";
import { analyzeFees } from "./fees-growth.js";
import { getFeesByUser } from "./fees.js";
import { analyzeFrequency } from "./frequency-growth.js";
import { getFrequencyByUser } from "./frequency.js";
import { getMaxTVLForUsers } from "./max-tvl.js";
import { getTelegramParameters } from "./tg-parameters.js";
import { getDistinctIdMapping } from "./utils.js";
import { analyzeVolume } from "./volume-growth.js";
import { getVolumesByUser } from "./volume.js";

/**
 * Interface representing the PMF metrics for a user
 */
interface PMFMetrics {
  distinctId: string;
  username: string;
  metrics: {
    actionsExecuted: number;
    actionsGrowth: number;
    feesGrowth: number;
    fees: number;
    frequencyGrowth: number;
    frequency: number;
    maxTVL: number;
    volumeGrowth: number;
    volume: number;
    telegramActivity: number;
  };
  pmfScore: number;
}

/**
 * Configuration for metric weights in PMF calculation
 */
interface WeightConfig {
  actionsExecuted: number;
  actionsGrowth: number;
  feesGrowth: number;
  fees: number;
  frequencyGrowth: number;
  frequency: number;
  maxTVL: number;
  volumeGrowth: number;
  volume: number;
  telegramActivity: number;
}

// Default weights for the PMF index calculation
const DEFAULT_WEIGHTS: WeightConfig = {
  actionsExecuted: 0.1,
  actionsGrowth: 0.1,
  feesGrowth: 0.1,
  fees: 0.1,
  frequencyGrowth: 0.1,
  frequency: 0.1,
  maxTVL: 0.1,
  volumeGrowth: 0.1,
  volume: 0.1,
  telegramActivity: 0.1,
};

/**
 * Normalizes an array of metrics to values between 0 and 1
 * @param metrics Array of numeric metrics to normalize
 * @returns Array of normalized metrics
 */
function normalizeMetrics(metrics: number[]): number[] {
  console.log("\nNormalizing metrics:", metrics);
  const max = Math.max(...metrics.filter((n) => !isNaN(n) && isFinite(n)));
  const min = Math.min(...metrics.filter((n) => !isNaN(n) && isFinite(n)));

  if (max === min) {
    console.log("All metrics are equal, returning 1s");
    return metrics.map(() => 1);
  }

  const normalized = metrics.map((metric) => {
    if (isNaN(metric) || !isFinite(metric)) {
      console.log("Found invalid metric:", metric);
      return 0;
    }
    return (metric - min) / (max - min);
  });

  console.log("Normalized metrics:", normalized);
  return normalized;
}

/**
 * Calculates PMF score from metrics using provided weights
 * @param metrics User metrics to calculate score from
 * @param weights Optional custom weights for calculation
 * @returns Calculated PMF score
 */
function calculatePMFScore(
  metrics: PMFMetrics["metrics"],
  weights: WeightConfig = DEFAULT_WEIGHTS,
): number {
  console.log("\nCalculating PMF score for metrics:", metrics);

  const metricValues = [
    metrics.actionsExecuted,
    metrics.actionsGrowth,
    metrics.feesGrowth,
    metrics.fees,
    metrics.frequencyGrowth,
    metrics.frequency,
    metrics.maxTVL,
    metrics.volumeGrowth,
    metrics.volume,
    metrics.telegramActivity,
  ];

  const weightValues = [
    weights.actionsExecuted,
    weights.actionsGrowth,
    weights.feesGrowth,
    weights.fees,
    weights.frequencyGrowth,
    weights.frequency,
    weights.maxTVL,
    weights.volumeGrowth,
    weights.volume,
    weights.telegramActivity,
  ];

  const normalizedMetrics = normalizeMetrics(metricValues);

  const score = normalizedMetrics.reduce((sum, metric, index) => {
    const weightedValue = metric * weightValues[index];
    console.log(
      `Metric ${index}: ${metric} * weight ${weightValues[index]} = ${weightedValue}`,
    );
    return sum + weightedValue;
  }, 0);

  console.log("Final PMF score:", score);
  return score;
}

/**
 * Saves data to a CSV file in the pmf-index-storage directory
 * @param data Array of objects to save
 * @param filename Base filename without extension
 */
async function saveToCSV(data: any[], filename: string) {
  const date = moment().format("YYYY-MM-DD");
  const csvFilename = `${filename}_${date}.csv`;
  const csvPath = path.join(
    process.cwd(),
    "analytics_utils/pmf-index-calcs/pmf-index-storage",
    csvFilename,
  );

  try {
    // Ensure directory exists
    const dir = path.dirname(csvPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Convert data to CSV format
    const headers = Object.keys(data[0]).join(",");
    const rows = data.map((item) => Object.values(item).join(","));
    const csvContent = [headers, ...rows].join("\n");

    // Write to file
    fs.writeFileSync(csvPath, csvContent);
    console.log(`Saved ${csvFilename}`);
  } catch (error) {
    console.error(`Error saving ${csvFilename}:`, error);
  }
}

/**
 * Main function to calculate PMF index for all users
 * @param customWeights Optional custom weights for PMF calculation
 * @returns Array of PMF metrics for all users, sorted by PMF score
 */
async function calculatePMFIndex(
  customWeights?: WeightConfig,
): Promise<PMFMetrics[]> {
  console.log("\n=== Starting PMF Index Calculation ===");

  console.log("\nFetching user mapping...");
  const distinctIdMapping = await getDistinctIdMapping();
  console.log(`Found ${Object.keys(distinctIdMapping).length} users`);

  console.log("\nFetching all metrics...");
  try {
    console.log("- Fetching Telegram metrics...");
    const telegramMetrics = await getTelegramParameters();
    await saveToCSV(
      telegramMetrics.map(({ distinctId, requests }) => {
        const profile = distinctIdMapping[distinctId];
        return {
          distinctId,
          discordId: profile?.name || distinctId,
          requests,
        };
      }),
      "telegram_requests",
    );

    console.log("- Fetching actions executed...");
    const actionsExecuted = await analyzeEvents();
    await saveToCSV(
      actionsExecuted.map(({ distinctId, maxActionsExecuted }) => {
        const profile = distinctIdMapping[distinctId];
        return {
          distinctId,
          discordId: profile?.name || distinctId,
          maxActionsExecuted,
        };
      }),
      "actions_executed",
    );

    console.log("- Fetching actions growth...");
    const actionsGrowth = await analyzeGrowthActions();
    await saveToCSV(
      actionsGrowth.adjustedActionsGrowth.map(
        ({ distinctId, adjustedActionGrowth }) => {
          const profile = distinctIdMapping[distinctId];
          return {
            distinctId,
            discordId: profile?.name || distinctId,
            adjustedActionGrowth,
          };
        },
      ),
      "actions_growth",
    );

    console.log("- Fetching fees metrics...");
    const feesByUser = await getFeesByUser();
    await saveToCSV(
      feesByUser.map(({ distinctId, maxFees, startDate, endDate }) => {
        const profile = distinctIdMapping[distinctId];
        return {
          distinctId,
          discordId: profile?.name || distinctId,
          maxFees,
          startDate: startDate?.toISOString() || null,
          endDate: endDate?.toISOString() || null,
        };
      }),
      "fees",
    );

    console.log("- Fetching fees growth...");
    const feesGrowth = await analyzeFees();
    await saveToCSV(
      feesGrowth.adjustedFeesGrowth.map(
        ({ distinctId, adjustedFeeGrowth }) => ({
          distinctId,
          discordId: distinctIdMapping[distinctId]?.name || distinctId,
          adjustedFeeGrowth,
        }),
      ),
      "fees_growth",
    );

    console.log("- Fetching frequency metrics...");
    const frequencyByUser = await getFrequencyByUser();
    await saveToCSV(
      frequencyByUser.map(
        ({ distinctId, maxUniqueDays, startDate, endDate }) => ({
          distinctId,
          discordId: distinctIdMapping[distinctId]?.name || distinctId,
          maxUniqueDays,
          startDate: startDate?.toISOString() || null,
          endDate: endDate?.toISOString() || null,
        }),
      ),
      "frequency",
    );

    console.log("- Fetching frequency growth...");
    const frequencyGrowth = await analyzeFrequency();
    await saveToCSV(
      frequencyGrowth.adjustedFrequencyGrowth.map(
        ({ distinctId, adjustedFrequencyGrowth }) => ({
          distinctId,
          discordId: distinctIdMapping[distinctId]?.name || distinctId,
          adjustedFrequencyGrowth,
        }),
      ),
      "frequency_growth",
    );

    console.log("- Fetching max TVL...");
    const maxTVL = await getMaxTVLForUsers();
    await saveToCSV(
      maxTVL.map(({ userId, maxTVL: tvl }) => {
        const [distinctId] = Object.entries(distinctIdMapping).find(
          ([_, profile]) => profile.user_id === userId,
        ) || [""];
        return {
          distinctId,
          discordId: distinctIdMapping[distinctId]?.name || distinctId,
          maxTVL: tvl,
        };
      }),
      "max_tvl",
    );

    console.log("- Fetching volume metrics...");
    const volumesByUser = await getVolumesByUser();
    await saveToCSV(
      Array.from(volumesByUser.entries()).map(([distinctId, stats]) => {
        const profile = distinctIdMapping[distinctId];
        return {
          distinctId,
          discordId: profile?.name || distinctId,
          maxVolume: stats.maxVolume,
          startDate: stats.startDate.toISOString(),
          endDate: stats.endDate.toISOString(),
        };
      }),
      "volume",
    );

    console.log("- Fetching volume growth...");
    const volumeGrowth = await analyzeVolume();
    await saveToCSV(
      volumeGrowth.adjustedVolumeGrowth.map(
        ({ distinctId, adjustedVolumeGrowth }) => ({
          distinctId,
          discordId: distinctIdMapping[distinctId]?.name || distinctId,
          adjustedVolumeGrowth,
        }),
      ),
      "volume_growth",
    );

    console.log("\nAll metrics fetched and saved successfully");

    // Create a map to store metrics by distinct ID
    console.log("\nInitializing metrics map...");
    const metricsMap = new Map<string, PMFMetrics>();

    // Initialize metrics for all users
    for (const [distinctId, profile] of Object.entries(distinctIdMapping)) {
      metricsMap.set(distinctId, {
        distinctId,
        username: profile.name || distinctId,
        metrics: {
          actionsExecuted: 0,
          actionsGrowth: 0,
          feesGrowth: 0,
          fees: 0,
          frequencyGrowth: 0,
          frequency: 0,
          maxTVL: 0,
          volumeGrowth: 0,
          volume: 0,
          telegramActivity: 0,
        },
        pmfScore: 0,
      });
    }

    console.log("\nPopulating metrics...");

    console.log("- Processing actions executed...");
    actionsExecuted.forEach(({ distinctId, maxActionsExecuted }) => {
      const user = metricsMap.get(distinctId);
      if (user) user.metrics.actionsExecuted = maxActionsExecuted;
    });

    console.log("- Processing actions growth...");
    actionsGrowth.adjustedActionsGrowth.forEach(
      ({ distinctId, adjustedActionGrowth }) => {
        const user = metricsMap.get(distinctId);
        if (user) user.metrics.actionsGrowth = adjustedActionGrowth;
      },
    );

    console.log("- Processing fees growth...");
    feesGrowth.adjustedFeesGrowth.forEach(
      ({ distinctId, adjustedFeeGrowth }) => {
        const user = metricsMap.get(distinctId);
        if (user) user.metrics.feesGrowth = adjustedFeeGrowth;
      },
    );

    console.log("- Processing frequency growth...");
    frequencyGrowth.adjustedFrequencyGrowth.forEach(
      ({ distinctId, adjustedFrequencyGrowth }) => {
        const user = metricsMap.get(distinctId);
        if (user) user.metrics.frequencyGrowth = adjustedFrequencyGrowth;
      },
    );

    console.log("- Processing max TVL...");
    maxTVL.forEach(({ userId, maxTVL: tvl }) => {
      const [distinctId] = Object.entries(distinctIdMapping).find(
        ([_, profile]) => profile.user_id === userId,
      ) || [""];
      if (distinctId) {
        const user = metricsMap.get(distinctId);
        if (user) user.metrics.maxTVL = tvl;
      }
    });

    console.log("- Fetching base fees...");
    feesByUser.forEach(({ distinctId, maxFees }) => {
      const user = metricsMap.get(distinctId);
      if (user) user.metrics.fees = maxFees;
    });

    console.log("- Fetching base frequency...");
    frequencyByUser.forEach(({ distinctId, maxUniqueDays }) => {
      const user = metricsMap.get(distinctId);
      if (user) user.metrics.frequency = maxUniqueDays;
    });

    console.log("- Fetching base volume...");
    volumesByUser.forEach((stats, distinctId) => {
      const user = metricsMap.get(distinctId);
      if (user) user.metrics.volume = stats.maxVolume;
    });

    console.log("- Fetching telegram activity...");
    telegramMetrics.forEach(({ distinctId, requests }) => {
      const user = metricsMap.get(distinctId);
      if (user) user.metrics.telegramActivity = requests;
    });

    console.log("- Processing volume growth...");
    volumeGrowth.adjustedVolumeGrowth.forEach(
      ({ distinctId, adjustedVolumeGrowth }) => {
        const user = metricsMap.get(distinctId);
        if (user) user.metrics.volumeGrowth = adjustedVolumeGrowth;
      },
    );

    console.log("\nCalculating final PMF scores...");
    const weights = customWeights || DEFAULT_WEIGHTS;
    console.log("Using weights:", weights);

    // First, collect all metrics across all users into arrays
    const allMetrics = {
      actionsExecuted: [] as number[],
      actionsGrowth: [] as number[],
      feesGrowth: [] as number[],
      fees: [] as number[],
      frequencyGrowth: [] as number[],
      frequency: [] as number[],
      maxTVL: [] as number[],
      volumeGrowth: [] as number[],
      volume: [] as number[],
      telegramActivity: [] as number[],
    };

    // Collect all metrics first
    for (const metrics of metricsMap.values()) {
      allMetrics.actionsExecuted.push(metrics.metrics.actionsExecuted);
      allMetrics.actionsGrowth.push(metrics.metrics.actionsGrowth);
      allMetrics.feesGrowth.push(metrics.metrics.feesGrowth);
      allMetrics.fees.push(metrics.metrics.fees);
      allMetrics.frequencyGrowth.push(metrics.metrics.frequencyGrowth);
      allMetrics.frequency.push(metrics.metrics.frequency);
      allMetrics.maxTVL.push(metrics.metrics.maxTVL);
      allMetrics.volumeGrowth.push(metrics.metrics.volumeGrowth);
      allMetrics.volume.push(metrics.metrics.volume);
      allMetrics.telegramActivity.push(metrics.metrics.telegramActivity);
    }

    // Then normalize each metric type across all users
    const normalizedMetricsByType = {
      actionsExecuted: normalizeMetrics(allMetrics.actionsExecuted),
      actionsGrowth: normalizeMetrics(allMetrics.actionsGrowth),
      feesGrowth: normalizeMetrics(allMetrics.feesGrowth),
      fees: normalizeMetrics(allMetrics.fees),
      frequencyGrowth: normalizeMetrics(allMetrics.frequencyGrowth),
      frequency: normalizeMetrics(allMetrics.frequency),
      maxTVL: normalizeMetrics(allMetrics.maxTVL),
      volumeGrowth: normalizeMetrics(allMetrics.volumeGrowth),
      volume: normalizeMetrics(allMetrics.volume),
      telegramActivity: normalizeMetrics(allMetrics.telegramActivity),
    };

    // Finally, calculate PMF scores using the cohort-normalized values
    let userIndex = 0;
    for (const metrics of metricsMap.values()) {
      const normalizedMetrics = {
        actionsExecuted: normalizedMetricsByType.actionsExecuted[userIndex],
        actionsGrowth: normalizedMetricsByType.actionsGrowth[userIndex],
        feesGrowth: normalizedMetricsByType.feesGrowth[userIndex],
        fees: normalizedMetricsByType.fees[userIndex],
        frequencyGrowth: normalizedMetricsByType.frequencyGrowth[userIndex],
        frequency: normalizedMetricsByType.frequency[userIndex],
        maxTVL: normalizedMetricsByType.maxTVL[userIndex],
        volumeGrowth: normalizedMetricsByType.volumeGrowth[userIndex],
        volume: normalizedMetricsByType.volume[userIndex],
        telegramActivity: normalizedMetricsByType.telegramActivity[userIndex],
      };
      metrics.pmfScore = calculatePMFScore(normalizedMetrics, weights);
      userIndex++;
    }

    console.log("\nSorting results...");
    const results = Array.from(metricsMap.values()).sort(
      (a, b) => b.pmfScore - a.pmfScore,
    );

    // Save final PMF scores with additional base metrics
    await saveToCSV(
      results.map((result) => {
        const fees = feesByUser.find((f) => f.distinctId === result.distinctId);
        const frequency = frequencyByUser.find(
          (f) => f.distinctId === result.distinctId,
        );
        const profile = distinctIdMapping[result.distinctId];
        const telegram = telegramMetrics.find(
          (t) => t.distinctId === result.distinctId,
        );
        const volume = volumesByUser.get(result.distinctId);

        return {
          distinctId: result.distinctId,
          discordId: profile?.name || result.distinctId,
          pmfScore: result.pmfScore,
          // Growth metrics
          actionsExecuted: result.metrics.actionsExecuted,
          actionsGrowth: result.metrics.actionsGrowth,
          feesGrowth: result.metrics.feesGrowth,
          frequencyGrowth: result.metrics.frequencyGrowth,
          maxTVL: result.metrics.maxTVL,
          volumeGrowth: result.metrics.volumeGrowth,
          // Base metrics
          maxFees: fees?.maxFees || 0,
          feesStartDate: fees?.startDate?.toISOString() || null,
          feesEndDate: fees?.endDate?.toISOString() || null,
          maxUniqueDays: frequency?.maxUniqueDays || 0,
          frequencyStartDate: frequency?.startDate?.toISOString() || null,
          frequencyEndDate: frequency?.endDate?.toISOString() || null,
          maxVolume: volume?.maxVolume || 0,
          volumeStartDate: volume?.startDate?.toISOString() || null,
          volumeEndDate: volume?.endDate?.toISOString() || null,
          // Telegram metrics
          telegramRequests: telegram?.requests || 0,
        };
      }),
      "pmf_scores",
    );

    console.log("\n=== PMF Index Calculation Complete ===");
    return results;
  } catch (error) {
    console.error("\nError during PMF index calculation:", error);
    throw error;
  }
}

// Export the main function and types
export { calculatePMFIndex, type PMFMetrics, type WeightConfig };

// Add this code to print the results
calculatePMFIndex()
  .then((results) => {
    console.log("\n=== Final Results ===");
  })
  .catch((error) => {
    console.error("\n=== Error in PMF Index Calculation ===");
    console.error("Error:", error);
  });
