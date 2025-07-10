import { initModels } from "../../../db/index.js";
import {
  calcTvl,
  cleanTransactions,
  isDependent,
  runFeeCalculations,
} from "../../../utils/index.js";
import type { Call, CleanedAction } from "../../../utils/types.js";

jest.mock("axios");

describe("runFeeCalculations", () => {
  beforeAll(async () => {
    await initModels();
  });

  it("calculates fees correctly for valid transactions and conditions", async () => {
    const account = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const rawTransactions = [
      {
        id: "m3c0",
        args: {
          provider: "1inch",
          slippage: "0.1",
          chainName: "arbitrum",
          inputToken: "eth",
          inputAmount: "6.044127889963867079",
          outputToken: "usdc",
          accountAddress: "0x6ED5b1F41072ff460105249ab251875c71460770",
        },
        body: {
          provider: "1inch",
          slippage: "0.1",
          chainName: "arbitrum",
          inputToken: "eth",
          inputAmount: "6.044127889963867079",
          outputToken: "usdc",
          accountAddress: "0x6ED5b1F41072ff460105249ab251875c71460770",
        },
        name: "swap",
        origin: 1,
        tokens: {
          "42161": { usdc: "0xaf88d065e77c8cc2239327c5edb3a432268e5831" },
        },
        txNames: ["Swap"],
        gasCheck: false,
        gasCosts: { "42161": "0.00006596824" },
        txHashes: [
          "0xc8df965b406d2815998e6cb846fc0a4d045fa000a9921abe88983cc68ab05345",
        ],
        contracts: ["0x1111111254eeb25477b68fb85ed929f73a960582"],
        txGasUsed: ["3298412"],
        balanceChanges: {
          "42161": { eth: "-6.044127889963867079", usdc: "17531.43425" },
        },
        txBalanceChanges: [
          { eth: "-6.044127889963867079", usdc: "17531.43425" },
        ],
      },
      {
        id: "m3c1",
        lp: undefined,
        args: {
          token: "usdc",
          amount: "17533.020048",
          chainName: "arbitrum",
          protocolName: "hyperliquid",
          accountAddress: "0x6ED5b1F41072ff460105249ab251875c71460770",
        },
        body: {
          token: "usdc",
          amount: "17533.020048",
          chainName: "arbitrum",
          protocolName: "hyperliquid",
          accountAddress: "0x6ED5b1F41072ff460105249ab251875c71460770",
        },
        name: "deposit",
        origin: 2,
        tokens: {
          "42161": { usdc: "0xaf88d065e77c8cc2239327c5edb3a432268e5831" },
        },
        txNames: ["Transfer"],
        gasCosts: { "42161": "0.0000036396" },
        txHashes: [
          "0xbe55c7f607c2c074fcd27e65abff8da90472c67e6be66f0ff33ee9c1343f1ca4",
        ],
        contracts: [],
        txGasUsed: ["181980"],
        hasSignData: true,
        balanceChanges: { "42161": { usdc: "-17531.43425" } },
        txBalanceChanges: [{ usdc: "-17531.43425" }],
      },
    ];
    const rawConditions: Call[] = [];
    const connectedChainName = "ethereum";
    const timestamp = 1731086561910;

    const result = await runFeeCalculations(
      account,
      rawTransactions,
      rawConditions,
      connectedChainName,
      timestamp,
      true,
    );

    // Assertions
    expect(result).toBe(8768.625468761487);
  });
});

