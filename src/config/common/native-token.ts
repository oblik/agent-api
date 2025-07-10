import type { ChainId } from "../../utils/types.js";

export default {
  1: "ETH",
  10: "ETH",
  // 25: "CRO",
  56: "BNB",
  // 61: "ETH",
  // 100: "xDAI",
  101: "SOL",
  137: "MATIC",
  // 250: "FTM",
  // 314: "FIL",
  324: "ETH",
  // 1284: "GLMR",
  // 1285: "MOVR",
  // 2222: "KAVA",
  5000: "MNT",
  // 7700: "CANTO",
  8453: "ETH",
  34443: "ETH",
  42161: "ETH",
  // 42220: "CELO",
  43114: "AVAX",
  59144: "ETH",
  81457: "ETH",
  // Add more chainId-rpcUrl mappings here as needed
} as Record<ChainId, string>;
