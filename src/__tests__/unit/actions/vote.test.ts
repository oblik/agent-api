import request from "supertest";
import app from "../../../app.js";
import { RetryProvider } from "../../../utils/retryProvider.js";
import {
  createVnet,
  increaseTokenBalance,
  runTxsOnVnet,
} from "../../helper.js";

const endpoint = `/vote?secret=${process.env.BACKEND_TOKEN_SECRET}`;
jest.retryTimes(3);
describe("Vote", () => {
  it.skip("Pendle", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Pendle",
      chainName: "Ethereum",
      poolName: null,
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(1);
  });

  it.skip("Thena", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Thena",
      chainName: "BinanceSmartChain",
      poolName: null,
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(1);
  });

  it.skip("Bladeswap", async () => {
    const accountAddress = "0x58cCd9d9F461FC2D821CbaB2E631A348f52dc795";
    const res = await request(app).post(endpoint).send({
      protocolName: "bladeswap",
      chainName: "blast",
      poolName: "blade-eth",
      amount: "200",
      accountAddress: "0x58cCd9d9F461FC2D821CbaB2E631A348f52dc795",
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
      "200",
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

    expect(success).toEqual(true);
  });

  it.skip("Vote with missing parameters", async () => {
    const res = await request(app).post(endpoint).send({
      // Missing required parameters
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
  });

  it.skip("Vote on unsupported protocol", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      // Unsupported protocol
      protocolName: "InvalidProtocol",
      chainName: "BinanceSmartChain",
      poolName: null,
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
  });

  it.skip("Vote with invalid account address", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "invalidAddress",
      protocolName: "Pendle",
      chainName: "Ethereum",
      poolName: null,
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
  });

  it.skip("Vote with invalid chain name", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Thena",
      // Invalid chain name
      chainName: "InvalidChain",
      poolName: null,
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
  });

  it.skip("Vote with invalid pool name", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Pendle",
      chainName: "Ethereum",
      // Invalid pool name
      poolName: "InvalidPool",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
  });

  it.skip("Vote with empty protocol name", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      // Empty protocol name
      protocolName: "",
      chainName: "Ethereum",
      poolName: null,
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
  });
});
