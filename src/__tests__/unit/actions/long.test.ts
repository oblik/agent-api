import request from "supertest";
import app from "../../../app.js";
import { availableMarkets } from "../../../config/gmx/markets.js";
import { RetryProvider } from "../../../utils/retryProvider.js";
import type { ChainId, JSONObject } from "../../../utils/types.js";
import { createVnet, runTxsOnVnet } from "../../helper.js";

const endpoint = `/long?secret=${process.env.BACKEND_TOKEN_SECRET}`;

jest.retryTimes(1);

describe("Long", () => {
  beforeEach(() => {
    console.log(expect.getState().currentTestName);
  });

  // unsupported
  describe.skip("GMX - Arbitrum", () => {
    it("OP-USDC", async () => {
      const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          inputToken: "USDC",
          inputAmount: "100",
          outputToken: "OP",
          leverageMultiplier: 4,
        },
        42161,
      );
    });

    it("GMX-USDC", async () => {
      const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          inputToken: "USDC",
          inputAmount: "100",
          outputToken: "GMX",
          leverageMultiplier: 4,
        },
        42161,
      );
    });

    it("ARB-USDC", async () => {
      const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          inputToken: "USDC",
          inputAmount: "100",
          outputToken: "ARB",
          leverageMultiplier: 4,
        },
        42161,
      );
    });

    it("WBTC-USDC", async () => {
      const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          inputToken: "USDC",
          inputAmount: "100",
          outputToken: "WBTC",
          leverageMultiplier: 4,
        },
        42161,
      );
    });

    it("BTC-USDC", async () => {
      const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          inputToken: "USDC",
          inputAmount: "100",
          outputToken: "BTC",
          leverageMultiplier: 4,
        },
        42161,
      );
    });

    it("WETH-USDC", async () => {
      const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          inputToken: "USDC",
          inputAmount: "100",
          outputToken: "WETH",
          leverageMultiplier: 4,
        },
        42161,
      );
    });

    it("ETH-USDC", async () => {
      const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          inputToken: "USDC",
          inputAmount: "100",
          outputToken: "ETH",
          leverageMultiplier: 4,
        },
        42161,
      );
    });

    it("SOL-USDC", async () => {
      const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          inputToken: "USDC",
          inputAmount: "203",
          outputToken: "SOL",
          leverageMultiplier: 10,
        },
        42161,
      );
    });

    it("UNI-USDC", async () => {
      const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          inputToken: "USDC",
          inputAmount: "100",
          outputToken: "UNI",
          leverageMultiplier: 4,
        },
        42161,
      );
    });

    it("LINK-USDC", async () => {
      const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          inputToken: "USDC",
          inputAmount: "100",
          outputToken: "LINK",
          leverageMultiplier: 4,
        },
        42161,
      );
    });

    it("WBNB-USDC", async () => {
      const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          inputToken: "USDC",
          inputAmount: "100",
          outputToken: "WBNB",
          leverageMultiplier: 4,
        },
        42161,
      );
    });

    it("BNB-USDC", async () => {
      const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          inputToken: "USDC",
          inputAmount: "100",
          outputToken: "BNB",
          leverageMultiplier: 4,
        },
        42161,
      );
    });

    it("XRP-USDC", async () => {
      const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          inputToken: "USDC",
          inputAmount: "100",
          outputToken: "XRP",
          leverageMultiplier: 4,
        },
        42161,
      );
    });

    it("DOGE-USDC", async () => {
      const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          inputToken: "USDC",
          inputAmount: "100",
          outputToken: "DOGE",
          leverageMultiplier: 4,
        },
        42161,
      );
    });

    it("ATOM-USDC", async () => {
      const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          inputToken: "USDC",
          inputAmount: "100",
          outputToken: "ATOM",
          leverageMultiplier: 4,
        },
        42161,
      );
    });

    it("LTC-USDC", async () => {
      const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          inputToken: "USDC",
          inputAmount: "100",
          outputToken: "LTC",
          leverageMultiplier: 4,
        },
        42161,
      );
    });

    it("AVAX-USDT", async () => {
      const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          inputToken: "USDT",
          inputAmount: "100",
          outputToken: "AVAX",
          leverageMultiplier: 4,
        },
        42161,
      );
    });

    it("WAVAX-DAI", async () => {
      const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          inputToken: "DAI",
          inputAmount: "100",
          outputToken: "WAVAX",
          leverageMultiplier: 4,
        },
        42161,
      );
    });

    it("AAVE-USDC.E", async () => {
      const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          inputToken: "USDC.E",
          inputAmount: "100",
          outputToken: "AAVE",
          leverageMultiplier: 4,
        },
        42161,
      );
    });

    it("SOL-WETH", async () => {
      const accountAddress = "0xf584f8728b874a6a5c7a8d4d387c9aae9172d621";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          inputToken: "WETH",
          inputAmount: "0.04",
          outputToken: "SOL",
          leverageMultiplier: 10,
        },
        42161,
      );
    });
  });

  // unsupported
  describe.skip("GMX - Avalanche", () => {
    it.skip("AVAX-USDC", async () => {
      const accountAddress = "0x3A2434c698f8D79af1f5A9e43013157ca8B11a66";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Avalanche",
          inputToken: "USDC",
          inputAmount: "100",
          outputToken: "AVAX",
          leverageMultiplier: 4,
        },
        43114,
      );
    });

    it("BTC-USDC", async () => {
      const accountAddress = "0x3A2434c698f8D79af1f5A9e43013157ca8B11a66";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Avalanche",
          inputToken: "USDC",
          inputAmount: "100",
          outputToken: "BTC",
          leverageMultiplier: 4,
        },
        43114,
      );
    });

    it("ETH-USDC", async () => {
      const accountAddress = "0x3A2434c698f8D79af1f5A9e43013157ca8B11a66";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Avalanche",
          inputToken: "USDC",
          inputAmount: "100",
          outputToken: "ETH",
          leverageMultiplier: 4,
        },
        43114,
      );
    });

    it("SOL-USDC", async () => {
      const accountAddress = "0x3A2434c698f8D79af1f5A9e43013157ca8B11a66";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Avalanche",
          inputToken: "USDC",
          inputAmount: "100",
          outputToken: "SOL",
          leverageMultiplier: 4,
        },
        43114,
      );
    });

    it("DOGE-USDC", async () => {
      const accountAddress = "0x3A2434c698f8D79af1f5A9e43013157ca8B11a66";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Avalanche",
          inputToken: "USDC",
          inputAmount: "100",
          outputToken: "DOGE",
          leverageMultiplier: 4,
        },
        43114,
      );
    });

    it("XRP-USDC", async () => {
      const accountAddress = "0x3A2434c698f8D79af1f5A9e43013157ca8B11a66";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Avalanche",
          inputToken: "USDC",
          inputAmount: "100",
          outputToken: "XRP",
          leverageMultiplier: 4,
        },
        43114,
      );
    });

    it("LTC-USDC", async () => {
      const accountAddress = "0x3A2434c698f8D79af1f5A9e43013157ca8B11a66";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Avalanche",
          inputToken: "USDC",
          inputAmount: "100",
          outputToken: "LTC",
          leverageMultiplier: 4,
        },
        43114,
      );
    });

    it.skip("AVAX-USDC.E", async () => {
      const accountAddress = "0x3A2434c698f8D79af1f5A9e43013157ca8B11a66";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Avalanche",
          inputToken: "USDC.E",
          inputAmount: "100",
          outputToken: "AVAX",
          leverageMultiplier: 4,
        },
        43114,
      );
    });

    it.skip("AVAX-USDT.E", async () => {
      const accountAddress = "0x3A2434c698f8D79af1f5A9e43013157ca8B11a66";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Avalanche",
          inputToken: "USDT.E",
          inputAmount: "100",
          outputToken: "AVAX",
          leverageMultiplier: 4,
        },
        43114,
      );
    });

    it.skip("AVAX-USDT", async () => {
      const accountAddress = "0x3A2434c698f8D79af1f5A9e43013157ca8B11a66";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Avalanche",
          inputToken: "USDT",
          inputAmount: "100",
          outputToken: "AVAX",
          leverageMultiplier: 4,
        },
        43114,
      );
    });

    it.skip("AVAX-DAI.E", async () => {
      const accountAddress = "0x3A2434c698f8D79af1f5A9e43013157ca8B11a66";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Avalanche",
          inputToken: "DAI.E",
          inputAmount: "100",
          outputToken: "AVAX",
          leverageMultiplier: 4,
        },
        43114,
      );
    });
  });

  // unsupported
  it.skip("GMX - Negative Leverage Multiplier Error", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "GMX",
      chainName: "Arbitrum",
      inputToken: "WETH",
      inputAmount: "0.1",
      outputToken: "WETH",
      leverageMultiplier: -4, // Assume negative leverage multiplier
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "Leverage multiplier must be greater than zero",
    );
  });

  // unsupported
  it.skip("GMX - Unsupported Token Error", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "GMX",
      chainName: "Arbitrum",
      inputToken: "invalidToken", // Assume an unsupported token
      inputAmount: "0.1",
      outputToken: "WBTC",
      leverageMultiplier: 4,
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "Token invalidToken not found on Arbitrum. Ensure you specify a chain and token properly in your next prompt.",
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
      `longing dai is not supported on gmx. The available tokens to long are ${availableMarkets(42161)}.`,
    );
  });

  it("Hyperliquid 1", async () => {
    const accountAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Hyperliquid",
      chainName: "Arbitrum",
      outputToken: "ETH",
      inputToken: "USDC",
      inputAmount: "10",
      leverageMultiplier: 10,
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body).toHaveProperty("signData");
  });

  it("Hyperliquid 2", async () => {
    const accountAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Hyperliquid",
      chainName: "Arbitrum",
      outputToken: "ARB",
      inputToken: "USDC",
      inputAmount: "10",
      leverageMultiplier: 10,
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body).toHaveProperty("signData");
  });

  it("Hyperliquid 3", async () => {
    const accountAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Hyperliquid",
      chainName: "Arbitrum",
      outputToken: "BTC",
      inputToken: "USDC",
      inputAmount: "10",
      leverageMultiplier: 10,
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body).toHaveProperty("signData");
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

  it("Hyperliquid - Invalid leverage multiplier", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Hyperliquid",
      chainName: "Arbitrum",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "ETH",
      leverageMultiplier: 100,
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "Leverage multiplier out of range. Max leverage allowed is 50.",
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
      "Token USDT is not supported to long on Hyperliquid. Only USDC is supported.",
    );
  });

  async function test(
    accountAddress: string,
    body: JSONObject,
    chainId: ChainId,
  ) {
    const res = await request(app).post(endpoint).send(body);
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const { vnetId, rpcUrl } = await createVnet(chainId);
    const provider = new RetryProvider(rpcUrl, chainId);

    const success = await runTxsOnVnet(
      provider,
      accountAddress,
      res.body.transactions,
      { chainId, vnetId, action: "long" },
    );
    expect(success).toEqual(true);
  }
});
