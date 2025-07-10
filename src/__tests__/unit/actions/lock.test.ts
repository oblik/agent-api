import request from "supertest";
import app from "../../../app.js";
import { initModels } from "../../../db/index.js";
import { getChainError } from "../../../utils/error.js";
import { RetryProvider } from "../../../utils/retryProvider.js";
import {
  createVnet,
  getTopHolder,
  increaseTokenBalance,
  runTxsOnVnet,
  simulateTxs,
} from "../../helper.js";

const endpoint = `/lock?secret=${process.env.BACKEND_TOKEN_SECRET}`;

jest.retryTimes(1);

describe("Lock", () => {
  beforeEach(async () => {
    await initModels();
    console.log(expect.getState().currentTestName);
  });

  it("Pendle - Pendle", async () => {
    const accountAddress = await getTopHolder("pendle", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Pendle",
      chainName: "Ethereum",
      token: "PENDLE",
      amount: "100",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(2);

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Pendle - ETH", async () => {
    const accountAddress = await getTopHolder("eth", 1);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Pendle",
      chainName: "Ethereum",
      token: "ETH",
      amount: "2",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual("Token eth is not supported");
  });

  it("Plutus", async () => {
    const accountAddress = await getTopHolder("pls", 42161);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Plutus",
      chainName: "Arbitrum",
      token: "PLS",
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

  it.skip("Bladeswap", async () => {
    const accountAddress = "0xbbe98d590d7eb99f4a236587f2441826396053d3";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "bladeswap",
      chainName: "blast",
      poolName: "blade-veblade",
      amount: "100",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const { rpcUrl } = await createVnet(81457);
    const provider = new RetryProvider(rpcUrl, 81457);

    await increaseTokenBalance(
      rpcUrl,
      accountAddress,
      "Blast",
      "BLADE",
      "100",
      {
        symbol: "BLADE",
        address: "0xD1FedD031b92f50a50c05E2C45aF1aDb4CEa82f4",
        decimals: 18,
      },
    );

    await increaseTokenBalance(rpcUrl, accountAddress, "Blast", "ETH", "1");

    const success = await runTxsOnVnet(
      provider,
      accountAddress,
      res.body.transactions,
    );

    expect(success).toEqual(true);
  });

  // unsupported
  it.skip("Thena", async () => {
    const accountAddress = await getTopHolder("the", 56);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Thena",
      chainName: "BinanceSmartChain",
      token: "THE",
      amount: "100",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(2);

    const success = await simulateTxs(
      56,
      res.body.transactions,
      accountAddress,
      35204668,
    );
    expect(success).toEqual(true);
  });

  it("Velodrome", async () => {
    const accountAddress = await getTopHolder("velo", 10);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Velodrome",
      chainName: "Optimism",
      token: "VELO",
      amount: "100",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(2);

    const success = await simulateTxs(
      10,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  it("Aerodrome", async () => {
    const accountAddress = await getTopHolder("aero", 8453);
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Aerodrome",
      chainName: "Base",
      token: "AERO",
      amount: "100",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(2);

    const success = await simulateTxs(
      8453,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  it("Plutus - Unsupported Chain Error", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xbbe98d590d7eb99f4a236587f2441826396053d3",
      protocolName: "Plutus",
      chainName: "InvalidChain",
      token: "PLS",
      amount: "100",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(getChainError("InvalidChain"));
  });

  // unsupported
  it.skip("Thena - Zero Amount Error", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xc97CB8E312dd1b933fcD9Ed7a4a3c4D5f9470551",
      protocolName: "Thena",
      chainName: "BinanceSmartChain",
      token: "THE",
      amount: "0", // Assume locking zero amount
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "The amount being used is zero, ensure you have funds on your Slate account",
    );
  });

  it("Pendle - Negative Amount Error", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xbbe98d590d7eb99f4a236587f2441826396053d3",
      protocolName: "Pendle",
      chainName: "Ethereum",
      token: "PENDLE",
      amount: "-100", // Assume locking a negative amount
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "-100 is an invalid amount. Please specify an amount correctly and try again.",
    );
  });

  it("Plutus - Insufficient Balance Error", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xbbe98d590d7eb99f4a236587f2441826396053d3",
      protocolName: "Plutus",
      chainName: "Arbitrum",
      token: "PLS",
      amount: "100000000", // Assume the account has insufficient balance
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(3);

    const success = await simulateTxs(
      42161,
      res.body.transactions,
      "0xe5b081F4112E8bEC5596B506EFEf6abCa1Af40fB",
    );
    expect(success).toEqual(false);
  });
});
