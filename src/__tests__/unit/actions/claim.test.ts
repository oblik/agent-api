import request from "supertest";
import app from "../../../app.js";
import {
  getChainError,
  getUnsupportedPoolError,
  getUnsupportedProtocolError,
} from "../../../utils/error.js";
import { RetryProvider } from "../../../utils/retryProvider.js";
import { createVnet, runTxsOnVnet, simulateTxs } from "../../helper.js";

const endpoint = `/claim?secret=${process.env.BACKEND_TOKEN_SECRET}`;

jest.retryTimes(1);

describe.skip("Claim", () => {
  beforeEach(() => {
    console.log(expect.getState().currentTestName);
  });

  describe.skip("Camelot", () => {
    it("Successful Claim", async () => {
      const accountAddress = "0x823b6b8da270906f0a231223e46edb5bdea3ff13";

      const { rpcUrl } = await createVnet(42161, 220421127);
      const provider = new RetryProvider(rpcUrl, 42161);

      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Camelot",
        chainName: "Arbitrum",
        poolName: null,
        token: "Dream Machine Token",
      });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await runTxsOnVnet(
        provider,
        accountAddress,
        res.body.transactions,
      );

      expect(success).toEqual(true);
    });

    it("Successful Claim All", async () => {
      const accountAddress = "0x823b6b8da270906f0a231223e46edb5bdea3ff13";

      const { rpcUrl } = await createVnet(42161, 220421127);
      const provider = new RetryProvider(rpcUrl, 42161);

      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Camelot",
        chainName: "Arbitrum",
        poolName: null,
      });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await runTxsOnVnet(
        provider,
        accountAddress,
        res.body.transactions,
      );

      expect(success).toEqual(true);
    });

    it("Invalid distributed token", async () => {
      const accountAddress = "0x823b6b8da270906f0a231223e46edb5bdea3ff13";

      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Camelot",
        chainName: "Arbitrum",
        poolName: null,
        token: "USDT",
      });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual("Token is not distributed token.");
    });

    it("Insufficient pending dividends amount", async () => {
      const accountAddress = "0x0000000000000000000000000000000000000000";

      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Camelot",
        chainName: "Arbitrum",
        poolName: null,
        token: "Dream Machine Token",
      });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual("Pending dividends amount is zero.");
    });
  });

  describe.skip("Dolomite", () => {
    it.skip("jUSDC pool", async () => {
      const accountAddress = "0xa5165efec8cfb91f5cf717029cb430d3121c2c8a";

      const { rpcUrl } = await createVnet(42161);
      const provider = new RetryProvider(rpcUrl, 42161);

      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Dolomite",
        chainName: "Arbitrum",
        poolName: null,
        token: "jUSDC",
        amount: "1",
      });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");

      const success = await runTxsOnVnet(
        provider,
        accountAddress,
        res.body.transactions,
      );

      expect(success).toEqual(true);
    });

    it("No position", async () => {
      const accountAddress = "0x8Fec806c9e94ff7AB2AF3D7e4875c2381413f98E";
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Dolomite",
        chainName: "Arbitrum",
        poolName: null,
        token: "jUSDC",
        amount: "80",
      });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        "Claiming from Dolomite is not supported with token jusdc. Available tokens to claim are GLP and GMX.",
      );
    });
  });

  it("Compound - Successful Claim", async () => {
    const accountAddress = "0x6Abd15c7823DD9BFF13093F2fE708eC96d92c423";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Compound",
      chainName: "Ethereum",
      poolName: "usdc",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(1);

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it.skip("Bladeswap - Successful Claim", async () => {
    const accountAddress = "0x6Abd15c7823DD9BFF13093F2fE708eC96d92c423";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "bladeswap",
      chainName: "blast",
      poolName: "blade-eth",
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
    // const { rpcUrl } = await createVnet(81457);
    // const provider = new RetryProvider(rpcUrl, 81457);

    // await increaseTokenBalance(rpcUrl, accountAddress, "Blast", "ETH", "1");

    // const success = await runTxsOnVnet(
    //   provider,
    //   accountAddress,
    //   res.body.transactions,
    // );

    // expect(success).toEqual(true);
  });

  it("Hop - Successful Claim", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Hop",
      chainName: "Optimism",
      poolName: "usdc",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions.length).toBeGreaterThan(0);

    const success = await simulateTxs(
      10,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  it.skip("Lodestar - Successful Claim", async () => {
    const accountAddress = "0x4De4C133D82f85660090A9330915bD84e03E249B";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Lodestar",
      chainName: "Arbitrum",
      poolName: null,
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(1);

    const success = await simulateTxs(
      42161,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  it("Plutus - Successful Claim", async () => {
    const accountAddress = "0x59b26c23dc0675866d9a23c9b4c83e5b500ef37b";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Plutus",
      chainName: "Arbitrum",
      poolName: null,
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(2);

    const success = await simulateTxs(
      42161,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  it.skip("Stargate - Successful Claim", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Stargate",
      chainName: "Ethereum",
      poolName: "USDT",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(1);

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it.skip("Velodrome - Successful Claim", async () => {
    const { rpcUrl } = await createVnet(10);
    const provider = new RetryProvider(rpcUrl, 10);
    const accountAddress = "0x73BDF6e4381a92cb48F48E2143E28047Ba72A998";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Velodrome",
      chainName: "Optimism",
      poolName: null,
      rpc: rpcUrl,
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(1);

    const success = await runTxsOnVnet(
      provider,
      accountAddress,
      res.body.transactions,
    );
    expect(success).toEqual(true);
  });

  it.skip("Aerodrome - Successful Claim", async () => {
    const { rpcUrl } = await createVnet(8453);
    const provider = new RetryProvider(rpcUrl, 8453);
    const accountAddress = "0xfce4fb3c6fb3be0f468baaf3ab3d77de800ef107";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Aerodrome",
      chainName: "Base",
      poolName: null,
      rpc: rpcUrl,
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(1);

    const success = await runTxsOnVnet(
      provider,
      accountAddress,
      res.body.transactions,
    );
    expect(success).toEqual(true);
  });

  it("Ether.fi", async () => {
    const accountAddress = "0x4B7D801E954C1A529A3813Cc21410d093A332AeC";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Etherfi",
      chainName: "Ethereum",
      token: "ETH",
      amount: "5",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(1);

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Invalid Protocol - Should return 400", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "InvalidProtocol",
      chainName: "Ethereum",
      poolName: null,
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      getUnsupportedProtocolError("invalidprotocol", "claim"),
    );
  });

  it("Missing Required Field - Should return 400", async () => {
    const res = await request(app).post(endpoint).send({
      // Missing required 'chainName' field
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Hop",
      poolName: "usdc",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(getChainError("undefined"));
  });

  it("Invalid Pool Name - Should return 400", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Hop",
      chainName: "Optimism",
      poolName: "InvalidPool",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      getUnsupportedPoolError("Optimism", "hop", "invalidpool"),
    );
  });
});
