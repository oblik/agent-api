import { storeHLTVLData } from "../pmf-index-calcs/hl-tvl-utils.js";
import { analyzeWallets } from "../pmf-index-calcs/tvl-utils.js";

/**
 * TVL collection by executing both wallet analysis and Hyperliquid TVL data collection.
 */
async function runTVLCollection(): Promise<void> {
  // analyzeWallets
  console.log("Starting regular wallet TVL analysis...");
  await analyzeWallets();
  console.log("Regular wallet TVL analysis completed");

  // storeHLTVLData
  console.log("Starting Hyperliquid TVL collection...");
  await storeHLTVLData();
  console.log("Hyperliquid TVL collection completed");
}

await runTVLCollection();
