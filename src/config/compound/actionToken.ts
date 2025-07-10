const ethTokens = {
  usdc: ["WBTC", "WETH", "UNI", "LINK", "USDC", "ETH", "wstETH"],
  usdt: ["WBTC", "WETH", "UNI", "LINK", "USDT", "wstETH", "ETH"],
  weth: [
    "wstETH",
    "WETH",
    "rETH",
    "cbETH",
    "ezETH",
    "osETH",
    "rsETH",
    "WBTC",
    "weETH",
    "ETH",
  ],
};

const arbTokens = {
  usdc: ["ARB", "GMX", "USDC", "WBTC", "WETH", "ETH"],
  "usdc.e": ["ARB", "GMX", "USDC.e", "WBTC", "WETH", "ETH"],
  usdt: ["ARB", "GMX", "USDT", "WBTC", "wstETH", "WETH", "ETH"],
  weth: ["rETH", "wstETH", "WBTC", "WETH", "ETH"],
};

const polygonTokens = {
  usdc: ["WBTC", "WMATIC", "stMATIC", "MaticX", "USDC.e", "WETH"],
  usdt: ["WBTC", "WMATIC", "stMATIC", "MaticX", "USDT", "WETH"],
};

const baseTokens = {
  usdc: ["cbETH", "WETH", "USDC", "ETH"],
  usdbc: ["cbETH", "WETH", "USDbC", "ETH"],
  weth: ["WETH", "cbETH", "ETH"],
};

const opTokens = {
  usdc: ["WETH", "WBTC", "USDC", "ETH"],
  usdt: ["WETH", "WBTC", "USDT", "ETH"],
  weth: ["WETH", "WBTC", "wstETH", "rETH", "ETH"],
};

export default {
  1: {
    deposit: ethTokens,
    lend: ethTokens,
  },
  137: {
    deposit: polygonTokens,
    lend: polygonTokens,
  },
  8453: {
    deposit: baseTokens,
    lend: baseTokens,
  },
  10: {
    deposit: opTokens,
    lend: opTokens,
  },
  42161: {
    deposit: arbTokens,
    lend: arbTokens,
  },
};
