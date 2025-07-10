import request from "supertest";
import app from "../../../app.js";
import {
  getChainError,
  getUnsupportedProtocolError,
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

const endpoint = `/repay?secret=${process.env.BACKEND_TOKEN_SECRET}`;

jest.retryTimes(1);

describe("Repay", () => {
  beforeEach(() => {
    console.log(expect.getState().currentTestName);
  });

  describe("Aave", () => {
    const testCases: Record<string, JSONObject[]> = {
      ethereum: [
        {
          lend: { token: "ETH", amount: "2" },
          borrow: { token: "USDC", amount: "200" },
          repay: { token: "USDC", amount: "100" },
        },
        {
          lend: { token: "USDC", amount: "100" },
          borrow: { token: "USDT", amount: "50" },
          repay: { token: "USDT", amount: "25" },
        },
      ],
      optimism: [
        {
          lend: { token: "ETH", amount: "2" },
          borrow: { token: "USDC", amount: "200" },
          repay: { token: "USDC", amount: "100" },
        },
        {
          lend: { token: "USDC", amount: "100" },
          borrow: { token: "DAI", amount: "50" },
          repay: { token: "DAI", amount: "25" },
        },
      ],
      polygon: [
        {
          lend: { token: "WMATIC", amount: "100" },
          borrow: { token: "USDC", amount: "10" },
          repay: { token: "USDC", amount: "5" },
        },
        {
          lend: { token: "WETH", amount: "2" },
          borrow: { token: "DAI", amount: "200" },
          repay: { token: "DAI", amount: "100" },
        },
        {
          lend: { token: "USDC", amount: "100" },
          borrow: { token: "USDT", amount: "50" },
          repay: { token: "USDT", amount: "25" },
        },
      ],
      arbitrum: [
        {
          lend: { token: "ETH", amount: "2" },
          borrow: { token: "USDC", amount: "200" },
          repay: { token: "USDC", amount: "100" },
        },
        {
          lend: { token: "USDC", amount: "100" },
          borrow: { token: "WETH", amount: "0.01" },
          repay: { token: "WETH", amount: "0.005" },
        },
      ],
      // avalanche: [
      // {
      // lend: { token: "WAVAX", amount: "100" },
      // borrow: { token: "USDC", amount: "100" },
      // repay: { token: "USDC", amount: "50" },
      // },
      // {
      // lend: { token: "WETH", amount: "2" },
      // borrow: { token: "USDT", amount: "200" },
      // repay: { token: "USDT", amount: "100" },
      // },
      // {
      // lend: { token: "USDC", amount: "100" },
      // borrow: { token: "DAI", amount: "50" },
      // repay: { token: "DAI", amount: "25" },
      // },
      // ],
    };

    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    for (const chainName of Object.keys(testCases)) {
      const chainId = getChainIdFromName(chainName);
      for (const tc of testCases[chainName]) {
        it(`Repay ${tc.repay.token} from Aave on ${chainName}`, async () => {
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

          const borrowRes = await request(app)
            .post(`/borrow?secret=${process.env.BACKEND_TOKEN_SECRET}`)
            .send({
              accountAddress,
              protocolName: "Aave",
              chainName,
              ...tc.borrow,
            });
          expect(borrowRes.statusCode).toEqual(200);
          expect(borrowRes.body).toHaveProperty("status");
          expect(borrowRes.body.status).toEqual("success");
          expect(borrowRes.body).toHaveProperty("transactions");

          success = await runTxsOnVnet(
            provider,
            accountAddress,
            borrowRes.body.transactions,
          );
          expect(success).toEqual(true);

          const res = await request(app)
            .post(endpoint)
            .send({
              accountAddress,
              protocolName: "Aave",
              chainName,
              ...tc.repay,
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
          { symbol: "ARB", amount: "200", borrowAmount: "50" },
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
          it(`Repay ${poolName} on ${chainName}`, async () => {
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

            const borrowRes = await request(app)
              .post(`/borrow?secret=${process.env.BACKEND_TOKEN_SECRET}`)
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

            const { rpcUrl } = await createVnet(chainId);
            await increaseTokenBalance(
              rpcUrl,
              accountAddress,
              chainName,
              tc.symbol,
              tc.amount,
            );

            const provider = new RetryProvider(rpcUrl, chainId);
            let success = await runTxsOnVnet(provider, accountAddress, [
              ...depositRes.body.transactions,
              ...borrowRes.body.transactions,
            ]);
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
            expect(res.body.transactions.length).toBeGreaterThanOrEqual(1);

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
        const { rpcUrl: rpc } = await createVnet(42161);
        const depositRes = await request(app)
          .post(`/lend?secret=${process.env.BACKEND_TOKEN_SECRET}`)
          .send({
            accountAddress,
            protocolName: "Dolomite",
            chainName: "Arbitrum",
            poolName: null,
            token: symbol,
            amount,
            rpc,
          });

        await increaseTokenBalance(
          rpc,
          accountAddress,
          "Arbitrum",
          symbol,
          amount,
        );

        const provider = new RetryProvider(rpc, 42161);
        let success = await runTxsOnVnet(
          provider,
          accountAddress,
          depositRes.body.transactions,
        );
        expect(success).toEqual(true);

        const borrowRes = await request(app)
          .post(`/borrow?secret=${process.env.BACKEND_TOKEN_SECRET}`)
          .send({
            accountAddress,
            protocolName: "Dolomite",
            chainName: "Arbitrum",
            poolName: null,
            token: symbol,
            amount: borrowAmount,
            rpc,
          });
        expect(borrowRes.statusCode).toEqual(200);
        expect(borrowRes.body).toHaveProperty("status");
        expect(borrowRes.body.status).toEqual("success");
        expect(borrowRes.body).toHaveProperty("transactions");
        expect(borrowRes.body.transactions).toHaveLength(1);
        success = await runTxsOnVnet(
          provider,
          accountAddress,
          borrowRes.body.transactions,
        );
        expect(success).toEqual(true);

        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "Dolomite",
          chainName: "Arbitrum",
          poolName: null,
          token: symbol,
          amount: borrowAmount,
          rpc,
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

  describe.skip("Lodestar", () => {
    it("ETH pool", async () => {
      const accountAddress = "0xf0840B643eAB3308633330c6bC5854D0167C63e2";
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Lodestar",
        chainName: "Arbitrum",
        poolName: null,
        token: "ETH",
        amount: "0.092",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        42161,
        res.body.transactions,
        accountAddress,
        180198475,
      );
      expect(success).toEqual(true);
    });

    it("USDT pool", async () => {
      const accountAddress = "0x9dd897df19ffc27d6685e98accc394f88a73e475";
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Lodestar",
        chainName: "Arbitrum",
        poolName: null,
        token: "USDT",
        amount: "100",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        42161,
        res.body.transactions,
        accountAddress,
        175722803,
      );
      expect(success).toEqual(true);
    });

    it("USDC pool", async () => {
      const accountAddress = "0x719df6573bfa3bd240932cad63839cfb85de3ab5";
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Lodestar",
        chainName: "Arbitrum",
        poolName: null,
        token: "USDC",
        amount: "100",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        42161,
        res.body.transactions,
        accountAddress,
        175615208,
      );
      expect(success).toEqual(true);
    });

    it("FRAX pool", async () => {
      const accountAddress = "0xf2df969f59b2c86e4b230da88918cdebcfc4ccbc";
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Lodestar",
        chainName: "Arbitrum",
        poolName: null,
        token: "FRAX",
        amount: "100",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        42161,
        res.body.transactions,
        accountAddress,
        175580275,
      );
      expect(success).toEqual(true);
    });

    it("GMX pool", async () => {
      const accountAddress = "0xa4a2f21517073da2557fcabbca9356a7a82b6a68";
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Lodestar",
        chainName: "Arbitrum",
        poolName: "gmx",
        token: "GMX",
        amount: "10",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        42161,
        res.body.transactions,
        accountAddress,
        178264687,
      );
      expect(success).toEqual(true);
    });
  });

  it.skip("Rodeo", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
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
  });

  describe.skip("Juice", () => {
    const testCases = [
      {
        lend: { poolName: "USDB", token: "WETH", amount: "4" },
        borrow: { token: "USDB", amount: "10" },
        repay: { token: "USDB", amount: "10" },
      },
      {
        lend: { token: "WETH", amount: "4" },
        borrow: { token: "WETH", amount: "4" },
        repay: { token: "WETH", amount: "4" },
      },
    ];
    for (const { lend, borrow, repay } of testCases) {
      it(`Repay ${repay.amount} ${repay.token}`, async () => {
        const accountAddress = "0x874b92Ee1c56A478056672137AD406E2121A12e7";

        const { rpcUrl: rpc } = await createVnet(81457);
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

        const borrowRes = await request(app)
          .post(`/borrow?secret=${process.env.BACKEND_TOKEN_SECRET}`)
          .send({
            accountAddress,
            protocolName: "Juice",
            chainName: "Blast",
            poolName: null,
            token: borrow.token,
            amount: borrow.amount,
            rpc,
          });
        expect(borrowRes.statusCode).toEqual(200);
        expect(borrowRes.body).toHaveProperty("status");
        expect(borrowRes.body.status).toEqual("success");
        expect(borrowRes.body).toHaveProperty("transactions");
        expect(borrowRes.body.transactions.length).toBeGreaterThanOrEqual(1);

        success = await runTxsOnVnet(
          provider,
          accountAddress,
          borrowRes.body.transactions,
        );
        expect(success).toEqual(true);

        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "Juice",
          chainName: "Blast",
          poolName: null,
          token: repay.token,
          amount: repay.amount,
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

  it("Repay from unsupported chain", async () => {
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

  it("Repay from unsupported protocol", async () => {
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
      getUnsupportedProtocolError("invalidprotocol", "repay"),
    );
  });

  it("Repay with invalid token address", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Lodestar",
      chainName: "Arbitrum",
      poolName: null,
      token: "invalidToken", // Assume an unsupported token for repayment
      amount: "50",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "Token invalidToken not found on Arbitrum. Ensure you specify a chain and token properly in your next prompt.",
    );
  });

  it("Repay with negative amount", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Aave",
      chainName: "Arbitrum",
      poolName: null,
      token: "USDT",
      amount: "-50", // Assume a negative repayment amount
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "-50 is an invalid amount. Please specify an amount correctly and try again.",
    );
  });

  it("Repay with Invalid HTTP Method (GET)", async () => {
    const res = await request(app).get(endpoint);

    expect(res.statusCode).toEqual(404);
  });
});
