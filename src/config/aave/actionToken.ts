const ethTokens = [
  "WETH",
  "wstETH",
  "WBTC",
  "USDC",
  "DAI",
  "LINK",
  "AAVE",
  "ETH",
  "cbETH",
  "USDT",
  "rETH",
  "LUSD",
  "CRV",
  "MKR",
  "SNX",
  "BAL",
  "UNI",
  "LDO",
  "ENS",
  "1INCH",
  "FRAX",
  "GHO",
  "RPL",
  "sDAI",
  "STG",
  "KNC",
  "FXS",
  "crvUSD",
  "PYUSD",
];

const opTokens = [
  "DAI",
  "SUSD",
  "USDC",
  "USDT",
  "AAVE",
  "LINK",
  "WBTC",
  "WETH",
  "ETH",
];

const arbTokens = [
  "DAI",
  "EURS",
  "USDC",
  "USDT",
  "AAVE",
  "LINK",
  "WBTC",
  "WETH",
  "ETH",
];

const polygonTokens = [
  "AGEUR",
  "DAI",
  "EURS",
  "JEUR",
  "MATIC",
  "USDC",
  "USDT",
  "AAVE",
  "BAL",
  "CRV",
  "DPI",
  "GHST",
  "LINK",
  "MATICX",
  "STMATIC",
  "SUSHI",
  "WBTC",
  "WETH",
  "WMATIC",
  "ETH",
];

const fantomTokens = [
  "AAVE",
  "DAI",
  "USDT",
  "LINK",
  "WFTM",
  "USDC",
  "WBTC",
  "WETH",
  "CRV",
  "SUSHI",
];

const avaxTokens = [
  "DAI",
  "FRAX",
  "MAI",
  "USDC",
  "USDT",
  "AAVE",
  "BTC.b",
  "LINK",
  "SAVAX",
  "WAVAX",
  "WBTC",
  "WETH",
  "ETH",
];

export default {
  1: {
    deposit: ethTokens,
    lend: ethTokens,
  },
  10: {
    deposit: opTokens,
    lend: opTokens,
  },
  42161: {
    deposit: arbTokens,
    lend: arbTokens,
  },
  137: {
    deposit: polygonTokens,
    lend: polygonTokens,
  },
  250: {
    deposit: fantomTokens,
    lend: fantomTokens,
  },
  43114: {
    deposit: avaxTokens,
    lend: avaxTokens,
  },
};
