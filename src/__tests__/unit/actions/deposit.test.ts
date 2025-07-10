import { ethers } from "ethers";
import request from "supertest";
import app from "../../../app.js";
import { abis } from "../../../config/abis.js";
import strategies from "../../../config/eigenlayer/strategies.js";
import LPAddresses from "../../../config/lptokens.js";
import { initModels } from "../../../db/index.js";
import {
  getMissingPoolNameError,
  getUnsupportedPoolError,
  getUnsupportedPoolTokenError,
  getUnsupportedTokenError,
} from "../../../utils/error.js";
import { getViemPublicClientFromEthers } from "../../../utils/ethers2viem.js";
import {
  getChainIdFromName,
  getChainNameFromId,
  getNativeTokenSymbolForChain,
  getTokenInfoForChain,
} from "../../../utils/index.js";
import { RetryProvider } from "../../../utils/retryProvider.js";
import {
  assert,
  type ChainId,
  type JSONObject,
  type TokenInfo,
  isHexStr,
} from "../../../utils/types.js";
import {
  createVnet,
  getTopHolder,
  increaseTokenBalance,
  runTxsOnVnet,
  simulateTxs,
} from "../../helper.js";

const endpoint = `/deposit?secret=${process.env.BACKEND_TOKEN_SECRET}`;

jest.retryTimes(1);

