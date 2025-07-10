/* eslint-disable no-await-in-loop */
import { ethers } from "ethers";
import { initModels } from "../../db/index.js";
import { getGasPrice } from "../../handler.js";
import {
  getCoinData,
  getCurrentTimestamp,
  getErrorMessage,
  getEthBalanceForUser,
  getPoolApy,
  getPoolMetadata,
  getTokenBalance,
  sleep,
} from "../../utils/index.js";
import {
  getLoanValueForProtocol,
  getMarketInfoForProtocol,
} from "../../utils/protocols/index.js";
import { assert, isDefined } from "../../utils/types.js";
import { DEFAULT_TEST_ADDRESS } from "../utils/common.js";
import {
  completeConditions,
  deleteConditions,
  getConditions,
  test,
  testStatus,
} from "../utils/conditional.js";

const weekdays = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

describe("Integration Tests", () => {
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

  // check via logs manually
  it.skip("check parseTime function", () => {
    // console.log(parseTime("", { start_time: "1 seconds" }));
    // console.log(parseTime("", { start_time: "2 secs" }));
    // console.log(parseTime("", { start_time: "three minute" }));
    // console.log(parseTime("", { start_time: "four mins" }));
    // console.log(parseTime("", { start_time: "5 hours" }));
    // console.log(parseTime("", { start_time: "6 hrs" }));
    // console.log(parseTime("", { start_time: "seven days" }));
    // console.log(parseTime("", { start_time: "eight weeks" }));
    // console.log(parseTime("", { start_time: "9 months" }));
    // console.log(parseTime("", { start_time: "10 years" }));
    // console.log(parseTime("", { start_time: "eleven hours" }));
    // console.log(parseTime("", { start_time: "twelve hours" }));
    // console.log(parseTime("", { start_time: "0am" }));
    // console.log(parseTime("", { start_time: "0" }));
    // console.log(parseTime("", { start_time: "0:30" }));
    // console.log(parseTime("", { start_time: "12am" }));
    // console.log(parseTime("", { start_time: "5am" }));
    // console.log(parseTime("", { start_time: "5:30am" }));
    // console.log(parseTime("", { start_time: "12pm" }));
    // console.log(parseTime("", { start_time: "12:30pm" }));
    // console.log(parseTime("", { start_time: "5pm" }));
    // console.log(parseTime("", { start_time: "5:30pm" }));
    // console.log(parseTime("", { start_time: "10:30" }));
    // console.log(parseTime("", { start_time: "16:30" }));
    // console.log(parseTime("", { start_time: "10am tomorrow" }));
    // console.log(parseTime("", { start_time: "10am monday" }));
    // console.log(parseTime("", { start_time: "10am friday" }));
    // console.log(parseTime("", { start_time: "10am thursday" }));
    // console.log(parseTime("", { start_time: "10am sunday" }));
    // console.log(parseTime("", { start_time: "midnight" }));
    // console.log(parseTime("", { start_time: "tomorrow" }));
    // console.log(parseTime("", { start_time: "monday" }));
    // console.log(parseTime("", { start_time: "wednesday" }));
    // console.log(parseTime("", { start_time: "thursday" }));
    // console.log(parseTime("", { start_time: "sunday" }));
  });

  it("swap 10 eth for usdc when gas is below X", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputAmount: "10",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
      {
        name: "condition",
        args: {
          subject: "gas",
          comparator: "<",
          value: "X",
          type: "price",
        },
      },
    ];
    const gasPrice = await getGasPrice("", 1);
    calls[1].args.value = (Math.floor(gasPrice || 0) + 10).toString();
    await test(calls);
  });

  it("swap 10 eth for usdc when gas is below 20%", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputAmount: "10",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
      {
        name: "condition",
        args: {
          subject: "gas",
          comparator: "<",
          value: "20%",
          type: "price",
        },
      },
    ];
    const ids = await test(calls, undefined, true);
    const conditions = await getConditions(ids);
    expect(typeof conditions[0].conditions[0].body?.value).toEqual("number");
  }, 500000);

  it("swap 10 eth for usdc when eth hits X", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputAmount: "10",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
      {
        name: "condition",
        args: {
          subject: "eth",
          comparator: "==",
          value: "X",
          type: "price",
        },
      },
    ];
    const ethPrice = (await getCoinData(DEFAULT_TEST_ADDRESS, "eth", 1)).price;
    assert(isDefined(ethPrice));
    calls[1].args.value = (Math.floor(ethPrice) + 10).toString();
    const ids = await test(calls, undefined, true);
    await testStatus(ids, false);
    const conditions = await getConditions(ids);
    expect(conditions[0].conditions[0].body?.comparator).toEqual(">=");
  }, 500000);

  it("swap 10 eth for usdc when eth is above -10%", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputAmount: "10",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
      {
        name: "condition",
        args: {
          subject: "eth",
          comparator: "<=",
          value: "-10%",
          type: "price",
        },
      },
    ];
    const ids = await test(calls, undefined, true);
    const conditions = await getConditions(ids);
    expect(typeof conditions[0].conditions[0].body?.value).toEqual("number");
  });

  it("swap 10 eth for usdc in twelve hours", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputAmount: "10",
          inputToken: "eth",
          outputToken: "usdc",
          chainName: "ethereum",
        },
      },
      {
        name: "time",
        args: {
          start_time: "twelve hours",
        },
      },
    ];
    await test(calls, undefined, true);
  });

  it("swap 10 eth for usdc at X", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputAmount: "10",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
      {
        name: "time",
        args: {
          start_time: "X",
        },
      },
    ];
    const time = new Date();
    const hour = time.getHours();
    const minute = time.getMinutes();
    calls[1].args.start_time = `${hour}:${minute + 1}`;
    await test(calls);
  });

  it("swap 10 eth for usdc in one minute, repeating every one hour", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputAmount: "10",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
      {
        name: "time",
        args: {
          start_time: "one minute",
          recurrence: {
            type: "hourly",
            interval: 1,
          },
        },
      },
    ];
    await test(calls);
  });

  it("swap 10 eth for usdc at 5pm, repeating every 1 hour", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputAmount: "10",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
      {
        name: "time",
        args: {
          start_time: "5pm",
          recurrence: {
            type: "hourly",
            interval: 1,
          },
        },
      },
    ];
    await test(calls, undefined, true);
  });

  it("when gas is below 5, deposit 100 usdc into morpho", async () => {
    const calls = [
      {
        name: "condition",
        args: {
          subject: "gas",
          comparator: "<=",
          value: "5",
          type: "gas",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "morpho",
          amount: "100",
          token: "usdc",
        },
      },
    ];
    await test(calls, undefined, true);
  });

  it("at 10am tomorrow, transfer 200 usdc to 0x2b605c2a76ee3f08a48b4b4a9d7d4dad3ed46bf3", async () => {
    const calls = [
      {
        name: "time",
        args: {
          start_time: "10am tomorrow",
        },
      },
      {
        name: "transfer",
        args: {
          amount: "200",
          token: "usdc",
          recipient: "0x2b605c2a76ee3f08a48b4b4a9d7d4dad3ed46bf3",
        },
      },
    ];
    await test(calls, undefined, true);
  });

  it("swap 500 dai for wbtc every day for a month when gas is less than 300", async () => {
    const calls = [
      {
        name: "condition",
        args: {
          subject: "gas",
          comparator: "<=",
          value: "300",
          type: "gas",
        },
      },
      {
        name: "time",
        args: {
          recurrence: {
            type: "daily",
            interval: 1,
          },
          start_time: "1 minute",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "500",
          inputToken: "dai",
          outputToken: "wbtc",
        },
      },
    ];
    await test(calls);
  });

  it("buy btc with 1 eth every week", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputAmount: "1",
          inputToken: "eth",
          outputToken: "btc",
        },
      },
      {
        name: "time",
        args: {
          recurrence: {
            type: "minutes",
            interval: 5,
          },
        },
      },
    ];
    await test(calls);
  });

  it("for my aave token, if it is over $1.0, sell it for usdd. if it is below $1.0, buy back with usdd", async () => {
    const calls = [
      {
        name: "condition",
        args: {
          subject: "aave",
          comparator: ">",
          value: "1.0",
          type: "price",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "aave",
          inputAmount: "all",
          outputToken: "usdd",
        },
      },
      {
        name: "condition",
        args: {
          subject: "aave",
          comparator: "<",
          value: "1.0",
          type: "price",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "usdd",
          inputAmount: "all",
          outputToken: "aave",
        },
      },
    ];
    await test(calls);
  });

  it("sell all my usdd for eth if usdd goes below X", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "usdc",
          outputToken: "eth",
        },
      },
      {
        name: "condition",
        args: {
          subject: "usdd_price",
          comparator: "<=",
          value: "X",
          type: "price",
        },
      },
    ];
    const usddPrice = (await getCoinData(DEFAULT_TEST_ADDRESS, "usdd", 1))
      .price;
    assert(isDefined(usddPrice));
    calls[1].args.value = (Math.floor(usddPrice) + 0.1).toString();
    await test(calls);
  });

  it("buy btc with 1 eth every X", async () => {
    const calls = [
      {
        name: "time",
        args: {
          start_time: "X",
          recurrence: {
            type: "weekly",
            interval: 1,
          },
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "1",
          inputToken: "eth",
          outputToken: "btc",
          chainName: "ethereum",
        },
      },
    ];
    const time = new Date();
    const hour = time.getHours();
    const minute = time.getMinutes();
    calls[0].args.start_time = `${hour}:${minute + 2} ${
      weekdays[time.getDay()]
    }`;
    await test(calls);
  }, 500000);

  it("if btc goes below 15k, buy eth", async () => {
    const calls = [
      {
        name: "condition",
        args: {
          subject: "btc_price",
          comparator: "<=",
          value: "15000",
          type: "price",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "btc",
          outputToken: "eth",
        },
      },
    ];
    await test(calls);
  });

  it("buy usdc with dai if the price of usdc/dai >= 1.0", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputToken: "dai",
          outputToken: "usdc",
        },
      },
      {
        name: "condition",
        args: {
          subject: "usdc/dai",
          comparator: ">=",
          value: "1.0",
          type: "price",
        },
      },
    ];
    await test(calls);
  });

  it("unstake all my usdc and sell it for dai if the price of usdc/dai < 0.95", async () => {
    const calls = [
      {
        name: "unstake",
        args: {
          amount: "all",
          token: "usdc",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "usdc",
          outputToken: "dai",
        },
      },
      {
        name: "condition",
        args: {
          subject: "usdc/dai",
          comparator: "<=",
          value: "0.95",
          type: "price",
        },
      },
    ];
    await test(calls, undefined, true);
  });

  it("bridge 4 eth from arbitrum to base and buy coin when gas is under X", async () => {
    const calls = [
      {
        name: "bridge",
        args: {
          amount: "4",
          token: "eth",
          sourceChainName: "arbitrum",
          destinationChainName: "base",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "outputToken",
          outputToken: "coin",
          chainName: "base",
        },
      },
      {
        name: "condition",
        args: {
          subject: "gas",
          comparator: "<=",
          value: "X",
          type: "gas",
        },
      },
    ];
    const gasPrice = await getGasPrice("", 42161);
    calls[2].args.value = (Math.floor(gasPrice || 0) + 10).toString();
    const ids = await test(calls);
    const conditions = await getConditions(ids);
    expect(conditions[0].actions[0].name).toEqual("bridge");
    expect(conditions[0].actions[1].name).toEqual("swap");
    await testStatus(ids, true);
  }, 500000);

  it("swap link to eth and buy arb when gas is below X", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputToken: "link",
          outputToken: "eth",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "arb",
        },
      },
      {
        name: "condition",
        args: {
          subject: "gas",
          comparator: "<=",
          value: "50",
          type: "gas",
        },
      },
    ];
    await test(calls);
  });

  it("when my eth balance hits X, buy 0.5 eth worth of usdc once the price of usdc/dai is above Y and gas under Z", async () => {
    const calls = [
      {
        name: "condition",
        args: {
          subject: "eth balance",
          comparator: ">=",
          value: "X",
          type: "balance",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "0.5",
          inputToken: "eth",
          outputToken: "usdc",
          chainName: "ethereum",
        },
      },
      {
        name: "condition",
        args: {
          subject: "usdc/dai price",
          comparator: ">=",
          value: "Y",
          type: "price",
        },
      },
      {
        name: "condition",
        args: {
          subject: "gas",
          comparator: "<=",
          value: "Z",
          type: "gas",
        },
      },
    ];
    const ethBalance = await getEthBalanceForUser(1, DEFAULT_TEST_ADDRESS);
    calls[0].args.value = ethers.formatEther(ethBalance - 100n);
    const usdcPrice = (await getCoinData(DEFAULT_TEST_ADDRESS, "usdc", 1))
      .price;
    const daiPrice = (await getCoinData(DEFAULT_TEST_ADDRESS, "dai", 1)).price;
    assert(isDefined(usdcPrice) && isDefined(daiPrice));
    const lpPrice = usdcPrice / daiPrice;
    calls[2].args.value = (lpPrice - 0.1).toString();
    const gasPrice = await getGasPrice("", 1);
    calls[3].args.value = (Math.floor(gasPrice || 0) + 10).toString();
    await test(calls);
  });

  it("stake stg on stargate, then every X claim and restake rewards", async () => {
    const calls = [
      {
        name: "stake",
        args: {
          protocolName: "stargate",
          amount: "all",
          token: "stg",
        },
      },
      {
        name: "time",
        args: {
          start_time: "X",
          recurrence: {
            type: "weekly",
            interval: 1,
          },
        },
      },
      {
        name: "claim",
        args: {
          protocolName: "stargate",
        },
      },
      {
        name: "stake",
        args: {
          protocolName: "stargate",
          amount: "all",
          token: "stg",
        },
      },
    ];
    const time = new Date();
    calls[1].args.start_time = weekdays[time.getDay() % 7];
    await test(calls);
  });

  it("swap 10 eth for usdc when the eth market cap is below 20", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputAmount: "10",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
      {
        name: "condition",
        args: {
          subject: "eth",
          comparator: "<=",
          value: "20",
          type: "market cap",
        },
      },
    ];
    await test(calls, undefined, true);
  });

  it("swap 10 eth for usdc when the market cap of eth is above X", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputAmount: "10",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
      {
        name: "condition",
        args: {
          subject: "eth",
          comparator: ">=",
          value: "X",
          type: "market cap",
        },
      },
    ];
    const marketCap = (await getCoinData(DEFAULT_TEST_ADDRESS, "eth", 1))
      .market_cap;
    assert(isDefined(marketCap));
    calls[1].args.value = (Math.floor(marketCap) - 100).toString();
    await test(calls);
  });

  it("swap 10 eth for usdc when my eth balance is below X", async () => {
    const calls = [
      {
        name: "condition",
        args: {
          subject: "eth",
          comparator: "<=",
          value: "X",
          type: "balance",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "10",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
    ];
    const ethBalance = await getEthBalanceForUser(1, DEFAULT_TEST_ADDRESS);
    calls[0].args.value = ethers.formatEther(ethBalance + 100n);
    await test(calls);
  });

  it("deposit 10 usdt to curve 3pool when apy is above 1", async () => {
    const calls = [
      {
        name: "deposit",
        args: {
          protocolName: "curve",
          poolName: "3pool",
          amount: "10",
          token: "usdc",
        },
      },
      {
        name: "condition",
        args: {
          subject: "apy",
          comparator: ">",
          value: "1",
          type: "yield",
        },
      },
    ];
    await test(calls);
  });

  it("deposit 10 usdt to curve 3pool when apy is above fraxusdc", async () => {
    const calls = [
      {
        name: "deposit",
        args: {
          protocolName: "curve",
          poolName: "3pool",
          amount: "10",
          token: "usdc",
        },
      },
      {
        name: "condition",
        args: {
          subject: "apy",
          comparator: ">",
          value: "fraxusdc",
          type: "yield",
        },
      },
    ];
    const apy1 = await getPoolApy(undefined, 1, "curve-dex", "DAI-USDC-USDT");
    const apy2 = await getPoolApy(undefined, 1, "curve-dex", "FRAX-USDC");
    assert(isDefined(apy1) && isDefined(apy2));
    calls[1].args.comparator = apy1 > apy2 ? ">=" : "<=";
    await test(calls);
  });

  it("swap 10 eth for usdc when my lodestar rewards are above 0.00004 eth", async () => {
    const calls = [
      {
        name: "condition",
        args: {
          subject: "lodestar rewards",
          comparator: ">=",
          value: "0.00004",
          value_token: "eth",
          type: "balance",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "10",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
    ];
    await test(calls, "0x34776762df20453a51654c541aa2dbd0354de5bd");
  }, 500000);

  it("once my lodestar rewards hit 2 eth, claim rewards and transfer to person.eth", async () => {
    const calls = [
      {
        name: "condition",
        args: {
          subject: "lodestar rewards",
          comparator: ">=",
          value: "2",
          value_token: "eth",
          type: "balance",
        },
      },
      {
        name: "claim",
        args: {
          protocolName: "lodestar",
          chainName: "arbitrum",
        },
      },
      {
        name: "transfer",
        args: {
          token: "outputToken",
          amount: "outputAmount",
          recipient: "person.eth",
        },
      },
    ];
    const ids = await test(
      calls,
      "0x34776762df20453a51654c541aa2dbd0354de5bd",
      true,
    );
    const conditions = await getConditions(ids);
    expect(conditions[0].actions[0].name).toEqual("claim");
    expect(conditions[0].actions[1].name).toEqual("transfer");
    await testStatus(ids, false);
  }, 500000);

  it("vote on the thena bnb/the pool every week at X", async () => {
    const calls = [
      {
        name: "vote",
        args: {
          protocolName: "thena",
          poolName: "bnb/the",
        },
      },
      {
        name: "time",
        args: {
          start_time: "X",
          recurrence: {
            type: "weeks",
            interval: 1,
          },
        },
      },
    ];
    const time = new Date();
    const hour = time.getUTCHours();
    const minute = time.getUTCMinutes();
    calls[1].args.start_time = `${weekdays[time.getDay()]} ${hour}:${
      minute + 1
    } utc`;
    await test(calls);
  });

  it("if token x goes -30%, sell to usdc", async () => {
    const calls = [
      {
        name: "condition",
        args: {
          subject: "x",
          comparator: "<=",
          value: "-30%",
          type: "price",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "all",
          outputToken: "usdc",
        },
      },
    ];
    await test(calls, undefined, true);
  }, 500000);

  it("vote on the thena bnb/the pool 5 minutes later", async () => {
    const calls = [
      {
        name: "vote",
        args: {
          protocolName: "thena",
          poolName: "bnb/the",
        },
      },
      {
        name: "time",
        args: {
          start_time: "5 minutes",
        },
      },
    ];
    const ids = await test(calls, undefined, true);
    await sleep(60);
    await testStatus(ids, false);
    await sleep(60);
    await testStatus(ids, true);
  }, 1000000);

  it("swap 10 eth for usdc when the usdc market cap is below X", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputAmount: "10",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
      {
        name: "condition",
        args: {
          subject: "usdc",
          comparator: "<=",
          value: "X",
          type: "market cap",
        },
      },
    ];
    const marketCap = (await getCoinData(DEFAULT_TEST_ADDRESS, "usdc", 1))
      .market_cap;
    assert(isDefined(marketCap));
    calls[1].args.value = (Math.floor(marketCap) + 100000000).toString();
    await test(calls);
  });

  it("swap 10 eth for usdc when my usdc balance is below X", async () => {
    const calls = [
      {
        name: "condition",
        args: {
          subject: "usdc",
          comparator: "<=",
          value: "X",
          type: "balance",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "10",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
    ];
    const usdcBalance = await getTokenBalance(
      DEFAULT_TEST_ADDRESS,
      "ethereum",
      "usdc",
    );
    calls[0].args.value = (usdcBalance + 100).toString();
    await test(calls);
  });

  it("swap 500 dai for wbtc every day for a month when gas is less than 30", async () => {
    const calls = [
      {
        name: "time",
        args: {
          recurrence: {
            type: "days",
            interval: 1,
          },
          end_time: "1 month",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "500",
          inputToken: "dai",
          outputToken: "wbtc",
        },
      },
    ];
    const ids = await test(calls);
    const conditions = await getConditions(ids);
    const timeCondition = conditions[0].conditions.find(
      (x) => x.name === "time",
    );
    if (!timeCondition?.body?.end_time) {
      throw new Error("end_time is undefined");
    }
    expect(+timeCondition?.body?.end_time).toBeGreaterThan(
      getCurrentTimestamp() + 86400 * 29,
    );
    await testStatus(ids, true);
  }, 1000000);

  it("stake 3 eth at lido for 2 weeks", async () => {
    const calls = [
      {
        name: "stake",
        args: {
          amount: "3",
          token: "eth",
          protocolName: "lido",
        },
      },
      {
        name: "time",
        args: {
          recurrence: {
            type: "minutes",
            interval: 1,
          },
          end_time: "2 minutes",
        },
      },
    ];
    const ids = await test(calls);
    const conditions = await getConditions(ids);
    const timeCondition = conditions[0].conditions.find(
      (x) => x.name === "time",
    );
    if (!timeCondition?.body?.end_time) {
      throw new Error("end_time is undefined");
    }
    expect(+timeCondition?.body?.end_time).toBeGreaterThan(
      getCurrentTimestamp(),
    );
    await sleep(60);
    await testStatus(ids, false);
  }, 1000000);

  it("lock steth for 2 months", async () => {
    const calls = [
      {
        name: "lock",
        args: {
          protocolName: "all",
          token: "steth",
        },
      },
      {
        name: "time",
        args: {
          end_time: "2 months",
        },
      },
    ];
    try {
      await test(calls);
    } catch (err) {
      // because time condition with end_time but without recurrence can't be stored.
      // hence `expect(ids.length).toBeGreaterThan(0)` doesn't pass
      const message = getErrorMessage(err);
      expect(message.indexOf("expect")).toBeGreaterThanOrEqual(0);
    }
  });

  it("bridge 25% of eth to optimism when gas is below X and buy uni when uni is below $Y", async () => {
    const calls = [
      {
        name: "bridge",
        args: {
          token: "eth",
          amount: "25%",
          sourceChainName: "ethereum",
          destinationChainName: "optimism",
        },
      },
      {
        name: "condition",
        args: {
          subject: "gas",
          comparator: "<=",
          value: "X",
          type: "gas",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "outputAmount",
          outputToken: "uni",
          chainName: "optimism",
        },
      },
      {
        name: "condition",
        args: {
          subject: "uni",
          comparator: "<=",
          value: "Y",
          value_units: "usd",
          type: "price",
        },
      },
    ];
    const gasPrice = await getGasPrice("", 1);
    calls[1].args.value = (Math.floor(gasPrice || 0) + 10).toString();
    const uniPrice = (await getCoinData(DEFAULT_TEST_ADDRESS, "uni", 1)).price;
    assert(isDefined(uniPrice));
    calls[3].args.value = (Math.floor(uniPrice) + 10).toString();
    await test(calls);
  });

  it("buy eth with 100 usdc whenever eth goes below $X until 2 minutes later", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputToken: "usdc",
          inputAmount: "100",
          outputToken: "eth",
          chainName: "ethereum",
        },
      },
      {
        name: "time",
        args: {
          end_time: "2 minutes",
        },
      },
      {
        name: "condition",
        args: {
          subject: "eth",
          comparator: "<=",
          value: "X",
          type: "price",
        },
      },
    ];
    const ethPrice = (await getCoinData(DEFAULT_TEST_ADDRESS, "eth", 1)).price;
    assert(isDefined(ethPrice));
    calls[2].args.value = (Math.floor(ethPrice) + 10).toString();
    const ids = await test(calls);
    await sleep(100);
    await testStatus(ids, false);
  }, 1000000);

  it("transfer 100 usdc to niyant.eth whenever gas goes below $X from 5 minutes later for 5 minutes", async () => {
    const calls = [
      {
        name: "transfer",
        args: {
          token: "usdc",
          amount: "100",
          chainName: "ethereum",
          recipient: "niyant.eth",
        },
      },
      {
        name: "time",
        args: {
          start_time: "5 minutes",
          end_time: "10 minutes",
        },
      },
      {
        name: "condition",
        args: {
          subject: "gas",
          comparator: "<=",
          value: "X",
          type: "gas",
        },
      },
    ];
    const gasPrice = await getGasPrice("", 1);
    calls[2].args.value = (Math.floor(gasPrice || 0) + 10).toString();
    const ids = await test(calls, undefined, true);
    await sleep(100);
    await testStatus(ids, true);
    await sleep(300);
    await testStatus(ids, false);
  }, 1000000);

  it("deposit 10 eth into the yearn yeth pool when the apy is X%", async () => {
    const calls = [
      {
        name: "deposit",
        args: {
          protocolName: "yearn",
          poolName: "yeth",
          amount: "10",
          token: "eth",
        },
      },
      {
        name: "condition",
        args: {
          subject: "apy",
          comparator: "==",
          value: "X%",
          type: "yield",
        },
      },
    ];
    const apy = await getPoolApy(undefined, 1, "yearn-finance", "YETH-F");
    calls[1].args.value = `${apy}%`;
    await test(calls);
  });

  it("deposit 10 eth into the pendle sy-weeth pool when the apy is above sy-susde", async () => {
    const calls = [
      {
        name: "deposit",
        args: {
          protocolName: "pendle",
          poolName: "sy-weeth",
          amount: "10",
          token: "eth",
        },
      },
      {
        name: "condition",
        args: {
          subject: "apy",
          comparator: "==",
          value: "sy-susde",
          type: "yield",
        },
      },
    ];
    const poolMetadata1 = await getPoolMetadata(
      "ethereum",
      "pendle",
      "sy-weeth",
      undefined,
    );
    const poolMetadata2 = await getPoolMetadata(
      "ethereum",
      "pendle",
      "sy-susde",
      undefined,
    );
    const apy1 = poolMetadata1?.apy;
    const apy2 = poolMetadata2?.apy;
    assert(isDefined(apy1) && isDefined(apy2));
    calls[1].args.comparator = apy1 > apy2 ? ">=" : "<=";
    await test(calls);
  });

  it("repay my borrow position on dolomite when apy rises above 69%", async () => {
    const calls = [
      {
        name: "repay",
        args: {
          protocolName: "dolomite",
        },
      },
      {
        name: "condition",
        args: {
          subject: "apy",
          comparator: ">=",
          value: "69%",
          type: "yield",
        },
      },
    ];
    try {
      await test(calls);
    } catch (err) {
      // because yield type condition specified without pool name
      // hence `expect(ids.length).toBeGreaterThan(0)` doesn't pass
      const message = getErrorMessage(err);
      expect(message.indexOf("expect")).toBeGreaterThanOrEqual(0);
    }
  });

  it("repay my borrow position on dolomite when borrow apy rises above 69%", async () => {
    const calls = [
      {
        name: "repay",
        args: {
          protocolName: "dolomite",
          poolName: "gmx",
        },
      },
      {
        name: "condition",
        args: {
          subject: "borrow apy",
          comparator: ">=",
          value: "69%",
          type: "yield",
        },
      },
    ];
    try {
      await test(calls);
    } catch (err) {
      // because yield type condition specified with borrow apy
      // hence `expect(ids.length).toBeGreaterThan(0)` doesn't pass
      const message = getErrorMessage(err);
      expect(message.indexOf("expect")).toBeGreaterThanOrEqual(0);
    }
  });

  it("deposit all of my $steth into the curve steth pool on ethereum when the apy goes above X%", async () => {
    const calls = [
      {
        name: "deposit",
        args: {
          protocolName: "curve",
          poolName: "steth",
          amount: "all",
          token: "steth",
          chainName: "ethereum",
        },
      },
      {
        name: "condition",
        args: {
          subject: "apy",
          comparator: ">=",
          value: "X%",
          type: "yield",
        },
      },
    ];
    const apy = await getPoolApy(undefined, 1, "curve-dex", "ETH-STETH");
    assert(isDefined(apy));
    calls[1].args.value = `${apy - 0.01}%`;
    await test(calls);
  });

  it("deposit 10 eth into the yearn yeth pool when apy is above pendle sy-susde", async () => {
    const calls = [
      {
        name: "deposit",
        args: {
          protocolName: "yearn",
          poolName: "yeth",
          amount: "10",
          token: "eth",
        },
      },
      {
        name: "condition",
        args: {
          subject: "apy",
          comparator: ">=",
          value: "pendle sy-susde",
          type: "yield",
        },
      },
    ];
    const apy1 = await getPoolApy(undefined, 1, "yearn-finance", "YETH-F");
    const poolMetadata = await getPoolMetadata(
      "ethereum",
      "pendle",
      "sy-susde",
      undefined,
    );
    const apy2 = poolMetadata?.apy;
    assert(isDefined(apy1) && isDefined(apy2));
    calls[1].args.comparator = apy1 > apy2 ? ">=" : "<=";
    await test(calls);
  });

  it("swap eth for 5 dai and lend it on aave on ethereum when dai supply apy goes above X%", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "dai",
          outputAmount: "5",
        },
      },
      {
        name: "lend",
        args: {
          protocolName: "aave",
          token: "dai",
          amount: "5",
          chainName: "ethereum",
        },
      },
      {
        name: "condition",
        args: {
          subject: "dai supply apy",
          comparator: ">=",
          value: "X%",
          type: "yield",
        },
      },
    ];
    const apy = await getPoolApy(undefined, 1, "aave-v3", "DAI");
    calls[2].args.value = `${apy}%`;
    await test(calls);
  });

  it("when dolomite health_factor is below than X%, repay 10% of loan.", async () => {
    const accountAddress = "0x000007656F345A789bB422f0307D826660258333";
    const calls = [
      {
        name: "condition",
        args: {
          subject: "health_factor",
          comparator: "<=",
          value: "X%",
          type: "health_factor",
          accountAddress,
        },
      },
      {
        name: "repay",
        args: {
          amount: "10%",
          protocolName: "dolomite",
        },
      },
    ];
    const hr = await getLoanValueForProtocol(accountAddress, "dolomite", true);
    if (!hr) {
      // This will cause the test to fail
      expect(hr).toBeDefined();
      return;
    }
    calls[0].args.value = `${hr + 1}%`;
    await test(calls, accountAddress);
  });

  it("when health_factor is greater than 20%, repay 10% of loan.", async () => {
    const calls = [
      {
        name: "condition",
        args: {
          subject: "health_factor",
          comparator: ">=",
          value: "20%",
          type: "health_factor",
        },
      },
      {
        name: "repay",
        args: {
          amount: "10%",
          protocolName: "all",
        },
      },
    ];
    try {
      await test(calls);
    } catch (err) {
      // because health_factor type condition specified without protocol name
      // hence `expect(ids.length).toBeGreaterThan(0)` doesn't pass
      const message = getErrorMessage(err);
      expect(message.indexOf("expect")).toBeGreaterThanOrEqual(0);
    }
  });

  it("when dolomite ltv is greater than X%, repay 10% of loan.", async () => {
    const accountAddress = "0x000007656F345A789bB422f0307D826660258333";
    const calls = [
      {
        name: "condition",
        args: {
          subject: "ltv",
          comparator: ">=",
          value: "X%",
          type: "ltv",
          accountAddress,
        },
      },
      {
        name: "repay",
        args: {
          amount: "10%",
          protocolName: "dolomite",
        },
      },
    ];
    const ltv = await getLoanValueForProtocol(
      accountAddress,
      "dolomite",
      false,
    );
    if (!ltv) {
      // This will cause the test to fail
      expect(ltv).toBeDefined();
      return;
    }
    calls[0].args.value = `${ltv - 0.05}%`;
    await test(calls, accountAddress);
  });

  it("when eth fdv is greater than X, repay 10% of loan.", async () => {
    const calls = [
      {
        name: "condition",
        args: {
          subject: "eth",
          comparator: ">=",
          value: "X",
          type: "fdv",
        },
      },
      {
        name: "repay",
        args: {
          amount: "10%",
          protocolName: "all",
        },
      },
    ];
    const fdv = (await getCoinData(DEFAULT_TEST_ADDRESS, "eth", 1)).fdv;
    assert(isDefined(fdv));
    calls[0].args.value = (Math.floor(fdv) - 100).toString();
    await test(calls);
  });

  it("when eth fdv is greater than 2x, repay 10% of loan.", async () => {
    const calls = [
      {
        name: "condition",
        args: {
          subject: "eth",
          comparator: ">=",
          value: "2x",
          type: "fdv",
        },
      },
      {
        name: "repay",
        args: {
          amount: "10%",
          protocolName: "all",
        },
      },
    ];
    const fdv = (await getCoinData(DEFAULT_TEST_ADDRESS, "eth", 1)).fdv;
    assert(isDefined(fdv));
    const ids = await test(calls, undefined, true);
    await testStatus(ids, false);
    const conditions = await getConditions(ids);
    if (!conditions[0].conditions[0].body?.value) {
      throw new Error("value is undefined");
    }
    expect(
      Number.parseFloat(conditions[0].conditions[0].body?.value),
    ).toBeCloseTo(fdv * 2);
  }, 500000);

  it("swap 10 eth for usdc when gas is below 50%", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputAmount: "10",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
      {
        name: "condition",
        args: {
          subject: "gas",
          comparator: "<",
          value: "50%",
          type: "price",
        },
      },
    ];
    const ids = await test(calls, undefined, true);
    await testStatus(ids, false);
    const conditions = await getConditions(ids);
    expect(typeof conditions[0].conditions[0].body?.value).toEqual("number");
  }, 500000);

  it("when gas doubles, sell all my eth", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "eth",
        },
      },
      {
        name: "condition",
        args: {
          subject: "gas",
          comparator: "==",
          value: "2x",
          type: "gas",
        },
      },
    ];
    const ids = await test(calls, undefined, true);
    await testStatus(ids, false);
    const conditions = await getConditions(ids);
    expect(typeof conditions[0].conditions[0].body?.value).toEqual("number");
  }, 500000);

  it("when gas greater than -30%, sell all my eth", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "eth",
        },
      },
      {
        name: "condition",
        args: {
          subject: "gas",
          comparator: ">=",
          value: "-30%",
          type: "gas",
        },
      },
    ];
    try {
      await test(calls);
    } catch (err) {
      // because > or >= to under 100% percentage value is meaningless
      // hence `expect(ids.length).toBeGreaterThan(0)` doesn't pass
      const message = getErrorMessage(err);
      expect(message.indexOf("expect")).toBeGreaterThanOrEqual(0);
    }
  });

  it("sell my doge when price 3x", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputToken: "doge",
        },
      },
      {
        name: "condition",
        args: {
          subject: "doge",
          comparator: "==",
          value: "3x",
          type: "price",
        },
      },
    ];
    const ids = await test(calls, undefined, true);
    await testStatus(ids, false);
    const conditions = await getConditions(ids);
    expect(typeof conditions[0].conditions[0].body?.value).toEqual("number");
  }, 500000);

  it("if market cap of eth 3x, sell 10% of my wif", async () => {
    const calls = [
      {
        name: "condition",
        args: {
          subject: "eth",
          comparator: "==",
          value: "3x",
          type: "market cap",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "10%",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
    ];
    const ids = await test(calls, undefined, true);
    await testStatus(ids, false);
    const conditions = await getConditions(ids);
    expect(typeof conditions[0].conditions[0].body?.value).toEqual("number");
  }, 500000);

  it("when my eth balance 5x, sell it all for eth", async () => {
    const calls = [
      {
        name: "condition",
        args: {
          subject: "eth",
          comparator: "==",
          value: "5x",
          type: "balance",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
    ];
    const ids = await test(calls, undefined, true);
    await testStatus(ids, false);
    const conditions = await getConditions(ids);
    expect(typeof conditions[0].conditions[0].body?.value).toEqual("number");
  }, 500000);

  it("deposit into morpho and bridge all my usdc to base when gas goes down 50%", async () => {
    const calls = [
      {
        name: "deposit",
        args: {
          protocolName: "morpho",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "usdc",
          destinationChainName: "base",
        },
      },
      {
        name: "condition",
        args: {
          subject: "gas",
          comparator: "<=",
          value: "50%",
          type: "gas",
        },
      },
    ];
    const ids = await test(calls, undefined, true);
    await testStatus(ids, false);
    const conditions = await getConditions(ids);
    expect(typeof conditions[0].conditions[0].body?.value).toEqual("number");
  }, 500000);

  it("if eth price goes up 20%, buy pepe with 30% of my usdc", async () => {
    const calls = [
      {
        name: "condition",
        args: {
          subject: "eth",
          comparator: ">=",
          value: "20%",
          type: "price",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "30%",
          inputToken: "usdc",
          outputToken: "pepe",
        },
      },
    ];
    const ids = await test(calls, undefined, true);
    await testStatus(ids, false);
    const conditions = await getConditions(ids);
    expect(typeof conditions[0].conditions[0].body?.value).toEqual("number");
  }, 500000);

  it("bridge to arbitrum and swap to gmx when gmx market cap dips 10%", async () => {
    const calls = [
      {
        name: "bridge",
        args: {
          token: "eth",
          amount: "all",
          sourceChainName: "ethereum",
          destinationChainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          outputToken: "gmx",
          chainName: "arbitrum",
          inputAmount: "outputAmount",
          inputToken: "outputToken",
        },
      },
      {
        name: "condition",
        args: {
          subject: "gmx",
          comparator: "<=",
          value: "10%",
          type: "market cap",
        },
      },
    ];
    const ids = await test(calls, undefined, true);
    await testStatus(ids, false);
    const conditions = await getConditions(ids);
    expect(typeof conditions[0].conditions[0].body?.value).toEqual("number");
  }, 700000);

  it("buy wbtc with eth when my usdc balance decreases 50%", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "wbtc",
        },
      },
      {
        name: "condition",
        args: {
          subject: "usdc",
          comparator: "<=",
          value: "50%",
          type: "balance",
        },
      },
    ];
    const ids = await test(calls, undefined, true);
    await testStatus(ids, false);
    const conditions = await getConditions(ids);
    expect(typeof conditions[0].conditions[0].body?.value).toEqual("number");
  }, 500000);

  it("on base sell my degen to eth when profit in eth terms is 50%", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputToken: "degen",
          outputToken: "eth",
          chainName: "base",
        },
      },
      {
        name: "condition",
        args: {
          subject: "degen",
          comparator: ">=",
          value: "50%",
          type: "price",
          value_token: "eth",
        },
      },
    ];
    const ids = await test(calls, undefined, true);
    await testStatus(ids, false);
    const conditions = await getConditions(ids);
    expect(typeof conditions[0].conditions[0].body?.value).toEqual("number");
  }, 500000);

  it("swap eth to 100 usdc on base every tuesday and thursday at 6pm cet", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputAmount: "100",
          outputToken: "usdc",
          chainName: "base",
        },
      },
      {
        name: "time",
        args: {
          start_time: "tuesday 6pm cet",
          recurrence: {
            type: "weeks",
            interval: 1,
          },
        },
      },
      {
        name: "time",
        args: {
          start_time: "thursday 6pm cet",
          recurrence: {
            type: "weeks",
            interval: 1,
          },
        },
      },
    ];
    const time = new Date();
    const weekday = time.getDay();
    const hour = time.getHours();
    const minute = time.getMinutes();
    calls[1].args.start_time = `${weekdays[weekday]} ${hour}:${minute + 1}`;
    await test(calls);
  });

  it("long eth with 3x leverage with 10 usdc on gmx if eth less than 3100 every 12 hours", async () => {
    const calls = [
      {
        name: "long",
        args: {
          protocolName: "gmx",
          inputAmount: "10",
          inputToken: "usdc",
          outputToken: "eth",
          leverageMultiplier: "3x",
        },
      },
      {
        name: "condition",
        args: {
          subject: "eth",
          comparator: "<=",
          value: "3100",
          type: "price",
        },
      },
      {
        name: "time",
        args: {
          recurrence: {
            type: "hours",
            interval: 12,
          },
        },
      },
    ];
    const ethPrice = (await getCoinData(DEFAULT_TEST_ADDRESS, "eth", 1)).price;
    assert(isDefined(ethPrice));
    calls[1].args.value = (Math.floor(ethPrice) + 10).toString();
    await test(calls);
  });

  it("unsupported operator", async () => {
    const calls = [
      {
        name: "transfer",
        args: {
          amount: "200",
          token: "usdc",
          recipient: "0x2b605c2a76ee3f08a48b4b4a9d7d4dad3ed46bf3",
        },
      },
      {
        name: "condition",
        args: {
          operator: "+",
          subject: "eth",
          comparator: "<=",
          value: "3100",
          type: "price",
        },
      },
    ];
    try {
      await test(calls);
    } catch (err) {
      // because operator + not supported
      // hence `expect(ids.length).toBeGreaterThan(0)` doesn't pass
      const message = getErrorMessage(err);
      expect(message.indexOf("expect")).toBeGreaterThanOrEqual(0);
    }
  });

  it("operator 'or' fail case without time", async () => {
    const calls = [
      {
        name: "transfer",
        args: {
          amount: "200",
          token: "usdc",
          recipient: "0x2b605c2a76ee3f08a48b4b4a9d7d4dad3ed46bf3",
        },
      },
      {
        name: "condition",
        args: {
          subject: "gas",
          comparator: ">",
          value: "X",
          type: "price",
        },
      },
      {
        name: "condition",
        args: {
          operator: "or",
          subject: "eth",
          comparator: "<",
          value: "X",
          type: "price",
        },
      },
    ];
    const gasPrice = await getGasPrice("", 1);
    calls[1].args.value = (Math.floor(gasPrice || 0) + 10).toString();
    const ethPrice = (await getCoinData(DEFAULT_TEST_ADDRESS, "eth", 1)).price;
    assert(isDefined(ethPrice));
    calls[1].args.value = (Math.floor(ethPrice) + 10).toString();
    await test(calls, undefined, true);
  });

  it("operator 'or' pass case without time", async () => {
    const calls = [
      {
        name: "transfer",
        args: {
          amount: "200",
          token: "usdc",
          recipient: "0x2b605c2a76ee3f08a48b4b4a9d7d4dad3ed46bf3",
        },
      },
      {
        name: "condition",
        args: {
          subject: "gas",
          comparator: "<",
          value: "X",
          type: "price",
        },
      },
      {
        name: "condition",
        args: {
          operator: "or",
          subject: "eth",
          comparator: ">",
          value: "X",
          type: "price",
        },
      },
    ];
    const gasPrice = await getGasPrice("", 1);
    calls[1].args.value = (Math.floor(gasPrice || 0) + 10).toString();
    const ethPrice = (await getCoinData(DEFAULT_TEST_ADDRESS, "eth", 1)).price;
    assert(isDefined(ethPrice));
    calls[1].args.value = (Math.floor(ethPrice) + 10).toString();
    await test(calls);
  });

  it("operator 'or' pass case with time", async () => {
    const calls = [
      {
        name: "transfer",
        args: {
          amount: "200",
          token: "usdc",
          recipient: "0x2b605c2a76ee3f08a48b4b4a9d7d4dad3ed46bf3",
        },
      },
      {
        name: "condition",
        args: {
          operator: "or",
          subject: "eth",
          comparator: ">",
          value: "X",
          type: "price",
        },
      },
      {
        name: "condition",
        args: {
          subject: "gas",
          comparator: "<",
          value: "X",
          type: "price",
        },
      },
      {
        name: "time",
        args: {
          recurrence: {
            type: "hours",
            interval: 12,
          },
        },
      },
    ];
    const gasPrice = await getGasPrice("", 1);
    calls[2].args.value = (Math.floor(gasPrice || 0) + 10).toString();
    const ethPrice = (await getCoinData(DEFAULT_TEST_ADDRESS, "eth", 1)).price;
    assert(isDefined(ethPrice));
    calls[1].args.value = (Math.floor(ethPrice) + 10).toString();
    await test(calls);
  });

  it("long eth on gmx when funding rate goes above X", async () => {
    const calls = [
      {
        name: "long",
        args: {
          protocolName: "gmx",
          inputToken: "usdc",
          outputToken: "eth",
        },
      },
      {
        name: "condition",
        args: {
          subject: "eth",
          comparator: ">=",
          value: "X",
          type: "funding rate",
        },
      },
    ];
    const data = await getMarketInfoForProtocol(
      DEFAULT_TEST_ADDRESS,
      "gmx",
      "eth",
      42161,
    );
    if (!data.funding) {
      // This will cause the test to fail
      expect(data.funding).toBeDefined();
      return;
    }
    calls[1].args.value = `${data.funding - 0.001}`;
    await test(calls);
  });

  it("close my ltc long on hyperliquid if funding goes below X", async () => {
    const calls = [
      {
        name: "close",
        args: {
          protocolName: "hyperliquid",
          outputToken: "ltc",
        },
      },
      {
        name: "condition",
        args: {
          subject: "ltc",
          comparator: "<=",
          value: "X",
          type: "funding rate",
        },
      },
    ];
    const data = await getMarketInfoForProtocol(
      DEFAULT_TEST_ADDRESS,
      "hyperliquid",
      "ltc",
      42161,
    );
    if (!data.funding) {
      // This will cause the test to fail
      expect(data.funding).toBeDefined();
      return;
    }
    calls[1].args.value = `${data.funding + 0.001}`;
    await test(calls);
  });

  it("if open interest goes below X, long btc on hyperliquid", async () => {
    const calls = [
      {
        name: "long",
        args: {
          protocolName: "hyperliquid",
          outputToken: "btc",
        },
      },
      {
        name: "condition",
        args: {
          subject: "btc",
          comparator: "<=",
          value: "X",
          type: "open interest",
        },
      },
    ];
    const data = await getMarketInfoForProtocol(
      DEFAULT_TEST_ADDRESS,
      "hyperliquid",
      "btc",
      42161,
    );
    if (!data.interest) {
      // This will cause the test to fail
      expect(data.interest).toBeDefined();
      return;
    }
    calls[1].args.value = `${data.interest + 100}`;
    await test(calls);
  });

  it("long arb short on gmx if open interest goes above X", async () => {
    const calls = [
      {
        name: "long",
        args: {
          protocolName: "gmx",
          inputToken: "usdc",
          outputToken: "arb",
        },
      },
      {
        name: "condition",
        args: {
          subject: "arb",
          comparator: "==",
          value: "X",
          type: "open interest",
        },
      },
    ];
    const data = await getMarketInfoForProtocol(
      DEFAULT_TEST_ADDRESS,
      "gmx",
      "arb",
      42161,
    );
    if (!data.interest) {
      // This will cause the test to fail
      expect(data.interest).toBeDefined();
      return;
    }
    calls[1].args.value = `${data.interest - 100}`;
    const ids = await test(calls, undefined, true);
    await testStatus(ids, false);
    const conditions = await getConditions(ids);
    expect(conditions[0].conditions[0].body?.comparator).toEqual("<=");
  }, 500000);

  it("withdraw from my pendle position when the apy is less than 10%", async () => {
    const calls = [
      {
        name: "withdraw",
        args: {
          protocolName: "pendle",
          poolName: "pt-weeth-26jun2024",
        },
      },
      {
        name: "condition",
        args: {
          subject: "apy",
          comparator: "<=",
          value: "10%",
          type: "yield",
        },
      },
    ];
    await test(calls, "0xA5A65ce98B53f7ae4fC77415840E9F66D598FC8C");
  });

  it("withdraw from my pendle position when the apy is less than X%", async () => {
    const calls = [
      {
        name: "withdraw",
        args: {
          protocolName: "pendle",
          poolName: "pt-weeth",
        },
      },
      {
        name: "condition",
        args: {
          subject: "apy",
          comparator: "<=",
          value: "X%",
          type: "yield",
        },
      },
    ];
    const poolMetadata = await getPoolMetadata(
      "ethereum",
      "pendle",
      "pt-weeth",
      undefined,
    );
    const apy = poolMetadata?.apy;
    assert(isDefined(apy));
    calls[1].args.value = `${apy + 10}%`;
    await test(calls);
  });

  it("deposit 10 eth into the pendle sy-pufeth pool when the apy is above X%", async () => {
    const calls = [
      {
        name: "deposit",
        args: {
          protocolName: "pendle",
          poolName: "sy-pufeth",
          amount: "10",
          token: "eth",
        },
      },
      {
        name: "condition",
        args: {
          subject: "apy",
          comparator: ">=",
          value: "X%",
          type: "yield",
        },
      },
    ];
    const poolMetadata = await getPoolMetadata(
      "ethereum",
      "pendle",
      "sy-pufeth",
      undefined,
    );
    const apy = poolMetadata?.apy;
    assert(isDefined(apy));
    calls[1].args.value = `${apy - 10}%`;
    await test(calls);
  });

  it("swap ankr to usdc and usdc to eth Nx on ethereum", async () => {
    const N = 3;
    const calls = [
      {
        name: "swap",
        args: {
          inputToken: "ankr",
          outputToken: "usdc",
          chainName: "ethereum",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "usdc",
          outputToken: "eth",
          chainName: "ethereum",
        },
      },
      {
        name: "time",
        args: {
          recurrence: {
            times: N,
          },
        },
      },
    ];
    const ids = await test(calls);
    for (let i = 0; i < N - 1; i++) {
      await completeConditions(ids);
      await testStatus(ids, true);
    }
  });

  it("bridge weth from base to arbitrum and back N times", async () => {
    const N = 3;
    const calls = [
      {
        name: "bridge",
        args: {
          token: "weth",
          sourceChainName: "base",
          destinationChainName: "arbitrum",
        },
      },
      {
        name: "bridge",
        args: {
          token: "weth",
          sourceChainName: "arbitrum",
          destinationChainName: "base",
        },
      },
      {
        name: "time",
        args: {
          recurrence: {
            times: N,
          },
        },
      },
    ];
    const ids = await test(calls);
    for (let i = 0; i < N - 1; i++) {
      await completeConditions(ids);
      await testStatus(ids, true);
    }
  });

  it("lend eth and borrow usdc on aave in a loop Nx", async () => {
    const N = 2;
    const calls = [
      {
        name: "lend",
        args: {
          protocolName: "aave",
          token: "eth",
        },
      },
      {
        name: "borrow",
        args: {
          protocolName: "aave",
          token: "usdc",
        },
      },
      {
        name: "time",
        args: {
          recurrence: {
            times: N,
          },
        },
      },
    ];
    const ids = await test(calls);
    for (let i = 0; i < N - 1; i++) {
      await completeConditions(ids);
      await testStatus(ids, true);
    }
  });

  it("swap eth to usdc Nx on ethereum at random times", async () => {
    const N = 3;
    const calls = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "usdc",
          chainName: "ethereum",
        },
      },
      {
        name: "time",
        args: {
          recurrence: {
            times: N,
            random: true,
          },
        },
      },
    ];
    const ids = await test(calls, undefined, true);
    for (let i = 0; i < N - 1; i++) {
      await completeConditions(ids);
      const conditions = await getConditions(ids);
      if (!conditions[0].conditions[0].body?.start_time) {
        throw new Error("start_time is undefined");
      }
      const delta =
        Number.parseInt(conditions[0].conditions[0].body?.start_time, 10) -
        getCurrentTimestamp();
      expect(delta > 0).toBeTruthy();
    }
    await completeConditions(ids);
    await testStatus(ids, false);
  }, 500000);

  it("bridge to mode and swap half my eth for usdc on symbiosis. repeat randomly for 3 days.", async () => {
    const calls = [
      {
        name: "bridge",
        args: {
          destinationChainName: "mode",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "half",
          inputToken: "eth",
          outputToken: "usdc",
          protocolName: "symbiosis",
          chainName: "mode",
        },
      },
      {
        name: "time",
        args: {
          recurrence: {
            random: true,
          },
          end_time: "3 days",
        },
      },
    ];
    const ids = await test(calls, undefined, true);
    for (let i = 0; i < 5; i++) {
      await completeConditions(ids);
      const conditions = await getConditions(ids);
      if (!conditions[0].conditions[0].body?.start_time) {
        throw new Error("start_time is undefined");
      }
      const delta =
        Number.parseInt(conditions[0].conditions[0].body?.start_time, 10) -
        getCurrentTimestamp();
      expect(delta > 0).toBeTruthy();
    }
  });

  it("randomly bridge my eth from arbitrum to optimism and optimism to arbitrum using bungee for the next week", async () => {
    const calls = [
      {
        name: "bridge",
        args: {
          token: "eth",
          sourceChainName: "arbitrum",
          destinationChainName: "optimism",
          protocolName: "bungee",
        },
      },
      {
        name: "bridge",
        args: {
          token: "eth",
          sourceChainName: "optimism",
          destinationChainName: "arbitrum",
          protocolName: "bungee",
        },
      },
      {
        name: "time",
        args: {
          recurrence: {
            random: true,
          },
          end_time: "next week",
        },
      },
    ];
    const ids = await test(calls, undefined, true);
    for (let i = 0; i < 5; i++) {
      await completeConditions(ids);
      const conditions = await getConditions(ids);
      if (!conditions[0].conditions[0].body?.start_time) {
        throw new Error("start_time is undefined");
      }
      const delta =
        Number.parseInt(conditions[0].conditions[0].body?.start_time, 10) -
        getCurrentTimestamp();
      expect(delta > 0).toBeTruthy();
    }
  });

  it("buy btc with 1 eth when btc is at or below $25000 and sell 0.2 btc for eth when btc is at or above $30000, forever", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputAmount: "1",
          inputToken: "eth",
          outputToken: "btc",
        },
      },
      {
        name: "condition",
        args: {
          subject: "btc",
          comparator: "<=",
          value: "25000",
          type: "price",
          value_units: "usd",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "0.2",
          inputToken: "btc",
          outputToken: "eth",
        },
      },
      {
        name: "condition",
        args: {
          subject: "btc",
          comparator: ">=",
          value: "30000",
          type: "price",
          value_units: "usd",
        },
      },
      {
        name: "time",
        args: {
          end_time: "forever",
        },
      },
    ];
    const ids = await test(calls);
    for (let i = 0; i < 3; i++) {
      await completeConditions(ids);
      await testStatus(ids, true);
    }
  });

  it("whenever $winr (0xd77b108d4f6cefaa0cae9506a934e825becca46e) falls below 3$, swap 2eth for it", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputAmount: "2",
          inputToken: "eth",
          outputToken: "0xd77b108d4f6cefaa0cae9506a934e825becca46e",
        },
      },
      {
        name: "condition",
        args: {
          subject: "0xd77b108d4f6cefaa0cae9506a934e825becca46e",
          comparator: "<=",
          value: "3",
          type: "price",
          value_units: "usd",
        },
      },
      {
        name: "time",
        args: {
          end_time: "forever",
        },
      },
    ];
    const ids = await test(calls, undefined, true);
    for (let i = 0; i < 3; i++) {
      await completeConditions(ids);
      await testStatus(ids, false);
    }
  }, 1000000);

  it("buy eth with 100 usdc whenever eth goes below $3100 and buy usdc with 0.03 eth whenever eth goes above $3300 indefinitely", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputAmount: "100",
          inputToken: "usdc",
          outputToken: "eth",
        },
      },
      {
        name: "condition",
        args: {
          subject: "eth",
          comparator: "<=",
          value: "3100",
          type: "price",
          value_units: "usd",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "0.03",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
      {
        name: "condition",
        args: {
          subject: "eth",
          comparator: ">=",
          value: "3300",
          type: "price",
          value_units: "usd",
        },
      },
      {
        name: "time",
        args: {
          end_time: "forever",
        },
      },
    ];
    const ethPrice = (await getCoinData(DEFAULT_TEST_ADDRESS, "eth", 1)).price;
    assert(isDefined(ethPrice));
    calls[1].args.value = (Math.floor(ethPrice) + 10).toString();
    const ids = await test(calls);
    for (let i = 0; i < 3; i++) {
      await completeConditions(ids);
      await testStatus(ids, true);
    }
  });

  it("whenever eth is below $2000, buy it with all my usdc", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "usdc",
          outputToken: "eth",
        },
      },
      {
        name: "condition",
        args: {
          subject: "eth",
          comparator: "<=",
          value: "2000",
          type: "price",
          value_units: "usd",
        },
      },
      {
        name: "time",
        args: {
          end_time: "forever",
        },
      },
    ];
    const ethPrice = (await getCoinData(DEFAULT_TEST_ADDRESS, "eth", 1)).price;
    assert(isDefined(ethPrice));
    calls[1].args.value = (Math.floor(ethPrice) + 10).toString();
    const ids = await test(calls);
    for (let i = 0; i < 3; i++) {
      await completeConditions(ids);
      await testStatus(ids, true);
    }
  });

  it("as long as sol is above $200, close it on hyperliquid with 3x leverage, forever", async () => {
    const calls = [
      {
        name: "close",
        args: {
          protocolName: "hyperliquid",
          outputToken: "sol",
          leverageMultiplier: "3x",
        },
      },
      {
        name: "condition",
        args: {
          subject: "sol",
          comparator: ">=",
          value: "200",
          type: "price",
          value_units: "usd",
        },
      },
      {
        name: "time",
        args: {
          end_time: "forever",
        },
      },
    ];
    const ids = await test(calls, undefined, true);
    for (let i = 0; i < 3; i++) {
      await completeConditions(ids);
      await testStatus(ids, false);
    }
  }, 1000000);

  it("swap 1 eth to usdc if the slippage is less than 2%", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputAmount: "1",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
      {
        name: "condition",
        args: {
          subject: "slippage",
          comparator: "<=",
          value: "2%",
          type: "slippage",
        },
      },
    ];
    await test(calls);
  }, 500000);

  it("swap 1 eth to usdc if the gas cost is less than 0.04 eth", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputAmount: "1",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
      {
        name: "condition",
        args: {
          subject: "gas",
          comparator: "<=",
          value: "0.04",
          type: "gas",
          value_token: "eth",
        },
      },
    ];
    await test(calls);
  }, 500000);

  it("swap 1 eth to usdc if the gas cost is less than $20 in gas", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputAmount: "1",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
      {
        name: "condition",
        args: {
          subject: "gas",
          comparator: "<=",
          value: "20",
          type: "gas",
          value_token: "usd",
        },
      },
    ];
    const ethPrice = (await getCoinData(DEFAULT_TEST_ADDRESS, "eth", 1)).price;
    assert(isDefined(ethPrice));
    calls[1].args.value = (Math.floor(0.02 * ethPrice) + 5).toString();
    await test(calls);
  }, 500000);

  it("deposit 1 eth to aave on arbitrum when slippage is less than 2%", async () => {
    const calls = [
      {
        name: "deposit",
        args: {
          amount: "1",
          token: "eth",
          protocolName: "aave",
          chainName: "arbitrum",
        },
      },
      {
        name: "condition",
        args: {
          subject: "slippage",
          comparator: "<=",
          value: "2%",
          type: "slippage",
        },
      },
    ];
    await test(calls);
  }, 500000);

  it("deposit 0.1 eth into yt sfrxeth 26dec2024 pool on ethereum. make sure slippage is less than 10%", async () => {
    const calls = [
      {
        name: "deposit",
        args: {
          poolName: "yt-sfrxeth-26dec2024",
          amount: "0.1",
          token: "eth",
          chainName: "ethereum",
        },
      },
      {
        name: "condition",
        args: {
          subject: "slippage",
          comparator: "<=",
          value: "10%",
          type: "slippage",
        },
      },
    ];
    await test(calls);
  }, 500000);

  it("if gas is < 0.008 eth, deposit 0.1 eth into yt sfrxeth 26dec2024 pool on ethereum", async () => {
    const calls = [
      {
        name: "condition",
        args: {
          subject: "gas",
          comparator: "<=",
          value: "0.008",
          type: "gas",
          value_token: "eth",
        },
      },
      {
        name: "deposit",
        args: {
          poolName: "yt-sfrxeth-26dec2024",
          amount: "0.1",
          token: "eth",
          chainName: "ethereum",
        },
      },
    ];
    await test(calls);
  }, 500000);

  it("when implied apy < 4%, withdraw from pt-unieth-26dec2024", async () => {
    const calls = [
      {
        name: "condition",
        args: {
          subject: "implied",
          comparator: "<=",
          value: "4%",
          type: "yield",
        },
      },
      {
        name: "withdraw",
        args: {
          protocolName: "pendle",
          poolName: "pt-unieth-26dec2024",
        },
      },
    ];
    const poolMetadata = await getPoolMetadata(
      "ethereum",
      "pendle",
      "pt-unieth-26dec2024",
      undefined,
    );
    const apy = poolMetadata?.apy;
    assert(isDefined(apy));
    calls[0].args.value = `${apy + 10}%`;
    await test(calls);
  }, 500000);

  it("when underlying apy < 4%, withdraw from pt-unieth-26dec2024", async () => {
    const calls = [
      {
        name: "condition",
        args: {
          subject: "underlying",
          comparator: "<=",
          value: "4%",
          type: "yield",
        },
      },
      {
        name: "withdraw",
        args: {
          protocolName: "pendle",
          poolName: "pt-unieth-26dec2024",
        },
      },
    ];
    const poolMetadata = await getPoolMetadata(
      "ethereum",
      "pendle",
      "pt-unieth-26dec2024",
      undefined,
      {},
      "underlying",
    );
    const apy = poolMetadata?.apy;
    assert(isDefined(apy));
    calls[0].args.value = `${apy + 10}%`;
    await test(calls);
  }, 500000);

  it("swap 0.01 eth to usdc on base when the apy of the eth aave pool is above X%", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputAmount: "0.01",
          inputToken: "eth",
          outputToken: "usdc",
          chainName: "base",
        },
      },
      {
        name: "condition",
        args: {
          subject: "eth",
          comparator: ">=",
          value: "X%",
          type: "yield",
          protocolName: "aave",
        },
      },
    ];
    const apy = await getPoolApy(undefined, 8453, "aave-v3", "ETH");
    assert(isDefined(apy));
    calls[1].args.value = `${apy - 1}%`;
    await test(calls);
  }, 500000);

  it("swap 0.01 eth to degen on base when the apy of the usdc aave pool on base is greater than X%", async () => {
    const calls = [
      {
        name: "swap",
        args: {
          inputAmount: "0.01",
          inputToken: "eth",
          outputToken: "degen",
          chainName: "base",
        },
      },
      {
        name: "condition",
        args: {
          subject: "usdc",
          comparator: ">=",
          value: "X%",
          type: "yield",
          chainName: "base",
          protocolName: "aave",
        },
      },
    ];
    const apy = await getPoolApy(undefined, 8453, "aave-v3", "USDC");
    assert(isDefined(apy));
    calls[1].args.value = `${apy - 1}%`;
    await test(calls);
  }, 500000);
});
