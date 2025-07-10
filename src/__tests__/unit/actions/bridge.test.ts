import request from "supertest";
import app from "../../../app.js";
import { initModels } from "../../../db/index.js";
import { getChainIdFromName } from "../../../utils/index.js";
import { RetryProvider } from "../../../utils/retryProvider.js";
import {
  createVnet,
  getTopHolder,
  increaseTokenBalance,
  runTxsOnVnet,
  simulateTxs,
} from "../../helper.js";

const endpoint = `/bridge?secret=${process.env.BACKEND_TOKEN_SECRET}`;

jest.retryTimes(1);

describe("Bridge", () => {
  beforeEach(async () => {
    await initModels();
    console.log(expect.getState().currentTestName);
  });

  describe("Bungee", () => {
    const testCases = [
      {
        srcChain: "Ethereum",
        destChain: "Avalanche",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Optimism",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Binance",
        token: "USDC",
        amount: "50",
      },
      // {
      //   srcChain: "Ethereum",
      //   destChain: "Fantom",
      //   token: "USDC",
      //   amount: "50",
      // },
      {
        srcChain: "Ethereum",
        destChain: "Polygon",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Arbitrum",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Base",
        token: "USDC",
        amount: "50",
      },
    ];

    for (const { srcChain, destChain, token, amount } of testCases) {
      it(`Bridge ${amount} ${token} from ${srcChain} to ${destChain} using Bungee`, async () => {
        const chainId = getChainIdFromName(srcChain);
        const accountAddress = await getTopHolder(token, chainId);
        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "Bungee",
          sourceChainName: srcChain,
          destinationChainName: destChain,
          token,
          amount,
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
  });

  describe("Across", () => {
    const testCases = [
      {
        srcChain: "Base",
        destChain: "Arbitrum",
        token: "DAI",
        amount: "500",
      },
      {
        srcChain: "Arbitrum",
        destChain: "Optimism",
        token: "USDT",
        amount: "500",
      },
      {
        srcChain: "Arbitrum",
        destChain: "Optimism",
        token: "BAL",
        amount: "100",
      },
      {
        srcChain: "Optimism",
        destChain: "Arbitrum",
        token: "WBTC",
        amount: "0.1",
      },
      {
        srcChain: "Polygon",
        destChain: "Arbitrum",
        token: "WBTC",
        amount: "0.2",
      },
    ];

    for (const { srcChain, destChain, token, amount } of testCases) {
      it(`Bridge ${amount} ${token} from ${srcChain} to ${destChain} using Across`, async () => {
        const chainId = getChainIdFromName(srcChain);
        const accountAddress = await getTopHolder(token, chainId);
        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "Across",
          sourceChainName: srcChain,
          destinationChainName: destChain,
          token,
          amount,
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
  });

  describe("Orbiter", () => {
    const testCases = [
      {
        srcChain: "Ethereum",
        destChain: "Optimism",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Polygon",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Arbitrum",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Arbitrum",
        token: "ETH",
        amount: "1",
      },
      {
        srcChain: "Ethereum",
        destChain: "Base",
        token: "USDC",
        amount: "50",
      },
    ];

    for (const { srcChain, destChain, token, amount } of testCases) {
      it(`Bridge ${amount} ${token} from ${srcChain} to ${destChain} using Orbiter`, async () => {
        const chainId = getChainIdFromName(srcChain);
        const accountAddress = await getTopHolder(token, chainId);
        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "Orbiter",
          sourceChainName: srcChain,
          destinationChainName: destChain,
          token,
          amount,
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
  });

  describe("Socket", () => {
    const testCases = [
      {
        srcChain: "Ethereum",
        destChain: "Avalanche",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Optimism",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Binance",
        token: "USDC",
        amount: "50",
      },
      // {
      //   srcChain: "Ethereum",
      //   destChain: "Fantom",
      //   token: "USDC",
      //   amount: "50",
      // },
      {
        srcChain: "Ethereum",
        destChain: "Polygon",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Arbitrum",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Base",
        token: "USDC",
        amount: "50",
      },
    ];

    for (const { srcChain, destChain, token, amount } of testCases) {
      it(`Bridge ${amount} ${token} from ${srcChain} to ${destChain} using Socket`, async () => {
        const chainId = getChainIdFromName(srcChain);
        const accountAddress = await getTopHolder(token, chainId);
        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "Socket",
          sourceChainName: srcChain,
          destinationChainName: destChain,
          token,
          amount,
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
  });

  describe("Hop", () => {
    it("Ethereum -> Arbitrum", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "Hop",
        sourceChainName: "Ethereum",
        destinationChainName: "Arbitrum",
        token: "USDC",
        amount: "50",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        1,
        res.body.transactions,
        "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      );
      expect(success).toEqual(true);
    });

    it("Ethereum -> Optimism", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "Hop",
        sourceChainName: "Ethereum",
        destinationChainName: "Optimism",
        token: "USDC",
        amount: "50",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        1,
        res.body.transactions,
        "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      );
      expect(success).toEqual(true);
    });

    it.skip("Ethereum -> Gnosis", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "Hop",
        sourceChainName: "Ethereum",
        destinationChainName: "Gnosis",
        token: "WETH",
        amount: "50",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        1,
        res.body.transactions,
        "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      );
      expect(success).toEqual(true);
    });

    it.skip("Ethereum -> Polygon", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "Hop",
        sourceChainName: "Ethereum",
        destinationChainName: "Polygon",
        token: "USDC",
        amount: "50",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        1,
        res.body.transactions,
        "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      );
      expect(success).toEqual(true);
    });

    it("Ethereum -> Base", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "Hop",
        sourceChainName: "Ethereum",
        destinationChainName: "Base",
        token: "USDC",
        amount: "50",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await simulateTxs(
        1,
        res.body.transactions,
        "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      );
      expect(success).toEqual(true);
    });
  });

  describe("Jumper", () => {
    const testCases = [
      {
        srcChain: "Ethereum",
        destChain: "Avalanche",
        token: "USDT",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Optimism",
        token: "USDT",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Binance",
        token: "USDT",
        amount: "50",
      },
      // {
      //   srcChain: "Ethereum",
      //   destChain: "Fantom",
      //   token: "USDT",
      //   amount: "50",
      // },
      {
        srcChain: "Ethereum",
        destChain: "Polygon",
        token: "USDT",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Arbitrum",
        token: "USDT",
        amount: "50",
      },
    ];

    for (const { srcChain, destChain, token, amount } of testCases) {
      it(`Bridge ${amount} ${token} from ${srcChain} to ${destChain} using Jumper`, async () => {
        const chainId = getChainIdFromName(srcChain);
        const accountAddress = await getTopHolder(token, chainId);
        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "Jumper",
          sourceChainName: srcChain,
          destinationChainName: destChain,
          token,
          amount,
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
  });

  describe("LiFi", () => {
    const testCases = [
      {
        srcChain: "Ethereum",
        destChain: "Avalanche",
        token: "USDT",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Optimism",
        token: "USDT",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Binance",
        token: "USDT",
        amount: "50",
      },
      // {
      //   srcChain: "Ethereum",
      //   destChain: "Fantom",
      //   token: "USDT",
      //   amount: "50",
      // },
      {
        srcChain: "Ethereum",
        destChain: "Polygon",
        token: "USDT",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Arbitrum",
        token: "USDT",
        amount: "50",
      },
    ];

    for (const { srcChain, destChain, token, amount } of testCases) {
      it(`Bridge ${amount} ${token} from ${srcChain} to ${destChain} using LiFi`, async () => {
        const chainId = getChainIdFromName(srcChain);
        const accountAddress = await getTopHolder(token, chainId);
        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "LiFi",
          sourceChainName: srcChain,
          destinationChainName: destChain,
          token,
          amount,
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
  });

  describe("Axelar", () => {
    const testCases = [
      {
        srcChain: "Ethereum",
        destChain: "Avalanche",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Optimism",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Binance",
        token: "USDC",
        amount: "50",
      },
      // {
      //   srcChain: "Ethereum",
      //   destChain: "Fantom",
      //   token: "USDC",
      //   amount: "50",
      // },
      {
        srcChain: "Ethereum",
        destChain: "Polygon",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Arbitrum",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Linea",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Base",
        token: "USDC",
        amount: "50",
      },
    ];

    for (const { srcChain, destChain, token, amount } of testCases) {
      it(`Bridge ${amount} ${token} from ${srcChain} to ${destChain} using Axelar`, async () => {
        const chainId = getChainIdFromName(srcChain);
        const accountAddress = await getTopHolder(token, chainId);
        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "Axelar",
          sourceChainName: srcChain,
          destinationChainName: destChain,
          token,
          amount,
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
  });

  describe("Squid", () => {
    const testCases = [
      {
        srcChain: "Ethereum",
        destChain: "Avalanche",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Optimism",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Binance",
        token: "USDC",
        amount: "50",
      },
      // {
      //   srcChain: "Ethereum",
      //   destChain: "Fantom",
      //   token: "USDC",
      //   amount: "50",
      // },
      {
        srcChain: "Ethereum",
        destChain: "Polygon",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Arbitrum",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Linea",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Base",
        token: "USDC",
        amount: "50",
      },
    ];

    for (const { srcChain, destChain, token, amount } of testCases) {
      it(`Bridge ${amount} ${token} from ${srcChain} to ${destChain} using Squid`, async () => {
        const chainId = getChainIdFromName(srcChain);
        const accountAddress = await getTopHolder(token, chainId);
        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "Squid",
          sourceChainName: srcChain,
          destinationChainName: destChain,
          token,
          amount,
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
  });

  describe("Synapse", () => {
    const testCases = [
      {
        srcChain: "Ethereum",
        destChain: "Avalanche",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Optimism",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Binance",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Polygon",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Arbitrum",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Base",
        token: "USDC",
        amount: "50",
      },
    ];

    for (const { srcChain, destChain, token, amount } of testCases) {
      it(`Bridge ${amount} ${token} from ${srcChain} to ${destChain} using Synapse`, async () => {
        const chainId = getChainIdFromName(srcChain);
        const accountAddress = await getTopHolder(token, chainId);
        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "Synapse",
          sourceChainName: srcChain,
          destinationChainName: destChain,
          token,
          amount,
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
  });

  describe("Stargate", () => {
    const testCases = [
      {
        src: "Ethereum",
        dst: "Arbitrum",
        tokens: ["USDC", "USDT", "ETH"],
        amounts: ["100", "100", "1"],
      },
      {
        src: "Ethereum",
        dst: "BNB",
        tokens: ["USDT"],
        amounts: ["100"],
      },
      // {
      //   src: "Ethereum",
      //   dst: "Avalanche",
      //   tokens: ["USDC", "USDT"],
      //   amounts: ["100", "100"],
      // },
      {
        address: "0xacD03D601e5bB1B275Bb94076fF46ED9D753435A",
        src: "Optimism",
        dst: "Arbitrum",
        tokens: ["USDC", "ETH"],
        amounts: ["100", "1"],
      },
      {
        address: "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D",
        src: "Arbitrum",
        dst: "Base",
        tokens: ["ETH"],
        amounts: ["1"],
      },
    ];

    for (const tc of testCases) {
      for (let i = 0; i < tc.tokens.length; i++) {
        const token = tc.tokens[i];
        const amount = tc.amounts[i];

        it(`Bridge ${amount} ${token} from ${tc.src} to ${tc.dst}`, async () => {
          const chainId = getChainIdFromName(tc.src);
          const accountAddress = await getTopHolder(token, chainId);
          const { rpcUrl: rpc } = await createVnet(chainId);
          await increaseTokenBalance(
            rpc,
            accountAddress || "",
            tc.src,
            token,
            amount,
          );
          if (tc.src !== "Ethereum" && token === "USDC") {
            await increaseTokenBalance(
              rpc,
              accountAddress || "",
              tc.src,
              "usdc.e",
              amount,
            );
          }

          const provider = new RetryProvider(rpc, chainId);

          const res = await request(app).post(endpoint).send({
            accountAddress,
            protocolName: "Stargate",
            sourceChainName: tc.src,
            destinationChainName: tc.dst,
            token,
            amount,
            rpc,
          });
          expect(res.statusCode).toEqual(200);
          expect(res.body).toHaveProperty("status");
          expect(res.body.status).toEqual("success");
          expect(res.body).toHaveProperty("transactions");

          const success = await runTxsOnVnet(
            provider,
            accountAddress || "",
            res.body.transactions,
          );
          expect(success).toEqual(true);
        });
      }
    }
  });

  describe("Reservoir", () => {
    const testCases = [
      {
        src: "Ethereum",
        dst: "Arbitrum",
        tokens: ["USDC", "ETH"],
        amounts: ["100", "1"],
      },
      {
        src: "Ethereum",
        dst: "Base",
        tokens: ["USDC", "ETH"],
        amounts: ["100", "1"],
      },
      {
        src: "Optimism",
        dst: "Arbitrum",
        tokens: ["ETH"],
        amounts: ["1"],
      },
      {
        src: "Arbitrum",
        dst: "Base",
        tokens: ["USDC", "ETH"],
        amounts: ["100", "1"],
      },
    ];

    for (const tc of testCases) {
      for (let i = 0; i < tc.tokens.length; i++) {
        const token = tc.tokens[i];
        const amount = tc.amounts[i];

        it(`Bridge ${amount} ${token} from ${tc.src} to ${tc.dst}`, async () => {
          const chainId = getChainIdFromName(tc.src);
          const accountAddress = await getTopHolder(token, chainId);
          const res = await request(app).post(endpoint).send({
            accountAddress,
            protocolName: "Reservoir",
            sourceChainName: tc.src,
            destinationChainName: tc.dst,
            token,
            amount,
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

    it("No bridge route found", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "Reservoir",
        sourceChainName: "Ethereum",
        destinationChainName: "Linea",
        token: "USDC",
        amount: "100",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        "Error fetching quote from Reservoir. Please try again later or contact support if the issue persists. You can also try a different protocol for your swap.",
      );
    });
  });

  describe("DeBridge", () => {
    const testCases = [
      {
        srcChain: "Ethereum",
        destChain: "Optimism",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Polygon",
        destChain: "Ethereum",
        token: "USDC",
        amount: "50",
      },
      {
        srcChain: "Arbitrum",
        destChain: "Ethereum",
        token: "USDT",
        amount: "50",
      },
      {
        srcChain: "Ethereum",
        destChain: "Arbitrum",
        token: "ETH",
        amount: "1",
      },
      {
        srcChain: "Polygon",
        destChain: "BSC",
        token: "USDC",
        amount: "50",
      },
    ];

    for (const { srcChain, destChain, token, amount } of testCases) {
      it(`Bridge ${amount} ${token} from ${srcChain} to ${destChain} using DeBridge`, async () => {
        const chainId = getChainIdFromName(srcChain);
        const accountAddress = await getTopHolder(token, chainId);
        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "DeBridge",
          sourceChainName: srcChain,
          destinationChainName: destChain,
          token,
          amount,
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
  });

  it.skip("ZKSync -> Ethereum", async () => {
    const accountAddress = "0x621425a1Ef6abE91058E9712575dcc4258F8d091";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      sourceChainName: "ZKSync",
      destinationChainName: "Ethereum",
      token: "USDC",
      amount: "1000",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
  });

  it.skip("Ethereum -> ZKSync", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      sourceChainName: "Ethereum",
      destinationChainName: "ZKSync",
      token: "USDC",
      amount: "10",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
  });

  it("Invalid Protocol - Should return 400", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "InvalidProtocol",
      sourceChainName: "Ethereum",
      destinationChainName: "Avalanche",
      token: "USDC",
      amount: "50",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
  });

  it("Missing Required Field - Should return 400", async () => {
    const res = await request(app).post(endpoint).send({
      // Missing required 'destinationChainName' field
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Bungee",
      sourceChainName: "Ethereum",
      token: "USDC",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
  });

  it("Invalid Source Chain - Should return 400", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Bungee",
      sourceChainName: "InvalidSourceChain",
      destinationChainName: "Avalanche",
      token: "USDC",
      amount: "50",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
  });

  it("Invalid Destination Chain - Should return 400", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Bungee",
      sourceChainName: "Ethereum",
      destinationChainName: "InvalidDestinationChain",
      token: "USDC",
      amount: "50",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
  });

  it("Zero Amount - Should return 400", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Bungee",
      sourceChainName: "Ethereum",
      destinationChainName: "Avalanche",
      token: "USDC",
      amount: "0",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "Trying to bridge zero usdc. Please specify positive amount in your next prompt.",
    );
  });

  it("Insufficient balance", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xd6216fC19Db775df9774a6E33526131Da7D19a20",
      protocolName: "Bungee",
      sourceChainName: "Ethereum",
      destinationChainName: "Avalanche",
      token: "USDC",
      amount: "100",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "Insufficient balance on Ethereum. On your Slate account, you have 0.0 and need 100.0. Please onboard 100.0 more usdc and try again.",
    );
  });

  it("Negative Amount - Should return 400", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Bungee",
      sourceChainName: "Ethereum",
      destinationChainName: "Avalanche",
      token: "USDC",
      amount: "-50",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
  });
});
