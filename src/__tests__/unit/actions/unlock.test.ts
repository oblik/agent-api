import request from "supertest";
import app from "../../../app.js";
import { RetryProvider } from "../../../utils/retryProvider.js";
import {
  createVnet,
  increaseTime,
  increaseTokenBalance,
  runTxsOnVnet,
} from "../../helper.js";

const lockEndpoint = `/lock?secret=${process.env.BACKEND_TOKEN_SECRET}`;
const unlockEndpoint = `/unlock?secret=${process.env.BACKEND_TOKEN_SECRET}`;

jest.retryTimes(1);

describe("Unlock", () => {
  it("Pendle", async () => {
    const { rpcUrl } = await createVnet(1);
    const provider = new RetryProvider(rpcUrl, 1);

    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const lockRes = await request(app).post(lockEndpoint).send({
      accountAddress,
      protocolName: "Pendle",
      chainName: "Ethereum",
      token: "PENDLE",
      amount: "100",
    });

    let success = await runTxsOnVnet(
      provider,
      accountAddress,
      lockRes.body.transactions,
    );
    expect(success).toEqual(true);

    const res = await request(app).post(unlockEndpoint).send({
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
    expect(res.body.transactions).toHaveLength(1);

    await increaseTime(provider, 3600 * 24 * 365 * 4); // advance 4 years

    success = await runTxsOnVnet(
      provider,
      accountAddress,
      res.body.transactions,
    );
    expect(success).toEqual(true);
  });

  it("Plutus", async () => {
    const { rpcUrl } = await createVnet(42161);
    const provider = new RetryProvider(rpcUrl, 42161);

    const accountAddress = "0xbbe98d590d7eb99f4a236587f2441826396053d3";
    const lockRes = await request(app).post(lockEndpoint).send({
      accountAddress,
      protocolName: "Plutus",
      chainName: "Arbitrum",
      token: "PLS",
      amount: "100",
    });

    let success = await runTxsOnVnet(
      provider,
      accountAddress,
      lockRes.body.transactions,
    );
    expect(success).toEqual(true);

    const res = await request(app).post(unlockEndpoint).send({
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
    expect(res.body.transactions).toHaveLength(1);

    await increaseTime(provider, 3600 * 24 * 150); // advance 150 days

    success = await runTxsOnVnet(
      provider,
      accountAddress,
      res.body.transactions,
    );
    expect(success).toEqual(true);
  });

  // unsupported
  it.skip("Thena", async () => {
    const { rpcUrl } = await createVnet(56, 36745812);
    const provider = new RetryProvider(rpcUrl, 56);

    const accountAddress = "0x0DC608d5a929ef20c2f988dE5f88D44C433abFD3";
    const res = await request(app).post(unlockEndpoint).send({
      accountAddress,
      protocolName: "Thena",
      chainName: "BinanceSmartChain",
      token: "THE",
      amount: "100",
      rpc: rpcUrl,
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(1);

    await increaseTime(provider, 3600 * 24 * 365 * 4); // advance 4 years

    const success = await runTxsOnVnet(
      provider,
      accountAddress,
      res.body.transactions,
    );
    expect(success).toEqual(true);
  });

  it.skip("Velodrome", async () => {
    const { rpcUrl } = await createVnet(10, 116200384);
    const provider = new RetryProvider(rpcUrl, 10);

    const accountAddress = "0xe3a5957a0503f5b9026f39cb8714e0df6c137d3d";
    const res = await request(app).post(unlockEndpoint).send({
      accountAddress,
      protocolName: "Velodrome",
      chainName: "Optimism",
      token: "Velo",
      amount: "10",
      rpc: rpcUrl,
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(2);

    const success = await runTxsOnVnet(
      provider,
      accountAddress,
      res.body.transactions,
    );
    expect(success).toEqual(true);
  });

  it.skip("Bladeswap unlock 100 veBLADE", async () => {
    const accountAddress = "0x58cCd9d9F461FC2D821CbaB2E631A348f52dc795";

    const res = await request(app).post(unlockEndpoint).send({
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
      "veBLADE",
      "100",
      {
        symbol: "veBLADE",
        address: "0xF8f2ab7C84CDB6CCaF1F699eB54Ba30C36B95d85",
        decimals: 18,
      },
    );

    await increaseTokenBalance(rpcUrl, accountAddress, "Blast", "ETH", "1");

    const success = await runTxsOnVnet(
      provider,
      accountAddress,
      res.body.transactions,
    );

    expect(success).toEqual(false);
  });

  it.skip("Aerodrome", async () => {
    const { rpcUrl } = await createVnet(8453, 10895258);
    const provider = new RetryProvider(rpcUrl, 8453);

    const accountAddress = "0x52e7633279802211ba4c2cef1ef0f3129fe596b1";
    const res = await request(app).post(unlockEndpoint).send({
      accountAddress,
      protocolName: "Aerodrome",
      chainName: "Base",
      token: "Aero",
      amount: "10",
      rpc: rpcUrl,
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(2);

    const success = await runTxsOnVnet(
      provider,
      accountAddress,
      res.body.transactions,
    );
    expect(success).toEqual(true);
  });

  it("Unlock on unsupported protocol", async () => {
    const res = await request(app).post(unlockEndpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      // Unsupported protocol
      protocolName: "InvalidProtocol",
      chainName: "BinanceSmartChain",
      token: "USDT",
      amount: "100",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
  });

  it("Unlock with missing parameters", async () => {
    const res = await request(app).post(unlockEndpoint).send({
      // Missing required parameters
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
  });
});