// swap protocol deposits are temporarily disabled
describe("Deposit", () => {
  beforeEach(async () => {
    await initModels();
    console.log(expect.getState().currentTestName);
  });

  describe("Aave", () => {
    const testCases: Record<string, JSONObject[]> = {
      ethereum: [
        { token: "ETH", amount: "2" },
        { token: "USDC", amount: "100" },
      ],
      optimism: [
        { token: "ETH", amount: "2" },
        { token: "USDC", amount: "100" },
      ],
      polygon: [
        { token: "WMATIC", amount: "100" },
        { token: "WETH", amount: "2" },
        { token: "USDC", amount: "100" },
      ],
      arbitrum: [
        { token: "ETH", amount: "2" },
        { token: "USDC", amount: "100" },
      ],
      // avalanche: [
      // { token: "WAVAX", amount: "100" },
      // { token: "WETH", amount: "2" },
      // { token: "USDC", amount: "100" },
      // ],
    };

    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    for (const chainName of Object.keys(testCases)) {
      const chainId = getChainIdFromName(chainName);
      for (const tc of testCases[chainName]) {
        it(`Deposit ${tc.token} into Aave on ${chainName}`, async () => {
          await test(
            accountAddress,
            {
              accountAddress,
              protocolName: "Aave",
              chainName,
              ...tc,
            },
            chainId as ChainId,
            undefined,
            true,
          );
        }, 300000);
      }
    }
  });

  it("Hyperliquid", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    await test(
      accountAddress,
      {
        accountAddress,
        protocolName: "Hyperliquid",
        chainName: "Arbitrum",
        poolName: null,
        token: "USDC",
        amount: "10",
      },
      42161,
    );
  });

  it("Ambient - ETH (Ethereum)", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";

    await test(
      accountAddress,
      {
        accountAddress,
        protocolName: "Ambient",
        chainName: "Ethereum",
        poolName: "eth-usdc",
        token: "ETH",
        amount: "1",
      },
      1,
    );
  });

  it("Ambient - WETH-USDC, ETH Deposit", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";

    await test(
      accountAddress,
      {
        accountAddress,
        protocolName: "Ambient",
        chainName: "Ethereum",
        poolName: "weth-usdc",
        token: "ETH",
        amount: "1",
      },
      1,
    );
  });

  it("Ambient - USDC", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";

    await test(
      accountAddress,
      {
        accountAddress,
        protocolName: "Ambient",
        chainName: "Ethereum",
        poolName: "eth-usdc",
        token: "USDC",
        amount: "1000",
      },
      1,
    );
  });

  it("Ambient - ETH (Blast)", async () => {
    const accountAddress = await getTopHolder("usdb", 81457);

    await test(
      accountAddress,
      {
        accountAddress,
        protocolName: "Ambient",
        chainName: "Blast",
        poolName: "eth-usdb",
        token: "ETH",
        amount: "0.5",
      },
      81457,
    );
  });

  it("Ambient - USDB", async () => {
    const accountAddress = await getTopHolder("usdb", 81457);

    await test(
      accountAddress,
      {
        accountAddress,
        protocolName: "Ambient",
        chainName: "Blast",
        poolName: "eth-usdb",
        token: "USDB",
        amount: "1000",
      },
      81457,
    );
  });

  it("Ambient v3 - ETH (Ethereum)", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";

    await test(
      accountAddress,
      {
        accountAddress,
        protocolName: "Ambient",
        chainName: "Ethereum",
        poolName: "eth-usdc",
        token: "ETH",
        amount: "1",
        range: "10",
      },
      1,
    );
  });

  it("Ambient v3 - WETH-USDC, ETH Deposit", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";

    await test(
      accountAddress,
      {
        accountAddress,
        protocolName: "Ambient",
        chainName: "Ethereum",
        poolName: "weth-usdc",
        token: "ETH",
        amount: "1",
        range: "10",
      },
      1,
    );
  });

  it("Ambient v3 - USDC", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";

    await test(
      accountAddress,
      {
        accountAddress,
        protocolName: "Ambient",
        chainName: "Ethereum",
        poolName: "eth-usdc",
        token: "USDC",
        amount: "1000",
        range: "10",
      },
      1,
    );
  });

  it("Ambient v3 - ETH (Blast)", async () => {
    const accountAddress = await getTopHolder("usdb", 81457);

    await test(
      accountAddress,
      {
        accountAddress,
        protocolName: "Ambient",
        chainName: "Blast",
        poolName: "eth-usdb",
        token: "ETH",
        amount: "0.5",
        range: "10",
      },
      81457,
    );
  });

  it("Ambient v3 - USDB", async () => {
    const accountAddress = await getTopHolder("usdb", 81457);

    await test(
      accountAddress,
      {
        accountAddress,
        protocolName: "Ambient",
        chainName: "Blast",
        poolName: "eth-usdb",
        token: "USDB",
        amount: "1000",
        range: "10",
      },
      81457,
    );
  });

  it("Invalid token in Aave", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Aave",
      chainName: "Ethereum",
      poolName: null,
      token: "HELGA",
      amount: "100",
    });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      getUnsupportedTokenError("Ethereum", "Aave", "HELGA"),
    );
  });

  describe("Camelot", () => {
    it("eth-usdc pool", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Camelot",
          chainName: "Arbitrum",
          poolName: "eth/usdc",
          token: "ETH",
          amount: "0.1",
        },
        42161,
        undefined,
        false,
        "0x54B26fAf3671677C19F70c4B879A6f7B898F732c",
      );
    });

    it("weth-usdc pool", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Camelot",
          chainName: "Arbitrum",
          poolName: "weth/usdc",
          token: "ETH",
          amount: "0.1",
        },
        42161,
        undefined,
        false,
        "0x54B26fAf3671677C19F70c4B879A6f7B898F732c",
      );
    });

    it("invalid token, eth-usdc pool", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "Camelot",
        chainName: "Arbitrum",
        poolName: "eth-usdc",
        token: "USDT",
        amount: "2",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        "Depositing into Camelot eth-usdc pool is not supported with USDT. Try depositing eth or usdc.",
      );
    });

    it("Missing pool name", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "Camelot",
        chainName: "Arbitrum",
        poolName: null,
        token: "USDC",
        amount: "2",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        "Missing a pool to deposit into on Camelot. The pool name should be token-token format.",
      );
    });

    it.skip("usdt-usdc pool", async () => {
      const accountAddress = "0x319f9b7415659a96c1648dd6a2ebdb31cc076fcb";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Camelot",
          chainName: "Arbitrum",
          poolName: "usdt-usdc",
          token: "USDT",
          amount: "1000",
        },
        42161,
        undefined,
        false,
        "0x935763d7c14925690b89b14d738ecd8bf37db39a",
      );
    });
  });

  describe("Camelot v3", () => {
    it("eth-usdc pool - usdc", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Camelot",
          chainName: "Arbitrum",
          poolName: "eth-usdc",
          token: "USDC",
          amount: "1000",
          range: "10",
        },
        1,
        undefined,
        false,
      );
    });

    it("eth-usdc pool - eth", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Camelot",
          chainName: "Arbitrum",
          poolName: "eth-usdc",
          token: "ETH",
          amount: "1",
          range: "10",
        },
        1,
        undefined,
        false,
      );
    });
  });

  describe.skip("Aerodrome v3", () => {
    it("rgusd-usdc pool - usdc", async () => {
      const accountAddress = "0xa5699AdaB368a5b027B3B1736CC592EBfC4cf077";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Aerodrome",
          chainName: "Base",
          poolName: "rgusd-usdc",
          token: "usdc",
          amount: "10",
          range: "10",
        },
        8453,
        undefined,
        { usdc: 100, rgusd: 100 },
      );
    });

    it("rgusd-usdc pool - weth", async () => {
      const accountAddress = "0x3304E22DDaa22bCdC5fCa2269b418046aE7b566A";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Aerodrome",
          chainName: "Base",
          poolName: "rgusd-usdc",
          token: "rgusd",
          amount: "1000",
          range: "10",
        },
        8453,
        undefined,
        true,
      );
    });
  });

  describe.skip("Velodrome v3", () => {
    it("eth-usdc pool - usdc", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Velodrome",
          chainName: "Optimism",
          poolName: "eth-usdc",
          token: "usdc",
          amount: "1000",
          range: "10",
        },
        10,
        undefined,
        false,
      );
    });

    it("eth-usdc pool - weth", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Velodrome",
          chainName: "Optimism",
          poolName: "eth-usdc",
          token: "eth",
          amount: "0.1",
          range: "10",
        },
        10,
        undefined,
        false,
      );
    });
  });

  describe("Compound", () => {
    const testCases: Record<string, Record<string, JSONObject[]>> = {
      ethereum: {
        usdc: [
          { symbol: "ETH", amount: "2" },
          { symbol: "WETH", amount: "2" },
          { symbol: "LINK", amount: "50" },
          { symbol: "WBTC", amount: "0.1" },
          {
            symbol: "USDC",
            amount: "100",
            lpToken: "0xc3d688b66703497daa19211eedff47f25384cdc3",
            balanceChange: "100",
          },
        ],
        weth: [
          { symbol: "ETH", amount: "2" },
          { symbol: "cbETH", amount: "2" },
          { symbol: "wstETH", amount: "2" },
          { symbol: "rETH", amount: "2" },
          {
            symbol: "WETH",
            amount: "2",
            lpToken: "0xA17581A9E3356d9A858b789D68B4d866e593aE94",
            balanceChange: "2",
          },
        ],
      },
      arbitrum: {
        usdc: [
          { symbol: "ETH", amount: "2" },
          { symbol: "ARB", amount: "20" },
          { symbol: "GMX", amount: "1" },
          { symbol: "WETH", amount: "2" },
        ],
      },
      base: {
        usdbc: [
          { symbol: "ETH", amount: "2" },
          { symbol: "cbETH", amount: "2" },
        ],
        weth: [
          { symbol: "ETH", amount: "2" },
          { symbol: "cbETH", amount: "2" },
        ],
      },
    };
    const testErr: Record<string, JSONObject[]> = {
      ethereum: [
        { symbol: "ETH", amount: "2" },
        {
          symbol: "wstETH",
          amount: "2",
          lpToken: "0xA17581A9E3356d9A858b789D68B4d866e593aE94",
          balanceChange: "2",
        },
      ],
      base: [
        { symbol: "ETH", amount: "2" },
        { symbol: "cbETH", amount: "2" },
      ],
    };

    for (const chainName of Object.keys(testCases)) {
      const chainId = getChainIdFromName(chainName, true);
      const chainTestCases = testCases[chainName];
      for (const poolName of Object.keys(chainTestCases)) {
        const tokens = chainTestCases[poolName];

        for (const tc of tokens) {
          it(`Deposit ${tc.symbol} into ${poolName} pool on ${chainName}`, async () => {
            const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
            await test(
              accountAddress,
              {
                accountAddress,
                protocolName: "Compound",
                chainName,
                poolName,
                token: tc.symbol,
                amount: tc.amount,
              },
              chainId as ChainId,
              undefined,
              true,
              tc.lpToken,
              tc.balanceChange,
            );
          });

          it(`Invalid token - Deposit HELGA into ${poolName} pool on ${chainName}`, async () => {
            const res = await request(app).post(endpoint).send({
              accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
              protocolName: "Compound",
              chainName,
              poolName,
              token: "HELGA",
              amount: "100",
            });
            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty("status");
            expect(res.body.status).toEqual("error");
            expect(res.body).toHaveProperty("message");
            expect(res.body.message).toEqual(
              getUnsupportedPoolTokenError(
                chainName,
                "Compound",
                poolName,
                "HELGA",
              ),
            );
          });
        }
      }

      it("Pool Name missing with invalid token", async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
          protocolName: "Compound",
          chainName,
          poolName: null,
          token: "HELGA",
          amount: "100",
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty("status");
        expect(res.body.status).toEqual("error");
        expect(res.body).toHaveProperty("message");
        expect(res.body.message).toEqual(
          getMissingPoolNameError(chainName, "Compound", "HELGA"),
        );
      });
    }

    for (const chainName of Object.keys(testErr)) {
      const chainTestCases = testErr[chainName];
      for (const tc of chainTestCases) {
        it(`Pool Name missing with ${tc.symbol} on ${chainName}`, async () => {
          const res = await request(app).post(endpoint).send({
            accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
            protocolName: "Compound",
            chainName,
            poolName: null,
            token: tc.symbol,
            amount: tc.amount,
          });
          expect(res.statusCode).toEqual(400);
          expect(res.body).toHaveProperty("status");
          expect(res.body.status).toEqual("error");
          expect(res.body).toHaveProperty("message");
          expect(res.body.message).toEqual(
            getMissingPoolNameError(chainName, "Compound", tc.symbol),
          );
        });
      }
    }
  });

  describe.skip("Lodestar", () => {
    const tokens = [
      {
        symbol: "frax",
        amount: "100",
        lpToken: "0xD12d43Cdf498e377D3bfa2c6217f05B466E14228",
      },
      {
        symbol: "magic",
        amount: "100",
        lpToken: "0xf21Ef887CB667f84B8eC5934C1713A7Ade8c38Cf",
      },
      {
        symbol: "plvglp",
        amount: "100",
        lpToken: "0xeA0a73c17323d1a9457D722F10E7baB22dc0cB83",
      },
      {
        symbol: "usdc.e",
        amount: "100",
        lpToken: "0x1ca530f02DD0487cef4943c674342c5aEa08922F",
      },
      {
        symbol: "usdt",
        amount: "100",
        lpToken: "0x9365181A7df82a1cC578eAE443EFd89f00dbb643",
      },
      {
        symbol: "wbtc",
        amount: "0.1",
        lpToken: "0xC37896BF3EE5a2c62Cdbd674035069776f721668",
      },
      {
        symbol: "dai",
        amount: "100",
        lpToken: "0x4987782da9a63bC3ABace48648B15546D821c720",
      },
      {
        symbol: "eth",
        amount: "10",
        lpToken: "0x2193c45244AF12C280941281c8aa67dD08be0a64",
      },
      {
        symbol: "arb",
        amount: "100",
        lpToken: "0x8991d64fe388fA79A4f7Aa7826E8dA09F0c3C96a",
      },
      {
        symbol: "wsteth",
        amount: "10",
        lpToken: "0xfECe754D92bd956F681A941Cef4632AB65710495",
      },
      {
        symbol: "gmx",
        amount: "100",
        lpToken: "0x79B6c5e1A7C0aD507E1dB81eC7cF269062BAb4Eb",
      },
      {
        symbol: "usdc",
        amount: "100",
        lpToken: "0x4C9aAed3b8c443b4b634D1A189a5e25C604768dE",
      },
    ];
    for (const { symbol, amount, lpToken } of tokens) {
      it(`${symbol.toUpperCase()} pool`, async () => {
        const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
        await test(
          accountAddress,
          {
            accountAddress,
            protocolName: "Lodestar",
            chainName: "Arbitrum",
            poolName: null,
            token: symbol,
            amount,
          },
          42161,
          203113292,
          true,
          lpToken,
        );
      });

      it("Invalid token - Deposit HELGA to Lodestar", async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress: "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D",
          protocolName: "Lodestar",
          chainName: "Arbitrum",
          poolName: null,
          token: "HELGA",
          amount,
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty("status");
        expect(res.body.status).toEqual("error");
        expect(res.body).toHaveProperty("message");
        expect(res.body.message).toEqual(
          getUnsupportedTokenError("Arbitrum", "Lodestar", "HELGA"),
        );
      });
    }
  });

  // unsupported
  describe.skip("GMX", () => {
    it("GMX - No pool name", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "GMX",
        chainName: "Arbitrum",
        poolName: null,
        token: "USDC",
        amount: "100",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        getMissingPoolNameError("Arbitrum", "GMX", "USDC"),
      );
    });

    it("GMX - No pool name and invalid token", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "GMX",
        chainName: "Arbitrum",
        poolName: null,
        token: "USDC",
        amount: "100",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        getMissingPoolNameError("Arbitrum", "GMX", "USDC"),
      );
    });

    it("WETH-USDC", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";

      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          poolName: "WETH-USDC",
          token: "USDC",
          amount: "100",
        },
        42161,
      );
    });

    it("WETH-USDC, ETH deposit", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";

      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          poolName: "WETH-USDC",
          token: "ETH",
          amount: "0.1",
        },
        42161,
      );
    });

    it("Invalid token - ETH-USDC", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "GMX",
        chainName: "Arbitrum",
        poolName: "ETH-USDC",
        token: "HELGA",
        amount: "100",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        getUnsupportedPoolTokenError("Arbitrum", "GMX", "ETH-USDC", "HELGA"),
      );
    });

    it("ETH-USDC", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";

      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          poolName: "ETH-USDC",
          token: "USDC",
          amount: "100",
        },
        42161,
      );
    });

    it("WBTC-USDC", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";

      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          poolName: "WBTC-USDC",
          token: "USDC",
          amount: "100",
        },
        42161,
      );
    });

    it("Invalid token - BTC-USDC", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "GMX",
        chainName: "Arbitrum",
        poolName: "BTC-USDC",
        token: "HELGA",
        amount: "100",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        getUnsupportedPoolTokenError("Arbitrum", "GMX", "BTC-USDC", "HELGA"),
      );
    });

    it("BTC-USDC", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";

      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          poolName: "BTC-USDC",
          token: "USDC",
          amount: "100",
        },
        42161,
      );
    });

    it("SOL-USDC", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";

      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          poolName: "SOL-USDC",
          token: "USDC",
          amount: "100",
        },
        42161,
      );
    });

    it("Invalid token - SOL-USDC", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "GMX",
        chainName: "Arbitrum",
        poolName: "SOL-USDC",
        token: "HELGA",
        amount: "100",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        getUnsupportedPoolTokenError("Arbitrum", "GMX", "SOL-USDC", "HELGA"),
      );
    });

    it("DOGE-USDC", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";

      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          poolName: "DOGE-USDC",
          token: "USDC",
          amount: "100",
        },
        42161,
      );
    });

    it("Invalid token - DOGE-USDC", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "GMX",
        chainName: "Arbitrum",
        poolName: "DOGE-USDC",
        token: "HELGA",
        amount: "100",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        getUnsupportedPoolTokenError("Arbitrum", "GMX", "DOGE-USDC", "HELGA"),
      );
    });

    it("XRP-USDC", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";

      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          poolName: "XRP-USDC",
          token: "USDC",
          amount: "100",
        },
        42161,
      );
    });

    it("Invalid token - XRP-USDC", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "GMX",
        chainName: "Arbitrum",
        poolName: "XRP-USDC",
        token: "HELGA",
        amount: "100",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        getUnsupportedPoolTokenError("Arbitrum", "GMX", "XRP-USDC", "HELGA"),
      );
    });

    it("LTC-USDC", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";

      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          poolName: "LTC-USDC",
          token: "USDC",
          amount: "100",
        },
        42161,
      );
    });

    it("Invalid token - LTC-USDC", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "GMX",
        chainName: "Arbitrum",
        poolName: "LTC-USDC",
        token: "HELGA",
        amount: "100",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        getUnsupportedPoolTokenError("Arbitrum", "GMX", "LTC-USDC", "HELGA"),
      );
    });

    it("ATOM-USDC", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";

      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          poolName: "ATOM-USDC",
          token: "USDC",
          amount: "100",
        },
        42161,
      );
    });

    it("Invalid token - ATOM-USDC", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "GMX",
        chainName: "Arbitrum",
        poolName: "ATOM-USDC",
        token: "HELGA",
        amount: "100",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        getUnsupportedPoolTokenError("Arbitrum", "GMX", "ATOM-USDC", "HELGA"),
      );
    });

    it("NEAR-USDC", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";

      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          poolName: "NEAR-USDC",
          token: "USDC",
          amount: "100",
        },
        42161,
      );
    });

    it("Invalid token - NEAR-USDC", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "GMX",
        chainName: "Arbitrum",
        poolName: "NEAR-USDC",
        token: "HELGA",
        amount: "100",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        getUnsupportedPoolTokenError("Arbitrum", "GMX", "NEAR-USDC", "HELGA"),
      );
    });

    it("ARB-USDC", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";

      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          poolName: "ARB-USDC",
          token: "USDC",
          amount: "100",
        },
        42161,
      );
    });

    it("Invalid token - ARB-USDC", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "GMX",
        chainName: "Arbitrum",
        poolName: "ARB-USDC",
        token: "HELGA",
        amount: "100",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        getUnsupportedPoolTokenError("Arbitrum", "GMX", "ARB-USDC", "HELGA"),
      );
    });

    it("UNI-USDC", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";

      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          poolName: "UNI-USDC",
          token: "USDC",
          amount: "100",
        },
        42161,
      );
    });

    it("Invalid token - UNI-USDC", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "GMX",
        chainName: "Arbitrum",
        poolName: "UNI-USDC",
        token: "HELGA",
        amount: "100",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        getUnsupportedPoolTokenError("Arbitrum", "GMX", "UNI-USDC", "HELGA"),
      );
    });

    it("LINK-USDC", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";

      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          poolName: "LINK-USDC",
          token: "USDC",
          amount: "100",
        },
        42161,
      );
    });

    it("Invalid token - LINK-USDC", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "GMX",
        chainName: "Arbitrum",
        poolName: "LINK-USDC",
        token: "HELGA",
        amount: "100",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        getUnsupportedPoolTokenError("Arbitrum", "GMX", "LINK-USDC", "HELGA"),
      );
    });

    it("BNB-USDC", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";

      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          poolName: "BNB-USDC",
          token: "USDC",
          amount: "100",
        },
        42161,
      );
    });

    it("Invalid token - BNB-USDC", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "GMX",
        chainName: "Arbitrum",
        poolName: "BNB-USDC",
        token: "HELGA",
        amount: "100",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        getUnsupportedPoolTokenError("Arbitrum", "GMX", "BNB-USDC", "HELGA"),
      );
    });

    it("WBNB-USDC", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";

      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          poolName: "WBNB-USDC",
          token: "USDC",
          amount: "100",
        },
        42161,
      );
    });
  });

  it("Rocket Pool", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    await test(
      accountAddress,
      {
        accountAddress,
        protocolName: "RocketPool",
        chainName: "Ethereum",
        poolName: null,
        token: "ETH",
        amount: "0.1",
      },
      1,
      18540910,
      false,
      "rETH",
      "0.095",
    );
  });

  it("Rocket Pool - Invalid token", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "RocketPool",
      chainName: "Ethereum",
      poolName: null,
      token: "HELGA",
      amount: "0.1",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      getUnsupportedTokenError("Ethereum", "RocketPool", "HELGA"),
    );
  });

  describe("Pendle Invalid Token", () => {
    // FAILS
    const testERR = [
      {
        accountAddress: "0xc3eD9cBa21F66ff7e65dD1972C55e28B227Ed8bA",
        poolName: "pt-ezeth",
        amount: "0.1",
      },
      {
        accountAddress: "0xc3eD9cBa21F66ff7e65dD1972C55e28B227Ed8bA",
        poolName: "pt-steth",
        amount: "0.1",
      },
      {
        accountAddress: "0x24db6717dB1C75B9Db6eA47164D8730B63875dB7",
        poolName: "pt-susde",
        amount: "0.05",
      },
    ];

    for (const { accountAddress, amount, poolName } of testERR) {
      it(`${poolName} pool`, async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "Pendle",
          chainName: "Ethereum",
          poolName,
          token: "HELGA",
          amount,
        });

        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty("status");
        expect(res.body.status).toEqual("error");
        expect(res.body).toHaveProperty("message");
        expect(res.body.message).toContain("not found");
      });
    }
  });

  describe("Pendle - ETH", () => {
    // FAILS
    const testETHCases = [
      {
        poolName: "weeth",
        token: "weeth",
        amount: "0.1",
      },
      {
        poolName: "rseth",
        token: "rseth",
        amount: "0.1",
      },
      {
        poolName: "zs-ezeth",
        token: "ezeth",
        amount: "0.1",
      },
      {
        poolName: "USDe",
        token: "USDe",
        amount: "100",
      },
      {
        poolName: "zs-rseth",
        token: "rseth",
        amount: "0.1",
      },
      {
        poolName: "zs-weeth",
        token: "weeth",
        amount: "0.1",
      },
    ];

    for (const { poolName, token, amount } of testETHCases) {
      const accountAddress = "0xf69282a7e7ba5428f92F610E7AFa1C0ceDC4E483";
      if (
        !(
          poolName === "rseth" ||
          poolName === "zs-weeth" ||
          poolName === "zs-rseth" ||
          poolName === "zs-ezeth"
        )
      ) {
        // rseth market deposit reached limit on contract
        // zs-weeth, zs-rseth, zs-ezeth are expired
        it(`${poolName}-lp pool`, async () => {
          await test(
            accountAddress,
            {
              accountAddress,
              protocolName: "Pendle",
              chainName: "Ethereum",
              poolName: `${poolName}-lp`,
              token,
              amount,
            },
            1,
            undefined,
            true,
          );
        });
      }

      it(`pt-${token} to sy-${poolName} pool`, async () => {
        await test(
          accountAddress,
          {
            accountAddress,
            protocolName: "Pendle",
            chainName: "Ethereum",
            poolName: `sy-${poolName}`,
            token: `pt-${token}`,
            amount,
          },
          1,
          undefined,
          true,
        );
      });

      it(`sy-${token} to yt-${poolName} pool`, async () => {
        await test(
          accountAddress,
          {
            accountAddress,
            protocolName: "Pendle",
            chainName: "Ethereum",
            poolName: `yt-${poolName}`,
            token: `sy-${token}`,
            amount,
          },
          1,
          undefined,
          true,
        );
      });

      it(`pt-${token} to yt-${poolName} pool`, async () => {
        await test(
          accountAddress,
          {
            accountAddress,
            protocolName: "Pendle",
            chainName: "Ethereum",
            poolName: `yt-${poolName}`,
            token: `pt-${token}`,
            amount,
          },
          1,
          undefined,
          true,
        );
      });

      it(`pt-${token} to ${poolName} pool`, async () => {
        await test(
          accountAddress,
          {
            accountAddress,
            protocolName: "Pendle",
            chainName: "Ethereum",
            poolName,
            token: `pt-${token}`,
            amount,
          },
          1,
          undefined,
          true,
        );
      });
    }
  });

  describe("Pendle - Arbitrum", () => {
    const testArbCases = [
      {
        accountAddress: "0xc3eD9cBa21F66ff7e65dD1972C55e28B227Ed8bA",
        poolName: "sy-weeth",
        token: "weeth",
        amount: "0.1",
      },
      {
        accountAddress: "0x24db6717dB1C75B9Db6eA47164D8730B63875dB7",
        poolName: "sy-rseth",
        token: "rseth",
        amount: "0.1",
      },
    ];

    for (const { accountAddress, poolName, token, amount } of testArbCases) {
      it(`${poolName} pool`, async () => {
        await test(
          accountAddress,
          {
            accountAddress,
            protocolName: "Pendle",
            chainName: "Arbitrum",
            poolName,
            token,
            amount,
          },
          42161,
          undefined,
          true,
        );
      });
    }
  });

  describe("Pendle - Optimism", () => {
    const testOptimismCases = [
      {
        accountAddress: "0xc3eD9cBa21F66ff7e65dD1972C55e28B227Ed8bA",
        poolName: "sy-reth",
        token: "reth",
        amount: "0.1",
      },
    ];

    for (const {
      accountAddress,
      poolName,
      token,
      amount,
    } of testOptimismCases) {
      it(`${poolName} pool`, async () => {
        await test(
          accountAddress,
          {
            accountAddress,
            protocolName: "Pendle",
            chainName: "Optimism",
            poolName,
            token,
            amount,
          },
          10,
          undefined,
          true,
        );
      });
    }
  });

  describe("Pendle - BSC", () => {
    const testBNBCases = [
      {
        accountAddress: "0xc3eD9cBa21F66ff7e65dD1972C55e28B227Ed8bA",
        poolName: "sy-wbeth",
        token: "wbeth",
        amount: "0.1",
      },
      {
        accountAddress: "0x9026A229b535ecF0162Dfe48fDeb3c75f7b2A7AE",
        poolName: "sy-ezeth",
        token: "ezeth",
        amount: "0.1",
      },
    ];

    for (const { accountAddress, poolName, token, amount } of testBNBCases) {
      it(`${poolName} pool`, async () => {
        await test(
          accountAddress,
          {
            accountAddress,
            protocolName: "Pendle",
            chainName: "BSC",
            poolName,
            token,
            amount,
          },
          56,
          undefined,
          true,
        );
      });
    }
  });

  describe("Uniswap v2", () => {
    it("eth-usdc pool", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Uniswap",
          chainName: "Ethereum",
          poolName: "eth/usdc",
          token: "ETH",
          amount: "4",
        },
        1,
        undefined,
        false,
        "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc",
      );
    });

    it("weth-usdc pool", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Uniswap",
          chainName: "Ethereum",
          poolName: "weth/usdc",
          token: "ETH",
          amount: "4",
        },
        1,
        undefined,
        false,
        "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc",
      );
    });

    it("invalid token, usdt-usdc pool", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "Uniswap",
        chainName: "Ethereum",
        poolName: "usdt-usdc",
        token: "ETH",
        amount: "1000",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        "Depositing into Uniswap usdt-usdc pool is not supported with ETH. Try depositing usdt or usdc.",
      );
    });

    it("Missing pool", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "Uniswap",
        chainName: "Ethereum",
        poolName: null,
        token: "USDT",
        amount: "1000",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        "Missing a pool to deposit into on Uniswap. The pool name should be token-token format.",
      );
    });

    it("usdt-usdc pool", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Uniswap",
          chainName: "Ethereum",
          poolName: "usdt-usdc",
          token: "USDT",
          amount: "1000",
        },
        1,
        undefined,
        false,
        "0x3041cbd36888becc7bbcbc0045e3b1f144466f5f",
      );
    });
  });

  describe.skip("Uniswap v3", () => {
    it("eth-dai pool - dai", async () => {
      const accountAddress = "0x8EB8a3b98659Cce290402893d0123abb75E3ab28";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Uniswap",
          chainName: "Ethereum",
          poolName: "eth-dai",
          token: "DAI",
          amount: "1000",
          range: "10",
        },
        1,
        undefined,
        false,
      );
    });

    it("eth-dai pool - eth", async () => {
      const accountAddress = "0x8EB8a3b98659Cce290402893d0123abb75E3ab28";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Uniswap",
          chainName: "Ethereum",
          poolName: "eth-dai",
          token: "ETH",
          amount: "1",
          range: "10",
        },
        1,
        undefined,
        false,
      );
    });

    it("eth-usdc pool - usdc", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Uniswap",
          chainName: "Ethereum",
          poolName: "eth-usdc",
          token: "USDC",
          amount: "1000",
          range: "10",
        },
        1,
        undefined,
        false,
      );
    });

    it("eth-usdc pool - eth", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Uniswap",
          chainName: "Ethereum",
          poolName: "eth-usdc",
          token: "ETH",
          amount: "1",
          range: "10",
        },
        1,
        undefined,
        false,
      );
    });
  });

  describe("Thruster", () => {
    it("eth-usdb pool", async () => {
      const accountAddress = await getTopHolder("usdb", 81457);
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Thruster",
          chainName: "Blast",
          poolName: "eth/usdb",
          token: "ETH",
          amount: "4",
        },
        81457,
        undefined,
        false,
        "0x12c69BFA3fb3CbA75a1DEFA6e976B87E233fc7df",
      );
    });

    it.skip("usdb-ole pool", async () => {
      const accountAddress = "0x1f054d881216718e5e9fd469c82d09c223bc9995";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Thruster",
          chainName: "Blast",
          poolName: "usdb/ole",
          token: "ole",
          amount: "1000",
        },
        81457,
        undefined,
        false,
      );
    });

    it("invalid token, usdb-ole pool", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0x020ca66c30bec2c4fe3861a94e4db4a498a35872",
        protocolName: "Thruster",
        chainName: "Blast",
        poolName: "usdb-ole",
        token: "ETH",
        amount: "1000",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        "Depositing into Thruster usdb-ole pool is not supported with ETH. Try depositing usdb or ole.",
      );
    });

    it("Missing pool", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0x020ca66c30bec2c4fe3861a94e4db4a498a35872",
        protocolName: "Thruster",
        chainName: "Blast",
        poolName: null,
        token: "USDB",
        amount: "1000",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        "Missing a pool to deposit into on Thruster. The pool name should be token-token format.",
      );
    });
  });

  describe.skip("Thruster v3", () => {
    it("eth-usdb pool - usdb", async () => {
      const accountAddress = await getTopHolder("usdb", 81457);
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Thruster",
          chainName: "Blast",
          poolName: "eth-usdb",
          token: "usdb",
          amount: "1000",
          range: "10",
        },
        81457,
        undefined,
        false,
      );
    });

    it("eth-usdb pool - weth", async () => {
      const accountAddress = await getTopHolder("usdb", 81457);
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Thruster",
          chainName: "Blast",
          poolName: "eth-usdb",
          token: "eth",
          amount: "0.1",
          range: "10",
        },
        81457,
        undefined,
        false,
      );
    });
  });

  describe.skip("Juice", () => {
    it("usdb pool", async () => {
      const accountAddress = "0xe7cbfb8c70d423202033ad4c51ce94ce9e21cfa2";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Juice",
          chainName: "Blast",
          poolName: "usdb",
          token: "USDB",
          amount: "100",
        },
        81457,
      );
    });

    it("weth pool", async () => {
      const accountAddress = "0x874b92Ee1c56A478056672137AD406E2121A12e7";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Juice",
          chainName: "Blast",
          poolName: "weth",
          token: "WETH",
          amount: "3",
        },
        81457,
      );
    });

    it("invalid token, pool", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xe7cbfb8c70d423202033ad4c51ce94ce9e21cfa2",
        protocolName: "Juice",
        chainName: "Blast",
        poolName: "USDC",
        token: "ETH",
        amount: "10",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        getUnsupportedPoolError("Blast", "juice", "usdc"),
      );
    });

    it("Missing pool", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xe7cbfb8c70d423202033ad4c51ce94ce9e21cfa2",
        protocolName: "Juice",
        chainName: "Blast",
        poolName: null,
        token: "ETH",
        amount: "1000",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        getUnsupportedTokenError("Blast", "juice", "ETH"),
      );
    });
  });

  describe("Velodrome", () => {
    it("eth-usdc pool", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Velodrome",
          chainName: "Optimism",
          poolName: "eth/usdc",
          token: "ETH",
          amount: "0.1",
        },
        10,
        undefined,
        false,
        "0xf4f2657ae744354baca871e56775e5083f7276ab",
      );
    });

    it("weth-usdc pool", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Velodrome",
          chainName: "Optimism",
          poolName: "weth/usdc",
          token: "ETH",
          amount: "0.1",
        },
        10,
        undefined,
        false,
        "0xf4f2657ae744354baca871e56775e5083f7276ab",
      );
    });

    it("invalid token, eth-usdc pool", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "Velodrome",
        chainName: "Optimism",
        poolName: "eth-usdc",
        token: "USDT",
        amount: "1",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        "Depositing into Velodrome eth-usdc pool is not supported with USDT. Try depositing eth or usdc.",
      );
    });

    it("Missing pool", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "Velodrome",
        chainName: "Optimism",
        poolName: null,
        token: "USDC",
        amount: "1",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        "Missing a pool to deposit into on Velodrome. The pool name should be token-token format.",
      );
    });

    it("op-usdc pool", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Velodrome",
          chainName: "Optimism",
          poolName: "vamm-op/usdc",
          token: "OP",
          amount: "200",
        },
        10,
        undefined,
        false,
        "0x67f56ac099f11ad5f65e2ec804f75f2cea6ab8c5",
      );
    });
  });

  describe("Aerodrome", () => {
    it("eth-dai pool", async () => {
      const accountAddress = "0x1985ea6e9c68e1c272d8209f3b478ac2fdb25c87";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Aerodrome",
          chainName: "Base",
          poolName: "eth-dai",
          token: "DAI",
          amount: "10",
        },
        8453,
        undefined,
        false,
        "0x9287c921f5d920ceee0d07d7c58d476e46acc640",
      );
    });

    it("weth-dai pool", async () => {
      const accountAddress = "0x1985ea6e9c68e1c272d8209f3b478ac2fdb25c87";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Aerodrome",
          chainName: "Base",
          poolName: "weth-usdc",
          token: "eth",
          amount: "0.1",
        },
        8453,
      );
    });

    it("invalid token, eth-dai pool", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0x1985ea6e9c68e1c272d8209f3b478ac2fdb25c87",
        protocolName: "Aerodrome",
        chainName: "Base",
        poolName: "eth-dai",
        token: "USDC",
        amount: "0.1",
      });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        "Depositing into Aerodrome eth-dai pool is not supported with USDC. Try depositing eth or dai.",
      );
    });

    it("Missing pool", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0x1985ea6e9c68e1c272d8209f3b478ac2fdb25c87",
        protocolName: "Aerodrome",
        chainName: "Base",
        poolName: null,
        token: "DAI",
        amount: "0.1",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        "Missing a pool to deposit into on Aerodrome. The pool name should be token-token format.",
      );
    });

    it("dai-usdc pool", async () => {
      const accountAddress = "0x1985ea6e9c68e1c272d8209f3b478ac2fdb25c87";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Aerodrome",
          chainName: "Base",
          poolName: "dai/usdc",
          token: "DAI",
          amount: "20",
        },
        8453,
        undefined,
        false,
        "0x67b00b46fa4f4f24c03855c5c8013c0b938b3eec",
      );
    });

    it("weth-usdc pool", async () => {
      const accountAddress = "0xD204E3dC1937d3a30fc6F20ABc48AC5506C94D1E";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Aerodrome",
          chainName: "Base",
          poolName: "vamm-weth/usdc",
          token: "usdc",
          amount: "20",
        },
        8453,
        undefined,
        false,
        "0xcDAC0d6c6C59727a65F871236188350531885C43",
      );
    });
  });

  it.skip("Rodeo", async () => {
    const accountAddress = "0x940a7ed683A60220dE573AB702Ec8F789ef0A402";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Rodeo",
      chainName: "Arbitrum",
      poolName: "gmx-glp",
      token: "USDC.e",
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

  describe.skip("Bladeswap - Deposit", () => {
    const accountAddress = "0x58cCd9d9F461FC2D821CbaB2E631A348f52dc795";
    const testCases = [
      {
        poolName: "Blade-ETH",
        token: "BLADE",
        amount: "5",
      },
      {
        poolName: "ezETH-ETH",
        token: "ezeth",
        amount: "5",
      },
      {
        poolName: "PAC-ETH",
        token: "PAC",
        amount: "5",
      },
      {
        poolName: "orbit-eth",
        token: "orbit",
        amount: "100",
      },
      {
        poolName: "usdb-eth",
        token: "eth",
        amount: "1",
      },
    ];
    for (const { poolName, token, amount } of testCases) {
      it(`Deposit ${amount} ${token} on bladeswap ${poolName} blast`, async () => {
        await test(
          accountAddress,
          {
            accountAddress,
            protocolName: "bladeswap",
            chainName: "blast",
            poolName,
            token,
            amount,
          },
          81457,
          undefined,
          true,
        );
      });
    }
    it("Pool name missing with invalid token", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Bladeswap",
        chainName: "Blast",
        poolName: null,
        token: "HELGA",
        amount: "5",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        getMissingPoolNameError("Blast", "Bladeswap", "HELGA"),
      );
    });

    it("Invalid token - Blade-ETH", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Bladeswap",
        chainName: "Blast",
        poolName: "Blade-ETH",
        token: "HELGA",
        amount: "5",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        getUnsupportedPoolTokenError(
          "Blast",
          "Bladeswap",
          "Blade-ETH",
          "HELGA",
        ),
      );
    });
  });

  describe("Stargate", () => {
    const testCases = [
      {
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        token: "USDT",
        amount: "100",
        lpToken: "0x38ea452219524bb87e18de1c24d3bb59510bd783",
      },
      {
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        token: "USDC",
        amount: "100",
        lpToken: "0xdf0770df86a8034b3efef0a1bb3c889b8332ff56",
      },
      {
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        token: "DAI",
        amount: "100",
        lpToken: "0x0faf1d2d3ced330824de3b8200fc8dc6e397850d",
      },
      {
        accountAddress: "0x267fc49a3170950Ee5d49eF84878695c29cCA1e0",
        token: "FRAX",
        amount: "100",
        blockNumber: 19145290,
        lpToken: "0xfa0f307783ac21c39e939acff795e27b650f6e68",
      },
      {
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        token: "USDD",
        amount: "100",
        lpToken: "0x692953e758c3669290cb1677180c64183cee374e",
      },
    ];

    for (const {
      accountAddress,
      token,
      amount,
      blockNumber,
      lpToken,
    } of testCases) {
      it(`${token} pool`, async () => {
        await test(
          accountAddress,
          {
            accountAddress,
            protocolName: "Stargate",
            chainName: "Ethereum",
            token,
            amount,
          },
          1,
          blockNumber,
          false,
          lpToken,
          amount,
        );
      });

      it("Stargate - Invalid token", async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "Stargate",
          chainName: "Ethereum",
          token: "HELGA",
          amount,
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty("status");
        expect(res.body.status).toEqual("error");
        expect(res.body).toHaveProperty("message");
        expect(res.body.message).toEqual(
          getUnsupportedTokenError("Ethereum", "Stargate", "HELGA"),
        );
      });
    }
  });

  describe.skip("Curve", () => {
    const testCases = [
      {
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        poolName: "3pool",
        token: "USDC",
        amount: "100",
        lpToken: "0x6c3f90f043a72fa612cbac8115ee7e52bde6e490",
      },
      {
        accountAddress: "0xA91661efEe567b353D55948C0f051C1A16E503A5",
        poolName: "steth",
        token: "steth",
        amount: "100",
        lpToken: "0x06325440d014e39736583c165c2963ba99faf14e",
      },
      {
        accountAddress: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
        poolName: "fraxusdc",
        token: "usdc",
        amount: "100",
        blockNumber: 19145290,
        lpToken: "0x3175df0976dfa876431c2e9ee6bc45b65d3473cc",
      },
      {
        accountAddress: "0x051d091B254EcdBBB4eB8E6311b7939829380b27",
        poolName: "tricrypto2",
        token: "wbtc",
        amount: "100",
        lpToken: "0xc4ad29ba4b3c580e6d59105fff484999997675ff",
      },
      {
        accountAddress: "0x267fc49a3170950Ee5d49eF84878695c29cCA1e0",
        poolName: "fraxusdp",
        token: "frax",
        amount: "100",
        blockNumber: 19145290,
        lpToken: "0xfc2838a17d8e8b1d5456e0a351b0708a09211147",
      },
    ];

    const testERR = [
      {
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        poolName: "3pool",
        token: "USDC",
        amount: "100",
        lpToken: "0x6c3f90f043a72fa612cbac8115ee7e52bde6e490",
      },
      {
        accountAddress: "0xA91661efEe567b353D55948C0f051C1A16E503A5",
        poolName: "steth",
        token: "steth",
        amount: "100",
        lpToken: "0x06325440d014e39736583c165c2963ba99faf14e",
      },
      {
        accountAddress: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
        poolName: "fraxusdc",
        token: "usdc",
        amount: "100",
        blockNumber: 19145290,
        lpToken: "0x3175df0976dfa876431c2e9ee6bc45b65d3473cc",
      },
      {
        accountAddress: "0x267fc49a3170950Ee5d49eF84878695c29cCA1e0",
        poolName: "fraxusdp",
        token: "frax",
        amount: "100",
        blockNumber: 19145290,
        lpToken: "0xfc2838a17d8e8b1d5456e0a351b0708a09211147",
      },
    ];

    const testTX = [
      {
        accountAddress: "0x051d091B254EcdBBB4eB8E6311b7939829380b27",
        poolName: "tricrypto2",
        token: "wbtc",
        amount: "100",
        lpToken: "0xc4ad29ba4b3c580e6d59105fff484999997675ff",
      },
    ];

    for (const { accountAddress, token, amount } of testERR) {
      it("Pool name missing", async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "Curve",
          chainName: "Ethereum",
          poolName: null,
          token,
          amount,
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty("status");
        expect(res.body.status).toEqual("error");
        expect(res.body).toHaveProperty("message");
        expect(res.body.message).toEqual(
          getMissingPoolNameError("Ethereum", "Curve", token),
        );
      });
    }

    for (const { accountAddress, poolName, token, amount, lpToken } of testTX) {
      it("missing pool name - run tx", async () => {
        await test(
          accountAddress,
          {
            accountAddress,
            protocolName: "Curve",
            chainName: "Ethereum",
            poolName,
            token,
            amount,
          },
          1,
          undefined,
          true,
          lpToken,
        );
      });
    }

    for (const {
      accountAddress,
      poolName,
      token,
      amount,
      blockNumber,
      lpToken,
    } of testCases) {
      if (poolName !== "steth") continue;
      it(poolName, async () => {
        await test(
          accountAddress,
          {
            accountAddress,
            protocolName: "Curve",
            chainName: "Ethereum",
            poolName,
            token,
            amount,
          },
          1,
          blockNumber,
          true,
          lpToken,
        );
      });

      it("Pool name missing with invalid token", async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "Curve",
          chainName: "Ethereum",
          poolName: null,
          token: "HELGA",
          amount,
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty("status");
        expect(res.body.status).toEqual("error");
        expect(res.body).toHaveProperty("message");
        expect(res.body.message).toEqual(
          getMissingPoolNameError("Ethereum", "Curve", "HELGA"),
        );
      });

      it(`Invalid token - ${poolName}`, async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "Curve",
          chainName: "Ethereum",
          poolName,
          token: "HELGA",
          amount,
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty("status");
        expect(res.body.status).toEqual("error");
        expect(res.body).toHaveProperty("message");
        expect(res.body.message).toEqual(
          getUnsupportedPoolTokenError("Ethereum", "Curve", poolName, "HELGA"),
        );
      });
    }
  });

  it.skip("Dopex", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Dopex",
      chainName: "Arbitrum",
      poolName: "arb-monthly-ssov",
      token: "USDC",
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

  describe.skip("Dolomite", () => {
    const tokens = [
      { symbol: "usdc", amount: "100" },
      { symbol: "eth", amount: "1" },
      { symbol: "usdt", amount: "100" },
      { symbol: "dai", amount: "100" },
      { symbol: "arb", amount: "100" },
      { symbol: "pendle", amount: "100" },
      // {
      //   symbol: "jUSDC",
      //   amount: "1",
      //   account: "0x8Fec806c9e94ff7AB2AF3D7e4875c2381413f98E",
      // },
      {
        symbol: "plvGLP",
        amount: "1",
        account: "0xF8a617cE9Ab59deb6939Bd865B7D33203752F962",
      },
      {
        symbol: "PT-rETH",
        amount: "0.1",
        account: "0x71F12a5b0E60d2Ff8A87FD34E7dcff3c10c914b0",
      },
      {
        symbol: "PT-wstETH",
        amount: "0.1",
        account: "0x7877AdFaDEd756f3248a0EBfe8Ac2E2eF87b75Ac",
      },
    ];
    for (const { symbol, amount, account } of tokens) {
      it(`${symbol.toUpperCase()} pool`, async () => {
        const accountAddress =
          account || "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
        await test(
          accountAddress,
          {
            accountAddress,
            protocolName: "Dolomite",
            chainName: "Arbitrum",
            poolName: null,
            token: symbol,
            amount,
          },
          42161,
        );
      });
    }

    it("Invalid token", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D",
        protocolName: "dolomite",
        chainName: "Arbitrum",
        poolName: null,
        token: "AWETH",
        amount: "10",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        getUnsupportedTokenError("Arbitrum", "dolomite", "AWETH"),
      );
    });
  });

  describe("Synapse", () => {
    it("USDC pool", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Synapse",
          chainName: "Ethereum",
          poolName: null,
          token: "USDC",
          amount: "100",
        },
        1,
        undefined,
        false,
        "0x1b84765de8b7566e4ceaf4d0fd3c5af52d3dde4f",
        "100",
      );
    });

    it("USDC pool - Invalid token", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "Synapse",
        chainName: "Ethereum",
        poolName: null,
        token: "HELGA",
        amount: "100",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        getUnsupportedTokenError("Ethereum", "Synapse", "HELGA"),
      );
    });

    it("USDT pool", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Synapse",
          chainName: "Ethereum",
          poolName: null,
          token: "USDT",
          amount: "100",
        },
        1,
        undefined,
        false,
        "0x1b84765de8b7566e4ceaf4d0fd3c5af52d3dde4f",
        "100",
      );
    });

    it("DAI pool", async () => {
      const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "Synapse",
          chainName: "Ethereum",
          poolName: null,
          token: "DAI",
          amount: "100",
        },
        1,
        undefined,
        false,
        "0x1b84765de8b7566e4ceaf4d0fd3c5af52d3dde4f",
        "100",
      );
    });
  });

  it("Hop", async () => {
    const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
    await test(
      accountAddress,
      {
        accountAddress,
        protocolName: "Hop",
        chainName: "Arbitrum",
        poolName: null,
        token: "USDT",
        amount: "100",
      },
      42161,
      undefined,
      false,
      "0xce3b19d820cb8b9ae370e423b0a329c4314335fe",
    );
  });

  it("Hop - Invalid token", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D",
      protocolName: "Hop",
      chainName: "Arbitrum",
      poolName: null,
      token: "HELGA",
      amount: "100",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      getUnsupportedTokenError("Arbitrum", "Hop", "HELGA"),
    );
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

      it("EigenLayer - Invalid token", async () => {
        const res = await request(app).post(endpoint).send({
          accountAddress: "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D",
          protocolName: "EigenLayer",
          chainName: "Ethereum",
          poolName: null,
          token: "HELGA",
          amount: "1",
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty("status");
        expect(res.body.status).toEqual("error");
        expect(res.body).toHaveProperty("message");
        expect(res.body.message).toEqual(
          getUnsupportedTokenError("Ethereum", "EigenLayer", "HELGA"),
        );
      });
    }
  });

  it("Rocket Pool - Token Not Supported error", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "RocketPool",
      chainName: "Ethereum",
      poolName: null,
      token: "USDT",
      amount: "100",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      getUnsupportedTokenError("Ethereum", "RocketPool", "USDT"),
    );
  });

  it("Pendle - Unsupported Pool Error", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Pendle",
      chainName: "Ethereum",
      poolName: "invalidPool",
      token: "stETH",
      amount: "100",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "Pendle market for pool invalidPool does not exist",
    );
  });

  it("Plutus - Invalid Token Address Error", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Plutus",
      chainName: "Arbitrum",
      poolName: null,
      token: "invalidToken", // Assume an invalid token address
      amount: "100",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      getUnsupportedTokenError("Arbitrum", "Plutus", "INVALIDTOKEN"),
    );
  });

  it.skip("Rodeo - Amount Is Invalid Error", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0x940a7ed683A60220dE573AB702Ec8F789ef0A402",
      protocolName: "Rodeo",
      chainName: "Arbitrum",
      poolName: "gmx-glp",
      token: "USDC.e",
      amount: "invalidAmount", // Assume an invalid amount format
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual("invalidAmount is an invalid amount");
  });

  it("Curve - Invalid Pool Error", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Curve",
      chainName: "Ethereum",
      poolName: "invalidPool", // Assume an invalid pool name
      token: "USDC",
      amount: "100",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      getUnsupportedPoolError("Ethereum", "curve", "invalidpool"),
    );
  });

  it.skip("Dopex - Pool Not Found Error", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Dopex",
      chainName: "Arbitrum",
      poolName: "nonexistentPool", // Assume a pool that does not exist
      token: "USDC",
      amount: "100",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual("Pool not found");
  });

  it.skip("Synapse - Unsupported Protocol Error", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Synapse",
      chainName: "Ethereum",
      poolName: null,
      token: "USDT",
      amount: "100",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual("Unsupported protocol");
  });

  it("Hop - Amount Is Zero Error", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Hop",
      chainName: "Arbitrum",
      poolName: null,
      token: "USDT",
      amount: "0", // Assume depositing zero amount
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "The amount being used is zero, ensure you have funds on your Slate account",
    );
  });

  it("Hop - Amount Is Invalid Error", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "Hop",
      chainName: "Arbitrum",
      poolName: null,
      token: "USDT",
      amount: "-100", // Assume depositing a negative amount
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "-100 is an invalid amount. Please specify an amount correctly and try again.",
    );
  });

  async function getTokenBalance(
    account: string,
    provider: RetryProvider,
    tokenInfo: TokenInfo | undefined,
  ) {
    if (!tokenInfo) return;
    const nativeTokenSymbol = getNativeTokenSymbolForChain(
      Number((await provider.getNetwork()).chainId),
    )?.toLowerCase();
    if (tokenInfo.symbol.toLowerCase() === nativeTokenSymbol) {
      return await provider.getBalance(account);
    }
    assert(isHexStr(tokenInfo.address));
    assert(isHexStr(account));
    return await (await getViemPublicClientFromEthers(provider)).readContract({
      address: tokenInfo.address,
      abi: abis.erc20,
      functionName: "balanceOf",
      args: [account],
    });
  }

  async function test(
    accountAddress: string | undefined,
    body: JSONObject,
    chainId: ChainId,
    blockNumber: number | undefined = undefined,
    increaseBalance: JSONObject | boolean = false,
    lpToken: string | undefined = undefined,
    balanceChange: string | undefined = undefined,
  ) {
    const res = await request(app).post(endpoint).send(body);
    if (res.statusCode === 400) {
      const msg = res.body.message.toLowerCase();
      expect(
        msg.includes("expired") ||
          msg.includes("differ on underlying token") ||
          msg.includes("unsupported method") ||
          msg.includes("cannot deposit lp"),
      ).toEqual(true);
      return;
    }
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

    const { vnetId, rpcUrl } = await createVnet(chainId, blockNumber);
    const provider = new RetryProvider(rpcUrl, chainId);

    if (increaseBalance) {
      if (typeof increaseBalance === "object") {
        await Promise.all(
          Object.entries(increaseBalance).map(([token, amount]) =>
            increaseTokenBalance(
              rpcUrl,
              accountAddress || "",
              getChainNameFromId(chainId),
              token,
              amount,
            ),
          ),
        );
      } else {
        await increaseTokenBalance(
          rpcUrl,
          accountAddress || "",
          body.chainName,
          body.token,
          body.amount,
        );
      }
    }

    let tokenInfo: TokenInfo | undefined;
    let token: ethers.Contract | undefined;
    let decimals = 18;
    let beforeBalance = 0n;

    if (lpToken) {
      tokenInfo = await getTokenInfoForChain(
        lpToken,
        getChainNameFromId(chainId),
      );
      if (tokenInfo?.address) {
        const viemClient = await getViemPublicClientFromEthers(provider);
        assert(isHexStr(tokenInfo.address));
        assert(isHexStr(accountAddress));
        [decimals, beforeBalance] = await Promise.all([
          viemClient.readContract({
            address: tokenInfo.address,
            abi: abis.erc20,
            functionName: "decimals",
          }),
          viemClient.readContract({
            address: tokenInfo.address,
            abi: abis.erc20,
            functionName: "balanceOf",
            args: [accountAddress],
          }),
        ]);
      }
    }
    const pName = body.protocolName;
    let depositTokenInfo: TokenInfo | undefined;

    if (pName.toLowerCase() === "dolomite") {
      const isoData = (LPAddresses.dolomite as JSONObject)[chainId.toString()];
      const lpList = Object.keys(isoData);
      const dToken = body.token;
      if (lpList.includes(dToken.toLowerCase())) {
        const tAddr = isoData[dToken.toLowerCase()].token;
        depositTokenInfo = await getTokenInfoForChain(
          tAddr,
          getChainNameFromId(chainId),
        );
      } else {
        depositTokenInfo = await getTokenInfoForChain(
          body.token,
          getChainNameFromId(chainId),
        );
      }
    } else {
      depositTokenInfo = await getTokenInfoForChain(
        body.token,
        getChainNameFromId(chainId),
      );
    }

    const depositBeforeBalance = await getTokenBalance(
      accountAddress || "",
      provider,
      depositTokenInfo,
    );

    const success = await runTxsOnVnet(
      provider,
      accountAddress || "",
      res.body.transactions,
      { chainId, vnetId, action: "deposit" },
    );

    expect(success).toEqual(true);

    const depositAfterBalance = await getTokenBalance(
      accountAddress || "",
      provider,
      depositTokenInfo,
    );
    const change = Number.parseFloat(
      ethers.formatUnits(
        (depositBeforeBalance || 0n) - (depositAfterBalance || 0n),
        depositTokenInfo?.decimals,
      ),
    );

    if (body.protocolName.toLowerCase() === "pendle") {
      /* empty */
    } else if (depositTokenInfo?.symbol === "eth") {
      expect(Number.parseFloat(body.amount) * 0.999).toBeLessThanOrEqual(
        change,
      );
    } else {
      expect(Number.parseFloat(body.amount)).toBeGreaterThanOrEqual(change);
    }

    if (lpToken) {
      const afterBalance: bigint = await token?.balanceOf(accountAddress);
      const change = Number.parseFloat(
        ethers.formatUnits(afterBalance - beforeBalance, decimals),
      );

      if (balanceChange) {
        expect(
          (Math.abs(change - +balanceChange) * 100) / +balanceChange,
        ).toBeLessThan(5); // 5% slippage
      } else {
        expect(change).toBeGreaterThan(0);
      }
    }
  }
});
