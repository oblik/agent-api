import request from "supertest";
import app from "../../../app.js";
import { RetryProvider } from "../../../utils/retryProvider.js";
import { createVnet, runTxsOnVnet, simulateTxs } from "../../helper.js";

const endpoint = `/bridge?secret=${process.env.BACKEND_TOKEN_SECRET}`;

jest.retryTimes(1);

describe("Bridge", () => {
  beforeEach(() => {
    console.log(expect.getState().currentTestName);
  });

  it("Ethereum -> Avalanche", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      sourceChainName: "Ethereum",
      destinationChainName: "Avalanche",
      token: "USDC",
      amount: "50",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it.skip("Avalanche -> Ethereum", async () => {
    const accountAddress = "0x5E12fc70B97902AC19B9cB87F2aC5a8593769779";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      sourceChainName: "Avalanche",
      destinationChainName: "Ethereum",
      token: "USDC",
      amount: "50",
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

  it("Ethereum -> Polygon", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      sourceChainName: "Ethereum",
      destinationChainName: "Polygon",
      token: "DAI",
      amount: "100",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Polygon -> Ethereum", async () => {
    const accountAddress = "0xf89d7b9c864f589bbF53a82105107622B35EaA40";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      sourceChainName: "Polygon",
      destinationChainName: "Ethereum",
      token: "USDT",
      amount: "100",
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

  it("Arbitrum -> Optimism", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      sourceChainName: "Arbitrum",
      destinationChainName: "Optimism",
      token: "USDT",
      amount: "50",
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

  it("Optimism -> Arbitrum", async () => {
    const accountAddress = "0x1ab4973a48dc892cd9971ece8e01dcc7688f8f23";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      sourceChainName: "Optimism",
      destinationChainName: "Arbitrum",
      token: "USDC",
      amount: "50",
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

  // unsupported
  it.skip("Linea -> Binance", async () => {
    const accountAddress = "0x3f3646528efcd96849823ec0652ad7e4c1fff812";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      sourceChainName: "Linea",
      destinationChainName: "Binance",
      token: "USDC",
      amount: "10",
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
  it.skip("Binance -> Linea", async () => {
    const accountAddress = "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      sourceChainName: "Binance",
      destinationChainName: "Linea",
      token: "USDC",
      amount: "50",
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

  it.skip("Fantom -> Arbitrum", async () => {
    const accountAddress = "0x801a55c9755a638A5770252541d14808D0E79D5E";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      sourceChainName: "Fantom",
      destinationChainName: "Arbitrum",
      token: "USDC",
      amount: "100",
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

  it.skip("Arbitrum -> Fantom", async () => {
    const accountAddress = "0x319f9b7415659a96c1648dd6a2ebdb31cc076fcb";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      sourceChainName: "Arbitrum",
      destinationChainName: "Fantom",
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
    );
    expect(success).toEqual(true);
  });

  it("Base -> Ethereum", async () => {
    const accountAddress = "0xaac391f166f33CdaEfaa4AfA6616A3BEA66B694d";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      sourceChainName: "Base",
      destinationChainName: "Ethereum",
      token: "USDC",
      amount: "50",
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

  it("Ethereum -> Base", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      sourceChainName: "Ethereum",
      destinationChainName: "Base",
      token: "USDC",
      amount: "50",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Base -> Arbitrum", async () => {
    const accountAddress = "0x20fe51a9229eef2cf8ad9e89d91cab9312cf3b7a";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      sourceChainName: "Base",
      destinationChainName: "Arbitrum",
      token: "USDC",
      amount: "50",
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

  it("Ethereum -> Blast", async () => {
    const accountAddress = "0x8eb8a3b98659cce290402893d0123abb75e3ab28";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      sourceChainName: "Ethereum",
      destinationChainName: "Blast",
      token: "WETH",
      amount: "1",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Blast -> Ethereum", async () => {
    const accountAddress = "0x50664ede715e131f584d3e7eaabd7818bb20a068";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      sourceChainName: "Blast",
      destinationChainName: "Ethereum",
      token: "ETH",
      amount: "0.4",
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

  it("Base -> Blast", async () => {
    const accountAddress = "0xbdc4a35a64379be0755afff23c559f7eb111147b";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      sourceChainName: "Base",
      destinationChainName: "Blast",
      token: "WETH",
      amount: "10",
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

  it("Blast -> Base", async () => {
    const accountAddress = "0x50664ede715e131f584d3e7eaabd7818bb20a068";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      sourceChainName: "Blast",
      destinationChainName: "Base",
      token: "ETH",
      amount: "0.4",
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

  it("Ethereum -> Mode", async () => {
    const accountAddress = "0x8eb8a3b98659cce290402893d0123abb75e3ab28";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      sourceChainName: "Ethereum",
      destinationChainName: "Mode",
      token: "WETH",
      amount: "1",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Mode -> Ethereum", async () => {
    const accountAddress = "0x5EC6abfF9BB4c673f63D077a962A29945f744857";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      sourceChainName: "Mode",
      destinationChainName: "Ethereum",
      token: "WETH",
      amount: "0.01",
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

  it("Base -> Mode", async () => {
    const accountAddress = "0x4bb7f4c3d47c4b431cb0658f44287d52006fb506";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      sourceChainName: "Base",
      destinationChainName: "Mode",
      token: "ETH",
      amount: "0.2",
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

  it("Mode -> Base", async () => {
    const accountAddress = "0x5EC6abfF9BB4c673f63D077a962A29945f744857";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      sourceChainName: "Mode",
      destinationChainName: "Base",
      token: "WETH",
      amount: "0.01",
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

  it("Ethereum -> zkSync", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      sourceChainName: "Ethereum",
      destinationChainName: "zkSync",
      token: "ETH",
      amount: "2",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  }, 400000);

  it.skip("zkSync -> Ethereum", async () => {
    const accountAddress = "0x1b72bac3772050fdcaf468cce7e20deb3cb02d89";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      sourceChainName: "zkSync",
      destinationChainName: "Ethereum",
      token: "ETH",
      amount: "2",
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
