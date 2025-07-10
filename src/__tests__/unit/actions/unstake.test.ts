import request from "supertest";
import app from "../../../app.js";
import strategies from "../../../config/eigenlayer/strategies.js";
import { RetryProvider } from "../../../utils/retryProvider.js";
import type { JSONObject } from "../../../utils/types.js";
import {
  createVnet,
  increaseTime,
  runTxsOnVnet,
  simulateTxs,
} from "../../helper.js";

const stakeEndpoint = `/stake?secret=${process.env.BACKEND_TOKEN_SECRET}`;
const unstakeEndpoint = `/unstake?secret=${process.env.BACKEND_TOKEN_SECRET}`;

jest.retryTimes(1);

describe("Unstake", () => {
  beforeEach(() => {
    console.log(expect.getState().currentTestName);
  });

  // unsupported
  it.skip("GMX", async () => {
    const accountAddress = "0xb38e8c17e38363af6ebdcb3dae12e0243582891d";
    const stakeRes = await request(app).post(stakeEndpoint).send({
      accountAddress,
      protocolName: "GMX",
      chainName: "Arbitrum",
      token: "GMX",
      amount: "100",
    });
    const res = await request(app).post(unstakeEndpoint).send({
      accountAddress,
      protocolName: "GMX",
      chainName: "Arbitrum",
      token: "GMX",
      amount: "100",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(1);

    const success = await simulateTxs(
      42161,
      [...stakeRes.body.transactions, ...res.body.transactions],
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  it.skip("Lodestar", async () => {
    const { rpcUrl } = await createVnet(42161, 179435700);
    const provider = new RetryProvider(rpcUrl, 42161);

    const accountAddress = "0xc27e87cfe1fd2Ed6F43DFfFBb9E9e46428497a24";
    const stakeRes = await request(app).post(stakeEndpoint).send({
      accountAddress,
      protocolName: "Lodestar",
      chainName: "Arbitrum",
      token: "LODE",
      amount: "100",
    });

    let success = await runTxsOnVnet(
      provider,
      accountAddress,
      stakeRes.body.transactions,
    );
    expect(success).toEqual(true);

    const res = await request(app).post(unstakeEndpoint).send({
      accountAddress,
      protocolName: "Lodestar",
      chainName: "Arbitrum",
      token: "LODE",
      amount: "20",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(1);

    await increaseTime(provider, 3600 * 24 * 200);

    success = await runTxsOnVnet(
      provider,
      accountAddress,
      res.body.transactions,
    );
    expect(success).toEqual(true);
  });

  it("Plutus", async () => {
    const accountAddress = "0x9e3ed152c07189086af3f8bed6e10a0b5e6b5dcf";
    const stakeRes = await request(app).post(stakeEndpoint).send({
      accountAddress,
      protocolName: "Plutus",
      chainName: "Arbitrum",
      token: "esPLS",
      amount: "100",
    });

    const res = await request(app).post(unstakeEndpoint).send({
      accountAddress,
      protocolName: "Plutus",
      chainName: "Arbitrum",
      token: "esPLS",
      amount: "100",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(1);

    const success = await simulateTxs(
      42161,
      [...stakeRes.body.transactions, ...res.body.transactions],
      accountAddress,
      178655210,
    );
    expect(success).toEqual(true);
  });

  it("Kwenta", async () => {
    const { rpcUrl } = await createVnet(10);
    const provider = new RetryProvider(rpcUrl, 10);

    const accountAddress = "0xDF90C9B995a3b10A5b8570a47101e6c6a29eb945";
    const stakeRes = await request(app).post(stakeEndpoint).send({
      accountAddress,
      protocolName: "Kwenta",
      chainName: "Optimism",
      token: "Kwenta",
      amount: "100",
    });

    let success = await runTxsOnVnet(
      provider,
      accountAddress,
      stakeRes.body.transactions,
    );
    expect(success).toEqual(true);

    const res = await request(app).post(unstakeEndpoint).send({
      accountAddress,
      protocolName: "Kwenta",
      chainName: "Optimism",
      token: "Kwenta",
      amount: "100",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(1);

    await increaseTime(provider, 3600 * 24 * 20);

    success = await runTxsOnVnet(
      provider,
      accountAddress,
      res.body.transactions,
    );
    expect(success).toEqual(true);
  });

  it("Ethena", async () => {
    const accountAddress = "0x3F843189280A4379EB12B928afD5D96Df8076679";
    const res = await request(app).post(unstakeEndpoint).send({
      accountAddress,
      protocolName: "Ethena",
      chainName: "Ethereum",
      amount: "100",
      poolName: null,
      token: "sUSDe",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const { rpcUrl } = await createVnet(1);
    const provider = new RetryProvider(rpcUrl, 1);
    const success = await runTxsOnVnet(
      provider,
      accountAddress,
      res.body.transactions,
    );
    expect(success).toEqual(true);
  });

  it("Ethena, replace unsupported token", async () => {
    const accountAddress = "0x1c00881a4b935D58E769e7c85F5924B8175D1526";
    const res = await request(app).post(unstakeEndpoint).send({
      accountAddress,
      protocolName: "Ethena",
      chainName: "Ethereum",
      poolName: null,
      token: "USDC",
      amount: "100",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(1);
  });

  it("Ethena, unsupported chain failure", async () => {
    const accountAddress = "0x1c00881a4b935D58E769e7c85F5924B8175D1526";
    const res = await request(app).post(unstakeEndpoint).send({
      accountAddress,
      protocolName: "Ethena",
      chainName: "Arbitrum",
      poolName: null,
      token: "USDC",
      amount: "100",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    const errMsg =
      "Ethena is not supported on arbitrum, please try on ethereum.";
    expect(res.body.message).toEqual(errMsg);
  });

  describe.skip("Stargate", () => {
    it("USDT pool", async () => {
      const accountAddress = "0x9998DEa5254E6e65f7DF20eD422654bA7Fa2FDA6";
      const stakeRes = await request(app).post(stakeEndpoint).send({
        accountAddress,
        protocolName: "Stargate",
        chainName: "Ethereum",
        token: "S*USDT",
        amount: "100",
      });
      const res = await request(app).post(unstakeEndpoint).send({
        accountAddress,
        protocolName: "Stargate",
        chainName: "Ethereum",
        token: "S*USDT",
        amount: "100",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");
      expect(res.body.transactions).toHaveLength(1);

      const success = await simulateTxs(
        1,
        [...stakeRes.body.transactions, ...res.body.transactions],
        accountAddress,
      );
      expect(success).toEqual(true);
    });

    it("USDC pool", async () => {
      const accountAddress = "0x60f2b4734c9586FD2aAabDce94FCD31b469B11C5";
      const stakeRes = await request(app).post(stakeEndpoint).send({
        accountAddress,
        protocolName: "Stargate",
        chainName: "Ethereum",
        token: "S*USDC",
        amount: "100",
      });
      const res = await request(app).post(unstakeEndpoint).send({
        accountAddress,
        protocolName: "Stargate",
        chainName: "Ethereum",
        token: "S*USDC",
        amount: "100",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");
      expect(res.body.transactions).toHaveLength(1);

      const success = await simulateTxs(
        1,
        [...stakeRes.body.transactions, ...res.body.transactions],
        accountAddress,
        19211870,
      );
      expect(success).toEqual(true);
    });
  });

  describe.skip("Dolomite", () => {
    it.skip("jUSDC pool", async () => {
      const accountAddress = "0xa5165efec8cfb91f5cf717029cb430d3121c2c8a";

      const { rpcUrl } = await createVnet(42161);
      const provider = new RetryProvider(rpcUrl, 42161);

      const res = await request(app).post(unstakeEndpoint).send({
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
      const res = await request(app).post(unstakeEndpoint).send({
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
        "Unstaking from protocol dolomite is not supported with token jusdc. Available tokens to unstake are GLP and GMX.",
      );
    });
  });

  describe("EigenLayer", () => {
    const testCases: Record<string, JSONObject> = {
      cbeth: {
        address: "0xAda0fE15a97da69C1B0Dd5Aab21EfD20840f5c72",
        blockNumber: 19192452,
      },
      steth: {
        address: "0x15A37c86c1104fE1f1C9a49B6a2c519d12320bcb",
        blockNumber: 19190853,
      },
      reth: {
        address: "0x02B7BeE0C9708f7E349a4a2Ed87172a5eafF7D73",
        blockNumber: 19166419,
      },
      ethx: {
        address: "0x56980055Abb7B6b403159Ee58C8483eB3D5AAac5",
        blockNumber: 18860355,
      },
      ankreth: {
        address: "0x3b3ea996aD6Deb5F1f50dECf7768a225b350CaAF",
        blockNumber: 19192404,
      },
      oeth: {
        address: "0xbdBd63EF681606542284BDAc6016AF3800B85473",
        blockNumber: 19192740,
      },
      oseth: {
        address: "0x2431D352FD3B7A16E0E5b9deD5F393C352F44b7C",
        blockNumber: 19192811,
      },
      sweth: {
        address: "0x45252B4CDCB82Fbfa22FBd61A38778254C08F7FC",
        blockNumber: 19192810,
      },
      wbeth: {
        address: "0xD0334BD0b530d53Bd50e590BeC0E4f0B0680AE8d",
        blockNumber: 19192811,
      },
      sfrxeth: {
        address: "0x9C271f7a72c036B707F78C8385f99DEF5d247DA0",
        blockNumber: 19192811,
      },
      lseth: {
        address: "0x7Cef5539420CcceBdcfC0F368eF06Bf4040E9137",
        blockNumber: 19192811,
      },
      meth: {
        address: "0x2df9467ce23163541d6323683A924776a9CF1fb0",
        blockNumber: 19192811,
      },
    };
    for (const { name: token } of Object.values(strategies)) {
      if (token.toLowerCase() === "ethx") continue;

      const tc = testCases[token.toLowerCase()];

      it(`${token} pool`, async () => {
        const { rpcUrl: rpc } = await createVnet(1, 19192811);
        const provider = new RetryProvider(rpc, 1);
        const accountAddress = tc.address;
        const res = await request(app).post(unstakeEndpoint).send({
          accountAddress,
          protocolName: "EigenLayer",
          chainName: "Ethereum",
          poolName: null,
          token,
          amount: "1",
          rpc,
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
    }
  });

  it("Invalid amount for GMX", async () => {
    const res = await request(app).post(unstakeEndpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "GMX",
      chainName: "Arbitrum",
      token: "GMX",
      // Invalid amount
      amount: "invalidAmount",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "invalidAmount is an invalid amount. Please specify an amount correctly and try again.",
    );
  });

  it("Ether.fi", async () => {
    const accountAddress = "0x4B7D801E954C1A529A3813Cc21410d093A332AeC";
    const res = await request(app).post(unstakeEndpoint).send({
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
    expect(res.body.transactions.length).toBeLessThanOrEqual(2);

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Unstake with zero amount for Lodestar", async () => {
    const res = await request(app).post(unstakeEndpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Lodestar",
      chainName: "Arbitrum",
      token: "USDT",
      // Zero amount
      amount: "0",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "The amount being used is zero, ensure you have funds on your Slate account",
    );
  });

  it("Unstake with negative amount for Plutus", async () => {
    const res = await request(app).post(unstakeEndpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Plutus",
      chainName: "Arbitrum",
      token: "USDT",
      // Negative amount
      amount: "-100",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "-100 is an invalid amount. Please specify an amount correctly and try again.",
    );
  });

  it("Unstake on unsupported protocol", async () => {
    const res = await request(app).post(unstakeEndpoint).send({
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

  it("Unstake with missing parameters", async () => {
    const res = await request(app).post(unstakeEndpoint).send({
      // Missing required parameters
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
  });

  it.skip("Unstake with excessive amount for Stargate", async () => {
    const accountAddress = "0xfb08564e20C094D55A3F62AE718584C1ac60A73d";
    const stakeRes = await request(app).post(stakeEndpoint).send({
      accountAddress,
      protocolName: "Stargate",
      chainName: "Ethereum",
      token: "S*USDT",
      amount: "100",
    });
    const res = await request(app).post(unstakeEndpoint).send({
      accountAddress,
      protocolName: "Stargate",
      chainName: "Ethereum",
      token: "S*USDT",
      amount: "9999999999999",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(1);

    const success = await simulateTxs(
      1,
      [...stakeRes.body.transactions, ...res.body.transactions],
      accountAddress,
    );
    expect(success).toEqual(false);
  });
});
