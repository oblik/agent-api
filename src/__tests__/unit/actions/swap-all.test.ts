import request from "supertest";
import app from "../../../app.js";
import { RetryProvider } from "../../../utils/retryProvider.js";
import { createVnet, runTxsOnVnet, simulateTxs } from "../../helper.js";

const endpoint = `/swap?secret=${process.env.BACKEND_TOKEN_SECRET}`;

jest.retryTimes(3);

describe("Swap", () => {
  beforeEach(() => {
    console.log(expect.getState().currentTestName);
  });

  it("Arbitrum", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      chainName: "Arbitrum",
      inputToken: "USDT",
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

  it("Arbitrum - outputAmount", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      chainName: "Arbitrum",
      inputToken: "USDT",
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

  it.skip("Avalanche", async () => {
    const accountAddress = "0x5E12fc70B97902AC19B9cB87F2aC5a8593769779";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      chainName: "Avalanche",
      inputToken: "WETH",
      inputAmount: "1",
      outputToken: "USDC",
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

  it.skip("Avalanche - outputAmount", async () => {
    const accountAddress = "0x5E12fc70B97902AC19B9cB87F2aC5a8593769779";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      chainName: "Avalanche",
      inputToken: "WETH",
      outputAmount: "1000",
      outputToken: "USDC",
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

  it("Base", async () => {
    const accountAddress = "0x20fe51a9229eef2cf8ad9e89d91cab9312cf3b7a";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      chainName: "Base",
      inputToken: "USDC",
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

  it("Base - outputAmount", async () => {
    const accountAddress = "0x20fe51a9229eef2cf8ad9e89d91cab9312cf3b7a";
    const res = await request(app).post(endpoint).send({
      accountAddress,
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

  it("Binance", async () => {
    const accountAddress = "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      chainName: "Binance",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(
      56,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  it("Binance - outputAmount", async () => {
    const accountAddress = "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      chainName: "Binance",
      inputToken: "USDC",
      outputAmount: "1",
      outputToken: "ETH",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(
      56,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  it("Ethereum", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const res = await request(app).post(endpoint).send({
      accountAddress,
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

  it("Ethereum - outputAmount", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      chainName: "Ethereum",
      inputToken: "USDC",
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

  it("Polygon", async () => {
    const accountAddress = "0xf89d7b9c864f589bbF53a82105107622B35EaA40";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      chainName: "Polygon",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "USDT",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(
      137,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  it("Polygon - outputAmount", async () => {
    const accountAddress = "0xf89d7b9c864f589bbF53a82105107622B35EaA40";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      chainName: "Polygon",
      inputToken: "USDC",
      outputToken: "USDT",
      outputAmount: "100",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(
      137,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  it.skip("Fantom", async () => {
    const accountAddress = "0xd30442bEEE8269bFb3829c401C62B38d2EA5BdB4";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      chainName: "Fantom",
      inputToken: "USDC",
      inputAmount: "100",
      outputToken: "FTM",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    // const success = await simulateTxs(
    //   250,
    //   res.body.transactions,
    //   accountAddress,
    // );
    // expect(success).toEqual(true);
  });

  it.skip("Fantom - outputAmount", async () => {
    const accountAddress = "0xd30442bEEE8269bFb3829c401C62B38d2EA5BdB4";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      chainName: "Fantom",
      inputToken: "USDC",
      outputAmount: "100",
      outputToken: "FTM",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    // const success = await simulateTxs(
    //   250,
    //   res.body.transactions,
    //   accountAddress,
    // );
    // expect(success).toEqual(true);
  });

  // unsupported
  it.skip("Linea", async () => {
    const accountAddress = "0x7787d7734fce536c72d1a37b8e922eaf09f35e92";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      chainName: "Linea",
      inputToken: "ETH",
      inputAmount: "0.9",
      outputToken: "USDC",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(
      59144,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  // unsupported
  it.skip("Linea - outputAmount", async () => {
    const accountAddress = "0x7787d7734fce536c72d1a37b8e922eaf09f35e92";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      chainName: "Linea",
      inputToken: "ETH",
      outputAmount: "100",
      outputToken: "USDC",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(
      59144,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  it("Optimism", async () => {
    const accountAddress = "0x1ab4973a48dc892cd9971ece8e01dcc7688f8f23";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      chainName: "Optimism",
      inputToken: "USDC",
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

  it("Optimism - outputAmount", async () => {
    const accountAddress = "0x1ab4973a48dc892cd9971ece8e01dcc7688f8f23";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      chainName: "Optimism",
      inputToken: "USDC",
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

  it("Blast", async () => {
    const accountAddress = "0xe7cbfb8c70d423202033ad4c51ce94ce9e21cfa2";
    const res = await request(app).post(endpoint).send({
      accountAddress,
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

  it("Blast - outputAmount", async () => {
    const accountAddress = "0xe7cbfb8c70d423202033ad4c51ce94ce9e21cfa2";
    const res = await request(app).post(endpoint).send({
      accountAddress,
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

  it("Mode", async () => {
    const accountAddress = "0x5EC6abfF9BB4c673f63D077a962A29945f744857";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      chainName: "Mode",
      inputToken: "ETH",
      inputAmount: "1",
      outputToken: "USDC",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(
      34443,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  it("Mode - outputAmount", async () => {
    const accountAddress = "0x5EC6abfF9BB4c673f63D077a962A29945f744857";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      chainName: "Mode",
      inputToken: "ETH",
      outputAmount: "1000",
      outputToken: "USDC",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(
      34443,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  it.skip("zkSync", async () => {
    const accountAddress = "0x1b72bac3772050fdcaf468cce7e20deb3cb02d89";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      chainName: "zkSync",
      inputToken: "ETH",
      inputAmount: "1",
      outputToken: "USDC",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const { vnetId, rpcUrl } = await createVnet(324);
    const provider = new RetryProvider(rpcUrl, 324);

    const success = await runTxsOnVnet(
      provider,
      accountAddress,
      res.body.transactions,
      { chainId: 324, vnetId, action: "swap" },
    );
    expect(success).toEqual(true);
  }, 400000);

  it.skip("zkSync - outputAmount", async () => {
    const accountAddress = "0x1b72bac3772050fdcaf468cce7e20deb3cb02d89";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      chainName: "zkSync",
      inputToken: "ETH",
      outputAmount: "1000",
      outputToken: "USDC",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const { vnetId, rpcUrl } = await createVnet(324);
    const provider = new RetryProvider(rpcUrl, 324);

    const success = await runTxsOnVnet(
      provider,
      accountAddress,
      res.body.transactions,
      { chainId: 324, vnetId, action: "swap" },
    );
    expect(success).toEqual(true);
  }, 400000);
});