describe("cleanTransactions", () => {
  const account = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
  it("correctly cleans and standardizes a set of transactions", async () => {
    // Example raw transactions
    const rawTransactions = [
      { name: "transfer", args: { token: "ETH", amount: "1000" } },
      // ... other transactions ...
    ];
    const connectedChainName = "ethereum";
    const timestamp = 1234567890;

    // Call cleanTransactions
    const result = await cleanTransactions(
      account,
      rawTransactions as CleanedAction[],
      connectedChainName,
      timestamp,
      true,
    );
    console.log(result);

    // Assertions to verify the transformations
    expect(result).toHaveLength(rawTransactions.length);
    expect(result[0]).toHaveProperty("type", "regular");
    expect(result[0]).toHaveProperty("token1", "ETH");
    expect(result[0]).toHaveProperty("amount1", 1000);
    expect(result[0]).toHaveProperty("price", 100);
    // ... other assertions as per your transformation logic ...
  });

  it("correctly cleans and standardizes a set of transactions - 2", async () => {
    // Example raw transactions
    const rawTransactions = [
      {
        name: "transfer",
        args: { token: "ETH", amount: "1000", amount_units: "usd" },
      },
      // ... other transactions ...
    ];
    const connectedChainName = "ethereum";
    const timestamp = 1234567890;

    // Call cleanTransactions
    const result = await cleanTransactions(
      account,
      rawTransactions as CleanedAction[],
      connectedChainName,
      timestamp,
      true,
    );
    console.log(result);

    // Assertions to verify the transformations
    expect(result).toHaveLength(rawTransactions.length);
    expect(result[0]).toHaveProperty("type", "regular");
    expect(result[0]).toHaveProperty("token1", "ETH");
    expect(result[0]).toHaveProperty("amount1", 10);
    expect(result[0]).toHaveProperty("price", 100);
    // ... other assertions as per your transformation logic ...
  });

  it("correctly processes a transfer transaction", async () => {
    const rawTransactions = [
      { name: "transfer", args: { token: "ETH", amount: "500" } },
    ];
    const connectedChainName = "ethereum";
    const timestamp = 1234567890;

    const result = await cleanTransactions(
      account,
      rawTransactions as CleanedAction[],
      connectedChainName,
      timestamp,
      true,
    );

    expect(result[0]).toHaveProperty("type", "regular");
    expect(result[0]).toHaveProperty("token1", "ETH");
    expect(result[0]).toHaveProperty("amount1", 500);
    expect(result[0]).toHaveProperty("price", 100);
  });

  it("correctly classifies a vote transaction", async () => {
    const rawTransactions = [{ name: "vote", args: {} }];
    const connectedChainName = "ethereum";
    const timestamp = 1234567890;

    const result = await cleanTransactions(
      account,
      rawTransactions as CleanedAction[],
      connectedChainName,
      timestamp,
      true,
    );

    expect(result[0]).toHaveProperty("type", "vote");
    expect(result[0]).toHaveProperty("token1", null);
    expect(result[0]).toHaveProperty("amount1", 0);
    expect(result[0]).toHaveProperty("price", 0);
  });

  it("defaults chain name to connectedChainName when missing", async () => {
    const rawTransactions = [
      { name: "transfer", args: { token: "ETH", amount: "500" } },
    ];
    const connectedChainName = "ethereum";
    const timestamp = 1234567890;

    const result = await cleanTransactions(
      account,
      rawTransactions as CleanedAction[],
      connectedChainName,
      timestamp,
      true,
    );

    expect(result[0]).toHaveProperty("chain1", connectedChainName);
  });

  it("correctly processes a trade transaction with inputToken and inputAmount", async () => {
    const rawTransactions = [
      { name: "swap", args: { inputToken: "BTC", inputAmount: "2" } },
    ];
    const connectedChainName = "ethereum";
    const timestamp = 1234567890;

    const result = await cleanTransactions(
      account,
      rawTransactions as CleanedAction[],
      connectedChainName,
      timestamp,
      true,
    );

    expect(result[0]).toHaveProperty("type", "trade");
    expect(result[0]).toHaveProperty("token1", "BTC");
    expect(result[0]).toHaveProperty("amount1", 2);
    expect(result[0]).toHaveProperty("price", 100);
  });

  it("calculates outputAmount correctly for swap transactions", async () => {
    const rawTransactions = [
      { name: "swap", args: { inputToken: "BTC", inputAmount: "2" } },
      { name: "swap", args: {} },
    ];
    const connectedChainName = "ethereum";
    const timestamp = 1234567890;

    const result = await cleanTransactions(
      account,
      rawTransactions as CleanedAction[],
      connectedChainName,
      timestamp,
      true,
    );

    expect(result[1]).toHaveProperty("amount1", 2);
  });

  it("handles unexpected transaction structure gracefully", async () => {
    const rawTransactions = [{ name: "unexpected", args: {} }];
    const connectedChainName = "ethereum";
    const timestamp = 1234567890;

    const result = await cleanTransactions(
      account,
      rawTransactions as CleanedAction[],
      connectedChainName,
      timestamp,
      true,
    );

    // Based on how your function is expected to handle unexpected structures
    expect(result[0]).toHaveProperty("type", "vote"); // Assuming it defaults to 'vote'
  });
});

