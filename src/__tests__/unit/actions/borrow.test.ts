import request from "supertest";
import app from "../../../app.js";
import { getUnsupportedProtocolError } from "../../../utils/error.js";
import { getChainIdFromName } from "../../../utils/index.js";
import { RetryProvider } from "../../../utils/retryProvider.js";
import type { JSONObject } from "../../../utils/types.js";
import {
  createVnet,
  increaseTokenBalance,
  runTxsOnVnet,
  simulateTxs,
} from "../../helper.js";

const endpoint = `/borrow?secret=${process.env.BACKEND_TOKEN_SECRET}`;

jest.retryTimes(1);

describe("Borrow", () => {
  beforeEach(() => {
    console.log(expect.getState().currentTestName);
  });

  describe("Aave", () => {
    const testCases: Record<string, JSONObject[]> = {
      ethereum: [
        {
          lend: { token: "ETH", amount: "2" },
          borrow: { token: "USDC", amount: "200" },
        },
        {
          lend: { token: "USDC", amount: "100" },
          borrow: { token: "USDT", amount: "50" },
        },
      ],
      optimism: [
        {
          lend: { token: "ETH", amount: "2" },
          borrow: { token: "USDC", amount: "200" },
        },
        {
          lend: { token: "USDC", amount: "100" },
          borrow: { token: "DAI", amount: "50" },
        },
      ],
      polygon: [
        {
          lend: { token: "WMATIC", amount: "100" },
          borrow: { token: "USDC", amount: "10" },
        },
        {
          lend: { token: "WETH", amount: "2" },
          borrow: { token: "DAI", amount: "200" },
        },
        {
          lend: { token: "USDC", amount: "100" },
          borrow: { token: "USDT", amount: "50" },
        },
      ],
      arbitrum: [
        {
          lend: { token: "ETH", amount: "2" },
          borrow: { token: "USDC", amount: "200" },
        },
        {
          lend: { token: "USDC", amount: "100" },
          borrow: { token: "WETH", amount: "0.01" },
        },
      ],
      // avalanche: [
      // {
      // lend: { token: "WAVAX", amount: "100" },
      // borrow: { token: "USDC", amount: "100" },
      // },
      // {
      // lend: { token: "WETH", amount: "2" },
      // borrow: { token: "USDT", amount: "200" },
      // },
      // {
      // lend: { token: "USDC", amount: "100" },
      // borrow: { token: "DAI", amount: "50" },
      // },
      // ],
    };

    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    for (const chainName of Object.keys(testCases)) {
      const chainId = getChainIdFromName(chainName);
      for (const tc of testCases[chainName]) {
        it(`Borrow ${tc.borrow.token} from Aave on ${chainName}`, async () => {
          const lendRes = await request(app)
            .post(`/lend?secret=${process.env.BACKEND_TOKEN_SECRET}`)
            .send({
              accountAddress,
              protocolName: "Aave",
              chainName,
              ...tc.lend,
            });

          const { rpcUrl } = await createVnet(chainId, undefined);
          await increaseTokenBalance(
            rpcUrl,
            accountAddress,
            chainName,
            tc.lend.token,
            tc.lend.amount,
          );

          const provider = new RetryProvider(rpcUrl, chainId);
          let success = await runTxsOnVnet(
            provider,
            accountAddress,
            lendRes.body.transactions,
          );
          expect(success).toEqual(true);

          const res = await request(app)
            .post(endpoint)
            .send({
              accountAddress,
              protocolName: "Aave",
              chainName,
              ...tc.borrow,
            });
          expect(res.statusCode).toEqual(200);
          expect(res.body).toHaveProperty("status");
          expect(res.body.status).toEqual("success");
          expect(res.body).toHaveProperty("transactions");

          success = await runTxsOnVnet(
            provider,
            accountAddress,
            res.body.transactions,
          );
          expect(success).toEqual(true);
        }, 300000);
      }
    }
  });

  it("Compound - Successful Borrow", async () => {
    const accountAddress = "0x779c3e4a2E8DC3104020DC1BaC3ABD68c92f1d7A";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Compound",
      chainName: "Ethereum",
      poolName: "USDC",
      token: "USDC",
      amount: "100",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(1);

    const success = await simulateTxs(
      1,
      res.body.transactions,
      accountAddress,
      19162720,
    );
    expect(success).toEqual(true);
  });

  describe("Compound", () => {
    const testCases: Record<string, Record<string, JSONObject[]>> = {
      ethereum: {
        usdc: [
          { symbol: "ETH", amount: "2", borrowAmount: "100" },
          { symbol: "LINK", amount: "50", borrowAmount: "100" },
          { symbol: "WBTC", amount: "0.1", borrowAmount: "100" },
        ],
        weth: [
          { symbol: "ETH", amount: "2", borrowAmount: "0.5" },
          { symbol: "cbETH", amount: "2", borrowAmount: "0.5" },
          { symbol: "wstETH", amount: "2", borrowAmount: "0.5" },
          { symbol: "rETH", amount: "2", borrowAmount: "0.5" },
        ],
      },
      arbitrum: {
        usdc: [
          { symbol: "ETH", amount: "2", borrowAmount: "0.5" },
          { symbol: "ARB", amount: "200", borrowAmount: "100" },
          { symbol: "GMX", amount: "20", borrowAmount: "100" },
          { symbol: "WETH", amount: "2", borrowAmount: "100" },
        ],
      },
      base: {
        usdbc: [
          { symbol: "ETH", amount: "2", borrowAmount: "0.5" },
          { symbol: "cbETH", amount: "2", borrowAmount: "100" },
        ],
        weth: [
          { symbol: "ETH", amount: "2", borrowAmount: "0.5" },
          { symbol: "cbETH", amount: "2", borrowAmount: "0.5" },
        ],
      },
    };
    for (const chainName of Object.keys(testCases)) {
      const chainId = getChainIdFromName(chainName, true);
      const chainTestCases = testCases[chainName];
      for (const poolName of Object.keys(chainTestCases)) {
        const tokens = chainTestCases[poolName];

        for (const tc of tokens) {
          it(`Deposit ${tc.symbol} and borrow on ${poolName} pool on ${chainName}`, async () => {
            const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
            const depositRes = await request(app)
              .post(`/deposit?secret=${process.env.BACKEND_TOKEN_SECRET}`)
              .send({
                accountAddress,
                protocolName: "Compound",
                chainName,
                poolName,
                token: tc.symbol,
                amount: tc.amount,
              });

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
            let success = await runTxsOnVnet(
              provider,
              accountAddress,
              depositRes.body.transactions,
            );
            expect(success).toEqual(true);

            const res = await request(app)
              .post(endpoint)
              .send({
                accountAddress,
                protocolName: "Compound",
                chainName,
                poolName,
                token:
                  chainName === "base" && poolName === "usdc"
                    ? "usdbc"
                    : poolName,
                amount: tc.borrowAmount,
              });
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty("status");
            expect(res.body.status).toEqual("success");
            expect(res.body).toHaveProperty("transactions");
            expect(res.body.transactions).toHaveLength(1);

            success = await runTxsOnVnet(
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

  describe.skip("Dolomite", () => {
    const tokens = [
      { symbol: "eth", amount: "1", borrowAmount: "0.5" },
      { symbol: "usdt", amount: "100", borrowAmount: "50" },
      { symbol: "dai", amount: "100", borrowAmount: "50" },
      { symbol: "arb", amount: "100", borrowAmount: "50" },
      { symbol: "usdc", amount: "100", borrowAmount: "50" },
    ];
    for (const { symbol, amount, borrowAmount } of tokens) {
      it(`${symbol.toUpperCase()} pool`, async () => {
        const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
        const depositRes = await request(app)
          .post(`/lend?secret=${process.env.BACKEND_TOKEN_SECRET}`)
          .send({
            accountAddress,
            protocolName: "Dolomite",
            chainName: "Arbitrum",
            poolName: null,
            token: symbol,
            amount,
          });

        const { rpcUrl } = await createVnet(42161, undefined);
        await increaseTokenBalance(
          rpcUrl,
          accountAddress,
          "Arbitrum",
          symbol,
          amount,
        );

        const provider = new RetryProvider(rpcUrl, 42161);
        let success = await runTxsOnVnet(
          provider,
          accountAddress,
          depositRes.body.transactions,
        );
        expect(success).toEqual(true);

        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "Dolomite",
          chainName: "Arbitrum",
          poolName: null,
          token: symbol,
          amount: borrowAmount,
        });
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty("status");
        expect(res.body.status).toEqual("success");
        expect(res.body).toHaveProperty("transactions");
        expect(res.body.transactions).toHaveLength(1);
        success = await runTxsOnVnet(
          provider,
          accountAddress,
          res.body.transactions,
        );
        expect(success).toEqual(true);
      });
    }
  });

  it.skip("Lodestar - Successful Borrow", async () => {
    const accountAddress = "0x0d66c4eee0c792b9bd38e97676493ed12a55e656";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Lodestar",
      chainName: "Arbitrum",
      poolName: null,
      token: "USDC",
      amount: "3000",
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
      150673000,
    );
    expect(success).toEqual(true);
  });

  it.skip("Rodeo - Successful Borrow", async () => {
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
    expect(res.body.transactions).toHaveLength(1);

    const success = await simulateTxs(
      42161,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  describe.skip("Juice", () => {
    const testCases = [
      {
        accountAddress: "0x874b92Ee1c56A478056672137AD406E2121A12e7",
        lend: { poolName: "USDB", token: "WETH", amount: "4" },
        borrow: { token: "USDB", amount: "10" },
      },
      {
        accountAddress: "0x874b92Ee1c56A478056672137AD406E2121A12e7",
        lend: { token: "WETH", amount: "4" },
        borrow: { token: "WETH", amount: "4" },
      },
    ];
    for (const { accountAddress, lend, borrow } of testCases) {
      it(`Borrow ${borrow.amount} ${borrow.token}`, async () => {
        const { rpcUrl: rpc } = await createVnet(81457, undefined);
        const provider = new RetryProvider(rpc, 81457);
        const lendRes = await request(app)
          .post(`/lend?secret=${process.env.BACKEND_TOKEN_SECRET}`)
          .send({
            accountAddress,
            protocolName: "Juice",
            chainName: "Blast",
            poolName: lend.poolName,
            token: lend.token,
            amount: lend.amount,
            rpc,
          });
        expect(lendRes.statusCode).toEqual(200);
        expect(lendRes.body).toHaveProperty("status");
        expect(lendRes.body.status).toEqual("success");
        expect(lendRes.body).toHaveProperty("transactions");
        expect(lendRes.body.transactions.length).toBeGreaterThanOrEqual(1);

        let success = await runTxsOnVnet(
          provider,
          accountAddress,
          lendRes.body.transactions,
        );
        expect(success).toEqual(true);

        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "Juice",
          chainName: "Blast",
          poolName: null,
          token: borrow.token,
          amount: borrow.amount,
          rpc,
        });
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty("status");
        expect(res.body.status).toEqual("success");
        expect(res.body).toHaveProperty("transactions");
        expect(res.body.transactions.length).toBeGreaterThanOrEqual(1);

        success = await runTxsOnVnet(
          provider,
          accountAddress,
          res.body.transactions,
        );
        expect(success).toEqual(true);
      });
    }
  });

  it("Borrow from unsupported protocol", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "InvalidProtocol",
      chainName: "Ethereum",
      poolName: null,
      token: "USDC",
      amount: "50",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      getUnsupportedProtocolError("invalidprotocol", "borrow"),
    );
  });

  it("Borrow with invalid account address", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "invalidAddress",
      protocolName: "Aave",
      chainName: "Ethereum",
      poolName: null,
      token: "USDC",
      amount: "100",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
  });

  it("Borrow with invalid amount", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Aave",
      chainName: "Ethereum",
      poolName: null,
      token: "USDC",
      amount: "invalidAmount",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "invalidAmount is an invalid amount. Please specify an amount correctly and try again.",
    );
  });

  it("Borrow with zero amount", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Aave",
      chainName: "Ethereum",
      poolName: null,
      token: "USDC",
      amount: "0",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "The amount being used is zero, ensure you have funds on your Slate account",
    );
  });

  it("Borrow with negative amount", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Aave",
      chainName: "Ethereum",
      poolName: null,
      token: "USDC",
      amount: "-50",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "-50 is an invalid amount. Please specify an amount correctly and try again.",
    );
  });
});
