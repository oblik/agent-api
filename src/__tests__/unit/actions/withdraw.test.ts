import { ethers } from "ethers";
import request from "supertest";
import app from "../../../app.js";
import { abis } from "../../../config/abis.js";
import strategies from "../../../config/eigenlayer/strategies.js";
import LPAddresses from "../../../config/lptokens.js";
import {
  getChainError,
  getMissingPoolNameError,
  getMissingPoolNameWithdrawError,
  getUnsupportedProtocolError,
} from "../../../utils/error.js";
import { getViemPublicClientFromEthers } from "../../../utils/ethers2viem.js";
import {
  getApproveData,
  getChainIdFromName,
  getChainNameFromId,
  getLPTokenInfo,
  getNativeTokenSymbolForChain,
  getProtocolAddressForChain,
  getTokenInfoForChain,
  isValidChainId,
  sfParseUnits,
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
  increaseTokenBalance,
  runTxsOnVnet,
  simulateTxs,
} from "../../helper.js";

const endpoint = `/withdraw?secret=${process.env.BACKEND_TOKEN_SECRET}`;

jest.retryTimes(1);

describe("Withdraw", () => {
  beforeEach(() => {
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
        it(`Withdraw ${tc.token} from Aave on ${chainName}`, async () => {
          const depositRes = await request(app)
            .post(`/deposit?secret=${process.env.BACKEND_TOKEN_SECRET}`)
            .send({
              accountAddress,
              protocolName: "Aave",
              chainName,
              ...tc,
            });

          const { rpcUrl } = await createVnet(chainId, undefined);
          await increaseTokenBalance(
            rpcUrl,
            accountAddress,
            chainName,
            tc.token,
            tc.amount,
          );

          const provider = new RetryProvider(rpcUrl, chainId);
          let success = await runTxsOnVnet(
            provider,
            accountAddress,
            depositRes.body.transactions,
          );
          expect(success).toEqual(true);

          const { lp } = await getLPTokenInfo(
            { protocolName: "aave", token: tc.token },
            chainId as ChainId,
            provider,
          );
          if (!lp?.address) {
            expect(lp?.address).toBeTruthy();
            return;
          }
          assert(isHexStr(lp.address));
          const decimals = await (
            await getViemPublicClientFromEthers(provider)
          ).readContract({
            address: lp.address,
            abi: abis.erc20,
            functionName: "decimals",
          });
          if (!chainId) {
            throw new Error(`Invalid chainName: ${chainName}`);
          }
          if (!isValidChainId(chainId)) {
            throw new Error(`Invalid chain id: ${chainId}`);
          }
          const approveTxs = await getApproveData(
            provider,
            lp,
            sfParseUnits(tc.amount, decimals),
            accountAddress,
            getProtocolAddressForChain(
              "aave",
              chainId,
              tc.token === "ETH" ? "wrapper" : "default",
            ) || "",
          );
          if (approveTxs.length > 0) {
            success = await runTxsOnVnet(provider, accountAddress, approveTxs);
            expect(success).toEqual(true);
          }

          const res = await request(app)
            .post(endpoint)
            .send({
              accountAddress,
              protocolName: "Aave",
              chainName,
              ...tc,
            });
          expect(res.statusCode).toEqual(200);
          expect(res.body).toHaveProperty("status");
          expect(res.body.status).toEqual("success");
          expect(res.body).toHaveProperty("transactions");
          success = await runTxsOnVnet(
            provider,
            accountAddress,
            res.body.transactions,
          );
          expect(success).toEqual(true);
        }, 300000);
      }
    }
  });

  it.skip("Ambient ETH-WBTC", async () => {
    const accountAddress = "0x9ffa87c59ab119d6f63e4cd94a5613bde210cfb6";

    const { rpcUrl } = await createVnet(1);
    const provider = new RetryProvider(rpcUrl, 1);

    const res = await request(app).post(endpoint).send({
      accountAddress,
      chainName: "ethereum",
      protocolName: "ambient",
      poolName: "eth-wbtc",
      amount: "0.005",
      token: "eth",
      range: 30,
      lowerTick: 258320,
      upperTick: 260336,
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

  describe.skip("Bladeswap", () => {
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
    for (const {
      poolName,
      amount,
      token,
      // lp
    } of testCases) {
      it(`Withdraw from ${poolName.toUpperCase()} pool on bladeswap protocol`, async () => {
        const accountAddress = "0x58cCd9d9F461FC2D821CbaB2E631A348f52dc795";
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

    it("Missing pool name", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D",
        protocolName: "Bladeswap",
        chainName: "Blast",
        poolName: null,
        token: "USDC",
        amount: "2",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      checkError(res.body.message);
    });
  });

  describe("Camelot", () => {
    const testCases = [
      {
        account: "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D",
        poolName: "eth-usdc",
        tokens: ["USDC"],
        amounts: ["200"],
        lp: "0x54B26fAf3671677C19F70c4B879A6f7B898F732c",
      },
      {
        account: "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D",
        poolName: "usdt-usdc.e",
        tokens: ["USDT"],
        amounts: ["100"],
      },
    ];

    for (const { account, poolName, tokens, amounts, lp } of testCases) {
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const amount = amounts[i];

        it(`Withdraw ${amount} ${token} from ${poolName}`, async () => {
          await test(
            account,
            {
              accountAddress: account,
              protocolName: "Camelot",
              chainName: "Arbitrum",
              poolName,
              token,
              amount,
            },
            42161,
            undefined,
            false,
            lp,
          );
        });
      }
    }

    it("Missing pool name", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D",
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
      checkError(res.body.message);
    });

    it("Missing pool name, run tx", async () => {
      const accountAddress = "0xa5ef861278d7bf18a8a2068a01d66fbded93a1bd";
      const { vnetId, rpcUrl } = await createVnet(42161);
      const provider = new RetryProvider(rpcUrl, 42161);

      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "Camelot",
        chainName: "Arbitrum",
        poolName: null,
        token: "USDC.e",
        amount: "1",
      });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("success");
      expect(res.body).toHaveProperty("transactions");
      expect(res.body.transactions).toHaveLength(2);

      const withdrawTokenInfo = await getTokenInfoForChain(
        "USDC.e",
        "Arbitrum",
      );
      if (!withdrawTokenInfo) throw new Error("Withdraw token info not found");

      const withdrawBeforeBalance = await getTokenBalance(
        accountAddress,
        provider,
        withdrawTokenInfo,
      );
      const success = await runTxsOnVnet(
        provider,
        accountAddress,
        res.body.transactions,
        { chainId: 42161, vnetId, action: "withdraw" },
      );

      expect(success).toEqual(true);

      const withdrawAfterBalance = await getTokenBalance(
        accountAddress,
        provider,
        withdrawTokenInfo,
      );
      const change = Number.parseFloat(
        ethers.formatUnits(
          (withdrawAfterBalance || 0n) - (withdrawBeforeBalance || 0n),
          withdrawTokenInfo?.decimals,
        ),
      );
      const wAmount = Number.parseFloat("1");
      expect((Math.abs(change - wAmount) / wAmount) * 100).toBeLessThan(5);
    });
  });

  describe.skip("Camelot v3", () => {
    const testCases = [
      {
        accountAddress: "0x1cfceb8466dec6e0a8ab1d29cc5adb5b47883dd0",
        poolName: "eth-rdnt",
        token: "rdnt",
        amount: "1000",
        tokenId: 90599,
        liquidity0: "2229470200000000000000",
        liquidity1: "115900000000000000",
      },
      {
        accountAddress: "0x1cfceb8466dec6e0a8ab1d29cc5adb5b47883dd0",
        poolName: "eth-rdnt",
        token: "eth",
        amount: "0.05",
        tokenId: 90599,
        liquidity0: "115900000000000000",
        liquidity1: "2229470200000000000000",
      },
    ];
    for (const {
      accountAddress,
      poolName,
      token,
      amount,
      tokenId,
      liquidity0,
      liquidity1,
    } of testCases) {
      it(`${poolName} pool - ${token}`, async () => {
        const { rpcUrl } = await createVnet(42161, 218500000);
        const provider = new RetryProvider(rpcUrl, 42161);

        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "Camelot",
          chainName: "Arbitrum",
          poolName,
          token,
          amount,
          range: "10",
          tokenId,
          liquidity0,
          liquidity1,
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
    }
  });

  describe("Compound", () => {
    const testCases: Record<string, Record<string, JSONObject[]>> = {
      ethereum: {
        usdc: [
          { symbol: "WETH", amount: "0.1" },
          { symbol: "LINK", amount: "50" },
          { symbol: "WBTC", amount: "0.1" },
        ],
        usdt: [
          { symbol: "WETH", amount: "0.1" },
          { symbol: "LINK", amount: "50" },
          { symbol: "WBTC", amount: "0.1" },
        ],
        weth: [
          { symbol: "ETH", amount: "0.1" },
          { symbol: "cbETH", amount: "0.1" },
          { symbol: "rETH", amount: "0.1" },
        ],
      },
      arbitrum: {
        usdc: [
          { symbol: "ETH", amount: "0.1" },
          { symbol: "ARB", amount: "20" },
          { symbol: "GMX", amount: "1" },
          { symbol: "WETH", amount: "0.1" },
        ],
        "usdc.e": [
          { symbol: "ETH", amount: "0.1" },
          { symbol: "ARB", amount: "20" },
          { symbol: "GMX", amount: "1" },
          { symbol: "WETH", amount: "0.1" },
        ],
        usdt: [
          { symbol: "ETH", amount: "0.1" },
          { symbol: "ARB", amount: "20" },
          { symbol: "GMX", amount: "1" },
          { symbol: "WETH", amount: "0.1" },
        ],
        weth: [
          { symbol: "ETH", amount: "0.1" },
          { symbol: "rETH", amount: "0.1" },
          { symbol: "wstETH", amount: "1" },
          { symbol: "WETH", amount: "0.1" },
        ],
      },
      base: {
        usdbc: [
          { symbol: "ETH", amount: "0.1" },
          { symbol: "cbETH", amount: "0.01" },
          { symbol: "USDbC", amount: "100" },
        ],
        usdc: [
          { symbol: "ETH", amount: "0.1" },
          { symbol: "cbETH", amount: "0.01" },
          { symbol: "USDC", amount: "100" },
        ],
        weth: [
          { symbol: "ETH", amount: "0.1" },
          { symbol: "cbETH", amount: "0.01" },
        ],
      },
      optimism: {
        usdc: [
          { symbol: "WETH", amount: "0.1" },
          { symbol: "WBTC", amount: "0.1" },
        ],
        usdt: [
          { symbol: "WETH", amount: "0.1" },
          { symbol: "USDT", amount: "50" },
          { symbol: "WBTC", amount: "0.1" },
        ],
        weth: [
          { symbol: "ETH", amount: "0.1" },
          { symbol: "wstETH", amount: "0.1" },
          { symbol: "rETH", amount: "0.1" },
        ],
      },
    };

    for (const chainName of Object.keys(testCases)) {
      const chainId = getChainIdFromName(chainName, true);
      const chainTestCases = testCases[chainName];
      for (const poolName of Object.keys(chainTestCases)) {
        const tokens = chainTestCases[poolName];

        for (const tc of tokens) {
          it(`Withdraw ${tc.symbol} from ${poolName} pool on ${chainName}`, async () => {
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
            );
          });
        }
      }
    }

    it.skip("Missing pool name - with no position", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0x43d85b781Ca0A33F42bB8Aad0a0023F85b270229",
        protocolName: "Compound",
        chainName: "Ethereum",
        poolName: null,
        token: "WETH",
        amount: "10",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      checkError(res.body.message);
    });
  });

  describe.skip("Dolomite", () => {
    const tokens = [
      { symbol: "eth", amount: "1" },
      { symbol: "usdt", amount: "100" },
      { symbol: "dai", amount: "100" },
      { symbol: "eth", amount: "10" },
      { symbol: "arb", amount: "100" },
      { symbol: "usdc", amount: "100" },
      {
        symbol: "jUSDC",
        amount: "1",
        account: "0x8Fec806c9e94ff7AB2AF3D7e4875c2381413f98E",
      },
      {
        symbol: "plvGLP",
        amount: "1",
        account: "0xF8a617cE9Ab59deb6939Bd865B7D33203752F962",
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
        "Withdrawing from protocol dolomite is not supported with token aweth.",
      );
    });
  });

  describe.skip("Lodestar", () => {
    const tokens = [
      { symbol: "magic", amount: "100" },
      { symbol: "usdc.e", amount: "100" },
      { symbol: "usdt", amount: "100" },
      { symbol: "dai", amount: "100" },
      { symbol: "eth", amount: "10" },
      { symbol: "arb", amount: "100" },
      { symbol: "gmx", amount: "100" },
      { symbol: "usdc", amount: "100" },
    ];
    for (const { symbol, amount } of tokens) {
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
        );
      });
    }
  });

  // unsupported
  describe.skip("GMX-Arbitrum", () => {
    it("WETH-USDC", async () => {
      const accountAddress = "0xd468808cC9e30f0Ae5137805fff7ffB213984250";
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
        undefined,
        { USDC: 100 },
      );
    });

    it("Missing pool name", async () => {
      const accountAddress = "0xccb12611039c7cd321c0f23043c841f1d97287a5";
      const res = await request(app).post(endpoint).send({
        accountAddress,
        protocolName: "GMX",
        chainName: "Arbitrum",
        poolName: null,
        token: "USDC",
        amount: "10",
      });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual("all pool not supported on chain 42161");
    });

    it("USDC-USDC.E", async () => {
      const accountAddress = "0xe1f7c5209938780625E354dc546E28397F6Ce174";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Arbitrum",
          poolName: "USDC-USDC.E",
          token: "USDC",
          amount: "100",
        },
        42161,
        undefined,
        {
          USDC: 100,
        },
      );
    });

    it("BTC-USDC", async () => {
      const accountAddress = "0x9F6478a876D7765F44BDA712573820eb3AE389fB";
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
        undefined,
        {
          USDC: 100,
        },
      );
    });

    it("ARB-USDC", async () => {
      const accountAddress = "0x4e4c132Ba29E6927b39d0b2286D6BE8c1cf3647D";
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
        undefined,
        {
          USDC: 100,
        },
      );
    });

    it("LINK-USDC", async () => {
      const accountAddress = "0xe1f7c5209938780625E354dc546E28397F6Ce174";
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
        undefined,
        {
          USDC: 100,
        },
      );
    });

    it("SOL-USDC", async () => {
      const accountAddress = "0xe1f7c5209938780625E354dc546E28397F6Ce174";
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
        undefined,
        {
          USDC: 100,
        },
      );
    });
  });

  // unsupported
  describe.skip("GMX-Avalanche", () => {
    it("AVAX-USDC", async () => {
      const accountAddress = "0xe1f7c5209938780625E354dc546E28397F6Ce174";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Avalanche",
          poolName: "AVAX-USDC",
          token: "USDC",
          amount: "10",
        },
        43114,
        undefined,
        {
          USDC: 100,
        },
      );
    });

    it("BTC-USDC", async () => {
      const accountAddress = "0xe1f7c5209938780625E354dc546E28397F6Ce174";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Avalanche",
          poolName: "BTC-USDC",
          token: "USDC",
          amount: "100",
        },
        43114,
        undefined,
        {
          USDC: 100,
        },
      );
    });

    it("ETH-USDC", async () => {
      const accountAddress = "0x6760Ff558c1db2231EB2Cf1D16de05B01231193E";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Avalanche",
          poolName: "ETH-USDC",
          token: "USDC",
          amount: "100",
        },
        43114,
        undefined,
        {
          USDC: 100,
        },
      );
    });

    it("SOL-USDC", async () => {
      const accountAddress = "0x20b67653BBC41a7cecA0Afc0072e3FCdFada7c34";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Avalanche",
          poolName: "SOL-USDC",
          token: "USDC",
          amount: "100",
        },
        43114,
        undefined,
        {
          USDC: 100,
        },
      );
    });

    it("DOGE-USDC", async () => {
      const accountAddress = "0x20b67653BBC41a7cecA0Afc0072e3FCdFada7c34";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Avalanche",
          poolName: "DOGE-USDC",
          token: "USDC",
          amount: "100",
        },
        43114,
        undefined,
        {
          USDC: 100,
        },
      );
    });

    it("XRP-USDC", async () => {
      const accountAddress = "0x20b67653BBC41a7cecA0Afc0072e3FCdFada7c34";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Avalanche",
          poolName: "XRP-USDC",
          token: "USDC",
          amount: "10",
        },
        43114,
        undefined,
        {
          USDC: 100,
        },
      );
    });

    it("USDC-USDC.E", async () => {
      const accountAddress = "0xe1f7c5209938780625E354dc546E28397F6Ce174";
      await test(
        accountAddress,
        {
          accountAddress,
          protocolName: "GMX",
          chainName: "Avalanche",
          poolName: "USDC-USDC.E",
          token: "USDC",
          amount: "10",
        },
        43114,
        undefined,
        {
          USDC: 100,
        },
      );
    });
  });

  it("Rocket Pool", async () => {
    const accountAddress = "0x84319955c56f929fC86Cf878189bcCd0Ab4eFe5c";
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
    );
  });

  describe("Pendle - Ethereum", () => {
    const testETHCases = [
      {
        deposit: {
          poolName: "sy-weeth",
          token: "weeth",
          amount: "0.1",
        },
        withdraw: {
          poolName: "sy-weeth",
          token: "pt-weeth",
          amount: "0.05",
        },
      },
      // {
      //   deposit: {
      //     poolName: "rseth-lp",
      //     token: "rseth",
      //     amount: "0.1",
      //   },
      //   withdraw: {
      //     poolName: "sy-rseth",
      //     token: "rseth-lp",
      //     amount: "0.05",
      //   },
      // },
      //{
      //deposit: {
      //poolName: "zs-ezeth-lp",
      //token: "ezeth",
      //amount: "0.1",
      //},
      //withdraw: {
      //poolName: "zs-ezeth-lp",
      //token: "sy-zs-ezeth",
      //amount: "0.05",
      //},
      //}, //expired pools
      {
        deposit: {
          poolName: "USDe-lp",
          token: "USDe",
          amount: "100",
        },
        withdraw: {
          poolName: "USDe-lp",
          token: "pt-USDe",
          amount: "50",
        },
      },
      {
        deposit: {
          poolName: "pt-zs-rseth",
          token: "zs-rseth",
          amount: "0.1",
        },
        withdraw: {
          poolName: "pt-zs-rseth",
          token: "yt-zs-rseth",
          amount: "0.05",
        },
      },
      {
        deposit: {
          poolName: "yt-zs-weeth",
          token: "pt-zs-weeth",
          amount: "0.1",
        },
        withdraw: {
          poolName: "yt-zs-weeth",
          token: "sy-zs-weeth",
          amount: "0.05",
        },
      },
      {
        deposit: {
          poolName: "weeth-lp",
          token: "weeth",
          amount: "0.1",
        },
        withdraw: {
          poolName: "weeth",
          token: "pt-weeth",
          amount: "0.05",
        },
      },
    ];

    for (const { deposit, withdraw } of testETHCases) {
      const accountAddress = "0x58cCd9d9F461FC2D821CbaB2E631A348f52dc795";
      it(`withdraw ${withdraw.token} from ${withdraw.poolName} pool`, async () => {
        await test(
          accountAddress,
          {
            accountAddress,
            protocolName: "Pendle",
            chainName: "Ethereum",
            poolName: deposit.poolName,
            token: deposit.token,
            amount: deposit.amount,
            withdraw,
          },
          1,
          undefined,
          true,
        );
      });
    }

    it("Missing pool name", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0x676b9749365a4793046d32F4c9F34b8a0c6Ae389",
        protocolName: "Pendle",
        chainName: "Ethereum",
        poolName: null,
        token: "FRAX",
        amount: "10",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        getMissingPoolNameError("Ethereum", "Pendle", "FRAX", "withdraw"),
      );
    });
  });

  describe("Pendle - Arbitrum", () => {
    const testCases = [
      {
        deposit: {
          poolName: "SY-ezETH",
          token: "ezETH",
          amount: "0.1",
        },
        withdraw: {
          poolName: "SY-ezETH",
          token: "pt-ezETH",
          amount: "0.05",
        },
      },
      {
        deposit: {
          poolName: "SY-rETH",
          token: "pt-rETH",
          amount: "0.1",
        },
        withdraw: {
          poolName: "SY-rETH",
          token: "yt-rETH",
          amount: "0.03",
        },
      },
      {
        deposit: {
          poolName: "gDAI-lp",
          token: "gDAI",
          amount: "100",
        },
        withdraw: {
          poolName: "gDAI-lp",
          token: "sy-gDAI",
          amount: "50",
        },
      },
      // {
      //   deposit: {
      //     poolName: "yt-mpendle",
      //     token: "sy-mPENDLE",
      //     amount: "1",
      //   },
      //   withdraw: {
      //     poolName: "yt-mpendle",
      //     token: "pt-mPENDLE",
      //     amount: "0.5",
      //   },
      // },
    ];

    for (const { deposit, withdraw } of testCases) {
      const accountAddress = "0x58cCd9d9F461FC2D821CbaB2E631A348f52dc795";
      it(`withdraw ${withdraw.token} from ${withdraw.poolName} pool`, async () => {
        await test(
          accountAddress,
          {
            accountAddress,
            protocolName: "Pendle",
            chainName: "Arbitrum",
            poolName: deposit.poolName,
            token: deposit.token,
            amount: deposit.amount,
            withdraw,
          },
          42161,
          undefined,
          true,
        );
      });
    }

    it("Missing pool name", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0x676b9749365a4793046d32F4c9F34b8a0c6Ae389",
        protocolName: "Pendle",
        chainName: "Arbitrum",
        poolName: null,
        token: "FRAX",
        amount: "10",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        getMissingPoolNameError("Arbitrum", "Pendle", "FRAX", "withdraw"),
      );
    });
  });

  describe("Pendle - Optimism", () => {
    const testCases = [
      {
        deposit: {
          poolName: "sy-reth",
          token: "reth",
          amount: "0.1",
        },
        withdraw: {
          poolName: "sy-reth",
          token: "reth",
          amount: "0.05",
        },
      },
    ];

    for (const { deposit, withdraw } of testCases) {
      const accountAddress = "0x58cCd9d9F461FC2D821CbaB2E631A348f52dc795";
      it(`withdraw ${withdraw.token} from ${withdraw.poolName} pool`, async () => {
        await test(
          accountAddress,
          {
            accountAddress,
            protocolName: "Pendle",
            chainName: "Optimism",
            poolName: deposit.poolName,
            token: deposit.token,
            amount: deposit.amount,
            withdraw,
          },
          10,
          undefined,
          true,
        );
      });
    }

    it("Missing pool name", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0x676b9749365a4793046d32F4c9F34b8a0c6Ae389",
        protocolName: "Pendle",
        chainName: "Optimism",
        poolName: null,
        token: "FRAX",
        amount: "10",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        getMissingPoolNameError("Optimism", "Pendle", "FRAX", "withdraw"),
      );
    });
  });

  describe("Pendle - BSC", () => {
    const testCases = [
      {
        deposit: {
          poolName: "pt-wbeth",
          token: "wbeth",
          amount: "0.1",
        },
        withdraw: {
          poolName: "pt-wbeth",
          token: "sy-wbeth",
          amount: "0.05",
        },
      },
      // {
      //   deposit: {
      //     poolName: "sy-ezeth",
      //     token: "ezeth",
      //     amount: "0.1",
      //   },
      //   withdraw: {
      //     poolName: "sy-ezeth",
      //     token: "yt-ezeth",
      //     amount: "0.05",
      //   },
      // },
    ];

    for (const { deposit, withdraw } of testCases) {
      const accountAddress = "0x58cCd9d9F461FC2D821CbaB2E631A348f52dc795";
      it(`withdraw ${withdraw.token} from ${withdraw.poolName} pool`, async () => {
        await test(
          accountAddress,
          {
            accountAddress,
            protocolName: "Pendle",
            chainName: "BSC",
            poolName: deposit.poolName,
            token: deposit.token,
            amount: deposit.amount,
            withdraw,
          },
          56,
          undefined,
          true,
        );
      });
    }

    it("Missing pool name", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0x676b9749365a4793046d32F4c9F34b8a0c6Ae389",
        protocolName: "Pendle",
        chainName: "BSC",
        poolName: null,
        token: "FRAX",
        amount: "10",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toEqual(
        getMissingPoolNameError("BSC", "Pendle", "FRAX", "withdraw"),
      );
    });
  });

  describe("Stargate", () => {
    const testCases = [
      {
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        token: "USDT",
        amount: "100",
      },
      {
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        token: "USDC",
        amount: "100",
      },
      {
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        token: "DAI",
        amount: "100",
      },
      {
        accountAddress: "0x267fc49a3170950Ee5d49eF84878695c29cCA1e0",
        token: "FRAX",
        amount: "100",
        blockNumber: 19145290,
      },
      {
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        token: "USDD",
        amount: "100",
      },
    ];

    for (const { accountAddress, token, amount, blockNumber } of testCases) {
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
      },
      {
        accountAddress: "0xA91661efEe567b353D55948C0f051C1A16E503A5",
        poolName: "steth",
        token: "steth",
        amount: "100",
      },
      {
        accountAddress: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
        poolName: "fraxusdc",
        token: "usdc",
        amount: "100",
        blockNumber: 19145290,
      },
      {
        accountAddress: "0x267fc49a3170950Ee5d49eF84878695c29cCA1e0",
        poolName: "fraxusdp",
        token: "frax",
        amount: "100",
        blockNumber: 19145290,
      },
    ];

    for (const {
      accountAddress,
      poolName,
      token,
      amount,
      blockNumber,
    } of testCases) {
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
        );
      });
    }

    it("Missing pool name", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD",
        protocolName: "Curve",
        chainName: "Ethereum",
        poolName: null,
        token: "FRAX",
        amount: "10",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      const err = await getMissingPoolNameWithdrawError(
        "Ethereum",
        "Curve",
        "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD",
      );
      expect(res.body.message).toEqual(err);
    });

    it("Missing pool name - no pool", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
        protocolName: "Curve",
        chainName: "Ethereum",
        poolName: null,
        token: "FRAX",
        amount: "10",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      checkError(res.body.message);
    });
  });

  describe("Synapse", () => {
    const testCases: Record<string, JSONObject[]> = {
      Ethereum: [
        {
          account: "0xAe2D4617c862309A3d75A0fFB358c7a5009c673F",
          tokens: ["USDC"],
          amounts: ["10"],
        },
      ],
      Optimism: [
        {
          account: "0x41d3D33156aE7c62c094AAe2995003aE63f587B3",
          tokens: ["USDC.e"],
          amounts: ["10"],
        },
      ],
      Arbitrum: [
        {
          account: "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D",
          tokens: ["USDC.e", "USDT"],
          amounts: ["100", "100"],
        },
      ],
      // Avalanche: [
      // {
      // account: "0x3A2434c698f8D79af1f5A9e43013157ca8B11a66",
      // tokens: ["USDC.e"],
      // amounts: ["100"],
      // },
      // ],
    };

    for (const chainName of Object.keys(testCases)) {
      const chainTcs = testCases[chainName];
      const chainId = getChainIdFromName(chainName, true);
      for (const { account, blockNumber, tokens, amounts } of chainTcs) {
        for (let i = 0; i < tokens.length; i++) {
          const token = tokens[i];
          const amount = amounts[i];

          it(`Withdraw ${token} on ${chainName}`, async () => {
            await test(
              account,
              {
                accountAddress: account,
                protocolName: "Synapse",
                chainName,
                poolName: null,
                token,
                amount,
              },
              chainId as ChainId,
              blockNumber,
            );
          });
        }
      }
    }
  });

  describe("Uniswap", () => {
    const testCases: Record<string, JSONObject[]> = {
      Ethereum: [
        {
          account: "0xAe2D4617c862309A3d75A0fFB358c7a5009c673F",
          poolName: "eth-usdc",
          tokens: ["ETH", "USDC"],
          amounts: ["0.1", "200"],
        },
        {
          account: "0xAe2D4617c862309A3d75A0fFB358c7a5009c673F",
          poolName: "usdt-usdc",
          tokens: ["USDT", "USDC"],
          amounts: ["10", "10"],
        },
      ],
    };

    for (const chainName of Object.keys(testCases)) {
      const chainTcs = testCases[chainName];
      for (const { account, poolName, tokens, amounts } of chainTcs) {
        for (let i = 0; i < tokens.length; i++) {
          const token = tokens[i];
          const amount = amounts[i];
          it(`Withdraw ${amount} ${token} from ${poolName} on ${chainName}`, async () => {
            await test(
              account,
              {
                accountAddress: account,
                protocolName: "uniswap",
                chainName,
                poolName,
                token,
                amount,
              },
              1,
            );
          });
        }
      }
    }

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
      checkError(res.body.message);
    });
  });

  describe.skip("Uniswap v3", () => {
    const testCases = [
      {
        accountAddress: "0x23A0029F1AE02C9f53fe35e2e29917a7A7126697",
        poolName: "eth-rndr",
        token: "rndr",
        amount: "1000",
        tokenId: 693597,
        liquidity0: "12669502182066495000000",
        liquidity1: "20326573263433257000",
      },
      {
        accountAddress: "0x23A0029F1AE02C9f53fe35e2e29917a7A7126697",
        poolName: "eth-rndr",
        token: "eth",
        amount: "1",
        tokenId: 693597,
        liquidity0: "20326573263433257000",
        liquidity1: "12669502182066495000000",
      },
    ];
    for (const {
      accountAddress,
      poolName,
      token,
      amount,
      tokenId,
      liquidity0,
      liquidity1,
    } of testCases) {
      it(`${poolName} pool - ${token}`, async () => {
        const { rpcUrl } = await createVnet(1);
        const provider = new RetryProvider(rpcUrl, 1);

        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "Uniswap",
          chainName: "Ethereum",
          poolName,
          token,
          amount,
          range: "10",
          tokenId,
          liquidity0,
          liquidity1,
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

  describe.skip("Thruster", () => {
    const testCases: Record<string, JSONObject[]> = {
      Blast: [
        {
          account: "0x020ca66c30bec2c4fe3861a94e4db4a498a35872",
          poolName: "eth-usdb",
          tokens: ["ETH", "USDB"],
          amounts: ["0.1", "200"],
        },
        {
          account: "0x1f054d881216718e5e9fd469c82d09c223bc9995",
          poolName: "ole-usdb",
          tokens: ["OLE"],
          amounts: ["1000"],
        },
      ],
    };

    for (const chainName of Object.keys(testCases)) {
      const chainTcs = testCases[chainName];
      for (const { account, poolName, tokens, amounts } of chainTcs) {
        for (let i = 0; i < tokens.length; i++) {
          const token = tokens[i];
          const amount = amounts[i];
          it(`Withdraw ${amount} ${token} from ${poolName} on ${chainName}`, async () => {
            await test(
              account,
              {
                accountAddress: account,
                protocolName: "thruster",
                chainName,
                poolName,
                token,
                amount,
              },
              81457,
            );
          });
        }
      }
    }

    it("Missing pool", async () => {
      const res = await request(app).post(endpoint).send({
        accountAddress: "0x020ca66c30bec2c4fe3861a94e4db4a498a35872",
        protocolName: "Thruster",
        chainName: "Blast",
        poolName: null,
        token: "USDT",
        amount: "1000",
      });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toEqual("error");
      expect(res.body).toHaveProperty("message");
      checkError(res.body.message);
    });
  });

  describe("Thruster v3", () => {
    const testCases = [
      {
        accountAddress: "0x5c703f5131bb3268e0dc32913a3c0994eda215fe",
        poolName: "eth-usdb",
        token: "usdb",
        amount: "20",
        tokenId: 68910,
        liquidity0: "32756086064748260000",
        liquidity1: "8671917446851637",
      },
      {
        accountAddress: "0x5c703f5131bb3268e0dc32913a3c0994eda215fe",
        poolName: "eth-usdb",
        token: "eth",
        amount: "0.005",
        tokenId: 68910,
        liquidity0: "8671917446851637",
        liquidity1: "32756086064748260000",
      },
    ];
    for (const {
      accountAddress,
      poolName,
      token,
      amount,
      tokenId,
      liquidity0,
      liquidity1,
    } of testCases) {
      it(`${poolName} pool - ${token}`, async () => {
        const { rpcUrl } = await createVnet(81457, 4318586);
        const provider = new RetryProvider(rpcUrl, 81457);

        const res = await request(app).post(endpoint).send({
          accountAddress,
          protocolName: "Thruster",
          chainName: "Blast",
          poolName,
          token,
          amount,
          range: "10",
          tokenId,
          liquidity0,
          liquidity1,
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
    }
  });

  describe.skip("Juice", () => {
    const testCases = [
      {
        account: "0xade44991d931ca62e4b56f59a7a8e9160067f48a",
        token: "USDB",
        amount: "1025",
        blockNumber: 2835859,
      },
      {
        account: "0xeede2b980bbe143f17b14a1f355a63a7ee82d0e4",
        token: "WETH",
        amount: "0.03",
        blockNumber: 2836496,
      },
    ];

    for (const tc of testCases) {
      it(`Withdraw ${tc.amount} ${tc.token}`, async () => {
        const { rpcUrl } = await createVnet(81457, tc.blockNumber);
        const provider = new RetryProvider(rpcUrl, 81457);

        const res = await request(app).post(endpoint).send({
          accountAddress: tc.account,
          protocolName: "Juice",
          chainName: "Blast",
          poolName: null,
          token: tc.token,
          amount: tc.amount,
        });
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty("status");
        expect(res.body.status).toEqual("success");
        expect(res.body).toHaveProperty("transactions");
        expect(res.body.transactions.length).toBeGreaterThanOrEqual(1);

        const success = await runTxsOnVnet(
          provider,
          tc.account,
          res.body.transactions,
        );
        expect(success).toEqual(true);
      });
    }
  });

  describe("Velodrome", () => {
    const testCases: Record<string, JSONObject[]> = {
      Optimism: [
        {
          account: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
          poolName: "op-usdc",
          tokens: ["OP", "USDC"],
          amounts: ["1", "100"],
        },
      ],
    };

    for (const chainName of Object.keys(testCases)) {
      const chainTcs = testCases[chainName];
      for (const { account, poolName, tokens, amounts } of chainTcs) {
        for (let i = 0; i < tokens.length; i++) {
          const token = tokens[i];
          const amount = amounts[i];

          it(`Withdraw ${amount} ${token} from ${poolName} on ${chainName}`, async () => {
            await test(
              account,
              {
                accountAddress: account,
                protocolName: "velodrome",
                chainName,
                poolName,
                token,
                amount,
              },
              getChainIdFromName(chainName) as ChainId,
            );
          });
        }
      }
    }

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
      checkError(res.body.message);
    });
  });

  describe("Aerodrome", () => {
    const testCases: Record<string, JSONObject[]> = {
      Base: [
        {
          account: "0x1985ea6e9c68e1c272d8209f3b478ac2fdb25c87",
          poolName: "eth-dai",
          tokens: ["ETH", "DAI"],
          amounts: ["0.1", "50"],
        },
      ],
    };

    for (const chainName of Object.keys(testCases)) {
      const chainTcs = testCases[chainName];
      for (const { account, poolName, tokens, amounts } of chainTcs) {
        for (let i = 0; i < tokens.length; i++) {
          const token = tokens[i];
          const amount = amounts[i];

          it(`Withdraw ${amount} ${token} from ${poolName} on ${chainName}`, async () => {
            await test(
              account,
              {
                accountAddress: account,
                protocolName: "aerodrome",
                chainName,
                poolName,
                token,
                amount,
              },
              getChainIdFromName(chainName) as ChainId,
            );
          });
        }
      }
    }

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
      checkError(res.body.message);
    });
  });

  it.skip("Hop", async () => {
    const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Hop",
      chainName: "Arbitrum",
      poolName: null,
      token: "USDC.e",
      amount: "5255",
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
      150648760,
    );
    expect(success).toEqual(true);
  });

  it("Hyperliquid", async () => {
    const accountAddress = "0x28129f5B8b689EdcB7B581654266976aD77C719B";
    const res = await request(app).post(endpoint).send({
      accountAddress,
      protocolName: "Hyperliquid",
      chainName: "Arbitrum",
      token: "USDC",
      amount: "20",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("signData");
    expect(res.body.signData).toHaveProperty("destination");
    expect(res.body.signData).toHaveProperty("time");
    expect(res.body.signData).toHaveProperty("amount");
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
    };
    for (const { name: token } of Object.values(strategies)) {
      if (token.toLowerCase() === "ethx") continue;

      const tc = testCases[token.toLowerCase()];
      if (!tc) continue;

      it(`${token} pool`, async () => {
        const { rpcUrl } = await createVnet(1, 19192811);
        const provider = new RetryProvider(rpcUrl, 1);

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
          rpc: rpcUrl,
        });
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty("status");
        expect(res.body.status).toEqual("success");
        expect(res.body).toHaveProperty("transactions");
        expect(res.body.transactions).toHaveLength(1);

        const withdrawTokenInfo = await getTokenInfoForChain(token, "ethereum");
        if (!withdrawTokenInfo)
          throw new Error("Withdraw token info not found");

        const withdrawBeforeBalance = await getTokenBalance(
          accountAddress,
          provider,
          withdrawTokenInfo,
        );
        const success = await runTxsOnVnet(
          provider,
          accountAddress,
          res.body.transactions,
        );
        expect(success).toEqual(true);

        const withdrawAfterBalance = await getTokenBalance(
          accountAddress,
          provider,
          withdrawTokenInfo,
        );
        const change = Number.parseFloat(
          ethers.formatUnits(
            (withdrawAfterBalance || 0n) - (withdrawBeforeBalance || 0n),
            withdrawTokenInfo?.decimals,
          ),
        );
        expect(change).toEqual(0);
      });
    }
  });

  it.skip("Plutus", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0x22222257783f4ae46c637466a538b1691871013e",
      protocolName: "Plutus",
      chainName: "Arbitrum",
      poolName: null,
      token: "JONES",
      amount: "1",
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");
    expect(res.body.transactions).toHaveLength(1);

    const success = await simulateTxs(
      42161,
      res.body.transactions,
      "0x22222257783f4ae46c637466a538b1691871013e",
      148382034,
    );
    expect(success).toEqual(true);
  });

  it.skip("Rodeo", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
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
    expect(res.body.transactions).toHaveLength(1);

    const success = await simulateTxs(
      42161,
      res.body.transactions,
      "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
    );
    expect(success).toEqual(true);
  });

  it.skip("Dopex", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0x3392daec7d0bfd9d2dcf0e6d6c8a811bf09dbd73",
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
      1,
      res.body.transactions,
      "0x3392daec7d0bfd9d2dcf0e6d6c8a811bf09dbd73",
    );
    expect(success).toEqual(true);
  });

  it("Withdraw with missing parameters", async () => {
    const res = await request(app).post(endpoint).send({
      // Missing required parameters
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(getChainError("undefined"));
  });

  it("Withdraw from unsupported protocol", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      // Unsupported protocol
      protocolName: "InvalidProtocol",
      chainName: "BinanceSmartChain",
      poolName: null,
      token: "USDT",
      amount: "100",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      getUnsupportedProtocolError("invalidprotocol", "withdraw"),
    );
  });

  it("Withdraw with invalid account address", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "invalidAddress",
      protocolName: "Pendle",
      chainName: "Ethereum",
      poolName: null,
      token: "USDT",
      amount: "100",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
  });

  it("Withdraw with invalid chain name", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "pendle",
      // Invalid chain name
      chainName: "InvalidChain",
      poolName: null,
      token: "USDT",
      amount: "100",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(getChainError("InvalidChain"));
  });

  it("Withdraw with invalid pool name", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      protocolName: "pendle",
      chainName: "Ethereum",
      // Invalid pool name
      poolName: "InvalidPool",
      token: "USDT",
      amount: "100",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toContain("differ on underlying token");
  });

  it("Withdraw with empty protocol name", async () => {
    const res = await request(app).post(endpoint).send({
      accountAddress: "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c",
      // Empty protocol name
      protocolName: "",
      chainName: "Arbitrum",
      poolName: null,
      token: "USDT",
      amount: "100",
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toEqual(
      "Protocol is missing. Please specify a protocol in your next prompt!",
    );
  });

  async function getTokenBalance(
    account: string,
    provider: RetryProvider,
    tokenInfo: TokenInfo,
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

  async function mineBlock(provider: RetryProvider) {
    await provider.send("evm_mine", []);
  }

  async function getLatestBlock(provider: RetryProvider) {
    return (await provider.getBlock("latest"))?.number;
  }

  async function mineBlockTo(blockNumber: number, provider: RetryProvider) {
    /* eslint-disable no-await-in-loop */
    for (let i = await provider.getBlockNumber(); i < blockNumber; i += 1) {
      await mineBlock(provider);
    }
  }

  async function test(
    accountAddress: string,
    body_: JSONObject,
    chainId: ChainId,
    blockNumber: number | undefined = undefined,
    increaseBalance: JSONObject | boolean = false,
    lpToken: string | undefined = undefined,
    balanceChange: string | undefined = undefined,
  ) {
    const { withdraw, ...body } = body_;
    const depositRes = await request(app)
      .post(`/deposit?secret=${process.env.BACKEND_TOKEN_SECRET}`)
      .send(body);

    if (depositRes.statusCode === 400) {
      expect(depositRes.body.message).toContain("expired");
      return;
    }
    expect(depositRes.statusCode).toEqual(200);
    expect(depositRes.body).toHaveProperty("status");
    expect(depositRes.body.status).toEqual("success");
    expect(depositRes.body).toHaveProperty("transactions");

    const { vnetId, rpcUrl } = await createVnet(chainId, blockNumber);
    body.rpc = rpcUrl;
    const provider = new RetryProvider(body.rpc, chainId);

    if (increaseBalance) {
      await increaseTokenBalance(
        rpcUrl,
        accountAddress,
        body.chainName,
        getNativeTokenSymbolForChain(chainId),
        1,
      );

      if (typeof increaseBalance === "object") {
        await Promise.all(
          Object.entries(increaseBalance).map(([token, amount]) =>
            increaseTokenBalance(
              rpcUrl,
              accountAddress,
              getChainNameFromId(chainId),
              token,
              amount,
            ),
          ),
        );
      } else {
        await increaseTokenBalance(
          rpcUrl,
          accountAddress,
          body.chainName,
          body.token,
          body.amount,
        );
      }
    }

    const depositSuccess = await runTxsOnVnet(
      provider,
      accountAddress,
      depositRes.body.transactions,
      { chainId, vnetId, action: "deposit" },
    );
    expect(depositSuccess).toEqual(true);

    if (body.protocolName.toLowerCase() === "gmx") {
      const params = [
        ethers.toBeHex(4 * 7 * 24 * 60 * 60), // hex encoded number of seconds
      ];
      await provider.send("evm_increaseTime", params);
      const currentBlockNumber = await getLatestBlock(provider);
      await mineBlockTo((currentBlockNumber || 0) + 10000, provider);
    }

    body.amount = (Number.parseFloat(body.amount) * 0.9).toString();
    const res = await request(app)
      .post(endpoint)
      .send({ ...body, ...(withdraw || {}) });

    if (res.statusCode === 400) {
      expect(res.body.message).toContain("expired");
      return;
    }
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toEqual("success");
    expect(res.body).toHaveProperty("transactions");

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
    let withdrawTokenInfo: TokenInfo | undefined;

    if (pName.toLowerCase() === "dolomite") {
      const isoData = (LPAddresses.dolomite as JSONObject)[chainId.toString()];
      const lpList = Object.keys(isoData);
      const dToken = body.token;
      if (lpList.includes(dToken.toLowerCase())) {
        const tAddr = isoData[dToken.toLowerCase()].token;
        withdrawTokenInfo = await getTokenInfoForChain(
          tAddr,
          getChainNameFromId(chainId),
        );
      } else {
        withdrawTokenInfo = await getTokenInfoForChain(
          body.token,
          getChainNameFromId(chainId),
        );
      }
    } else {
      withdrawTokenInfo = await getTokenInfoForChain(
        withdraw?.token || body.token,
        getChainNameFromId(chainId),
      );
    }
    let withdrawBeforeBalance = 0n;
    if (withdrawTokenInfo) {
      withdrawBeforeBalance =
        (await getTokenBalance(accountAddress, provider, withdrawTokenInfo)) ||
        0n;
    }

    const success = await runTxsOnVnet(
      provider,
      accountAddress,
      res.body.transactions,
      { chainId, vnetId, action: "withdraw" },
    );
    expect(success).toEqual(true);
    let withdrawAfterBalance = 0n;
    if (withdrawTokenInfo) {
      withdrawAfterBalance =
        (await getTokenBalance(accountAddress, provider, withdrawTokenInfo)) ||
        0n;
    }

    let change = Number.parseFloat(
      ethers.formatUnits(
        withdrawAfterBalance - withdrawBeforeBalance,
        withdrawTokenInfo?.decimals,
      ),
    );

    if (body.protocolName.toLowerCase() !== "gmx") {
      const withdrawAmount = Number.parseFloat(withdraw?.amount || body.amount);
      if (!withdraw) {
        expect(
          (Math.abs(change - withdrawAmount) / withdrawAmount) * 100,
        ).toBeLessThan(5);
      } else {
        if (withdraw.token.includes("market")) change = -change;
        expect(change).toBeGreaterThan(0);
      }
    }

    if (lpToken) {
      const afterBalance = await token?.balanceOf(accountAddress);

      const change = Number.parseFloat(
        ethers.formatUnits(beforeBalance - afterBalance, decimals),
      );

      if (balanceChange) {
        expect(
          (Math.abs(change - +balanceChange) / +balanceChange) * 100,
        ).toBeLessThan(5); // 5% slippage
      } else {
        expect(change).toBeGreaterThan(0);
      }
    }
  }
});

const checkError = (error: string) => {
  expect(
    /Could not detect any tokens to withdraw on/i.test(error),
  ).toBeTruthy();
};
