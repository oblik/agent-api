import type { ChainId } from "../../utils/types.js";

export const TICKER_URL = {
  42161: "https://arbitrum-api.gmxinfra.io/prices/tickers",
  43114: "https://avalanche-api.gmxinfra.io/prices/tickers",
} as Record<ChainId, string>;

export const TOKEN_URL = {
  42161: "https://arbitrum-api.gmxinfra.io/tokens",
  43114: "https://avalanche-api.gmxinfra.io/tokens",
} as Record<ChainId, string>;
