import request from "supertest";
import app from "../../../app.js";
import strategies from "../../../config/eigenlayer/strategies.js";
import { getChainIdFromName } from "../../../utils/index.js";
import { getProtocolErrorMessage } from "../../../utils/protocols/index.js";
import { RetryProvider } from "../../../utils/retryProvider.js";
import type { JSONObject } from "../../../utils/types.js";
import {
  createVnet,
  increaseTokenBalance,
  runTxsOnVnet,
  simulateTxs,
} from "../../helper.js";

const endpoint = `/stake?secret=${process.env.BACKEND_TOKEN_SECRET}`;

jest.retryTimes(1);

describe("Stake", () => {
  beforeEach(() => {
    console.log(expect.getState().currentTestName);
  });

  it.skip("Hop", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Hop",
      chainName: "Arbitrum",
      token: "USDC",
      amount: "20",
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

  it("Lido", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Lido",
      chainName: "Ethereum",
      token: "ETH",
      amount: "20",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(1);

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  // unsupported
  it.skip("GMX", async () => {
    const accountAddress = "0xb38e8c17e38363af6ebdcb3dae12e0243582891d";
    const res = await request(app).post(endpoint).send({
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
    expect(res.body.transactions).toHaveLength(2);

    const success = await simulateTxs(
      42161,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  it("Rocket Pool", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "RocketPool",
      chainName: "Ethereum",
      token: "ETH",
      amount: "100",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(1);

    const success = await simulateTxs(
      1,
      res.body.transactions,
      accountAddress,
      18455750,
    );
    expect(success).toEqual(true);
  });

  it.skip("Lodestar", async () => {
    const accountAddress = "0xc27e87cfe1fd2Ed6F43DFfFBb9E9e46428497a24";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Lodestar",
      chainName: "Arbitrum",
      token: "LODE",
      amount: "100",
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
      179435700,
    );
    expect(success).toEqual(true);
  });

  it("Plutus", async () => {
    const accountAddress = "0xeA0a73c17323d1a9457D722F10E7baB22dc0cB83";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Plutus",
      chainName: "Arbitrum",
      token: "plvGLP",
      amount: "100",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions.length).toBeGreaterThanOrEqual(1);

    const success = await simulateTxs(
      42161,
      res.body.transactions,
      accountAddress,
      178655210,
    );
    expect(success).toEqual(true);
  });

  it("Kwenta", async () => {
    const accountAddress = "0xDF90C9B995a3b10A5b8570a47101e6c6a29eb945";
    const res = await request(app).post(endpoint).send({
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
    expect(res.body.transactions).toHaveLength(2);

    const success = await simulateTxs(
      10,
      res.body.transactions,
      accountAddress,
    );
    expect(success).toEqual(true);
  });

  describe("Stargate", () => {
    it("USDT pool", async () => {
      const accountAddress = "0xfb08564e20C094D55A3F62AE718584C1ac60A73d";
      const res = await request(app).post(endpoint).send({
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
      expect(res.body.transactions).toHaveLength(2);

      const success = await simulateTxs(
        1,
        res.body.transactions,
        accountAddress,
        19211870,
      );
      expect(success).toEqual(true);
    });

    it("USDC pool", async () => {
      const accountAddress = "0x60f2b4734c9586FD2aAabDce94FCD31b469B11C5";
      const res = await request(app).post(endpoint).send({
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
      expect(res.body.transactions).toHaveLength(2);

      const success = await simulateTxs(
        1,
        res.body.transactions,
        accountAddress,
        19211870,
      );
      expect(success).toEqual(true);
    });
  });

  it("Swell", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Swell",
      chainName: "Ethereum",
      token: "ETH",
      amount: "20",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(1);

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  describe.skip("Renzo", () => {
    const testCases: Record<string, JSONObject[]> = {
      ethereum: [
        {
          accountAddress: "0xAe2D4617c862309A3d75A0fFB358c7a5009c673F",
          token: "ETH",
          amount: "0.1",
        },
        {
          accountAddress: "0xE53FFF67f9f384d20Ebea36F43b93DC49Ed22753",
          token: "stETH",
          amount: "0.1",
        },
      ],
      arbitrum: [
        {
          accountAddress: "0xf584F8728B874a6a5c7A8d4d387C9aae9172D621",
          token: "ETH",
          amount: "0.1",
        },
        {
          accountAddress: "0xf584F8728B874a6a5c7A8d4d387C9aae9172D621",
          token: "wETH",
          amount: "0.1",
        },
      ],
      base: [
        {
          accountAddress: "0x3a8A1F045cd4F7246c6B3A78861269CC6065433a",
          token: "ETH",
          amount: "0.1",
        },
        {
          accountAddress: "0x3a8A1F045cd4F7246c6B3A78861269CC6065433a",
          token: "wETH",
          amount: "0.1",
        },
      ],
      linea: [
        {
          accountAddress: "0x428ab2ba90eba0a4be7af34c9ac451ab061ac010",
          token: "ETH",
          amount: "0.1",
        },
        {
          accountAddress: "0x428ab2ba90eba0a4be7af34c9ac451ab061ac010",
          token: "wETH",
          amount: "0.1",
        },
      ],
      mode: [
        {
          accountAddress: "0xD746A2a6048C5D3AFF5766a8c4A0C8cFD2311745",
          token: "ETH",
          amount: "0.1",
        },
        {
          accountAddress: "0xe9b14a1Be94E70900EDdF1E22A4cB8c56aC9e10a",
          token: "wETH",
          amount: "0.1",
        },
      ],
    };
    for (const chainName of Object.keys(testCases)) {
      const chainId = getChainIdFromName(chainName, true);
      const chainTestCases = testCases[chainName];
      for (const { accountAddress, token, amount } of chainTestCases) {
        it(`Stake ${token} to Renzo on ${chainName}`, async () => {
          const res = await request(app).post(endpoint).send({
            accountAddress,
            protocolName: "Renzo",
            chainName,
            poolName: null,
            token,
            amount,
          });
          expect(res.statusCode).toEqual(200);
          expect(res.body).toHaveProperty("status");
          expect(res.body.status).toEqual("success");
          expect(res.body).toHaveProperty("transactions");

          const { rpcUrl } = await createVnet(chainId);
          const provider = new RetryProvider(rpcUrl, chainId);
          const success = await runTxsOnVnet(
            provider,
            accountAddress,
            res.body.transactions,
          );
          expect(success).toEqual(true);
        });
      }
    }
  });

  it("Ethena", async () => {
    const accountAddress = "0x1c00881a4b935D58E769e7c85F5924B8175D1526";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Ethena",
      chainName: "Ethereum",
      poolName: null,
      token: "USDe",
      amount: "100",
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
    const res = await request(app).post(endpoint).send({
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
  });

  it("Ethena, unsupported chain failure", async () => {
    const accountAddress = "0x1c00881a4b935D58E769e7c85F5924B8175D1526";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Ethena",
      chainName: "Arbitrum",
      poolName: null,
      token: "USDC",
      amount: "100",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.message).toEqual("Could not find address for Ethena stake");
  });

  describe.skip("Dolomite", () => {
    const testCases = [
      // {
      //   accountAddress: "0x8Fec806c9e94ff7AB2AF3D7e4875c2381413f98E",
      //   token: "jUSDC",
      //   amount: "1",
      // },
      {
        accountAddress: "0x80A9ae39310abf666A87C743d6ebBD0E8C42158E",
        token: "GMX",
        amount: "10",
      },
    ];

    for (const { accountAddress, token, amount } of testCases) {
      it(`${token} pool`, async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "Dolomite",
          chainName: "Arbitrum",
          poolName: null,
          token,
          amount,
        });
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty("status");
        expect(res.body.status).toEqual("success");
        expect(res.body).toHaveProperty("transactions");

        const { rpcUrl } = await createVnet(42161);
        const provider = new RetryProvider(rpcUrl, 42161);
        const success = await runTxsOnVnet(
          provider,
          accountAddress,
          res.body.transactions,
        );
        expect(success).toEqual(true);
      });
    }

    it("invalid token", async () => {
      const accountAddress = "0x8Fec806c9e94ff7AB2AF3D7e4875c2381413f98E";
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Dolomite",
        chainName: "Arbitrum",
        poolName: null,
        token: "AWETH",
        amount: "100",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        "Staking to protocol dolomite is not supported with token aweth. Available tokens to stake are GLP and GMX.",
      );
    });
  });

  describe("EigenLayer", () => {
    const testCases: Record<string, JSONObject> = {
      steth: {
        address: "0x59A5A9f9325130fB6eaADE6E77B092D04E1cEf08",
        blockNumber: 19174527,
      },
      oeth: {
        address: "0x8bBBCB5F4D31a6db3201D40F478f30Dc4F704aE2",
        blockNumber: 19191487,
        txCount: 1,
      },
      lseth: {
        address: "0x609Be6F6De661c87Ba00e45E02561A47FB5a9f74",
        blockNumber: 19191322,
      },
    };
    for (const { name: token } of Object.values(strategies)) {
      if (token.toLowerCase() === "ethx") continue;

      const tc = testCases[token.toLowerCase()];

      it(`${token} pool`, async () => {
        const defaultAccountAddress =
          "0xae9DBE3fEB9Fd03945ED79F79142e8787Fe47907";
        const accountAddress = tc?.address || defaultAccountAddress;
        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "EigenLayer",
          chainName: "Ethereum",
          poolName: null,
          token,
          amount: "1",
        });
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty("status");
        expect(res.body.status).toEqual("success");
        expect(res.body).toHaveProperty("transactions");
        expect(res.body.transactions).toHaveLength(tc?.txCount || 2);

        const { rpcUrl } = await createVnet(1, tc?.blockNumber || 19192811);
        if (!tc) {
          await increaseTokenBalance(
            rpcUrl,
            accountAddress,
            "Ethereum",
            token,
            "1",
          );
        }

        const provider = new RetryProvider(rpcUrl, 1);
        const success = await runTxsOnVnet(
          provider,
          accountAddress,
          res.body.transactions,
        );
        expect(success).toEqual(true);
      });
    }
  });

  it("Ether.fi", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Etherfi",
      chainName: "Ethereum",
      token: "ETH",
      amount: "20",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(1);

    const success = await simulateTxs(1, res.body.transactions, accountAddress);
    expect(success).toEqual(true);
  });

  it("Invalid token in Ether.fi", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Etherfi",
      chainName: "Ethereum",
      token: "eETH",
      amount: "100",
    });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      getProtocolErrorMessage("stake", "eeth", "ether.fi", 1),
    );
  });

  describe("KelpDAO", () => {
    it("ETH", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "KelpDAO",
        chainName: "Ethereum",
        token: "ETH",
        amount: "10",
      });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");
      expect(res.body.transactions).toHaveLength(1);

      const success = await simulateTxs(
        1,
        res.body.transactions,
        accountAddress,
      );
      expect(success).toEqual(true);
    });

    it("Invalid token", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "KelpDAO",
        chainName: "Ethereum",
        token: "USDC",
        amount: "100",
      });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        "The token usdc is not supported in KelpDAO staking.",
      );
    });
  });

  it("Stake - Invalid Token", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Lido",
      chainName: "Ethereum",
      token: "INVALID_TOKEN",
      amount: "32",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "Token INVALID_TOKEN not found on Ethereum. Ensure you specify a chain and token properly in your next prompt.",
    );
  });

  it("Stake - Insufficient Balance", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Lido",
      chainName: "Arbitrum",
      token: "Lido",
      amount: "100000", // Assuming an amount greater than the available balance
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
    expect(success).toEqual(false);
  });

  it("Stake - Negative Amount", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Lido",
      chainName: "Ethereum",
      token: "ETH",
      amount: "-32",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "-32 is an invalid amount. Please specify an amount correctly and try again.",
    );
  });

  it("Stake - Zero Amount", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Lodestar",
      chainName: "Arbitrum",
      token: "LODE",
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
});
