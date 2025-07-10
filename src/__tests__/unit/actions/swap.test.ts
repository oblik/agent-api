import request from "supertest";
import app from "../../../app.js";
import { initModels } from "../../../db/index.js";
import { getChainIdFromName } from "../../../utils/index.js";
import type { JSONObject } from "../../../utils/types.js";
import {
  createVnet,
  getTopHolder,
  setErc20Balance,
  simulateTxs,
} from "../../helper.js";

const endpoint = `/swap?secret=${process.env.BACKEND_TOKEN_SECRET}`;

jest.retryTimes(1);

describe("Swap", () => {
  beforeEach(async () => {
    await initModels();
    console.log(expect.getState().currentTestName);
  });

  it("Uniswap", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Uniswap",
      chainName: "Ethereum",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  describe("Uniswap", () => {
    it("USDC -> ETH", async () => {
      const accountAddress = await getTopHolder("USDC", 1);
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Uniswap",
        chainName: "Ethereum",
        inputToken: "USDC",
        inputAmount: "100",
        outputToken: "ETH",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        1,
        res.body.transactions,
        accountAddress,
      );
      expect(success).toEqual(true);
    });

    it("ETH -> USDC", async () => {
      const accountAddress = await getTopHolder("ETH", 1);
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Uniswap",
        chainName: "Ethereum",
        inputToken: "ETH",
        inputAmount: "1",
        outputToken: "USDC",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        1,
        res.body.transactions,
        accountAddress,
      );
      expect(success).toEqual(true);
    });

    it("USDC -> USDT", async () => {
      const accountAddress = await getTopHolder("USDC", 1);
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Uniswap",
        chainName: "Ethereum",
        inputToken: "USDC",
        inputAmount: "100",
        outputToken: "USDT",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        1,
        res.body.transactions,
        accountAddress,
      );
      expect(success).toEqual(true);
    });

    it("USDC -> ETH, outputAmount", async () => {
      const accountAddress = await getTopHolder("USDC", 1);
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Uniswap",
        chainName: "Ethereum",
        inputToken: "USDC",
        outputAmount: "1",
        outputToken: "ETH",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        1,
        res.body.transactions,
        accountAddress,
      );
      expect(success).toEqual(true);
    });

    it("ETH -> USDC, outputAmount", async () => {
      const accountAddress = await getTopHolder("ETH", 1);
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Uniswap",
        chainName: "Ethereum",
        inputToken: "ETH",
        outputAmount: "1000",
        outputToken: "USDC",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        1,
        res.body.transactions,
        accountAddress,
      );
      expect(success).toEqual(true);
    });
  });

  it("USDC -> USDT on Cowswap", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Cowswap",
      chainName: "Ethereum",
      inputToken: "USDC",
      outputAmount: "100",
      outputToken: "USDT",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body).toHaveProperty("signData");
  });

  it("USDC -> ETH on Cowswap", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Cowswap",
      chainName: "Ethereum",
      inputToken: "USDC",
      inputAmount: "200",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body).toHaveProperty("signData");
  });

  it("ETH -> USDC on Cowswap", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Cowswap",
      chainName: "Ethereum",
      inputToken: "ETH",
      inputAmount: "0.3",
      outputToken: "USDC",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "Native token swap is not supported on Cowswap",
    );
  });

  describe("Ambient", () => {
    const testCases: Record<string, JSONObject[]> = {
      Ethereum: [
        {
          inputToken: "ETH",
          outputToken: "USDC",
          inputAmount: "1",
        },
        {
          inputToken: "ETH",
          outputToken: "USDC",
          outputAmount: "1000",
        },
        {
          inputToken: "USDC",
          outputToken: "ETH",
          inputAmount: "1000",
        },
        {
          inputToken: "USDC",
          outputToken: "ETH",
          outputAmount: "1",
        },
      ],
      Blast: [
        {
          inputToken: "ETH",
          outputToken: "USDB",
          inputAmount: "1",
        },
        {
          inputToken: "ETH",
          outputToken: "USDB",
          outputAmount: "1000",
        },
        {
          inputToken: "USDB",
          outputToken: "ETH",
          inputAmount: "1000",
        },
        {
          inputToken: "USDB",
          outputToken: "ETH",
          outputAmount: "1",
        },
        // {
        //   inputToken: "BAG",
        //   outputToken: "USDB",
        //   inputAmount: "1",
        // },
        // {
        //   inputToken: "USDB",
        //   outputToken: "JUICE",
        //   outputAmount: "1",
        // },
      ],
    };
    for (const chainName of Object.keys(testCases)) {
      const chainId = getChainIdFromName(chainName);

      for (const tc of testCases[chainName]) {
        it(`${tc.inputToken} -> ${tc.outputToken} on ${chainName}`, async () => {
          const accountAddress =
            chainId === 1
              ? "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c"
              : "0x3d3eb99c278c7a50d8cf5fe7ebf0ad69066fb7d1";
          const res = await request(app)
            .post(endpoint)
            .send({
              accountAddress,
              protocolName: "Ambient",
              chainName,
              ...tc,
            });
          expect(res.statusCode).toEqual(200);
          expect(res.body).toHaveProperty("status");
          expect(res.body.status).toEqual("success");
          expect(res.body).toHaveProperty("transactions");

          const success = await simulateTxs(
            chainId,
            res.body.transactions,
            accountAddress,
          );
          expect(success).toEqual(true);
        });
      }
    }
  });

  it("Ambient Buy", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Ambient",
      chainName: "Ethereum",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Ambient Sell", async () => {
    const accountAddress = await getTopHolder("eth", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Ambient",
      chainName: "Ethereum",
      inputToken: "ETH",
      inputAmount: "1",
      outputToken: "USDC",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  describe.skip("Bladeswap", () => {
    const accountAddress = "0x9499054d02a725316d61fa896c29d58550ee4a5b";
    const testCases = [
      {
        inputToken: "ETH",
        inputAmount: "10",
        outputToken: "WETH",
      },
      {
        inputToken: "USDB",
        inputAmount: "50",
        outputToken: "ETH",
      },
      {
        inputToken: "YIELD",
        inputAmount: "20",
        outputToken: "WETH",
      },
      {
        inputToken: "GLORY",
        inputAmount: "15",
        outputToken: "ETH",
      },
    ];
    for (const { inputToken, inputAmount, outputToken } of testCases) {
      it(`swap ${inputAmount} ${inputToken} into ${outputToken} on Bladeswap`, async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "bladeswap",
          chainName: "blast",
          inputToken,
          inputAmount,
          outputToken,
        });

        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty("status");
        expect(res.body.status).toEqual("success");
        expect(res.body).toHaveProperty("transactions");

        const success = await simulateTxs(
          81457,
          res.body.transactions,
          accountAddress,
        );
        expect(success).toEqual(true);
      });
    }
  });

  it("Uniswap - outputAmount", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Uniswap",
      chainName: "Ethereum",
      inputToken: "USDC",
      outputAmount: "1",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Hashflow", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Hashflow",
      chainName: "Ethereum",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Hashflow - outputAmount", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Hashflow",
      chainName: "Ethereum",
      inputToken: "USDC",
      outputAmount: "1",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Leetswap", async () => {
    const accountAddress = await getTopHolder("LEET", 8453);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Leetswap",
      chainName: "Base",
      inputToken: "LEET",
      inputAmount: "5000",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Leetswap - outputAmount", async () => {
    const accountAddress = await getTopHolder("LEET", 8453);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Leetswap",
      chainName: "Base",
      inputToken: "LEET",
      outputAmount: "0.5",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  describe("Velodrome", () => {
    it("USDT -> ETH", async () => {
      const accountAddress = await getTopHolder("USDT", 10);
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Velodrome",
        chainName: "Optimism",
        inputToken: "USDT",
        inputAmount: "1000",
        outputToken: "ETH",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        10,
        res.body.transactions,
        accountAddress,
      );
      expect(success).toEqual(true);
    });

    it("USDC -> ETH", async () => {
      const accountAddress = await getTopHolder("USDC", 10);
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Velodrome",
        chainName: "Optimism",
        inputToken: "USDC",
        inputAmount: "1000",
        outputToken: "ETH",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        10,
        res.body.transactions,
        accountAddress,
      );
      expect(success).toEqual(true);
    });

    it("OP -> ETH", async () => {
      const accountAddress = await getTopHolder("OP", 10);
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Velodrome",
        chainName: "Optimism",
        inputToken: "OP",
        inputAmount: "1000",
        outputToken: "ETH",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        10,
        res.body.transactions,
        accountAddress,
      );
      expect(success).toEqual(true);
    });

    it("VELO -> ETH", async () => {
      const accountAddress = await getTopHolder("VELO", 10);
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Velodrome",
        chainName: "Optimism",
        inputToken: "VELO",
        inputAmount: "1000",
        outputToken: "ETH",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        10,
        res.body.transactions,
        accountAddress,
      );
      expect(success).toEqual(true);
    });

    it("DAI -> ETH velodrome", async () => {
      const accountAddress = await getTopHolder("DAI", 10);
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Velodrome",
        chainName: "Optimism",
        inputToken: "DAI",
        inputAmount: "1000",
        outputToken: "ETH",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        10,
        res.body.transactions,
        accountAddress,
      );
      expect(success).toEqual(true);
    });

    it("USDC.e -> ETH", async () => {
      const accountAddress = await getTopHolder("USDC.e", 10);
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Velodrome",
        chainName: "Optimism",
        inputToken: "USDC.e",
        inputAmount: "1000",
        outputToken: "ETH",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        10,
        res.body.transactions,
        accountAddress,
      );
      expect(success).toEqual(true);
    });

    it("USDT -> ETH, outputAmount", async () => {
      const accountAddress = await getTopHolder("USDT", 10);
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Velodrome",
        chainName: "Optimism",
        inputToken: "USDT",
        outputAmount: "1",
        outputToken: "ETH",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        10,
        res.body.transactions,
        accountAddress,
      );
      expect(success).toEqual(true);
    });
  });

  describe("Aerodrome", () => {
    it("USDC -> ETH", async () => {
      const accountAddress = await getTopHolder("USDC", 8453);
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Aerodrome",
        chainName: "Base",
        inputToken: "USDC",
        inputAmount: "1000",
        outputToken: "ETH",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        8453,
        res.body.transactions,
        accountAddress,
      );
      expect(success).toEqual(true);
    });

    it("DOG -> ETH", async () => {
      const accountAddress = await getTopHolder("DOG", 8453);
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Aerodrome",
        chainName: "Base",
        inputToken: "DOG",
        inputAmount: "100",
        outputToken: "ETH",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        8453,
        res.body.transactions,
        accountAddress,
      );
      expect(success).toEqual(true);
    });

    it("DAI -> ETH", async () => {
      const accountAddress = await getTopHolder("DAI", 8453);
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Aerodrome",
        chainName: "Base",
        inputToken: "DAI",
        inputAmount: "100",
        outputToken: "ETH",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        8453,
        res.body.transactions,
        accountAddress,
      );
      expect(success).toEqual(true);
    });

    it("BAL -> ETH", async () => {
      const accountAddress = await getTopHolder("BAL", 8453);
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Aerodrome",
        chainName: "Base",
        inputToken: "BAL",
        inputAmount: "100",
        outputToken: "ETH",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        8453,
        res.body.transactions,
        accountAddress,
      );
      expect(success).toEqual(true);
    });

    it("DEUS -> ETH", async () => {
      const accountAddress = await getTopHolder("DEUS", 8453);
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Aerodrome",
        chainName: "Base",
        inputToken: "DEUS",
        inputAmount: "10",
        outputToken: "ETH",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        8453,
        res.body.transactions,
        accountAddress,
      );
      expect(success).toEqual(true);
    });

    it("AERO -> ETH", async () => {
      const accountAddress = await getTopHolder("AERO", 8453);
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Aerodrome",
        chainName: "Base",
        inputToken: "AERO",
        inputAmount: "100",
        outputToken: "ETH",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        8453,
        res.body.transactions,
        accountAddress,
      );
      expect(success).toEqual(true);
    });

    it("USDC -> ETH, outputAmount", async () => {
      const accountAddress = await getTopHolder("USDC", 8453);
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Aerodrome",
        chainName: "Base",
        inputToken: "USDC",
        outputAmount: "1",
        outputToken: "ETH",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        8453,
        res.body.transactions,
        accountAddress,
      );
      expect(success).toEqual(true);
    });
  });

  it("Camelot", async () => {
    const accountAddress = await getTopHolder("USDC", 42161);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Camelot",
      chainName: "Arbitrum",
      inputToken: "USDC",
      inputAmount: "1000",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(
      42161,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  it("Camelot - outputAmount", async () => {
    const accountAddress = await getTopHolder("USDC", 42161);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Camelot",
      chainName: "Arbitrum",
      inputToken: "USDC",
      outputAmount: "1",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(
      42161,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  it("Sushiswap", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Sushiswap",
      chainName: "Ethereum",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Sushiswap - outputAmount", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Sushiswap",
      chainName: "Ethereum",
      inputToken: "USDC",
      outputAmount: "1",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it.skip("TraderJoe", async () => {
    const accountAddress = "0xf89d7b9c864f589bbF53a82105107622B35EaA40";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "TraderJoe",
      chainName: "Avalanche",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "USDT",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(
      43114,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  it.skip("TraderJoe - outputAmount", async () => {
    const accountAddress = "0xf89d7b9c864f589bbF53a82105107622B35EaA40";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "TraderJoe",
      chainName: "Avalanche",
      inputToken: "USDC",
      outputAmount: "100",
      outputToken: "USDT",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(
      43114,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  it("Balancer", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Balancer",
      chainName: "Ethereum",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Balancer - outputAmount", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Balancer",
      chainName: "Ethereum",
      inputToken: "USDC",
      outputAmount: "1",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("0x", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "0x",
      chainName: "Ethereum",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("0x - outputAmount", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "0x",
      chainName: "Ethereum",
      inputToken: "USDC",
      outputAmount: "1",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Lifi", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Lifi",
      chainName: "Ethereum",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Lifi - outputAmount", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Lifi",
      chainName: "Ethereum",
      inputToken: "USDC",
      outputAmount: "1",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Matcha", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Matcha",
      chainName: "Ethereum",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Matcha - outputAmount", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Matcha",
      chainName: "Ethereum",
      inputToken: "USDC",
      outputAmount: "1",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("1inch", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "1inch",
      chainName: "Ethereum",
      inputToken: "USDC",
      inputAmount: "2000",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("1inch - outputAmount", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "1inch",
      chainName: "Ethereum",
      inputToken: "USDC",
      outputAmount: "1",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("ParaSwap", async () => {
    const accountAddress = "0xf89d7b9c864f589bbF53a82105107622B35EaA40";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "ParaSwap",
      chainName: "Ethereum",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "USDT",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("ParaSwap - outputAmount", async () => {
    const accountAddress = "0xf89d7b9c864f589bbF53a82105107622B35EaA40";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "ParaSwap",
      chainName: "Ethereum",
      inputToken: "USDC",
      outputAmount: "100",
      outputToken: "USDT",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Odos", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Odos",
      chainName: "Ethereum",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Odos - outputAmount", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Odos",
      chainName: "Ethereum",
      inputToken: "USDC",
      outputAmount: "1",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("KyberSwap", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "KyberSwap",
      chainName: "Ethereum",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("KyberSwap - outputAmount", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "KyberSwap",
      chainName: "Ethereum",
      inputToken: "USDC",
      outputAmount: "0.1",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("PancakeSwap", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "PancakeSwap",
      chainName: "Ethereum",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("PancakeSwap - outputAmount", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "PancakeSwap",
      chainName: "Ethereum",
      inputToken: "USDC",
      outputAmount: "1",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("OpenOcean", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "OpenOcean",
      chainName: "Ethereum",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("OpenOcean - outputAmount", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "OpenOcean",
      chainName: "Ethereum",
      inputToken: "USDC",
      outputAmount: "1",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Llamazip", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Llamazip",
      chainName: "Ethereum",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Llamazip - outputAmount", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Llamazip",
      chainName: "Ethereum",
      inputToken: "USDC",
      outputAmount: "1",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Synapse", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Synapse",
      chainName: "Ethereum",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "DAI",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Jumper", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Jumper",
      chainName: "Ethereum",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Jumper - outputAmount", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Jumper",
      chainName: "Ethereum",
      inputToken: "USDC",
      outputAmount: "1",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Camelot 2", async () => {
    const accountAddress = await getTopHolder("USDC", 42161);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Camelot",
      chainName: "Arbitrum",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(
      42161,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  it("Camelot - outputAmount 2", async () => {
    const accountAddress = await getTopHolder("USDC", 42161);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Camelot",
      chainName: "Arbitrum",
      inputToken: "USDC",
      outputAmount: "10",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(
      42161,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  it("Curve", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Curve",
      chainName: "Ethereum",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Curve - outputAmount", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Curve",
      chainName: "Ethereum",
      inputToken: "USDC",
      outputAmount: "1",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Aerodrome", async () => {
    const accountAddress = await getTopHolder("USDC", 10);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Aerodrome",
      chainName: "Optimism",
      inputToken: "USDT",
      inputAmount: "100",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(
      10,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  it("Aerodrome - outputAmount", async () => {
    const accountAddress = await getTopHolder("USDC", 10);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Aerodrome",
      chainName: "Optimism",
      inputToken: "USDT",
      outputAmount: "1",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(
      10,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  it("Thruster", async () => {
    const accountAddress = await getTopHolder("USDB", 81457);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Thruster",
      chainName: "Blast",
      inputToken: "USDB",
      inputAmount: "100",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(
      81457,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  it("Thruster - outputAmount", async () => {
    const accountAddress = await getTopHolder("USDB", 81457);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Thruster",
      chainName: "Blast",
      inputToken: "USDB",
      outputAmount: "1",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(
      81457,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  it.skip("ZKSync", async () => {
    const accountAddress = "0x621425a1Ef6abE91058E9712575dcc4258F8d091";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      chainName: "ZKSync",
      inputToken: "USDC",
      inputAmount: "10",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
  });

  it.skip("SyncSwap", async () => {
    const accountAddress = "0x621425a1Ef6abE91058E9712575dcc4258F8d091";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      chainName: "ZKSync",
      protocolName: "SyncSwap",
      inputToken: "ETH",
      inputAmount: "10",
      outputToken: "USDC",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
  });

  it.skip("SyncSwap - outputAmount", async () => {
    const accountAddress = "0x621425a1Ef6abE91058E9712575dcc4258F8d091";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      chainName: "ZKSync",
      protocolName: "SyncSwap",
      inputToken: "USDC",
      outputAmount: "0.05",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
  });

  it("Slippage", async () => {
    const accountAddress = await getTopHolder("USDC", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Uniswap",
      chainName: "Ethereum",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "ETH",
      slippage: 0.5,
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Missing accountAddress", async () => {
    const res = await request(app).post(endpoint).send({
      // Missing accountAddress
      protocolName: "Uniswap",
      chainName: "Ethereum",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
  });

  it("Invalid inputAmount", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Uniswap",
      chainName: "Ethereum",
      inputToken: "USDC",
      inputAmount: "invalidAmount",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
  });

  it("Zero inputAmount", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Uniswap",
      chainName: "Ethereum",
      inputToken: "USDC",
      inputAmount: "0",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "You are trying to swap from zero usdc to eth on Ethereum. Please ensure your prompt is correctly formatted and try again.",
    );
  });

  it("Zero outputAmount", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Uniswap",
      chainName: "Ethereum",
      inputToken: "USDC",
      outputAmount: "0",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "You are trying to swap from usdc to zero eth on Ethereum. Please ensure your prompt is correctly formatted and try again.",
    );
  });

  it("Insufficient balance", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xd6216fC19Db775df9774a6E33526131Da7D19a20",
      protocolName: "Uniswap",
      chainName: "Ethereum",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "Insufficient balance on Ethereum. On your Slate account, you have 0.0 and need 100.0. Please onboard 100.0 more usdc and try again.",
    );
  });

  it("Insufficient balance when outputAmount is specified", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xdD81c6681633Cb26C69d8f52F88b513D6A90a286",
      inputToken: "eth",
      outputToken: "usdc",
      outputAmount: "100",
      protocolName: "1inch",
      chainName: "Ethereum",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    const errReg =
      /Insufficient balance on Ethereum. On your Slate account, you have [+-]?([0-9]*[.])?[0-9]+ and need [+-]?([0-9]*[.])?[0-9]+. Please onboard [+-]?([0-9]*[.])?[0-9]+ more eth and try again./i;
    expect(errReg.test(res.body.message)).toEqual(true);
  });

  it("Missing inputToken", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Uniswap",
      chainName: "Ethereum",
      // Missing inputToken
      inputAmount: "100",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
  });

  it("Invalid slippage", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Odos",
      chainName: "Avalanche",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "ETH",
      slippage: "invalidSlippage",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
  });

  it("Invalid protocolName", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      // Invalid protocolName
      protocolName: "InvalidProtocol",
      chainName: "Ethereum",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
  });

  it.skip("Provider", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const actions = [
      {
        name: "swap",
        args: {
          chainName: "Ethereum",
          inputToken: "USDC",
          inputAmount: "1000",
          outputToken: "ETH",
        },
      },
    ];
    const res = await request(app)
      .post(`/simulate?secret=${process.env.BACKEND_TOKEN_SECRET}`)
      .send({
        actions,
        conditions: [],
        accountAddress,
      });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("actions");
    const updatedActions = res.body.actions;
    const { provider, timestamp } = updatedActions[0].args;

    const res1 = await request(app)
      .post(endpoint)
      .send({
        ...updatedActions[0].args,
        accountAddress,
        provider: provider === "lifi" ? "1inch" : "lifi",
        timestamp,
      });
    expect(res1.statusCode).toEqual(200);
    expect(res1.body).toHaveProperty("status");
    expect(res1.body.status).toEqual("success");
    expect(res1.body).toHaveProperty("transactions");

    const res2 = await request(app)
      .post(endpoint)
      .send({
        ...updatedActions[0].args,
        accountAddress,
        provider: provider === "lifi" ? "1inch" : "lifi",
        timestamp: timestamp - 300,
      });
    expect(res2.statusCode).toEqual(200);
    expect(res2.body).toHaveProperty("status");
    expect(res2.body.status).toEqual("success");
    expect(res2.body).toHaveProperty("transactions");

    expect(res1.body.transactions[1].to).not.toEqual(
      res2.body.transactions[1].to,
    );
  });
});
