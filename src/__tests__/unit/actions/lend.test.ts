import request from "supertest";
import app from "../../../app.js";
import {
  getChainError,
  getUnsupportedProtocolError,
  getUnsupportedTokenError,
} from "../../../utils/error.js";
import { getChainIdFromName } from "../../../utils/index.js";
import { RetryProvider } from "../../../utils/retryProvider.js";
import type { JSONObject } from "../../../utils/types.js";
import {
  createVnet,
  increaseTokenBalance,
  runTxsOnVnet,
  simulateTxs,
} from "../../helper.js";

const endpoint = `/lend?secret=${process.env.BACKEND_TOKEN_SECRET}`;

jest.retryTimes(1);

describe("Lend", () => {
  beforeEach(() => {
    console.log(expect.getState().currentTestName);
  });

  describe("Aave", () => {
    const testCases: Record<string, JSONObject[]> = {
      ethereum: [
        { token: "ETH", amount: "2" },
        { token: "USDC", amount: "100" },
      ],
      optimism: [
        { token: "ETH", amount: "2" },
        { token: "USDC", amount: "100" },
      ],
      polygon: [
        { token: "WMATIC", amount: "100" },
        { token: "WETH", amount: "2" },
        { token: "USDC", amount: "100" },
      ],
      arbitrum: [
        { token: "ETH", amount: "2" },
        { token: "USDC", amount: "100" },
      ],
      // avalanche: [
      // { token: "WAVAX", amount: "100" },
      // { token: "WETH", amount: "2" },
      // { token: "USDC", amount: "100" },
      // ],
    };

    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    for (const chainName of Object.keys(testCases)) {
      const chainId = getChainIdFromName(chainName);
      for (const tc of testCases[chainName]) {
        it(`Lend ${tc.token} into Aave on ${chainName}`, async () => {
          const res = await request(app)
            .post(endpoint)
            .send({
              accountAddress,
              protocolName: "Aave",
              chainName,
              ...tc,
            });
          expect(res.statusCode).toEqual(200);
          expect(res.body).toHaveProperty("status");
          expect(res.body.status).toEqual("success");
          expect(res.body).toHaveProperty("transactions");
          expect(res.body.transactions.length).toBeGreaterThanOrEqual(1);

          const { rpcUrl } = await createVnet(chainId, undefined);
          await increaseTokenBalance(
            rpcUrl,
            accountAddress,
            chainName,
            tc.token,
            tc.amount,
          );

          const provider = new RetryProvider(rpcUrl, chainId);
          const success = await runTxsOnVnet(
            provider,
            accountAddress,
            res.body.transactions,
          );
          expect(success).toEqual(true);
        }, 300000);
      }
    }
  });

  describe.skip("Juice", () => {
    const testCases = [
      {
        account: "0x874b92Ee1c56A478056672137AD406E2121A12e7",
        poolName: "USDB",
        token: "WETH",
        amount: "4",
      },
      {
        account: "0x874b92Ee1c56A478056672137AD406E2121A12e7",
        token: "WETH",
        amount: "4",
      },
      {
        account: "0xfe8054e14f1a2878293f1b18b4339d0c0503204e",
        token: "ezETH",
        amount: "100",
      },
    ];
    for (const tc of testCases) {
      it(`Lend ${tc.amount} ${tc.token}`, async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress: tc.account,
          protocolName: "Juice",
          chainName: "Blast",
          poolName: tc.poolName,
          token: tc.token,
          amount: tc.amount,
        });
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty("status");
        expect(res.body.status).toEqual("success");
        expect(res.body).toHaveProperty("transactions");
        expect(res.body.transactions.length).toBeGreaterThanOrEqual(1);

        const success = await simulateTxs(
          81457,
          res.body.transactions,
          tc.account,
        );
        expect(success).toEqual(true);
      });
    }
  });

  describe("Compound", () => {
    const testCases: Record<string, Record<string, JSONObject[]>> = {
      ethereum: {
        usdc: [
          { symbol: "ETH", amount: "2" },
          { symbol: "WETH", amount: "2" },
          { symbol: "LINK", amount: "50" },
          { symbol: "WBTC", amount: "0.1" },
          { symbol: "USDC", amount: "100" },
        ],
        weth: [
          { symbol: "ETH", amount: "2" },
          { symbol: "cbETH", amount: "2" },
          { symbol: "wstETH", amount: "2" },
          { symbol: "rETH", amount: "2" },
        ],
      },
      arbitrum: {
        usdc: [
          { symbol: "ETH", amount: "2" },
          { symbol: "ARB", amount: "20" },
          { symbol: "GMX", amount: "1" },
          { symbol: "WETH", amount: "2" },
        ],
      },
      base: {
        usdbc: [
          { symbol: "ETH", amount: "2" },
          { symbol: "cbETH", amount: "2" },
        ],
        weth: [
          { symbol: "ETH", amount: "2" },
          { symbol: "cbETH", amount: "2" },
        ],
      },
    };
    for (const chainName of Object.keys(testCases)) {
      const chainId = getChainIdFromName(chainName, true);
      const chainTestCases = testCases[chainName];
      for (const poolName of Object.keys(chainTestCases)) {
        const tokens = chainTestCases[poolName];

        for (const tc of tokens) {
          it(`Lend ${tc.symbol} into ${poolName} pool on ${chainName}`, async () => {
            const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
            const res = await request(app).post(endpoint).send({
              accountAddress,
              protocolName: "Compound",
              chainName,
              poolName,
              token: tc.symbol,
              amount: tc.amount,
            });
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty("status");
            expect(res.body.status).toEqual("success");
            expect(res.body).toHaveProperty("transactions");
            expect(res.body.transactions.length).toBeGreaterThanOrEqual(1);

            if (!chainId) {
              throw new Error(`Invalid chainName: ${chainName}`);
            }
            const { rpcUrl } = await createVnet(
              chainId,
              chainId === 1
                ? 19240000
                : chainId === 42161
                  ? 170000000
                  : undefined,
            );
            await increaseTokenBalance(
              rpcUrl,
              accountAddress,
              chainName,
              tc.symbol,
              tc.amount,
            );

            const provider = new RetryProvider(rpcUrl, chainId);
            const success = await runTxsOnVnet(
              provider,
              accountAddress,
              res.body.transactions,
            );
            expect(success).toEqual(true);
          });
        }
      }
    }
  });

  describe.skip("Lodestar", () => {
    const tokens = [
      { symbol: "frax", amount: "100" },
      { symbol: "magic", amount: "100" },
      { symbol: "plvglp", amount: "100" },
      { symbol: "usdc.e", amount: "100" },
      { symbol: "usdt", amount: "100" },
      { symbol: "wbtc", amount: "0.1" },
      { symbol: "dai", amount: "100" },
      { symbol: "eth", amount: "10" },
      { symbol: "arb", amount: "100" },
      { symbol: "wsteth", amount: "10" },
      { symbol: "gmx", amount: "100" },
      { symbol: "usdc", amount: "100" },
    ];
    for (const { symbol, amount } of tokens) {
      it(`${symbol.toUpperCase()} pool`, async () => {
        const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "Lodestar",
          chainName: "Arbitrum",
          poolName: null,
          token: symbol,
          amount,
        });
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty("status");
        expect(res.body.status).toEqual("success");
        expect(res.body).toHaveProperty("transactions");
        expect(res.body.transactions).toHaveLength(symbol === "eth" ? 2 : 3);

        const { rpcUrl } = await createVnet(42161);
        await increaseTokenBalance(
          rpcUrl,
          accountAddress,
          "Arbitrum",
          symbol,
          amount,
        );

        const provider = new RetryProvider(rpcUrl, 42161);
        const success = await runTxsOnVnet(
          provider,
          accountAddress,
          res.body.transactions,
        );
        expect(success).toEqual(true);
      });
    }

    it("FRAX pool with empty token", async () => {
      const accountAddress = "0x1ba2743042d9fd06905182bac83171c4773a29a0";
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Lodestar",
        chainName: "Arbitrum",
        poolName: "FRAX",
        amount: "100",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");
      expect(res.body.transactions).toHaveLength(3);

      const success = await simulateTxs(
        42161,
        res.body.transactions,
        accountAddress,
      );
      expect(success).toEqual(true);
    });
  });

  describe.skip("Dolomite", () => {
    const tokens = [
      { symbol: "usdc", amount: "100" },
      { symbol: "eth", amount: "1" },
      { symbol: "usdt", amount: "100" },
      { symbol: "dai", amount: "100" },
      { symbol: "arb", amount: "100" },
      { symbol: "pendle", amount: "100" },
    ];
    for (const { symbol, amount } of tokens) {
      it(`${symbol.toUpperCase()} pool`, async () => {
        const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "Dolomite",
          chainName: "Arbitrum",
          poolName: null,
          token: symbol,
          amount,
        });
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty("status");
        expect(res.body.status).toEqual("success");
        expect(res.body).toHaveProperty("transactions");

        const { rpcUrl } = await createVnet(42161);
        await increaseTokenBalance(
          rpcUrl,
          accountAddress,
          "Arbitrum",
          symbol,
          amount,
        );

        const provider = new RetryProvider(rpcUrl, 42161);
        const success = await runTxsOnVnet(
          provider,
          accountAddress,
          res.body.transactions,
        );
        expect(success).toEqual(true);
      });
    }
  });

  it.skip("Rodeo", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Rodeo",
      chainName: "Arbitrum",
      poolName: null,
      token: "USDT",
      amount: "100",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(2);

    const success = await simulateTxs(
      42161,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  it("Lend from unsupported chain", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Lodestar",
      chainName: "InvalidChain",
      poolName: null,
      token: "USDT",
      amount: "100",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(getChainError("InvalidChain"));
  });

  it("Lend from unsupported protocol", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "InvalidProtocol",
      chainName: "Arbitrum",
      poolName: null,
      token: "USDT",
      amount: "100",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      getUnsupportedProtocolError("invalidprotocol", "lend"),
    );
  });

  it("Lend with zero amount", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Aave",
      chainName: "Ethereum",
      poolName: null,
      token: "USDT",
      amount: "0", // Assume lending zero amount
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "The amount being used is zero, ensure you have funds on your Slate account",
    );
  });

  it("Lend with negative amount", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Lodestar",
      chainName: "Arbitrum",
      poolName: null,
      token: "USDT",
      amount: "-100", // Assume lending a negative amount
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "-100 is an invalid amount. Please specify an amount correctly and try again.",
    );
  });

  it("Lend with invalid token address", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Aave",
      chainName: "Ethereum",
      poolName: null,
      token: "invalidToken", // Assume an invalid token address
      amount: "100",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      getUnsupportedTokenError("Ethereum", "Aave", "invalidToken"),
    );
  });
});
