import type { ChainId } from "../..//utils/types.js";

const markets = {
  42161: [
    "btc",
    "eth",
    "sol",
    "arb",
    "link",
    "bnb",
    "atom",
    "doge",
    "near",
    "avax",
    "aave",
    "xrp",
    "ltc",
    "uni",
    "op",
    "gmx",
  ],
  43114: ["avax", "btc", "eth", "xrp", "doge", "sol", "ltc"],
} as Record<ChainId, string[]>;

export const availableMarkets = (chainId: ChainId) => {
  const marketsForChain = markets[chainId];
  return `${marketsForChain
    .slice(0, marketsForChain.length - 1)
    .join(", ")}, and ${marketsForChain[marketsForChain.length - 1]}`;
};

export default markets;
