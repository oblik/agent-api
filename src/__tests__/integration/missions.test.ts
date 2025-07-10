import { initModels } from "../../db/index.js";
import { getGasPrice } from "../../handler.js";
import { getCoinData } from "../../utils/index.js";
import { assert, isDefined } from "../../utils/types.js";
import missionTarget from "../missionTarget.js";
import { DEFAULT_TEST_ADDRESS } from "../utils/common.js";
import {
  deleteConditions,
  test as testConditional,
} from "../utils/conditional.js";
import {
  getTokenPrices,
  test as testNonConditional,
} from "../utils/non-conditional.js";

const missions: string[] = Object.values(missionTarget)
  .filter((x) => x[0])
  .map((x) => x[1].slice(x[1].indexOf("executing") + 11), -2);

jest.retryTimes(1);

describe("Mission Target Tests", () => {
  beforeAll(async () => {
    await initModels();
  });

  beforeEach(() => {
    console.log(expect.getState().currentTestName);
  });

  // Cleanup function to run after all tests
  afterAll(async () => {
    await deleteConditions();
  });

  it(missions[0], async () => {
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "0.01",
          inputToken: "eth",
          outputToken: "usdc",
          chainName: "arbitrum",
          slippage: "",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    const [ethPrice, usdcPrice] = await getTokenPrices(DEFAULT_TEST_ADDRESS, [
      "eth",
      "usdc",
    ]);
    const balanceChanges = {
      arbitrum: {
        usdc: (0.01 * ethPrice) / usdcPrice,
      },
    };
    await testNonConditional(
      DEFAULT_TEST_ADDRESS,
      actions,
      "arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it(missions[1], async () => {
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "0.01",
          token: "eth",
          sourceChainName: "arbitrum",
          destinationChainName: "base",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await testNonConditional(
      DEFAULT_TEST_ADDRESS,
      actions,
      "arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
    );
  });

  it(missions[2], async () => {
    const actions = [
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
          inputToken: "eth",
          outputToken: "toshi",
          chainName: "base",
          slippage: "",
        },
      },
      { name: "time", args: { start_time: "12pm tomorrow" } },
    ];
    actions[2].args.start_time = "1 minute";
    await testConditional(actions, DEFAULT_TEST_ADDRESS);
  });

  it(missions[3], async () => {
    const address = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "usdc",
          sourceChainName: "arbitrum",
          destinationChainName: "base",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "usdc",
          outputToken: "bald",
          chainName: "base",
          slippage: "",
        },
      },
    ];
    const [usdcPrice, baldPrice] = await getTokenPrices(
      address,
      ["usdc", "bald"],
      42161,
    );
    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdc: 100,
      },
      base: {
        eth: 1,
      },
    };
    const balanceChanges = {
      arbitrum: {
        usdc: 0,
      },
      base: {
        bald: (100 * usdcPrice) / baldPrice,
      },
    };
    await testNonConditional(
      address,
      actions,
      "arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it(missions[4], async () => {
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "1",
          token: "usdc",
          sourceChainName: "arbitrum",
          destinationChainName: "optimism",
          protocolName: "bungee",
        },
      },
      {
        name: "time",
        args: {
          recurrence: {
            type: "minutes",
            interval: 5,
          },
          end_time: "30 minutes",
        },
      },
    ];
    await testConditional(actions);
  });

  it(missions[5], async () => {
    const address = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "lend",
        args: {
          protocolName: "aave",
          amount: "0.1",
          token: "eth",
          chainName: "arbitrum",
        },
      },
      {
        name: "borrow",
        args: {
          protocolName: "aave",
          amount: "20",
          token: "usdc",
          chainName: "arbitrum",
        },
      },
      {
        name: "short",
        args: {
          protocolName: "gmx",
          inputAmount: "20",
          inputToken: "usdc",
          outputToken: "arb",
          chainName: "arbitrum",
          leverageMultiplier: "2x",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await testNonConditional(
      address,
      actions,
      "arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it(missions[6], async () => {
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "10",
          inputToken: "usdc",
          outputToken: "eth",
          chainName: "arbitrum",
          slippage: "",
        },
      },
      {
        name: "condition",
        args: {
          subject: "eth",
          comparator: "<=",
          value: "3000",
          type: "price",
          value_units: "usd",
        },
      },
    ];
    const [ethPrice] = await getTokenPrices(DEFAULT_TEST_ADDRESS, ["eth"]);
    actions[1].args.value = (Math.floor(ethPrice) + 10).toString();
    await testConditional(actions);
  });

  it(missions[7], async () => {
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "10",
          inputToken: "usdc",
          outputToken: "degen",
          chainName: "base",
          slippage: "",
        },
      },
      {
        name: "condition",
        args: {
          subject: "degen",
          comparator: "==",
          value: "700000000",
          type: "market cap",
          value_units: "usd",
        },
      },
    ];
    const { market_cap } = await getCoinData(
      DEFAULT_TEST_ADDRESS,
      "DEGEN",
      8453,
      false,
    );
    assert(isDefined(market_cap));
    actions[1].args.value = (Math.floor(market_cap) - 10).toString();
    actions[1].args.comparator = ">=";
    await testConditional(actions);
  });

  it(missions[8], async () => {
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "0.01",
          token: "eth",
          sourceChainName: "ethereum",
          destinationChainName: "arbitrum",
        },
      },
      {
        name: "condition",
        args: { subject: "gas", comparator: "<=", value: "35", type: "gas" },
      },
    ];
    const gas = await getGasPrice(DEFAULT_TEST_ADDRESS, 1);
    actions[1].args.value = (Math.floor(gas || 0) + 10).toString();
    await testConditional(actions);
  });

  it(missions[9], async () => {
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "10",
          inputToken: "usdc",
          outputToken: "eth",
          chainName: "ethereum",
          slippage: "",
        },
      },
      {
        name: "condition",
        args: { subject: "gas", comparator: "<=", value: "35", type: "gas" },
      },
      {
        name: "condition",
        args: {
          subject: "eth",
          comparator: "<=",
          value: "3000",
          type: "price",
          value_units: "usd",
        },
      },
    ];
    const [ethPrice] = await getTokenPrices(DEFAULT_TEST_ADDRESS, ["eth"]);
    const gas = await getGasPrice(DEFAULT_TEST_ADDRESS, 1);
    actions[1].args.value = (Math.floor(gas || 0) + 10).toString();
    actions[2].args.value = (Math.floor(ethPrice) + 10).toString();
    await testConditional(actions);
  });
});
