import request from "supertest";
import app from "../../../app.js";
import { getUnsupportedProtocolError } from "../../../utils/error.js";
import { RetryProvider } from "../../../utils/retryProvider.js";
import type { ChainId, JSONObject } from "../../../utils/types.js";
import { createVnet, runTxsOnVnet } from "../../helper.js";

const endpoint = `/close?secret=${process.env.BACKEND_TOKEN_SECRET}`;

jest.retryTimes(1);

describe("Close", () => {
  beforeEach(() => {
    console.log(expect.getState().currentTestName);
  });

  // unsupported
  describe.skip("GMX-Arbitrum", () => {
    it("ARB-USDC", async () => {
      const accountAddress = "0x6859dA14835424957a1E6B397D8026B1D9fF7e1E";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          inputToken: "ARB",
        },
        42161,
        235170000,
      );
    });

    it("ETH-USDC", async () => {
      const accountAddress = "0x4Cd80aa0CE4881Eb8679EdA1f6fbe3d89AEc0F7F";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          inputToken: "ETH",
        },
        42161,
        235170000,
      );
    });

    it("BTC-USDC", async () => {
      const accountAddress = "0x4Cd80aa0CE4881Eb8679EdA1f6fbe3d89AEc0F7F";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          inputToken: "BTC",
        },
        42161,
        235170000,
      );
    });

    it("AVAX-USDC", async () => {
      const accountAddress = "0x4Cd80aa0CE4881Eb8679EdA1f6fbe3d89AEc0F7F";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          inputToken: "AVAX",
        },
        42161,
        235170000,
      );
    });

    it("UNI-USDC", async () => {
      const accountAddress = "0xe2823659bE02E0F48a4660e4Da008b5E1aBFdF29";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          inputToken: "UNI",
        },
        42161,
        235170000,
      );
    });

    it("DOGE-USDC", async () => {
      const accountAddress = "0x4Cd80aa0CE4881Eb8679EdA1f6fbe3d89AEc0F7F";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          inputToken: "DOGE",
        },
        42161,
        235170000,
      );
    });
  });

  // unsupported
  describe.skip("GMX-Avalanche", () => {
    it("AVAX-USDC", async () => {
      const accountAddress = "0x4Cd80aa0CE4881Eb8679EdA1f6fbe3d89AEc0F7F";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Avalanche",
          inputToken: "AVAX",
        },
        43114,
        48329900,
      );
    });

    it("BTC-USDC", async () => {
      const accountAddress = "0x3fbF01A89884BBcc2a523A655Fb32f912a4Af1C1";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Avalanche",
          inputToken: "BTC",
        },
        43114,
        48318728,
      );
    });

    it("DOGE-USDC", async () => {
      const accountAddress = "0xf2d83482f8C835423C2901b1c67081f726E39B25";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Avalanche",
          inputToken: "DOGE",
        },
        43114,
        48329900,
      );
    });

    it("LTC-USDC", async () => {
      const accountAddress = "0xf2d83482f8C835423C2901b1c67081f726E39B25";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Avalanche",
          inputToken: "LTC",
        },
        43114,
        48329900,
      );
    });
  });

  it("Invalid Protocol - Should return 400", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "InvalidProtocol",
      chainName: "Arbitrum",
      inputToken: "WETH",
      inputAmount: "0.1",
      outputToken: "USDT",
      leverageMultiplier: 4,
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      getUnsupportedProtocolError("invalidprotocol", "close"),
    );
  });

  it("Invalid Input Amount - Should return 400", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "GMX",
      chainName: "Arbitrum",
      inputToken: "WETH",
      inputAmount: "invalidAmount",
      outputToken: "USDT",
      leverageMultiplier: 4,
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "invalidAmount is an invalid amount. Please specify an amount correctly and try again.",
    );
  });

  it("Negative Leverage - Should return 400", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "GMX",
      chainName: "Arbitrum",
      inputToken: "WETH",
      inputAmount: "0.1",
      outputToken: "USDT",
      leverageMultiplier: -4,
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "Leverage multiplier must be greater than zero",
    );
  });

  it("Zero Input Amount - Should return 400", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "GMX",
      chainName: "Arbitrum",
      inputToken: "WETH",
      inputAmount: "0",
      outputToken: "USDT",
      leverageMultiplier: 4,
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "The amount being used is zero, ensure you have funds on your Slate account",
    );
  });

  // unsupported
  it.skip("GMX - Unsupported Output Token Error", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "GMX",
      chainName: "Arbitrum",
      inputToken: "USDT",
      inputAmount: "0.1",
      outputToken: "DAI",
      leverageMultiplier: 2,
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "closing dai is not supported on gmx. The available tokens to close are btc, eth, sol, arb, link, bnb, atom, doge, near, avax, aave, xrp, ltc, uni, op, and gmx.",
    );
  });

  it("Hyperliquid 1", async () => {
    const accountAddress = "0x90C85cBF499dCfb49d37B56e2A40467B2B97BAc7";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Hyperliquid",
      chainName: "Arbitrum",
      inputToken: "USDC",
      outputToken: "ENA",
      inputamount: "10",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body).toHaveProperty("signData");
  });

  it("Hyperliquid 2", async () => {
    const accountAddress = "0x000007656F345A789bB422f0307D826660258333";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Hyperliquid",
      chainName: "Arbitrum",
      inputToken: "USDC",
      outputToken: "ETH",
      inputamount: "10",
    });
    expect(res.statusCode).toEqual(400);
  });

  it("Hyperliquid 3", async () => {
    const accountAddress = "0x0666E6252a6bC3A4A186eD2e004643D7f2418b57";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Hyperliquid",
      chainName: "Arbitrum",
      inputToken: "USDC",
      outputToken: "BTC",
      inputamount: "10",
    });
    expect(res.statusCode).toEqual(400);
  });

  it("Hyperliquid - Unsupported Output Token Error", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Hyperliquid",
      chainName: "Arbitrum",
      inputToken: "USDC",
      inputAmount: "10",
      outputToken: "DAI",
      leverageMultiplier: 2,
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "Token DAI is not supported on Arbitrum for hyperliquid.",
    );
  });

  it("Hyperliquid - Invalid input token", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Hyperliquid",
      chainName: "Arbitrum",
      inputToken: "USDT",
      inputAmount: "100",
      outputToken: "ETH",
      leverageMultiplier: 20,
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "Token USDT is not supported to close on Hyperliquid. Only USDC is supported.",
    );
  });

  async function test(
    accountAddress: string,
    body: JSONObject,
    chainId: ChainId,
    blockNumber: number | JSONObject | undefined,
  ) {
    const { vnetId, rpcUrl } = await createVnet(chainId, blockNumber);
    body.rpc = rpcUrl;
    const provider = new RetryProvider(rpcUrl, chainId);

    const res = await request(app).post(endpoint).send(body);
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await runTxsOnVnet(
      provider,
      accountAddress,
      res.body.transactions,
      { chainId, vnetId, action: "close" },
    );
    expect(success).toEqual(true);
  }
});
