import request from "supertest";
import app from "../../../app.js";
import EntityData from "../../../config/common/entity.js";
import { initModels } from "../../../db/index.js";
import {
  getChainIdFromName,
  getNativeTokenSymbolForChain,
} from "../../../utils/index.js";
import { RetryProvider } from "../../../utils/retryProvider.js";
import {
  createVnet,
  getTopHolder,
  increaseTokenBalance,
  runTxsOnVnet,
} from "../../helper.js";

const endpoint = `/swap?secret=${process.env.BACKEND_TOKEN_SECRET}`;

jest.retryTimes(1);

describe("Wrap", () => {
  beforeEach(async () => {
    await initModels();
    console.log(expect.getState().currentTestName);
  });

  const testCases = EntityData.chains
    .filter((x) => x.toLowerCase() !== "zksync")
    .map((chainName) => {
      const chainId = getChainIdFromName(chainName);
      if (!chainId) {
        throw new Error(`Invalid chainName: ${chainName}`);
      }
      const nativeSymbol = getNativeTokenSymbolForChain(chainId)?.toLowerCase();
      const cases = [
        {
          inputToken: nativeSymbol,
          inputAmount: "1",
          outputToken: `w${nativeSymbol}`,
        },
        {
          inputToken: nativeSymbol,
          inputAmount: "1000",
          inputAmountUnits: "usd",
          outputToken: `w${nativeSymbol}`,
        },
        {
          inputToken: `w${nativeSymbol}`,
          inputAmount: "1",
          outputToken: nativeSymbol,
        },
        {
          inputToken: `w${nativeSymbol}`,
          inputAmount: "1000",
          inputAmountUnits: "usd",
          outputToken: nativeSymbol,
        },
        {
          inputToken: nativeSymbol,
          outputToken: `w${nativeSymbol}`,
          outputAmount: "1",
        },
        {
          inputToken: `w${nativeSymbol}`,
          outputToken: nativeSymbol,
          outputAmount: "1",
        },
      ];
      return { chainName, chainId, cases };
    });

  for (const testCase of testCases) {
    const { chainName, chainId, cases } = testCase;
    for (const tc of cases) {
      it(`swap ${tc.inputToken} to ${tc.outputToken} on ${chainName.toLowerCase()}`, async () => {
        const accountAddress =
          chainName === "Blast"
            ? await getTopHolder("weth", 81457)
            : "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
        const { rpcUrl: rpc } = await createVnet(chainId, undefined);
        if (chainName !== "Blast" || tc.inputToken?.toLowerCase() !== "weth") {
          await increaseTokenBalance(
            rpc,
            accountAddress || "",
            chainName,
            tc.inputToken,
            "2000",
          );
        }

        const res = await request(app)
          .post(endpoint)
          .send({ accountAddress, chainName, ...tc, rpc });
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty("status");
        expect(res.body.status).toEqual("success");
        expect(res.body).toHaveProperty("transactions");

        const provider = new RetryProvider(rpc, chainId);
        const success = await runTxsOnVnet(
          provider,
          accountAddress || "",
          res.body.transactions,
        );
        expect(success).toEqual(true);
      });
    }
  }
});