describe("calcTvl", () => {
  it("calculates the total tvl of transactions correctly", () => {
    const transactions = [
      { type: "trade", dependent: true, amount1: 100, price: 10 },
      { type: "regular", dependent: false, amount1: 50, price: 5 },
      { type: "trade", dependent: false, amount1: 30, price: 2 },
    ];
    expect(calcTvl(undefined, transactions)).toBe(1000 + 250 + 60); // 1310
  });

  it("returns 0 for negative tvl values", () => {
    const transactions = [
      { type: "trade", dependent: true, amount1: -100, price: 10 },
    ];
    expect(calcTvl(undefined, transactions)).toBe(0);
  });

  it("ignores transactions of types other than trade or regular", () => {
    const transactions = [{ type: "other", amount1: 100, price: 10 }];
    expect(calcTvl(undefined, transactions)).toBe(0);
  });

  it("handles empty transaction array", () => {
    expect(calcTvl(undefined, [])).toBe(0);
  });
});

// describe("getHistoricalPrice", () => {
//   it("fetches historical price successfully", async () => {
//     const symbol = "ETH";
//     const timestamp = "1699576204";
//     const price = 2109;

//     axios.get.mockResolvedValue({
//       data: {
//         status: {
//           timestamp: "2023-11-14T19:46:27.199Z",
//           error_code: 0,
//           error_message: null,
//           elapsed: 48,
//           credit_count: 1,
//           notice: null,
//         },
//         data: {
//           ETH: [
//             {
//               quotes: [
//                 {
//                   timestamp: "2023-11-10T00:35:00.000Z",
//                   quote: {
//                     USD: {
//                       percent_change_1h: 0.232448196307,
//                       percent_change_24h: 11.438202415035,
//                       percent_change_7d: 17.712282984278,
//                       percent_change_30d: 34.383937366057,
//                       price: 2109,
//                       volume_24h: 25141218770.04,
//                       market_cap: 253697207489.06067,
//                       total_supply: 120266596.56,
//                       circulating_supply: 120266596.56,
//                       timestamp: "2023-11-10T00:35:00.000Z",
//                     },
//                   },
//                 },
//               ],
//               id: 1027,
//               name: "Ethereum",
//               symbol: "ETH",
//               is_active: 1,
//               is_fiat: 0,
//             },
//           ],
//         },
//       },
//     });
//     const result = await getHistoricalPrice(symbol, timestamp);
//     expect(result).toBe(price);
//   });
// });

describe("isDependent", () => {
  it("returns false for the first transaction (idx = 0)", () => {
    const transactions = [{ name: "deposit" }];
    expect(isDependent(transactions, 0)).toBe(false);
  });

  it("returns false if the previous transaction is a transfer", () => {
    const transactions = [{ name: "transfer" }, { name: "deposit" }];
    expect(isDependent(transactions, 1)).toBe(false);
  });

  it("returns false if the previous transaction is a trade with different output tokens", () => {
    const transactions = [
      { name: "deposit" },
      { type: "trade", args: { outputToken: "tokenA" } },
      { token1: "tokenB" },
    ];
    expect(isDependent(transactions, 2)).toBe(false);
  });

  it("returns true for a dependent transaction scenario", () => {
    const transactions = [
      { name: "deposit" },
      { type: "trade", args: { outputToken: "tokenA" } },
      { token1: "tokenA" },
    ];
    expect(isDependent(transactions, 2)).toBe(true);
  });
});
