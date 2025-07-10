import request from "supertest";
import app from "../../../app.js";
import {
  getUnsupportedPoolError,
  getUnsupportedProtocolError,
} from "../../../utils/error.js";

const endpoint = `/simulate?secret=${process.env.BACKEND_TOKEN_SECRET}`;

describe("Test Simulation", () => {
  it("Simulate - Bridge and transfer", async () => {
    const res = await request(app)
      .post(endpoint)
      .send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        actions: [
          {
            name: "bridge",
            args: {
              sourceChainName: "Ethereum",
              destinationChainName: "Arbitrum",
              token: "USDC",
              amount: "10000",
            },
          },
          {
            name: "transfer",
            args: {
              token: "USDC",
              amount: "",
              recipient: "0x42310121982db7fa65552aE797016aB63b430292",
              chainName: "Arbitrum",
            },
          },
        ],
        conditions: [],
        blocknumber: 18813100,
      });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("actions");
  });

  it("Simulate - Bridge ETH from Arbitrum to Base and buy TOSHI", async () => {
    const res = await request(app)
      .post(endpoint)
      .send({
        accountAddress: "0x35d2085239e04e9b0bd5082f28044170ac6fbdad",
        actions: [
          {
            name: "bridge",
            args: {
              amount: "0.01",
              token: "eth",
              sourceChainName: "arbitrum",
              destinationChainName: "base",
            },
          },
          {
            name: "swap",
            args: {
              inputAmount: "outputAmount",
              inputToken: "outputToken",
              outputToken: "toshi",
              chainName: "base",
            },
          },
        ],
        conditions: [],
        blocknumber: {
          1: 162261400,
          8453: 8404000,
        },
      });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("actions");
  });

  it("Simulate - Bridge ETH from Arbitrum to Base and buy USDC", async () => {
    const res = await request(app)
      .post(endpoint)
      .send({
        accountAddress: "0x35d2085239e04e9b0bd5082f28044170ac6fbdad",
        actions: [
          {
            name: "bridge",
            args: {
              amount: "0.069",
              token: "eth",
              sourceChainName: "arbitrum",
              destinationChainName: "base",
            },
          },
          {
            name: "swap",
            args: {
              inputAmount: "outputAmount",
              inputToken: "outputToken",
              outputToken: "usdc",
              chainName: "base",
            },
          },
        ],
        conditions: [],
        blocknumber: {
          1: 162261400,
          8453: 8404000,
        },
      });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("actions");
  });

  it("Simulate - Bridge all tokens and transfer", async () => {
    const res = await request(app)
      .post(endpoint)
      .send({
        accountAddress: "0xbe2f0354d970265bfc36d383af77f72736b81b54",
        actions: [
          {
            name: "bridge",
            args: {
              sourceChainName: "Ethereum",
              destinationChainName: "Arbitrum",
              token: "all",
            },
          },
          {
            name: "transfer",
            args: {
              token: "USDC",
              amount: "",
              recipient: "0x42310121982db7fa65552aE797016aB63b430292",
              chainName: "Arbitrum",
            },
          },
        ],
        conditions: [],
        blocknumber: 18813100,
      });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("actions");
  }, 1000000);

  it("Simulate - Get associated protocol", async () => {
    const res = await request(app)
      .post(endpoint)
      .send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        actions: [
          {
            name: "deposit",
            args: {
              chainName: "Ethereum",
              token: "USDT",
              amount: "100",
              protocolName: "aUSDT",
            },
          },
        ],
        conditions: [],
        blocknumber: 18813100,
      });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("actions");
    expect(res.body.actions[0].args.protocolName).toEqual("aave");
  });

  it("Simulate - Fail to get associated protocol", async () => {
    const res = await request(app)
      .post(endpoint)
      .send({
        accountAddress: "0xbe2f0354d970265bfc36d383af77f72736b81b54",
        actions: [
          {
            name: "deposit",
            args: {
              chainName: "Ethereum",
              token: "USDT",
              amount: "10000",
              protocolName: "abc",
            },
          },
        ],
        conditions: [],
        blocknumber: 18813100,
      });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      getUnsupportedProtocolError("abc", "deposit"),
    );
  });

  it("Simulate - Pool is supported", async () => {
    const res = await request(app)
      .post(endpoint)
      .send({
        accountAddress: "0xbe2f0354d970265bfc36d383af77f72736b81b54",
        actions: [
          {
            name: "deposit",
            args: {
              chainName: "Ethereum",
              protocolName: "curve",
              poolName: "3pool",
              amount: "10",
              token: "usdc",
            },
          },
        ],
        conditions: [],
        blocknumber: 18813100,
      });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("actions");
    expect(res.body.actions[0].args.protocolName).toEqual("curve");
    expect(res.body.actions[0].args.poolName).toEqual("3pool");
  });

  it("Simulate - No pools are supported on chain", async () => {
    const res = await request(app)
      .post(endpoint)
      .send({
        accountAddress: "0xbe2f0354d970265bfc36d383af77f72736b81b54",
        actions: [
          {
            name: "deposit",
            args: {
              chainName: "zkSync",
              protocolName: "all",
              poolName: "3pool",
              amount: "10",
              token: "usdc",
            },
          },
        ],
        conditions: [],
        blocknumber: 18813100,
      });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "Failed to simulate due to issue with vnet initialization, please try again.",
    );
  });

  it("Simulate - No pools are supported for protocol", async () => {
    const res = await request(app)
      .post(endpoint)
      .send({
        accountAddress: "0xbe2f0354d970265bfc36d383af77f72736b81b54",
        actions: [
          {
            name: "deposit",
            args: {
              chainName: "Ethereum",
              protocolName: "aave",
              poolName: "3pool",
              amount: "10",
              token: "usdc",
            },
          },
        ],
        conditions: [],
        blocknumber: 18813100,
      });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "No pools are supported for protocol aave. Please specify protocol name correctly and try again.",
    );
  });

  it("Simulate - No pools are supported for protocol on chain", async () => {
    const res = await request(app)
      .post(endpoint)
      .send({
        accountAddress: "0xbe2f0354d970265bfc36d383af77f72736b81b54",
        actions: [
          {
            name: "deposit",
            args: {
              chainName: "zkSync",
              protocolName: "curve",
              poolName: "3pool",
              amount: "10",
              token: "usdc",
            },
          },
        ],
        conditions: [],
        blocknumber: 18813100,
      });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "Failed to simulate due to issue with vnet initialization, please try again.",
    );
  });

  it("Simulate - Pool is not supported for protocol on chain", async () => {
    const res = await request(app)
      .post(endpoint)
      .send({
        accountAddress: "0xbe2f0354d970265bfc36d383af77f72736b81b54",
        actions: [
          {
            name: "deposit",
            args: {
              chainName: "Ethereum",
              protocolName: "curve",
              poolName: "abc",
              amount: "10",
              token: "usdc",
            },
          },
        ],
        conditions: [],
        blocknumber: 18813100,
      });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      getUnsupportedPoolError("ethereum", "curve", "abc"),
    );
  });

  it("Simulate - Missing Account Address", async () => {
    const res = await request(app)
      .post(endpoint)
      .send({
        actions: [
          {
            name: "bridge",
            args: {
              sourceChainName: "Ethereum",
              destinationChainName: "Arbitrum",
              token: "USDC",
              amount: "10000",
            },
          },
          {
            name: "transfer",
            args: {
              token: "USDC",
              amount: "",
              recipient: "0x42310121982db7fa65552aE797016aB63b430292",
              chainName: "Arbitrum",
            },
          },
        ],
        conditions: [],
        blocknumber: 18813100,
      });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toContain("Account address is required");
  });

  it("Simulate - Missing Actions", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      conditions: [],
      blocknumber: 18813100,
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toContain(
      "At least one action is required for simulation.",
    );
  });

  it("Simulate - Invalid Action Format", async () => {
    const res = await request(app)
      .post(endpoint)
      .send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        actions: [
          {
            invalidKey: "bridge", // Using an invalid action key
            args: {
              sourceChainName: "Ethereum",
              destinationChainName: "Arbitrum",
              token: "USDC",
              amount: "10000",
            },
          },
        ],
        conditions: [],
        blocknumber: 18813100,
      });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toContain(
      "Action name is required for simulation.",
    );
  });
});
