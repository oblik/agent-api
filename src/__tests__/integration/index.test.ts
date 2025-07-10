import { ethers } from "ethers";
import ProtocolAddresses from "../../config/addresses.js";
import { initModels } from "../../db/index.js";
import { getUnsupportedChainError } from "../../utils/error.js";
import { getEthBalanceForUser, getRpcUrlForChain } from "../../utils/index.js";
import { RetryProvider } from "../../utils/retryProvider.js";
import { simulateSolanaActions } from "../../utils/simulate-sol.js";
import { getTopHolder } from "../helper.js";
import { getTokenPrices, test, testFail } from "../utils/non-conditional.js";

jest.retryTimes(1);

describe("Integration Tests", () => {
  beforeAll(async () => {
    await initModels();
  });

  beforeEach(() => {
    console.log(expect.getState().currentTestName);
  });

  it("swap all my trump to weth", async () => {
    // FAILS
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "trump",
          outputToken: "weth",
          chainName: "ethereum",
          slippage: "",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        trump: 25000,
      },
    };
    const balanceChanges = {
      Ethereum: {
        weth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap all 0x4166673521e31ed98801e45e8b068b4bc227a110 to eth on ethereum", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "0x4166673521e31ed98801e45e8b068b4bc227a110",
          outputToken: "eth",
          chainName: "ethereum",
        },
      },
    ];

    const initialBalances = {
      ethereum: {
        "0x4166673521e31ed98801e45e8b068b4bc227a110": 25000,
      },
    };
    const balanceChanges = {
      Ethereum: {
        eth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap 1 eth for usdc", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "1",
          inputToken: "eth",
          outputToken: "usdc",
          slippage: "",
        },
      },
    ];

    const initialBalances = {
      ethereum: {
        eth: 2,
      },
    };
    const [ethPrice, usdcPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdc",
    ]);
    const balanceChanges = {
      Ethereum: {
        eth: -1,
        usdc: ethPrice / usdcPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("buy neiro with 0.01 eth", async () => {
    const accountAddress = "0xb9488098870816eEB62636A88d40857362a3Ee45";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "0.01",
          inputToken: "eth",
          outputToken: "neiro",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
      arbitrum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      arbitrum: {
        eth: "-",
      },
      ethereum: {
        neiro: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 1: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 750000);

  it("swap small usdc for eth", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "0.0023238372047251759473",
          inputToken: "usdc",
          outputToken: "eth",
          slippage: "",
        },
      },
    ];

    const initialBalances = {
      ethereum: {
        eth: 2,
        usdc: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it("swap 1 eth for weth", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "1",
          inputToken: "eth",
          outputToken: "weth",
        },
      },
    ];

    const initialBalances = {
      ethereum: {
        eth: 2,
      },
    };
    const [ethPrice, wethPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "weth",
    ]);
    const balanceChanges = {
      Ethereum: {
        eth: -1,
        weth: ethPrice / wethPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap 1 weth for eth", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "1",
          inputToken: "weth",
          outputToken: "eth",
        },
      },
    ];

    const initialBalances = {
      ethereum: {
        eth: 1,
        weth: 2,
      },
    };
    const [ethPrice, wethPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "weth",
    ]);
    const balanceChanges = {
      Ethereum: {
        weth: -1,
        eth: wethPrice / ethPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("buy trump with 1 eth", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "1",
          inputToken: "eth",
          outputToken: "trump",
        },
      },
    ];

    const initialBalances = {
      base: {
        eth: 2,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
    );
  });

  it("swap 1000 usdt for usdc on cowswap", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "1000",
          inputToken: "usdt",
          outputToken: "usdc",
          protocolName: "cowswap",
        },
      },
    ];

    const initialBalances = {
      ethereum: {
        eth: 1,
        usdt: 1000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it("swap 1000 usdc for eth on cowswap", async () => {
    // FAILS
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "1000",
          inputToken: "usdc",
          outputToken: "eth",
          protocolName: "cowswap",
        },
      },
    ];

    const initialBalances = {
      ethereum: {
        eth: 1,
        usdc: 1000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it("swap 1000 usdt for usdc on cowswap on arbitrum", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "1000",
          inputToken: "usdt",
          outputToken: "usdc",
          protocolName: "cowswap",
          chainName: "arbitrum",
        },
      },
    ];

    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdt: 1000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 1: undefined },
      initialBalances,
    );
  });

  it("swap 1000 usdc for eth on cowswap on arbitrum", async () => {
    // FAILS
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "1000",
          inputToken: "usdc",
          outputToken: "eth",
          protocolName: "cowswap",
          chainName: "arbitrum",
        },
      },
    ];

    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdc: 1000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 1: undefined },
      initialBalances,
    );
  });

  it("swap 0.1 eth for 0x010728385Ce76C3F4f9Ccb8b7F86cF49f6C56305 on base", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "0.1",
          inputToken: "eth",
          outputToken: "0x010728385Ce76C3F4f9Ccb8b7F86cF49f6C56305", // Uni LP
        },
      },
    ];

    const initialBalances = {
      base: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 1: undefined, 8453: undefined },
      initialBalances,
    );
  });

  it("swap 0.1 eth for 0xCFfDdeD873554F362Ac02f8Fb1f02E5ada10516f on uniswap", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "0.1",
          inputToken: "eth",
          outputToken: "0xCFfDdeD873554F362Ac02f8Fb1f02E5ada10516f", // Uni LP
          protocolName: "uniswap",
        },
      },
    ];

    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    const [ethPrice, compPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "comp",
    ]);
    const balanceChanges = {
      Ethereum: {
        eth: -0.1,
        comp: (0.1 * ethPrice) / compPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap 1 eth for 0xd3d2E2692501A5c9Ca623199D38826e513033a17 on uniswap", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "1",
          inputToken: "eth",
          outputToken: "0xd3d2E2692501A5c9Ca623199D38826e513033a17", // Uni LP
          protocolName: "uniswap",
        },
      },
    ];

    const initialBalances = {
      ethereum: {
        eth: 2,
      },
    };
    const [ethPrice, uniPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
    ]);
    const balanceChanges = {
      Ethereum: {
        eth: -1,
        "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984": ethPrice / uniPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap 10% eth for usdc", async () => {
    const accountAddress = "0x428AB2BA90Eba0a4Be7aF34C9Ac451ab061AC010";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "10%",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 5,
      },
    };
    const balanceChanges = {
      Ethereum: {
        eth: "-",
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap 1 eth for usdc and array of tokens for usdt", async () => {
    // FAILS
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "1",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: ["1", "outputAmount"],
          inputToken: ["eth", "usdc"],
          outputToken: "usdt",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 3,
      },
    };
    const [ethPrice, usdtPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdt",
    ]);
    const balanceChanges = {
      Ethereum: {
        eth: -2,
        usdt: (2 * ethPrice) / usdtPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 1000000);

  it("swap eth for 1000 usdc", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "usdc",
          outputAmount: "1000",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 2,
      },
    };
    const [ethPrice, usdcPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdc",
    ]);
    const balanceChanges = {
      Ethereum: {
        eth: (-1000 * usdcPrice) / ethPrice,
        usdc: 1000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap 100 usdc for eth", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdc",
          outputToken: "eth",
          inputAmount: "100",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 2,
        usdc: 10000,
      },
    };
    const [ethPrice, usdcPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdc",
    ]);
    const balanceChanges = {
      Ethereum: {
        eth: (100 * ethPrice) / usdcPrice,
        usdc: -100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap 300 usdc for eth", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdc",
          outputToken: "eth",
          inputAmount: "300",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 2,
        usdc: 10000,
      },
    };
    const [ethPrice, usdcPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdc",
    ]);
    const balanceChanges = {
      Ethereum: {
        eth: (300 * ethPrice) / usdcPrice,
        usdc: -300,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap 1000 usdc for eth", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdc",
          outputToken: "eth",
          inputAmount: "1000",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 2,
        usdc: 10000,
      },
    };
    const [ethPrice, usdcPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdc",
    ]);
    const balanceChanges = {
      Ethereum: {
        eth: (1000 * ethPrice) / usdcPrice,
        usdc: -1000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap all my boomer to eth on base", async () => {
    const accountAddress = "0x190417184a9a19386c29022399d6b291fac6c92d";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "boomer",
          outputToken: "eth",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
        boomer: 25000,
      },
    };
    const balanceChanges = {
      Base: {
        eth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("swap 1 eth for usdc and deposit in uniswap eth-usdc pool", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "usdc",
          inputAmount: "1",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "uniswap",
          amount: "outputAmount",
          token: "outputToken",
          poolName: "eth-usdc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 3,
      },
    };
    const balanceChanges = {
      Ethereum: {
        eth: -2,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  // temp disabled
  it.skip("swap 1 eth for usdc and deposit 10% range in uniswap eth-usdc pool", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "usdc",
          inputAmount: "1",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "uniswap",
          amount: "outputAmount",
          token: "outputToken",
          poolName: "eth-usdc",
          range: "10%",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 3,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  // temp disabled
  it.skip("deposit 1 eth from uniswap 10% range eth-rndr pool", async () => {
    const accountAddress = "0x23A0029F1AE02C9f53fe35e2e29917a7A7126697";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "uniswap",
          amount: "1",
          token: "eth",
          poolName: "eth-rndr",
          range: "10%",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 2,
        rndr: 1000,
      },
    };
    const balanceChanges = {
      ethereum: {
        rndr: "-",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("withdraw 10 eth from uniswap eth-rndr pool", async () => {
    const accountAddress = "0x23A0029F1AE02C9f53fe35e2e29917a7A7126697";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "uniswap",
          amount: "10",
          token: "eth",
          poolName: "eth-rndr",
          range: "10%",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      ethereum: {
        rndr: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  // temp disabled
  it.skip("swap 1 eth for usdc and deposit 10% range in camelot eth-usdc pool", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "usdc",
          inputAmount: "1",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "camelot",
          amount: "outputAmount",
          token: "outputToken",
          poolName: "eth-usdc",
          range: "10%",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 3,
      },
    };
    await test(
      accountAddress,
      actions,
      "arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  // temp disabled
  it.skip("deposit 1 eth to camelot 10% range eth-gmx pool", async () => {
    const accountAddress = "0x1cfceb8466dec6e0a8ab1d29cc5adb5b47883dd0";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "camelot",
          amount: "1",
          token: "eth",
          poolName: "eth-gmx",
          range: "10%",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 2,
        gmx: 1000,
      },
    };
    const balanceChanges = {
      arbitrum: {
        gmx: "-",
      },
    };
    await test(
      accountAddress,
      actions,
      "arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("withdraw 0.1 weth from camelot weth-pendle pool", async () => {
    const accountAddress = "0x955954d5aC0a61B0996CCeD9d43E2534b0d99f5e";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "camelot",
          amount: "0.1",
          token: "eth",
          poolName: "weth-pendle",
          range: "10%",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      arbitrum: {
        pendle: "+",
        weth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  // temp disabled
  it.skip("deposit 1 eth 10% range in aerodrome eth-usdc pool", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "aerodrome",
          amount: "1",
          token: "eth",
          poolName: "eth-usdc",
          range: "10%",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 2,
        usdc: 5000,
      },
    };
    const balanceChanges = {
      base: {
        usdc: "-",
      },
    };
    await test(
      accountAddress,
      actions,
      "base",
      { 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("deposit 1 eth 10% range in velodrome eth-usdc pool", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "velodrome",
          amount: "1",
          token: "eth",
          poolName: "eth-usdc",
          range: "10%",
        },
      },
    ];
    const initialBalances = {
      optimism: {
        eth: 2,
        usdc: 5000,
      },
    };
    const balanceChanges = {
      optimism: {
        usdc: "-",
      },
    };
    await test(
      accountAddress,
      actions,
      "optimism",
      { 10: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  // temp disabled
  it.skip("deposit 1 eth 10% range in thruster eth-usdb pool", async () => {
    const accountAddress = "0xe7cbfb8c70d423202033ad4c51ce94ce9e21cfa2";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "thruster",
          amount: "1",
          token: "eth",
          poolName: "eth-usdb",
          range: "10%",
        },
      },
    ];
    const initialBalances = {
      blast: {
        eth: 10,
      },
    };
    const balanceChanges = {
      blast: {
        usdb: "-",
      },
    };
    await test(
      accountAddress,
      actions,
      "blast",
      { 81457: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("withdraw 100 usde from thruster usde-usdb pool", async () => {
    const accountAddress = "0xC7E82646fbc92190b8d4D73B89e1f8E3985E9AA9";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "thruster",
          amount: "100",
          token: "usdb",
          poolName: "usde-usdb",
          range: "10%",
        },
      },
    ];
    const initialBalances = {
      blast: {
        eth: 1,
      },
    };
    const balanceChanges = {
      blast: {
        usdb: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "blast",
      { 81457: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("swap 900 usdt for usdc on cowswap and deposit in uniswap usdt-usdc pool", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          protocolName: "cowswap",
          inputToken: "usdt",
          outputToken: "usdc",
          inputAmount: "900",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "uniswap",
          amount: "outputAmount",
          token: "outputToken",
          poolName: "usdt-usdc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdt: 2000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it.skip("deposit 30 dai and the equivalent eth into the uniswap eth-dai pool", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "uniswap",
          amount: "30",
          token: "dai",
          poolName: "eth-dai",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "uniswap",
          amount: "outputAmount",
          token: "eth",
          poolName: "eth-dai",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 3,
        dai: 40,
      },
    };
    const balanceChanges = {
      Ethereum: {
        dai: -30,
        eth: "-",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("withdraw 5000 usdc from my eth-usdc pool position on uniswap", async () => {
    const accountAddress = "0x18498Ab9931c671742C4fF0CA292c1876CaB7384";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "uniswap",
          poolName: "eth-usdc",
          amount: "5000",
          token: "usdc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 3,
      },
    };
    const balanceChanges = {
      Ethereum: {
        eth: "+",
        usdc: 5000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("bridge 0.1 eth from arbitrum to base and swap half of the eth to usdc and deposit the eth and usdc to aerodrome on base", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "0.1",
          token: "eth",
          sourceChainName: "arbitrum",
          destinationChainName: "base",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "half",
          inputToken: "eth",
          outputToken: "usdc",
          chainName: "base",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "aerodrome",
          amount: "outputAmount",
          token: "eth",
          chainName: "base",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "aerodrome",
          amount: "outputAmount",
          token: "usdc",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
      base: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
    );
  }, 500000);

  it.skip("bridge 0.1 eth from arbitrum to base then swap half of my eth balance for usdc then deposit half of my eth and usdc to aerodrome on base", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "0.1",
          token: "eth",
          sourceChainName: "arbitrum",
          destinationChainName: "base",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "half",
          inputToken: "eth",
          outputToken: "usdc",
          chainName: "base",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "aerodrome",
          amount: "half",
          token: "eth",
          chainName: "base",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "aerodrome",
          amount: "half",
          token: "usdc",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
      base: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
    );
  }, 500000);

  it("Swap all my eth for usdc on camelot", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "usdc",
          inputAmount: "all",
          protocolName: "camelot",
        },
      },
    ];
    const initialBalances = {};
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it("Swap 0.1 eth for eth", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "0.1",
          outputToken: "eth",
          chainName: "ethereum",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      /You are trying to swap from eth to eth on ethereum. Please make sure input and output token are different when swapping./i,
    );
  });

  it("Swap 0.4984 eth for usdc on uniswap", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const rpcUrl = getRpcUrlForChain(1);
    const provider = new RetryProvider(rpcUrl, 1);
    const balance = +ethers.formatEther(
      await provider.getBalance(accountAddress),
    );
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: (Math.floor(balance * 1000) / 1000).toString(),
          outputToken: "usdc",
          protocolName: "uniswap",
        },
      },
    ];
    await test(accountAddress, actions, "Ethereum", { 1: undefined });
  });

  it.skip("Swap 36.276 bnb for busd on paraswap", async () => {
    const accountAddress = "0x7807F2155C89B71E146c64a8f2DFFa8CE2a33D05";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "bnb",
          inputAmount: "36.276",
          outputToken: "busd",
          protocolName: "paraswap",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "BSC",
      { 56: undefined },
      /Not enough bnb on bsc. You have [+-]?([0-9]*[.])?[0-9]+ and need [+-]?([0-9]*[.])?[0-9]+. Please onboard [+-]?([0-9]*[.])?[0-9]+ more bnb and try again./i,
    );
  });

  it.skip("Swap all matic for usdc", async () => {
    const accountAddress = "0xAC56Ccc93c6712842906812258B061216d795103";
    const rpcUrl = getRpcUrlForChain(137);
    const provider = new RetryProvider(rpcUrl, 137);
    const balance = +ethers.formatEther(
      await provider.getBalance(accountAddress),
    );
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "matic",
          inputAmount: (Math.floor(balance * 1000) / 1000).toString(),
          outputToken: "usdc",
        },
      },
    ];
    await test(accountAddress, actions, "Polygon", { 137: undefined });
  });

  it("swap 0.05 eth to 0x8e16d46cb2da01cdd49601ec73d7b0344969ae33 on base", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "0x8e16d46cb2da01cdd49601ec73d7b0344969ae33",
          inputAmount: "0.05",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
    );
  });

  it("transfer 0.1 WETH to niyant.eth on ethereum", async () => {
    const accountAddress = "0xe6767a0c53556b9580ac3b59fac8180aa0cb4e85";
    const actions = [
      {
        name: "transfer",
        args: {
          token: "weth",
          amount: "0.1",
          recipient: "niyant.eth",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 0.05,
        weth: 0.01,
      },
    };
    await testFail(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      /Not enough weth on ethereum. You have 0.01 and need 0.1. Please onboard [+-]?([0-9]*[.])?[0-9]+ more weth and try again./i,
      initialBalances,
    );
  });

  it("swap all DEGEN for ETH on Base", async () => {
    const accountAddress = "0xf62c0ecbfcd066dd92022918402740b5d48973ab";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "degen",
          outputToken: "eth",
          inputAmount: "all",
        },
      },
    ];
    const initialBalances = {
      base: {
        degen: 100,
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
    );
  });

  it("Swap 1 matic to usdc on polygon", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "matic",
          outputToken: "dai",
          inputAmount: "10",
          chainName: "polygon",
        },
      },
    ];
    const initialBalances = {
      polygon: {
        matic: 12,
      },
    };
    await test(
      accountAddress,
      actions,
      "Polygon",
      { 137: undefined },
      initialBalances,
    );
  });

  /// inference applied, since blur does not exist on arbitrum
  it("swap my blur to eth and bridge to base", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "blur",
          outputToken: "eth",
          outputAmount: "0.005",
        },
      },
      {
        name: "bridge",
        args: {
          token: "eth",
          amount: "outputAmount",
          destinationChainName: "base",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        blur: 1000,
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 1: undefined, 8453: undefined },
      initialBalances,
    );
  }, 500000);

  it("swap eth for 2 matic on eth mainnet then bridge matic to polygon", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "matic",
          outputAmount: "2",
        },
      },
      {
        name: "bridge",
        args: {
          token: "matic",
          amount: "2",
          sourceChainName: "ethereum",
          destinationChainName: "polygon",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 137: undefined },
      initialBalances,
    );
  }, 500000);

  it.skip("deposit 1 eth and 2000 usdc in uniswap eth-usdc pool", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "uniswap",
          amount: "1",
          token: "eth",
          poolName: "eth-usdc",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "uniswap",
          amount: "2000",
          token: "usdc",
          poolName: "eth-usdc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 2,
        usdc: 2000,
      },
    };
    const [ethPrice, usdcPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdc",
    ]);
    const liquidity = Math.min(ethPrice, 2000 * usdcPrice);
    const balanceChanges = {
      Ethereum: {
        eth: -liquidity / ethPrice,
        usdc: -liquidity / usdcPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap usdc for 1 weth on 1inch and deposit in aave", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdc",
          outputToken: "weth",
          outputAmount: "1",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "aave",
          amount: "outputAmount",
          token: "outputToken",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        usdc: 5000,
      },
    };
    const [ethPrice, usdcPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdc",
    ]);
    const balanceChanges = {
      Ethereum: {
        usdc: -ethPrice / usdcPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("Buy 2 eth with usdc on arbitrum", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdc",
          outputToken: "eth",
          outputAmount: "2",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdc: 10000,
      },
    };
    const [ethPrice, usdcPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdc",
    ]);
    const balanceChanges = {
      Arbitrum: {
        eth: 2,
        usdc: (-ethPrice * 2) / usdcPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("bridge 100 usdc from base to arbitrum", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "100",
          token: "usdc",
          sourceChainName: "base",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
        usdc: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined, 42161: undefined },
      initialBalances,
    );
  });

  it("bridge all usdc to arbitrum", async () => {
    const accountAddress = "0x024cDB696a719f37B324a852085A68786D269212";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "usdc",
          sourceChainName: "ethereum",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdc: 10,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
    );
  });

  it("bridge all usdc to arbitrum on reservoir", async () => {
    const accountAddress = "0x024cDB696a719f37B324a852085A68786D269212";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "usdc",
          sourceChainName: "ethereum",
          destinationChainName: "arbitrum",
          protocolName: "reservoir",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdc: 10,
      },
    };
    await testFail(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      "Reservoir relay bridges don't work when using all amount",
      initialBalances,
    );
  });

  it("bridge 1 ETH from base to polygon", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "1",
          token: "eth",
          sourceChainName: "base",
          destinationChainName: "polygon",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 2,
      },
    };
    const balanceChanges = {
      base: {
        eth: -1,
      },
      polygon: {
        weth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined, 137: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 300000);

  it("bridge 1 ETH from polygon to base", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "1",
          token: "weth",
          sourceChainName: "polygon",
          destinationChainName: "base",
        },
      },
    ];
    const initialBalances = {
      polygon: {
        matic: 10,
        weth: 1,
      },
    };
    const balanceChanges = {
      base: {
        eth: 1,
      },
      polygon: {
        weth: -1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Polygon",
      { 8453: undefined, 137: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("bridge all 0xff970a61a04b1ca14834a43f5de4533ebddb5cc8 from arbitrum to base", async () => {
    const accountAddress = "0xb38e8c17e38363af6ebdcb3dae12e0243582891d";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
          sourceChainName: "arbitrum",
          destinationChainName: "base",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      "Token 0xff970a61a04b1ca14834a43f5de4533ebddb5cc8 not found on base. Ensure you specify a chain and token properly in your next prompt.",
    );
  });

  it("Bridge all my matic from polygon to ethereum", async () => {
    const accountAddress = "0xAC56Ccc93c6712842906812258B061216d795103";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "matic",
          sourceChainName: "polygon",
          destinationChainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      polygon: {
        matic: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Polygon",
      { 137: undefined, 1: undefined },
      initialBalances,
    );
  });

  it("bridge 100 usdc from ethereum to arbitrum on stargate protocol", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "100",
          token: "usdc",
          sourceChainName: "ethereum",
          destinationChainName: "arbitrum",
          protocolName: "stargate",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdc: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
    );
  });

  it("bridge 10 eth from ethereum to arbitrum on stargate protocol", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "10",
          token: "eth",
          sourceChainName: "ethereum",
          destinationChainName: "arbitrum",
          protocolName: "stargate",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 11,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
    );
  });

  it("transfer 10 dai to niyant.eth", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "transfer",
        args: {
          amount: "10",
          token: "dai",
          recipient: "niyant.eth",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        dai: 10,
      },
    };
    const balanceChanges = {
      Ethereum: {
        dai: -10,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("transfer 1000 dtrxb to niyant.eth on base", async () => {
    const accountAddress = "0x5393E0578F50EB91aDb6E3eE2B3A31C559bbFc25";
    const actions = [
      {
        name: "transfer",
        args: {
          amount: "1000",
          token: "dtrxb",
          recipient: "niyant.eth",
          chainName: "base",
        },
      },
    ];
    const balanceChanges = {
      base: {
        dtrxbt: -1000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: 25200000 },
      undefined,
      balanceChanges,
    );
  });

  it("swap 1 btc to usdt on ethereum", async () => {
    const accountAddress = "0x5Ee5bf7ae06D1Be5997A1A72006FE6C607eC6DE8";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "1",
          inputToken: "btc",
          outputToken: "usdt",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      ethereum: {
        wbtc: -1,
        usdt: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("transfer all kerosene to 0xc9a4ddbc437d2dd5ea8a69b1d803122818a39a0a", async () => {
    const accountAddress = "0xD7E3DC09d1f7aBD44160b42513f44aB8F4055EDA";
    const actions = [
      {
        name: "transfer",
        args: {
          amount: "all",
          token: "kerosene",
          recipient: "0xc9a4ddbc437d2dd5ea8a69b1d803122818a39a0a",
        },
      },
    ];
    await test(accountAddress, actions, "Ethereum", { 1: 20600900 });
  });

  it.skip("send 0.006 BNB on BSC to 0x10683d8452618CfCFEA3b918d17a58D09D5dB895", async () => {
    const accountAddress = "0xeB683293576c20B20ebD90a405FBe778360D4d55";
    const actions = [
      {
        name: "transfer",
        args: {
          amount: "0.006",
          token: "bnb",
          recipient: "0x10683d8452618CfCFEA3b918d17a58D09D5dB895",
        },
      },
    ];
    const balanceChanges = {
      bsc: {
        bnb: -0.006,
      },
    };
    await test(
      accountAddress,
      actions,
      "BSC",
      { 56: 37190950 },
      undefined,
      balanceChanges,
    );
  });

  it.skip("transfer 0.0025 matic to 0x13e1841c6F2045e3f98508e80328D3f0b6E4eF2F on polygon", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "transfer",
        args: {
          amount: "0.0025",
          token: "matic",
          recipient: "0x13e1841c6F2045e3f98508e80328D3f0b6E4eF2F",
        },
      },
    ];
    const initialBalances = {
      polygon: {
        matic: 10,
      },
    };
    const balanceChanges = {
      polygon: {
        matic: -0.0025,
      },
    };
    await test(
      accountAddress,
      actions,
      "Polygon",
      { 137: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap 1 eth for usdc on ethereum then bridge to arbitrum", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "1",
          inputToken: "eth",
          outputToken: "usdc",
          chainName: "ethereum",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "usdc",
          sourceChainName: "ethereum",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 2,
      },
    };
    const balanceChanges = {
      ethereum: {
        eth: -1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("bridge 1 eth from ethereum to optimism then buy usdc", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "1",
          token: "eth",
          sourceChainName: "ethereum",
          destinationChainName: "optimism",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "outputToken",
          outputToken: "usdc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 2,
      },
      optimism: {
        eth: 0.1,
      },
    };
    const [ethPrice, usdcPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdc",
    ]);
    const balanceChanges = {
      ethereum: {
        eth: -1,
      },
      optimism: {
        usdc: ethPrice / usdcPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 10: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("bridge 1 weth from base to ethereum and deposit in aave", async () => {
    const accountAddress = "0x428AB2BA90Eba0a4Be7aF34C9Ac451ab061AC010";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "1",
          token: "weth",
          sourceChainName: "base",
          destinationChainName: "ethereum",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "aave",
          amount: "outputAmount",
          token: "outputToken",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 0.2,
        weth: 1,
      },
      ethereum: {
        eth: 0.1,
      },
    };
    const balanceChanges = {
      base: {
        weth: -1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 1: undefined, 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("deposit all my weth into aave", async () => {
    // FAILS
    const accountAddress = "0x7a6a59588b8106045303e1923227a2cefbec2b66";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "aave",
          amount: "all",
          token: "weth",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 0.1,
      },
    };
    const balanceChanges = {
      base: {
        weth: "-",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("deposit 10 usdc to Hyperliquid", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "hyperliquid",
          amount: "10",
          token: "usdc",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdc: 20,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it("deposit 1000 usdc to Hyperliquid", async () => {
    const accountAddress = "0x28129f5B8b689EdcB7B581654266976aD77C719B";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "hyperliquid",
          amount: "1000",
          token: "usdc",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        usdc: 10.3,
      },
    };
    await testFail(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      /Not enough usdc on hyperliquid. You have [+-]?([0-9]*[.])?[0-9]+ and need 1000. Please onboard [+-]?([0-9]*[.])?[0-9]+ more usdc and try again./i,
      initialBalances,
    );
  });

  it("long 2x dai with 100 usdc on hyperliquid", async () => {
    const accountAddress = "0x8dCdDB335E694EB7750622A34E27CB6C4fec0C9e";
    const actions = [
      {
        name: "long",
        args: {
          protocolName: "hyperliquid",
          inputAmount: "100",
          inputToken: "usdc",
          outputToken: "dai",
          leverageMultiplier: 2,
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdc: 100,
      },
    };
    await testFail(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      "Token dai is not supported on arbitrum for hyperliquid.",
      initialBalances,
    );
  });

  it("long 2x eth with 100 usdc on hyperliquid", async () => {
    const accountAddress = "0x8af700ba841f30e0a3fcb0ee4c4a9d223e1efa05";
    const actions = [
      {
        name: "long",
        args: {
          protocolName: "hyperliquid",
          inputAmount: "100",
          inputAmountUnits: "usd",
          inputToken: "usdc",
          outputToken: "eth",
          leverageMultiplier: 2,
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  });

  it("long eth with 100 usdt on hyperliquid", async () => {
    const accountAddress = "0x8dCdDB335E694EB7750622A34E27CB6C4fec0C9e";
    const actions = [
      {
        name: "long",
        args: {
          protocolName: "hyperliquid",
          inputAmount: "100",
          inputToken: "usdt",
          outputToken: "eth",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdt: 100,
      },
    };
    const balanceChanges = {
      arbitrum: {
        usdt: -100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("short 100x eth with 100 usdc on hyperliquid", async () => {
    const accountAddress = "0x8dCdDB335E694EB7750622A34E27CB6C4fec0C9e";
    const actions = [
      {
        name: "short",
        args: {
          protocolName: "hyperliquid",
          inputAmount: "100",
          inputToken: "usdc",
          outputToken: "eth",
          leverageMultiplier: 100,
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdc: 100,
      },
    };
    await testFail(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      "Leverage multiplier out of range. Max leverage allowed is 50.",
      initialBalances,
    );
  });

  it("close eth on hyperliquid", async () => {
    const accountAddress = "0x8af700ba841f30e0a3fcb0ee4c4a9d223e1efa05";
    const actions = [
      {
        name: "close",
        args: {
          protocolName: "hyperliquid",
          outputToken: "eth",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  });

  it("close 40% of eth position on hyperliquid", async () => {
    const accountAddress = "0x8af700ba841f30e0a3fcb0ee4c4a9d223e1efa05";
    const actions = [
      {
        name: "close",
        args: {
          protocolName: "hyperliquid",
          outputToken: "eth",
          percentReduction: "40%",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  });

  it("close 101% of eth position on hyperliquid", async () => {
    const accountAddress = "0x8af700ba841f30e0a3fcb0ee4c4a9d223e1efa05";
    const actions = [
      {
        name: "close",
        args: {
          protocolName: "hyperliquid",
          outputToken: "eth",
          percentReduction: "101%",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      /Percent reduction for close action cannot be greater than 100%./i,
    );
  });

  it("send all my ETH on Arbitrum to Hyperliquid", async () => {
    const accountAddress = "0x8af700ba841f30e0a3fcb0ee4c4a9d223e1efa05";
    const actions = [
      {
        name: "transfer",
        args: {
          recipient: "hyperliquid",
          amount: "all",
          token: "eth",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      arbitrum: {
        eth: "-",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("long sol with 3x leverage with 100 usdc on hyperliquid", async () => {
    const accountAddress = "0x8af700ba841f30e0a3fcb0ee4c4a9d223e1efa00";
    const actions = [
      {
        name: "long",
        args: {
          protocolName: "hyperliquid",
          inputAmount: "100",
          inputToken: "usdc",
          outputToken: "sol",
          leverageMultiplier: "3x",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdc: 100,
      },
      arbitrum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      ethereum: {
        usdc: -100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 1: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("long wif with all of my wbtc on arbitrum using hyperliquid", async () => {
    const accountAddress = "0x8af700ba841f30e0a3fcb0ee4c4a9d223e1efa05";
    const actions = [
      {
        name: "long",
        args: {
          protocolName: "hyperliquid",
          inputAmount: "all",
          inputToken: "wbtc",
          outputToken: "wif",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        wbtc: 1,
      },
    };
    const balanceChanges = {
      arbitrum: {
        wbtc: "-",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("long scr on hl", async () => {
    const accountAddress = "0x8af700ba841f30e0a3fcb0ee4c4a9d223e1efa00";
    const actions = [
      {
        name: "long",
        args: {
          protocolName: "hyperliquid",
          outputToken: "scr",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdc: 100,
      },
      arbitrum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      ethereum: {
        usdc: -100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 1: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("long 2x btc with 200 usdc on hyperliquid", async () => {
    const accountAddress = "0xb1ef5f7eb05311c0118942c0c896f32dbccfba4f";
    const actions = [
      {
        name: "long",
        args: {
          protocolName: "hyperliquid",
          inputAmount: "200",
          inputToken: "usdc",
          outputToken: "btc",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        usdc: 0,
      },
      arbitrum: {
        eth: 1,
        usdc: 0,
      },
    };
    const balanceChanges = {
      arbitrum: {
        usdt: "-",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 1: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("deposit all my eth into aave", async () => {
    const accountAddress = "0x428AB2BA90Eba0a4Be7aF34C9Ac451ab061AC010";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "aave",
          amount: "all",
          token: "eth",
        },
      },
    ];
    await test(accountAddress, actions, "Ethereum", { 1: undefined });
  });

  it("swap all my weth into usdc", async () => {
    const accountAddress = "0x7a6a59588b8106045303e1923227a2cefbec2b66";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "weth",
          outputToken: "usdc",
          inputAmount: "all",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 0.1,
      },
    };
    const balanceChanges = {
      ethereum: {
        weth: "-",
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("buy usdt with all my weth", async () => {
    const accountAddress = "0x7a6a59588b8106045303e1923227a2cefbec2b66";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "weth",
          outputToken: "usdt",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 0.1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it("bridge all my weth to base", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "weth",
          destinationChainName: "base",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 0.1,
        weth: 2,
      },
    };
    const balanceChanges = {
      ethereum: {
        weth: 0,
      },
      base: {
        weth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("withdraw 10 dai from curve and buy usdc", async () => {
    const accountAddress = "0xe74b28c2eAe8679e3cCc3a94d5d0dE83CCB84705";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "curve",
          amount: "10",
          token: "dai",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "outputToken",
          outputToken: "usdc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 10,
      },
    };
    const balanceChanges = {
      ethereum: {
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("withdraw 80% usdt from curve", async () => {
    const accountAddress = "0x3Bd57A7b5e27F03Eed88F38e994504CB71f4F5DB";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "curve",
          amount: "80%",
          token: "usdt",
        },
      },
    ];
    const balanceChanges = {
      ethereum: {
        usdt: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: 18817000 },
      {},
      balanceChanges,
    );
  });

  it.skip("withdraw 0.2 eth from ambient", async () => {
    const accountAddress = "0x5e2b3A8b96B253bAF07A775b80F5c8Ec592FB52E";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "ambient",
          poolName: "eth-wbtc",
          amount: "0.2",
          token: "eth",
        },
      },
    ];
    const balanceChanges = {
      ethereum: {
        eth: "+",
        wbtc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: 19636025 },
      {},
      balanceChanges,
    );
  });

  it.skip("withdraw 0.01 btc from ambient", async () => {
    const accountAddress = "0x5e2b3A8b96B253bAF07A775b80F5c8Ec592FB52E";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "ambient",
          poolName: "eth-wbtc",
          amount: "0.01",
          token: "wbtc",
        },
      },
    ];
    const balanceChanges = {
      ethereum: {
        eth: "+",
        wbtc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: 19636025 },
      {},
      balanceChanges,
    );
  });

  // ambient withdraw temporarily disabled
  it.skip("withdraw 1 eth from ambient on blast", async () => {
    const accountAddress = "0x0301079dabdc9a2c70b856b2c51aca02bac10c3a";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "ambient",
          poolName: "eth-usdb",
          amount: "2",
          token: "eth",
        },
      },
      {
        name: "withdraw",
        args: {
          protocolName: "ambient",
          poolName: "eth-usdb",
          amount: "1",
          token: "eth",
        },
      },
    ];
    const initialBalances = {
      blast: {
        eth: 10,
      },
    };
    await test(
      accountAddress,
      actions,
      "Blast",
      { 81457: undefined },
      initialBalances,
    );
  });

  // withdraw from ambient not supported
  it.skip("withdraw 100 usdb from ambient on blast", async () => {
    const accountAddress = "0xe7cbfb8c70d423202033ad4c51ce94ce9e21cfa2";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "ambient",
          poolName: "eth-usdb",
          amount: "2",
          token: "eth",
        },
      },
      {
        name: "withdraw",
        args: {
          protocolName: "ambient",
          poolName: "eth-usdb",
          amount: "1000",
          token: "usdb",
        },
      },
    ];
    const initialBalances = {
      blast: {
        eth: 10,
      },
    };
    await test(
      accountAddress,
      actions,
      "Blast",
      { 81457: undefined },
      initialBalances,
    );
  });

  it.skip("deposit 0.2 eth to 10% range pool on ambient", async () => {
    const accountAddress = "0x5e2b3A8b96B253bAF07A775b80F5c8Ec592FB52E";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "ambient",
          poolName: "eth-wbtc",
          amount: "0.2",
          token: "eth",
          range: "10%",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        wbtc: 1,
      },
    };
    const balanceChanges = {
      ethereum: {
        wbtc: "-",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("deposit 0.02 wbtc to 10% range pool on ambient", async () => {
    const accountAddress = "0x5e2b3A8b96B253bAF07A775b80F5c8Ec592FB52E";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "ambient",
          poolName: "eth-wbtc",
          amount: "0.02",
          token: "wbtc",
          range: "10%",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        wbtc: 1,
      },
    };
    const balanceChanges = {
      ethereum: {
        wbtc: "-",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  // unsupported
  it.skip("withdraw 0.05 eth from ambient 10% range pool", async () => {
    const accountAddress = "0x3a567303b207c6d906a8fcc380a2c307ece7051d";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "ambient",
          poolName: "eth-wbtc",
          amount: "0.05",
          token: "eth",
          range: "30%",
        },
      },
    ];
    const balanceChanges = {
      ethereum: {
        eth: "+",
        wbtc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      {},
      balanceChanges,
    );
  });

  it("swap 2 eth to usdc and repay 0.05% usdc for aave", async () => {
    const accountAddress = "0xa313262a5856021164bd4a5d2dda65bc018bc758";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "2",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
      {
        name: "repay",
        args: {
          protocolName: "aave",
          amount: "0.05%",
          token: "usdc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 3,
      },
    };
    const balanceChanges = {
      ethereum: {
        eth: -2,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  // avalanche get avax balance fails
  it.skip("bridge 3 eth to avalanche and buy mim", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "3",
          token: "eth",
          destinationChainName: "avalanche",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "outputToken",
          outputToken: "mim",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 4,
      },
    };
    const [ethPrice] = await getTokenPrices(accountAddress, ["eth"]);
    const balanceChanges = {
      ethereum: {
        eth: -3,
      },
      avalanche: {
        mim: 3 * ethPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 43114: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  // avalanche get avax balance fails
  it.skip("use 3 weth to buy gohm on avalanche", async () => {
    const accountAddress = "0x508BAee20854c6b0B001b278c62644a51A66Daba";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "3",
          inputToken: "weth",
          outputToken: "gohm",
          chainName: "avalanche",
        },
      },
    ];
    const initialBalances = {
      avalanche: {
        weth: 3,
      },
    };
    const [ethPrice, gohmPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "gohm",
    ]);
    const balanceChanges = {
      avalanche: {
        weth: -3,
        gohm: (3 * ethPrice) / gohmPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Avalanche",
      { 43114: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("buy grail with 4 weth", async () => {
    const accountAddress = "0xf584F8728B874a6a5c7A8d4d387C9aae9172D621";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "4",
          inputToken: "weth",
          outputToken: "grail",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 0.5,
        weth: 4,
      },
    };
    const [ethPrice, grailPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "grail",
    ]);
    const balanceChanges = {
      Arbitrum: {
        weth: -4,
        grail: (4 * ethPrice) / grailPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("bridge all my tokens on canto to ethereum", async () => {
    const accountAddress = "0xD5FB6254262C7cB51aBC21E863EFd0BCCFCb2591";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "all",
          sourceChainName: "ethereum",
          destinationChainName: "arbitrum",
        },
      },
    ];
    await test(accountAddress, actions, "Ethereum", {
      1: undefined,
      42161: undefined,
    });
  }, 500000);

  it("open a short trade on hyperliquid on btc with 3 weth with 3x leverage on arbitrum", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const actions = [
      {
        name: "short",
        args: {
          protocolName: "hyperliquid",
          inputAmount: "3",
          inputToken: "weth",
          outputToken: "btc",
          leverageMultiplier: "3x",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        weth: 4,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it.skip("withdraw from all my positions, convert to weth, and bridge to arbitrum", async () => {
    const accountAddress = "0x5e2b3A8b96B253bAF07A775b80F5c8Ec592FB52E";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "all",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "outputToken",
          outputToken: "weth",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "weth",
          destinationChainName: "arbitrum",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      /Please specify a chain in case you use all/i,
    );
  });

  it("swap eth for usdt, swap link for usdt, bridge usdt to arbitrum", async () => {
    const accountAddress = "0x9A7A84F355E060b418000d540889549DaB103381";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "1",
          outputToken: "usdt",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "link",
          inputAmount: "all",
          outputToken: "usdt",
        },
      },
      {
        name: "bridge",
        args: {
          token: "usdt",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 4,
        link: 20,
      },
    };
    const balanceChanges = {
      Ethereum: {
        eth: "-",
        link: 0,
      },
      Arbitrum: {
        usdt: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 1000000);

  it("stake 10 eth on lido", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "stake",
        args: {
          protocolName: "lido",
          amount: "10",
          token: "eth",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 11,
      },
    };
    const balanceChanges = {
      Ethereum: {
        eth: -10,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap 100 usdc to eth and stake to renzo on ethereum", async () => {
    const accountAddress = "0xE53FFF67f9f384d20Ebea36F43b93DC49Ed22753";
    const actions = [
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
        name: "stake",
        args: {
          token: "outputToken",
          amount: "outputAmount",
          protocolName: "renzo",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdc: 100,
      },
    };
    const balanceChanges = {
      Ethereum: {
        usdc: "-",
        ezeth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap 1 eth to usdc and deposit to hyperliquid on arbitrum", async () => {
    const accountAddress = "0xE53FFF67f9f384d20Ebea36F43b93DC49Ed22753";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "1",
          outputToken: "usdc",
          chainName: "arbitrum",
        },
      },
      {
        name: "deposit",
        args: {
          token: "outputToken",
          amount: "outputAmount",
          protocolName: "hyperliquid",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 2,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it("bridge 4 weth from arbitrum to base and stake to renzo", async () => {
    // FAILS
    const accountAddress = "0xE53FFF67f9f384d20Ebea36F43b93DC49Ed22753";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "weth",
          amount: "4",
          sourceChainName: "arbitrum",
          destinationChainName: "base",
        },
      },
      {
        name: "stake",
        args: {
          protocolName: "renzo",
          token: "outputToken",
          amount: "outputAmount",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        weth: 5,
      },
      base: {
        eth: 1,
      },
    };
    const balanceChanges = {
      Arbitrum: {
        weth: "-",
      },
      Base: {
        ezeth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("stake all my eth on lido", async () => {
    const accountAddress = "0x95222290DD7278Aa3Ddd389Cc1E1d165CC4BAfe5";
    const actions = [
      {
        name: "stake",
        args: {
          protocolName: "lido",
          amount: "all",
          token: "eth",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 3,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it("bridge all my eth from ethereum to arbitrum", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "eth",
          sourceChainName: "ethereum",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
    );
  });

  it("swap all my tokens on optimism to weth and bridge to arbitrum", async () => {
    // FAILS
    const accountAddress = "0xd06657f02c266746b502df0a79255ae69ebdbb95";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "all",
          inputAmount: "all",
          outputToken: "weth",
          chainName: "optimism",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "weth",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      optimism: {
        eth: 1,
      },
    };
    const balanceChanges = {
      optimism: {
        op: "-",
      },
      arbitrum: {
        weth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Optimism",
      { 10: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 700000);

  // unsupported protocols
  it.skip("swap 1 eth to usdc, bridge to arbitrum, deposit into jonesdao, then deposit lp into rodeo", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "1",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "usdc",
          destinationChainName: "arbitrum",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "jonesdao",
          amount: "outputAmount",
          token: "outputToken",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "rodeo",
          amount: "outputAmount",
          token: "outputToken",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 2,
      },
    };
    const balanceChanges = {
      Ethereum: {
        eth: -1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("bridge 1 eth to ethereum, swap half to usdc, deposit into uniswap eth-usdc pool", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "1",
          token: "eth",
          destinationChainName: "ethereum",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "half",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "uniswap",
          poolName: "eth-usdc",
          amount: "outputAmount",
          token: "usdc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
      arbitrum: {
        eth: 2,
      },
    };
    const balanceChanges = {
      arbitrum: {
        eth: -1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 1: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it.skip("deposit all of my assets into uniswap usdt-usdc pool on ethereum", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const actions = [
      {
        name: "deposit",
        args: {
          amount: "all",
          token: "all",
          poolName: "usdt-usdc",
          protocolName: "uniswap",
        },
      },
    ];
    const balanceChanges = {
      ethereum: {
        usdc: "-",
        usdt: "-",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      {},
      balanceChanges,
    );
  });

  it.skip("deposit all of my assets into curve 3pool pool on ethereum", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const actions = [
      {
        name: "deposit",
        args: {
          amount: "all",
          token: "all",
          poolName: "3pool",
          protocolName: "curve",
        },
      },
    ];
    const balanceChanges = {
      ethereum: {
        usdc: "-",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      {},
      balanceChanges,
    );
  });

  it("3.1x leverage long arb with 1000 usdc on HL", async () => {
    const accountAddress = "0xb38e8c17e38363af6ebdcb3dae12e0243582891d";
    const actions = [
      {
        name: "long",
        args: {
          protocolName: "hyperliquid",
          inputAmount: "1000",
          inputToken: "usdc",
          outputToken: "arb",
          leverageMultiplier: "3.1x",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 2,
        usdc: 2000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it("bridge 200 usdt from ethereum to arbitrum and buy pepe", async () => {
    // FAILS
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "200",
          token: "usdt",
          sourceChainName: "ethereum",
          destinationChainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "outputToken",
          outputToken: "pepe",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdt: 200,
      },
    };
    const [pepePrice, usdtPrice] = await getTokenPrices(
      accountAddress,
      ["pepe", "usdt"],
      42161,
    );
    const balanceChanges = {
      Ethereum: {
        usdt: -200,
      },
      Arbitrum: {
        pepe: (200 * usdtPrice) / pepePrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it.skip("using 2 eth buy usdc, usdt, and dai, then deposit into curve tricrypto pool", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "2",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "2",
          inputToken: "eth",
          outputToken: "usdt",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "2",
          inputToken: "eth",
          outputToken: "dai",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "curve",
          poolName: "3pool",
          amount: "outputAmount",
          token: "usdc",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "curve",
          poolName: "3pool",
          amount: "outputAmount",
          token: "usdt",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "curve",
          poolName: "3pool",
          amount: "outputAmount",
          token: "dai",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 10,
      },
    };
    const balanceChanges = {
      Ethereum: {
        eth: -6,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 900000);

  // plutus deposit has been removed because plutus withdraw is impossible
  it.skip("deposit 100 spa into plutus, stake lp for pls, then lock pls", async () => {
    const accountAddress = "0xed586dc568ad7f87a7f84c53fe91969c10576230";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "plutus",
          amount: "100",
          token: "SPA",
        },
      },
      {
        name: "stake",
        args: {
          protocolName: "plutus",
          amount: "outputAmount",
          token: "lp",
        },
      },
      // stake doesn't return the reward, we should call claim instead
      // {
      //   name: "lock",
      //   args: {
      //     protocolName: "plutus",
      //     amount: "outputAmount",
      //     token: "pls",
      //   },
      // },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        spa: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it("bridge 4 usdc to base", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "4",
          token: "usdc",
          destinationChainName: "base",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdc: 4,
      },
    };
    const balanceChanges = {
      ethereum: {
        usdc: -4,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("open a 2x arb short on HL with 1000 usdc", async () => {
    const accountAddress = "0xcae294852ead2f10dd017a3d233495fef16a6434";
    const actions = [
      {
        name: "short",
        args: {
          protocolName: "hyperliquid",
          inputAmount: "1000",
          inputToken: "usdc",
          outputToken: "arb",
          leverageMultiplier: "2x",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdc: 2000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it.skip("close 2x arb with weth order on gmx", async () => {
    const accountAddress = "0x6859dA14835424957a1E6B397D8026B1D9fF7e1E";
    const actions = [
      {
        name: "close",
        args: {
          protocolName: "gmx",
          inputToken: "weth",
          outputToken: "arb",
          leverageMultiplier: "2x",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        weth: 10,
      },
    };
    const balanceChanges = {
      Arbitrum: {
        usdc: 11135.771229,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: 235170000 },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("close half of 2x arb with weth order on gmx", async () => {
    const accountAddress = "0x6859dA14835424957a1E6B397D8026B1D9fF7e1E";
    const actions = [
      {
        name: "close",
        args: {
          protocolName: "gmx",
          inputToken: "weth",
          outputToken: "arb",
          leverageMultiplier: "2x",
          percentReduction: "half",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        weth: 10,
      },
    };
    const balanceChanges = {
      Arbitrum: {
        usdc: 5567.8856145, // 50% of 11135.771229
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: 235170000 },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("close 40% of 2x arb with weth order on gmx", async () => {
    const accountAddress = "0x6859dA14835424957a1E6B397D8026B1D9fF7e1E";
    const actions = [
      {
        name: "close",
        args: {
          protocolName: "gmx",
          inputToken: "weth",
          outputToken: "arb",
          leverageMultiplier: "2x",
          percentReduction: "40%",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        weth: 10,
      },
    };
    const balanceChanges = {
      Arbitrum: {
        usdc: 4454.308492, // 40% of 11135.771229
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: 235170000 },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("close 0% of 2x arb with weth order on gmx", async () => {
    const accountAddress = "0x6859dA14835424957a1E6B397D8026B1D9fF7e1E";
    const actions = [
      {
        name: "close",
        args: {
          protocolName: "gmx",
          inputToken: "weth",
          outputToken: "arb",
          leverageMultiplier: "2x",
          percentReduction: "0%",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: 235170000 },
      /Percent reduction for close action cannot be less than 0%./i,
    );
  });

  it("claim stg from my stargate positions, swap to dai, and deposit back into stargate", async () => {
    const accountAddress = "0x723071BC13A9A11aF5646d167aCd9C357dC120f1";
    const actions = [
      {
        name: "claim",
        args: {
          protocolName: "stargate",
          poolName: "s*usdc",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "stg",
          outputToken: "dai",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "stargate",
          amount: "outputAmount",
          token: "dai",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: 19724334 },
      initialBalances,
    );
  }, 700000);

  it("claim rewards from s*usdc pool of stargate", async () => {
    const accountAddress = "0x605f11621fefbc23bb970e53027b4733b8924b99";
    const actions = [
      {
        name: "claim",
        args: {
          protocolName: "stargate",
          poolName: "s*usdc",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  }, 700000);

  it("swap 5000 usdc for eth on 0x on ethereum, bridge to base, sell eth for usdc, bridge usdc back to mainnet", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const actions = [
      {
        name: "swap",
        args: {
          protocolName: "0x",
          inputAmount: "5000",
          inputToken: "usdc",
          outputToken: "eth",
          chainName: "ethereum",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "eth",
          sourceChainName: "ethereum",
          destinationChainName: "base",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "eth",
          outputToken: "usdc",
          chainName: "base",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "usdc",
          destinationChainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdc: 5000,
      },
      base: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 8453: undefined },
      initialBalances,
    );
  }, 700000);

  // unsupported
  it.skip("unstake from my lodestar position", async () => {
    const accountAddress = "0x9F488Eb668470081d74af06788543b5D1fef9A02";
    const actions = [
      {
        name: "unstake",
        args: {
          protocolName: "lodestar",
          token: "LODE",
          amount: "0.00000000000007",
        },
      },
    ];
    const balanceChanges = {
      Arbitrum: {
        lode: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: 161447200 },
      {},
      balanceChanges,
    );
  });

  // unsupported
  it.skip("repay usdc on lodestar and withdraw 0.01 eth on lodestar", async () => {
    const accountAddress = "0xF62C0ecBFcD066dD92022918402740B5D48973ab";
    const actions = [
      {
        name: "repay",
        args: {
          protocolName: "lodestar",
          token: "usdc",
          amount: "all",
        },
      },
      {
        name: "withdraw",
        args: {
          protocolName: "lodestar",
          token: "eth",
          amount: "0.01",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: "1",
      },
    };
    const balanceChanges = {
      arbitrum: {
        usdc: "-",
        eth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: 208178260 },
      initialBalances,
      balanceChanges,
    );
  });

  // uniswap deposits temporarily disabled
  it.skip("lend 5 eth, borrow 100 pt, then deposit 100 pt and 100 glp into the pt-glp pool on pendle", async () => {
    const accountAddress = "0xD5FB6254262C7cB51aBC21E863EFd0BCCFCb2591";
    const actions = [
      {
        name: "lend",
        args: {
          protocolName: "aave",
          amount: "5",
          token: "eth",
        },
      },
      {
        name: "borrow",
        args: {
          protocolName: "aave",
          amount: "1000",
          token: "usdc",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "uniswap",
          poolName: "usdc-usdt",
          amount: "1000",
          token: "usdc",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "uniswap",
          poolName: "usdc-usdt",
          amount: "1000",
          token: "usdt",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 10,
        usdt: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  }, 500000);

  it.skip("swap 5 BLADE into ETH on BLADE-ETH pool and deposit 5 BLADE into BLADE-ETH pool on bladeswap on blast", async () => {
    const accountAddress = "0xD5FB6254262C7cB51aBC21E863EFd0BCCFCb2591";
    const actions = [
      {
        name: "swap",
        args: {
          protocolName: "bladeswap",
          chainName: "blast",
          inputToken: "BLADE",
          inputAmount: "5",
          outputToken: "ETH",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "bladeswap",
          chainName: "blast",
          poolName: "blade-eth",
          token: "blade",
          amount: "5",
        },
      },
    ];
    const initialBalances = {
      blast: {
        eth: "1",
        blade: "10",
      },
    };
    const balanceChanges = {
      blast: {
        eth: "+",
        blade: "-",
      },
    };
    await test(
      accountAddress,
      actions,
      "blast",
      { 81457: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("deposit 5 ezETH into ezETH-ETH pool and withdraw ezETH from ezETH-ETH pool on bladeswap on blast", async () => {
    const accountAddress = "0xD5FB6254262C7cB51aBC21E863EFd0BCCFCb2591";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "bladeswap",
          chainName: "blast",
          poolName: "ezETH-ETH",
          amount: "5",
          token: "ezETH",
        },
      },
      {
        name: "withdraw",
        args: {
          protocolName: "bladeswap",
          chainName: "blast",
          poolName: "ezETH-ETH",
          amount: "5",
          token: "ezETH",
        },
      },
    ];
    const initialBalances = {
      blast: {
        eth: "1",
        ezETH: "5",
      },
    };
    const balanceChanges = {
      Blast: {
        eth: "-",
        ezETH: "-",
      },
    };
    await test(
      accountAddress,
      actions,
      "blast",
      { 81457: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("fail while deposit orbit into unsupported pool blade-eth into bladeswap on blast", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "bladeswap",
          poolName: "Blade-orbit",
          token: "orbit",
          amount: "5",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "blast",
      { 81457: undefined },
      /Pool blade-orbit is not supported for protocol bladeswap on blast./i,
    );
  });

  it("withdraw all my usdc from aave and deposit into compound", async () => {
    const accountAddress = "0x607DB376b0EDEf8Cbf346443De2395F046140b1E";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "aave",
          token: "usdc",
          amount: "all",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "compound",
          amount: "outputAmount",
          token: "outputToken",
          poolName: "usdc",
        },
      },
    ];
    await test(accountAddress, actions, "Ethereum", { 1: undefined });
  });

  it("deposit 1000 usdc into compound", async () => {
    const accountAddress = "0x607DB376b0EDEf8Cbf346443De2395F046140b1E";
    const actions = [
      {
        name: "deposit",
        args: {
          amount: "1000",
          token: "usdc",
          poolName: "0xc3d688B66703497DAA19211EEdff47f25384cdc3",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdc: 1000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it.skip("deposit 1 eth into 0x84652bb2539513BAf36e225c930Fdd8eaa63CE27 on camelot", async () => {
    const accountAddress = "0x607DB376b0EDEf8Cbf346443De2395F046140b1E";
    const actions = [
      {
        name: "deposit",
        args: {
          amount: "1",
          token: "eth",
          poolName: "0x84652bb2539513BAf36e225c930Fdd8eaa63CE27",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 2,
        "usdc.e": 5000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it.skip("deposit 1 eth into 0x84652bb2539513BAf36e225c930Fdd8eaa63CE27 on uniswap", async () => {
    const accountAddress = "0x607DB376b0EDEf8Cbf346443De2395F046140b1E";
    const actions = [
      {
        name: "deposit",
        args: {
          amount: "1",
          token: "eth",
          poolName: "0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 2,
        usdc: 5000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it("withdraw 1000 usdc from compound", async () => {
    // FAILS
    const accountAddress = "0x7f714b13249BeD8fdE2ef3FBDfB18Ed525544B03";
    const actions = [
      {
        name: "withdraw",
        args: {
          amount: "1000",
          token: "usdc",
          poolName: "0xc3d688B66703497DAA19211EEdff47f25384cdc3",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it.skip("withdraw 1 eth from 0x84652bb2539513BAf36e225c930Fdd8eaa63CE27 on camelot", async () => {
    const accountAddress = "0x6BC938abA940fB828D39Daa23A94dfc522120C11";
    const actions = [
      {
        name: "withdraw",
        args: {
          amount: "0.1",
          token: "eth",
          poolName: "0x84652bb2539513BAf36e225c930Fdd8eaa63CE27",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 0.2,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it.skip("withdraw 1 eth from 0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc on uniswap", async () => {
    const accountAddress = "0x18498Ab9931c671742C4fF0CA292c1876CaB7384";
    const actions = [
      {
        name: "withdraw",
        args: {
          amount: "1",
          token: "eth",
          poolName: "0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 0.2,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it("claim stargate rewards, swap to dai, redeposit", async () => {
    const accountAddress = "0x723071BC13A9A11aF5646d167aCd9C357dC120f1";
    const actions = [
      {
        name: "claim",
        args: {
          protocolName: "stargate",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "stg",
          outputToken: "dai",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "stargate",
          amount: "outputAmount",
          token: "dai",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: 19724334 },
      initialBalances,
    );
  }, 1500000);

  it("swap all my tokens to eth and transfer to niyant.eth on mainnet", async () => {
    const accountAddress = "0xAB9945AfF93Eb4cEb9fCd6A56AFF972367249f69";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "all",
          inputAmount: "all",
          outputToken: "eth",
          chainName: "ethereum",
        },
      },
      {
        name: "transfer",
        args: {
          amount: "all",
          token: "eth",
          recipient: "niyant.eth",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  }, 1000000);

  it("swap half of all my tokens to eth and transfer to niyant.eth on mainnet", async () => {
    const accountAddress = "0xD5FB6254262C7cB51aBC21E863EFd0BCCFCb2591";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "half",
          inputToken: "all",
          outputToken: "eth",
          chainName: "ethereum",
        },
      },
      {
        name: "transfer",
        args: {
          amount: "outputAmount",
          token: "eth",
          recipient: "niyant.eth",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 10,
        usdt: 1000,
        usdc: 500,
      },
    };
    const balanceChanges = {
      Ethereum: {
        usdc: "-",
        usdt: "-",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 700000);

  // updated outputToken to weth
  it("can you use my dai to purchase sweed", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "dai",
          outputToken: "weth",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        dai: 1000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it("transfer $500 worth of eth to niyant.eth", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "transfer",
        args: {
          amount: "500",
          amount_units: "usd",
          token: "eth",
          recipient: "niyant.eth",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 10,
      },
    };
    const [ethPrice] = await getTokenPrices(accountAddress, ["eth"]);
    const balanceChanges = {
      Ethereum: {
        eth: -500 / ethPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
      true,
    );
  });

  it("transfer 0.5 eth worth of dai to niyant.eth", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "transfer",
        args: {
          amount: "0.5",
          amount_units: "eth",
          token: "dai",
          recipient: "niyant.eth",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        dai: 2000,
      },
    };
    const [ethPrice, daiPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "dai",
    ]);
    const balanceChanges = {
      Ethereum: {
        dai: (-0.5 * ethPrice) / daiPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
      true,
    );
  });

  it("bridge 0.5 eth worth of dai to arbitrum", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "0.5",
          amount_units: "eth",
          token: "dai",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        dai: 2000,
      },
    };
    const [ethPrice, daiPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "dai",
    ]);
    const balanceChanges = {
      Ethereum: {
        dai: (-0.5 * ethPrice) / daiPrice,
      },
      Arbitrum: {
        dai: (0.5 * ethPrice) / daiPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
      true,
    );
  });

  it.skip("transfer lodestar rewards to niyant.eth on arbitrum", async () => {
    const accountAddress = "0x34776762df20453a51654c541aa2dbd0354de5bd";
    const actions = [
      {
        name: "transfer",
        args: {
          chainName: "arbitrum",
          token: "lodestar rewards",
          recipient: "niyant.eth",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: 157055300 });
  });

  it.skip("withdraw liquidity from curve", async () => {
    const accountAddress = "0x3Bd57A7b5e27F03Eed88F38e994504CB71f4F5DB";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "curve",
          poolName: "3pool",
          chainName: "ethereum",
          token: "liquidity",
        },
      },
    ];
    await test(accountAddress, actions, "Ethereum", { 1: undefined });
  });

  /// this was for curve withdraw test, which is not supported now
  it.skip("withdraw from all positions", async () => {
    const accountAddress = "0x3Bd57A7b5e27F03Eed88F38e994504CB71f4F5DB";
    const actions = [
      {
        name: "withdraw",
        args: {
          chainName: "ethereum",
        },
      },
    ];
    await test(accountAddress, actions, "Ethereum", { 1: 18817000 });
  });

  it.skip("claim lodestar rewards and transfer to niyant.eth", async () => {
    const accountAddress = "0x34776762df20453a51654c541aa2dbd0354de5bd";
    const actions = [
      {
        name: "claim",
        args: {
          protocolName: "lodestar",
        },
      },
      {
        name: "transfer",
        args: {
          token: "outputToken",
          amount: "outputAmount",
          recipient: "niyant.eth",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: 157055300 });
  });

  it.skip("pull my liquidity on curve", async () => {
    const accountAddress = "0x8Fc80Ea799e65Acd70D4FA17E6a92a6EC393e71a";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "curve",
          amount: "all",
        },
      },
    ];
    await test(accountAddress, actions, "Ethereum", { 1: undefined });
  });

  it("harvest all my positions on arbitrum", async () => {
    const accountAddress = "0x34776762df20453a51654c541aa2dbd0354de5bd";
    const actions = [
      {
        name: "claim",
        args: {
          protocolName: "all",
          chainName: "arbitrum",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  });

  // check back in later part
  it.skip("compound my staking rewards", async () => {
    const accountAddress = "0xe0470be8e86225524c386571450b4f6ecff769fb";
    const actions = [
      {
        name: "claim",
        args: {
          protocolName: "all",
        },
      },
      {
        name: "deposit",
        args: {
          amount: "outputAmount",
          token: "outputToken",
          protocolName: "all",
        },
      },
    ];
    await test(accountAddress, actions, "Ethereum", { 1: 18817000 });
  });

  // balancer harvest is not supported yet
  it.skip("harvest my balancer position and stake the rewards", async () => {
    const accountAddress = "0x3Bd57A7b5e27F03Eed88F38e994504CB71f4F5DB";
    const actions = [
      {
        name: "claim",
        args: {
          protocolName: "balancer",
        },
      },
      {
        name: "stake",
        args: {
          protocolName: "balancer",
          amount: "outputAmount",
          token: "outputToken",
        },
      },
    ];
    await test(accountAddress, actions, "Ethereum", { 1: 18817000 });
  });

  // camelot claim is not supported yet
  it.skip("when my camelot rewards balance is greater than 10 eth, swap to usdc", async () => {
    const accountAddress = "0x3Bd57A7b5e27F03Eed88F38e994504CB71f4F5DB";
    const actions = [
      {
        name: "condition",
        args: {
          subject: "camelot rewards",
          comparator: ">=",
          value: "10",
          value_token: "eth",
          type: "balance",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "camelot rewards",
          outputToken: "usdc",
        },
      },
    ];
    await test(accountAddress, actions, "Ethereum", { 1: 18817000 });
  });

  // spice deposit is not supported yet
  it.skip("claim camelot rewards and convert all rewards to weth. then deposit in spice vault.", async () => {
    const accountAddress = "0x823b6b8da270906f0a231223e46edb5bdea3ff13";
    const actions = [
      {
        name: "claim",
        args: {
          protocolName: "camelot",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "outputToken",
          outputToken: "weth",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "spice",
          amount: "outputAmount",
          token: "weth",
        },
      },
    ];
    await test(accountAddress, actions, "Ethereum", { 1: 18817000 });
  });

  it.skip("withdraw half the liquidity from my curve position", async () => {
    const accountAddress = "0x3Bd57A7b5e27F03Eed88F38e994504CB71f4F5DB";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "curve",
          amount: "half",
        },
      },
    ];
    await test(accountAddress, actions, "Ethereum", { 1: 18719673 });
  });

  it.skip("claim weth-grail lp rewards from camelot and sell for usdc", async () => {
    const accountAddress = "0x823b6b8da270906f0a231223e46edb5bdea3ff13";
    const actions = [
      {
        name: "claim",
        args: {
          protocolName: "camelot",
          poolName: "weth-grail",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "lp",
          outputToken: "usdc",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: 220421127 },
      /Not able to swap any tokens. Please specify correct arguments in your next prompt!/i,
    );
  });

  // cannot deposit in sushi, not supported
  it.skip("buy jones with half my eth, deposit into the eth-jones pool on sushi, then trade lp for plsjones", async () => {
    const accountAddress = "0x3Bd57A7b5e27F03Eed88F38e994504CB71f4F5DB";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "half",
          inputToken: "eth",
          outputToken: "jones",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "sushi",
          poolName: "eth-jones",
          amount: "outputAmount",
          token: "jones",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "outputToken",
          outputToken: "plsjones",
        },
      },
    ];
    await test(accountAddress, actions, "Ethereum", { 1: 18817000 });
  });

  it.skip("harvest my positions every wednesday", async () => {
    const accountAddress = "0x34776762df20453a51654c541aa2dbd0354de5bd";
    const actions = [
      {
        name: "claim",
        args: {},
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  });

  it.skip("claim and restake rewards from all my positions every monday", async () => {
    const accountAddress = "0x3Bd57A7b5e27F03Eed88F38e994504CB71f4F5DB";
    const actions = [
      {
        name: "claim",
        args: {
          protocolName: "all",
        },
      },
      {
        name: "stake",
        args: {
          protocolName: "all",
          amount: "outputAmount",
          token: "outputToken",
        },
      },
      {
        name: "time",
        args: {
          start_time: "monday",
          recurrence: {
            type: "weekly",
            interval: 1,
          },
        },
      },
    ];
    await test(accountAddress, actions, "Ethereum", { 1: 18817000 });
  });

  it.skip("harvesting on camelot", async () => {
    const accountAddress = "0x823b6b8da270906f0a231223e46edb5bdea3ff13";
    const actions = [
      {
        name: "claim",
        args: {
          protocolName: "camelot",
          chainName: "Arbitrum",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: 220421127 });
  });

  // thena vote is not supported yet
  it.skip("vote on my thena position", async () => {
    const accountAddress = "0x71ac0a4b655d6d0d6d4f59345561a8ca0775ba2c";
    const actions = [
      {
        name: "vote",
        args: {
          protocolName: "thena",
          chainName: "ethereum",
        },
      },
    ];
    await test(accountAddress, actions, "Ethereum", { 1: 18817000 });
  });

  it("withdraw position from aave", async () => {
    // FAILS
    const accountAddress = "0xA91661efEe567b353D55948C0f051C1A16E503A5";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "aave",
        },
      },
    ];
    await test(accountAddress, actions, "Ethereum", { 1: undefined });
  });

  it("borrow 1000 usdc from aave and deposit into compound", async () => {
    const accountAddress = "0xe0470be8e86225524c386571450b4f6ecff769fb";
    const actions = [
      {
        name: "borrow",
        args: {
          protocolName: "aave",
          amount: "1000",
          token: "usdc",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "compound",
          amount: "outputAmount",
          token: "usdc",
          poolName: "usdc",
        },
      },
    ];
    await test(accountAddress, actions, "Ethereum", { 1: 18817000 });
  });

  it.skip("deposit 100 usdc into dolomite", async () => {
    const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "dolomite",
          amount: "100",
          token: "usdc",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  });

  it.skip("deposit 100 usdc into dolomite and withdraw 80 usdc", async () => {
    const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "dolomite",
          amount: "100",
          token: "usdc",
        },
      },
      {
        name: "withdraw",
        args: {
          protocolName: "dolomite",
          amount: "80",
          token: "usdc",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  });

  it.skip("lend 0.02 eth to dolomite and borrow 20 usdc then long eth with 2x leverage", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const actions = [
      {
        name: "lend",
        args: {
          protocolName: "dolomite",
          amount: "0.02",
          token: "eth",
          chainName: "arbitrum",
        },
      },
      {
        name: "borrow",
        args: {
          protocolName: "dolomite",
          amount: "20",
          token: "usdc",
          chainName: "arbitrum",
        },
      },
      {
        name: "long",
        args: {
          protocolName: "gmx",
          inputAmount: "outputAmount",
          inputToken: "usdc",
          outputToken: "eth",
          chainName: "arbitrum",
          leverageMultiplier: "2x",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      /Borrowing from dolomite stores borrowed funds in their smart contract, not your wallet, so unable to simulate this multi step action. Try borrowing first, then proceeding with the rest./i,
    );
  });

  it.skip("unstake 10 gmx from dolomite", async () => {
    const accountAddress = "0x000007656F345A789bB422f0307D826660258333";
    const actions = [
      {
        name: "unstake",
        args: {
          protocolName: "dolomite",
          amount: "0.03",
          token: "gmx",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: 209495865 });
  });

  it.skip("lend 1 eth into dolomite and borrow 50 usdc", async () => {
    const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
    const actions = [
      {
        name: "lend",
        args: {
          protocolName: "dolomite",
          amount: "1",
          token: "eth",
        },
      },
      {
        name: "borrow",
        args: {
          protocolName: "dolomite",
          amount: "50",
          token: "usdc",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  });

  it("withdraw all my usdc from compound", async () => {
    const accountAddress = "0xa4a2f21517073da2557fcabbca9356a7a82b6a68";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "compound",
          amount: "all",
          token: "usdc",
          poolName: "usdc",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  });

  it.skip("swap 3 eth to usdc and deposit into the eth-usdc pool on uniswap", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "3",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "uniswap",
          poolName: "eth-usdc",
          amount: "outputAmount",
          token: "usdc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 10,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it.skip("withdraw 2 eth from my eth-syk pool position on camelot", async () => {
    const accountAddress = "0xead0575234bdf2fc4f86b6e4f11b4d92587964b0";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "camelot",
          poolName: "weth-syk",
          amount: "0.49",
          token: "weth",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: 204683196 });
  });

  it("withdraw all of my usdc from compound on arbitrum", async () => {
    const accountAddress = "0xa5ef861278d7bf18a8a2068a01d66fbded93a1bd";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "compound",
          amount: "all",
          token: "usdc",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  });

  it("lend 0.01 weth on compound on arbitrum", async () => {
    const accountAddress = "0x0172e05392aba65366c4dbbb70d958bbf43304e4";
    const actions = [
      {
        name: "lend",
        args: {
          protocolName: "compound",
          amount: "0.01",
          token: "weth",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  });

  it.skip("withdraw all of my usdc.e from the grail-usdc.e pool on camelot on arbitrum", async () => {
    const accountAddress = "0xa5ef861278d7bf18a8a2068a01d66fbded93a1bd";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "camelot",
          poolName: "grail-usdc.e",
          amount: "all",
          token: "usdc.e",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  });

  it("buy wbtc with eth on 1inch and sell it for eth on 0x", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          protocolName: "1inch",
          inputToken: "eth",
          outputToken: "wbtc",
        },
      },
      {
        name: "swap",
        args: {
          protocolName: "0x",
          inputToken: "wbtc",
          outputToken: "eth",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 4,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  }, 500000);

  it.skip("harvest all my rewards on arbitrum and buy eth", async () => {
    const accountAddress = "0x34776762df20453a51654c541aa2dbd0354de5bd";
    const actions = [
      {
        name: "claim",
        args: {
          chainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "outputToken",
          outputToken: "eth",
          chainName: "arbitrum",
        },
      },
    ];
    const balanceChanges = {
      Arbitrum: {
        eth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "arbitrum",
      { 42161: undefined },
      {},
      balanceChanges,
    );
  });

  // claim on camelot returns multi tokens
  it.skip("claim rewards from camelot, swap rewards and grail into xgrail, then deposit xgrail into camelot", async () => {
    const accountAddress = "0x823b6b8da270906f0a231223e46edb5bdea3ff13";
    const actions = [
      {
        name: "claim",
        args: {
          protocolName: "camelot",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "outputToken",
          outputToken: "xgrail",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "grail",
          outputToken: "xgrail",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "camelot",
          amount: "outputAmount",
          token: "xgrail",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: 220421127 });
  });

  it("buy 1 eth", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          outputAmount: "1",
          outputToken: "eth",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        dai: 3000,
        simp: 6000000,
      },
    };
    const balanceChanges = {
      Ethereum: {
        eth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: 18817000 },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("swap 1 eth for usdc with 2% slippage", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "1",
          inputToken: "eth",
          outputToken: "usdc",
          slippage: "2%",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 2,
      },
    };
    const [ethPrice, usdcPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdc",
    ]);
    const balanceChanges = {
      Ethereum: {
        eth: -1,
        usdc: ethPrice / usdcPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap 1 eth for usdc with max 3% slippage", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "1",
          inputToken: "eth",
          outputToken: "usdc",
          slippage: "3",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 2,
      },
    };
    const [ethPrice, usdcPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdc",
    ]);
    const balanceChanges = {
      Ethereum: {
        eth: -1,
        usdc: ethPrice / usdcPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap all my usdt for dai", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdt",
          outputToken: "dai",
          inputAmount: "all",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdt: 2000,
      },
    };
    const balanceChanges = {
      Ethereum: {
        usdt: 0,
        dai: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap all my usdt and usdc for dai", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: ["usdt", "usdc"],
          outputToken: "dai",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdt: 2000,
        usdc: 2000,
      },
    };
    const balanceChanges = {
      Ethereum: {
        usdt: "-",
        usdc: "-",
        dai: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 700000);

  it("swap all my usdc and usdt for dai", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: ["usdc", "usdt"],
          inputAmount: "all",
          outputToken: "dai",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdt: 2000,
        usdc: 2000,
      },
    };
    const balanceChanges = {
      Ethereum: {
        usdt: "-",
        usdc: "-",
        dai: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 700000);

  it("swap 1000 my usdc and usdt for dai", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: ["usdc", "usdt"],
          inputAmount: "1000",
          outputToken: "dai",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdt: 2000,
        usdc: 2000,
      },
    };
    const balanceChanges = {
      Ethereum: {
        usdt: "-",
        usdc: "-",
        dai: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 700000);

  it("swap 1000 usdc and 1000 usdt for dai", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: ["usdc", "usdt"],
          inputAmount: ["1000", "1000"],
          outputToken: "dai",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdt: 2000,
        usdc: 2000,
      },
    };
    const balanceChanges = {
      Ethereum: {
        usdt: "-",
        usdc: "-",
        dai: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 700000);

  // updated protocol name rodeo to aave
  it.skip("withdraw all my usdc and usdt from aave, convert to eth, and bridge all of it to arbitrum", async () => {
    const accountAddress = "0xc2707568D31F3fB1Fc55B2F8b2ae5682eAa72041";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "aave",
          amount: "all",
          token: "usdc",
        },
      },
      {
        name: "withdraw",
        args: {
          protocolName: "aave",
          amount: "all",
          token: "usdt",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: ["outputAmount", "outputAmount"],
          inputToken: ["usdc", "usdt"],
          outputToken: "eth",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "eth",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 10,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: 19595033, 42161: undefined },
      initialBalances,
    );
  }, 1000000);

  it.skip("deposit 10 usdc and usdt into the uniswap usdc-usdt pool", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "uniswap",
          poolName: "usdc-usdt",
          amount: "10",
          token: "usdc",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "uniswap",
          poolName: "usdc-usdt",
          amount: "10",
          token: "usdt",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdt: 10,
        usdc: 10,
      },
    };
    const balanceChanges = {
      Ethereum: {
        usdt: -10,
        usdc: -10,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap all my dai and half my usdt for usdc on 1inch", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          protocolName: "1inch",
          inputAmount: ["all", "half"],
          inputToken: ["dai", "usdt"],
          outputToken: "usdc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        dai: 2000,
        usdt: 2000,
      },
    };
    const balanceChanges = {
      Ethereum: {
        dai: "≈0",
        usdt: "-",
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("buy usdt with 2 eth", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "2",
          inputToken: "eth",
          outputToken: "usdt",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 3,
      },
    };
    const [ethPrice, usdtPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdt",
    ]);
    const balanceChanges = {
      Ethereum: {
        eth: -2,
        usdt: (2 * ethPrice) / usdtPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("buy 0.1 eth", async () => {
    const accountAddress = "0xD1668fB5F690C59Ab4B0CAbAd0f8C1617895052B";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "dai",
          outputAmount: "0.1",
          outputToken: "eth",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      Ethereum: {
        eth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  // no protocol specified for long action
  it.skip("bridge 5 eth from arbitrum to ethereum mainnet and long $pepe", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "5",
          token: "eth",
          sourceChainName: "arbitrum",
          destinationChainName: "ethereum",
        },
      },
      {
        name: "long",
        args: {
          inputAmount: "outputAmount",
          inputToken: "outputToken",
          outputToken: "pepe",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 6,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
    );
  });

  it("swap everything i own on eth mainnet to $eth and bridge it all to arbitrum", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          outputToken: "eth",
          chainName: "ethereum",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "eth",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        dai: 1000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
    );
  }, 500000);

  // jonesdao withdraw not supported
  it.skip("withdraw 1 eth from my jonesdao position and ape $jesus", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "jonesdao",
          amount: "1",
          token: "eth",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "outputToken",
          outputToken: "jesus",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  });

  it.skip("deposit 0.33 eth and 500 usdt in the eth/usdt lp on uniswap", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "uniswap",
          poolName: "eth-usdt",
          amount: "0.33",
          token: "eth",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "uniswap",
          poolName: "eth-usdt",
          amount: "500",
          token: "usdt",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdt: 500,
      },
    };
    const [ethPrice, usdtPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdt",
    ]);
    const liquidity = Math.min(0.33 * ethPrice, 500 * usdtPrice);
    const balanceChanges = {
      Ethereum: {
        eth: -liquidity / ethPrice,
        usdt: -liquidity / usdtPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap 1 $eth to $usdc and then bridge it to arbitrum", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "1",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "usdc",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1.5,
      },
    };
    const balanceChanges = {
      Ethereum: {
        eth: -1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("send 0.5 weth to bicep.eth", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "transfer",
        args: {
          amount: "0.5",
          token: "weth",
          recipient: "bicep.eth",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        weth: 1,
      },
    };
    const balanceChanges = {
      Ethereum: {
        weth: -0.5,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("send all my funds to 0x6955e7216e8d9d2ab2ca5ca5e31ccf7307e9d59f", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "transfer",
        args: {
          amount: "all",
          recipient: "0x6955e7216e8d9d2ab2ca5ca5e31ccf7307e9d59f",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it("deposit 0.35 eth into aave, borrow $400 usdc and swap to $bitcoin", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "aave",
          amount: "0.35",
          token: "eth",
        },
      },
      {
        name: "borrow",
        args: {
          protocolName: "aave",
          amount: "400",
          token: "usdc",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "usdc",
          outputToken: "wbtc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    const [btcPrice, usdcPrice] = await getTokenPrices(accountAddress, [
      "wbtc",
      "usdc",
    ]);
    const balanceChanges = {
      Ethereum: {
        eth: -0.35,
        wbtc: (400 * usdcPrice) / btcPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("bridge [amount] weth from arbitrum one back to ethereum and then trade it for usdc.", async () => {
    const accountAddress = "0x40d7c3C539b5BF2102652192aB39e80E36c67cE1";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "weth",
          sourceChainName: "arbitrum",
          destinationChainName: "ethereum",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "outputToken",
          outputToken: "usdc",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
      arbitrum: {
        eth: 0.2,
        weth: 1,
      },
    };
    const [ethPrice, usdcPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdc",
    ]);
    const balanceChanges = {
      Ethereum: {
        usdc: ethPrice / usdcPrice,
      },
      Arbitrum: {
        weth: -1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 700000);

  it("bridge 1 ether to arb chain", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "1",
          token: "eth",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 2,
      },
    };
    const balanceChanges = {
      Ethereum: {
        eth: -1,
      },
      Arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("bridge 1 ether to arbitrum via hop", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "1",
          token: "eth",
          destinationChainName: "arbitrum",
          protocolName: "hop",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 2,
      },
    };
    const balanceChanges = {
      Ethereum: {
        eth: -1,
      },
      Arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("bridge 3.2 eth to mainnet", async () => {
    // FAILS
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "3.2",
          token: "eth",
          destinationChainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 4,
      },
    };
    const balanceChanges = {
      Ethereum: {
        eth: 3.2,
      },
      Arbitrum: {
        eth: -3.2,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 1: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("convert 1e to usdc", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "1",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 2,
      },
    };
    const [ethPrice, usdcPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdc",
    ]);
    const balanceChanges = {
      Ethereum: {
        eth: -1,
        usdc: ethPrice / usdcPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("bridge 500 usdt from arbitrum to ethereum using orbiter", async () => {
    const accountAddress = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "500",
          token: "usdt",
          sourceChainName: "arbitrum",
          destinationChainName: "ethereum",
          protocolName: "orbiter",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", {
      42161: undefined,
      1: undefined,
    });
  });

  it("bridge all eth at this address [address] from the arbitrum blockchain to the ether blockchain", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "eth",
          sourceChainName: "arbitrum",
          destinationChainName: "ethereum",
        },
      },
    ];
    const initialBalances = {};
    const balanceChanges = {
      Ethereum: {
        eth: "+",
      },
      Arbitrum: {
        eth: "-",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 1: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("bridge all usdc from arbitrum to optimism with bungee", async () => {
    const accountAddress = "0x40d7c3C539b5BF2102652192aB39e80E36c67cE1";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "usdc",
          sourceChainName: "arbitrum",
          destinationChainName: "optimism",
          protocolName: "bungee",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdc: 1000,
      },
    };
    const balanceChanges = {
      Optimism: {
        usdc: 1000,
      },
      Arbitrum: {
        usdc: 0,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 10: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("bridge all dai from base to arbitrum using across", async () => {
    const accountAddress = "0x024cDB696a719f37B324a852085A68786D269212";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "dai",
          sourceChainName: "base",
          destinationChainName: "arbitrum",
          protocolName: "across",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
        dai: 1000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined, 42161: undefined },
      initialBalances,
    );
  });

  it("bridge all usdt from arbitrum to ethereum using across", async () => {
    const accountAddress = "0x024cDB696a719f37B324a852085A68786D269212";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "usdt",
          sourceChainName: "arbitrum",
          destinationChainName: "ethereum",
          protocolName: "across",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdt: 1000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 1: undefined, 42161: undefined },
      initialBalances,
    );
  });

  it("bridge all arb from arbitrum to ethereum using across", async () => {
    const accountAddress = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "100",
          token: "arb",
          sourceChainName: "arbitrum",
          destinationChainName: "ethereum",
          protocolName: "across",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Arbitrum",
      { 1: undefined, 42161: undefined },
      "Token arb is not supported on arbitrum for Across.",
    );
  });

  it("bridge all snx from ethereum to optimism using across", async () => {
    const accountAddress = "0x0D0452f487D1EDc869d1488ae984590ca2900D2F";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "100",
          token: "snx",
          sourceChainName: "ethereum",
          destinationChainName: "optimism",
          protocolName: "across",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 10: undefined },
      "Token snx is not supported on ethereum for Across.",
    );
  });

  it("bridge all usdt from optimism to ethereum using across", async () => {
    const accountAddress = "0x024cDB696a719f37B324a852085A68786D269212";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "1",
          token: "eth",
          sourceChainName: "optimism",
          destinationChainName: "ethereum",
          protocolName: "across",
        },
      },
    ];
    const initialBalances = {
      optimism: {
        eth: 2,
      },
    };
    await test(
      accountAddress,
      actions,
      "Optimism",
      { 1: undefined, 10: undefined },
      initialBalances,
    );
  });

  it("bridge all bal from polygon to arbitrum using across", async () => {
    const accountAddress = "0x024cDB696a719f37B324a852085A68786D269212";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "bal",
          sourceChainName: "polygon",
          destinationChainName: "arbitrum",
          protocolName: "across",
        },
      },
    ];
    const initialBalances = {
      polygon: {
        matic: 2,
        bal: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Polygon",
      { 137: undefined, 42161: undefined },
      initialBalances,
    );
  });

  // camelot stake not supported
  it.skip("deposit usdc and eth into camelot usdc/eth pool, stake the spnft into a nitro pool", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "camelot",
          poolName: "usdc-eth",
          amount: "all",
          token: "usdc",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "camelot",
          poolName: "usdc-eth",
          amount: "all",
          token: "eth",
        },
      },
      {
        name: "stake",
        args: {
          amount: "all",
          token: "spnft",
          protocolName: "camelot",
        },
      },
    ];
    await test(accountAddress, actions, "Ethereum", { 1: undefined });
  });

  it("swap my $wbtc for usdc", async () => {
    const accountAddress = "0x40d7c3C539b5BF2102652192aB39e80E36c67cE1";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "wbtc",
          outputToken: "usdc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        wbtc: 1,
      },
    };
    const [usdcPrice, btcPrice] = await getTokenPrices(accountAddress, [
      "usdc",
      "wbtc",
    ]);
    const balanceChanges = {
      Ethereum: {
        wbtc: -1,
        usdc: btcPrice / usdcPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("bridge eth from mainnet to arbitrum", async () => {
    const accountAddress = "0x40d7c3C539b5BF2102652192aB39e80E36c67cE1";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "eth",
          sourceChainName: "ethereum",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 5.05,
      },
    };
    const balanceChanges = {
      Ethereum: {
        eth: -5,
      },
      Arbitrum: {
        eth: 5,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap eth to usdc", async () => {
    const accountAddress = "0x40d7c3C539b5BF2102652192aB39e80E36c67cE1";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 5.05,
      },
    };
    const [ethPrice, usdcPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdc",
    ]);
    const balanceChanges = {
      Ethereum: {
        eth: -5,
        usdc: (5 * ethPrice) / usdcPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("cheapest route for eth to arbitrum now", async () => {
    const accountAddress = "0x40d7c3C539b5BF2102652192aB39e80E36c67cE1";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "eth",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 5.05,
      },
    };
    const balanceChanges = {
      Ethereum: {
        eth: -5,
      },
      Arbitrum: {
        eth: 5,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  // updated steth to eth
  it("swap my ohm to steth, bridge everything to arbitrum", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "ohm",
          outputToken: "eth",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "eth",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        ohm: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
    );
  }, 500000);

  // unsupported
  it.skip("swap all my lodestar rewards to usdc", async () => {
    const accountAddress = "0xced29ba48490c51e4348e654c313ac97762beccc";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "lodestar rewards",
          outputToken: "usdc",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  });

  it("wrap eth", async () => {
    const accountAddress = "0x40d7c3C539b5BF2102652192aB39e80E36c67cE1";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "weth",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 5,
      },
    };
    const balanceChanges = {
      Ethereum: {
        eth: -4.95,
        weth: 4.95,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("unwrap weth into eth", async () => {
    const accountAddress = "0x40d7c3C539b5BF2102652192aB39e80E36c67cE1";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "weth",
          outputToken: "eth",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        weth: 5,
      },
    };
    const balanceChanges = {
      Ethereum: {
        eth: 5,
        weth: -5,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("buy wbtc with 1 eth on 1inch", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          protocolName: "1inch",
          inputAmount: "1",
          inputToken: "eth",
          outputToken: "wbtc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 2,
      },
    };
    const [ethPrice, btcPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "wbtc",
    ]);
    const balanceChanges = {
      Ethereum: {
        eth: -1,
        wbtc: ethPrice / btcPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap 1 eth for usdt", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "1",
          inputToken: "eth",
          outputToken: "usdt",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 2,
      },
    };
    const [ethPrice, usdtPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdt",
    ]);
    const balanceChanges = {
      Ethereum: {
        eth: -1,
        usdt: ethPrice / usdtPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap $50 of eth into usdc on 1inch", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          protocolName: "1inch",
          inputAmount: "50",
          inputAmountUnits: "usd",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    const [ethPrice, usdcPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdc",
    ]);
    const balanceChanges = {
      Ethereum: {
        eth: -50 / ethPrice,
        usdc: 50 / usdcPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
      true,
    );
  });

  it("transfer $50 eth and half my usdt to 7bfee.eth", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "transfer",
        args: {
          amount: "50",
          amount_units: "usd",
          token: "eth",
          recipient: "7bfee.eth",
        },
      },
      {
        name: "transfer",
        args: {
          amount: "half",
          token: "usdt",
          recipient: "7bfee.eth",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdt: 2000,
      },
    };
    const [ethPrice] = await getTokenPrices(accountAddress, ["eth"]);
    const balanceChanges = {
      Ethereum: {
        eth: -50 / ethPrice,
        usdt: "-",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
      true,
    );
  });

  it("swap $100 eth for usdc and bridge to base", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "100",
          inputAmountUnits: "usd",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "usdc",
          destinationChainName: "base",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    const [ethPrice] = await getTokenPrices(accountAddress, ["eth"]);
    const balanceChanges = {
      Ethereum: {
        eth: -100 / ethPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 8453: undefined },
      initialBalances,
      balanceChanges,
      true,
    );
  }, 500000);

  it("swap $100 of eth to usdc on arbitrum, and bridge to base", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "100",
          inputAmountUnits: "usd",
          inputToken: "eth",
          outputToken: "usdc",
          chainName: "arbitrum",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "usdc",
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
    const [ethPrice] = await getTokenPrices(accountAddress, ["eth"]);
    const balanceChanges = {
      Arbitrum: {
        eth: -100 / ethPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
      balanceChanges,
      true,
    );
  }, 500000);

  it("swap $100 eth for usdc on arbitrum", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "100",
          inputAmountUnits: "usd",
          inputToken: "eth",
          outputToken: "usdc",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    const [ethPrice, usdcPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdc",
    ]);
    const balanceChanges = {
      Arbitrum: {
        eth: -100 / ethPrice,
        usdc: 100 / usdcPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
      true,
    );
  });

  it.skip("lend 100 usdc to lodestar and borrow 50 usdc", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "lend",
        args: {
          protocolName: "lodestar",
          amount: "100",
          token: "usdc",
          chainName: "arbitrum",
        },
      },
      {
        name: "borrow",
        args: {
          protocolName: "lodestar",
          amount: "50",
          token: "usdc",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdc: 200,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it.skip("lend 100 usdc to lodestar and borrow 50 usdc.e", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "lend",
        args: {
          protocolName: "lodestar",
          amount: "100",
          token: "usdc",
          chainName: "arbitrum",
        },
      },
      {
        name: "borrow",
        args: {
          protocolName: "lodestar",
          amount: "50",
          token: "usdc.e",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdc: 200,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  // unsupported
  it.skip("lend 300 usdc to lodestar and borrow 180 usd worth of eth", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "lend",
        args: {
          protocolName: "lodestar",
          amount: "300",
          token: "usdc",
          chainName: "arbitrum",
        },
      },
      {
        name: "borrow",
        args: {
          protocolName: "lodestar",
          amount: "180",
          amount_units: "usd",
          token: "eth",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdc: 300,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it("swap $100 of usdc for arb", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "100",
          inputAmountUnits: "usd",
          inputToken: "usdc",
          outputToken: "arb",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdc: 200,
      },
    };
    const [usdcPrice, arbPrice] = await getTokenPrices(accountAddress, [
      "usdc",
      "arb",
    ]);
    const balanceChanges = {
      Ethereum: {
        usdc: -100 / usdcPrice,
        arb: 100 / arbPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
      true,
    );
  });

  it("swap $40 worth of eth for $usdc on arbitrum", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "40",
          inputAmountUnits: "usd",
          inputToken: "eth",
          outputToken: "usdc",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    const [ethPrice, usdcPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdc",
    ]);
    const balanceChanges = {
      Arbitrum: {
        eth: -40 / ethPrice,
        usdc: 40 / usdcPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
      true,
    );
  });

  it("buy 20 usdc on arbitrum", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputAmount: "20",
          outputToken: "usdc",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    const [ethPrice, usdcPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdc",
    ]);
    const balanceChanges = {
      Arbitrum: {
        eth: -20 / ethPrice,
        usdc: 20 / usdcPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
      false,
    );
  });

  // unsupported
  it.skip("swap eth for 2 usdc and deposit it into the gmx weth-usdc pool on arbitrum", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputAmount: "2",
          outputToken: "usdc",
          chainName: "arbitrum",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "gmx",
          poolName: "weth-usdc",
          token: "usdc",
          amount: "2",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdc: 10,
      },
    };
    const [ethPrice] = await getTokenPrices(accountAddress, ["eth"]);
    const balanceChanges = {
      Arbitrum: {
        eth: -2 / ethPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
      false,
    );
  });

  it("swap 1 GRAIL to ETH on arbitrum, bridge ETH to polygon and swap to KLIMA", async () => {
    const accountAddress = "0x35d2085239e04e9B0BD5082F28044170ac6fbdad";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "grail",
          inputAmount: "1",
          outputToken: "eth",
          chainName: "arbitrum",
        },
      },
      {
        name: "bridge",
        args: {
          token: "eth",
          amount: "outputAmount",
          sourceChainName: "arbitrum",
          destinationChainName: "polygon",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "outputToken",
          inputAmount: "outputAmount",
          outputToken: "klima",
          chainName: "polygon",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        grail: 10,
      },
      polygon: {
        matic: 10,
      },
    };
    const balanceChanges = {
      arbitrum: {
        grail: "-",
      },
      polygon: {
        klima: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 137: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 700000);

  it("swap my toshi for 3 usdc on base", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "toshi",
          outputAmount: "3",
          outputToken: "usdc",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      base: {
        toshi: 50000,
        usdc: 0,
      },
    };
    const balanceChanges = {
      Base: {
        usdc: 3,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
      balanceChanges,
      false,
    );
  });

  it.skip("deposit 1 eth worth of usdc into dolomite", async () => {
    const accountAddress = "0x3Bd57A7b5e27F03Eed88F38e994504CB71f4F5DB";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "dolomite",
          amount: "1",
          amount_units: "eth",
          token: "usdc",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        usdc: 10000,
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it("swap all usdt to eth and half of eth for usdc", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdt",
          outputToken: "eth",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "half",
          inputToken: "outputToken",
          outputToken: "usdc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdt: 2000,
      },
    };
    const balanceChanges = {
      Ethereum: {
        usdt: 0,
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("sell all of my $dai and $usdc.e for $usdc on arbitrum", async () => {
    const accountAddress = "0x7c68c7866a64fa2160f78eeae12217ffbf871fa8";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "dai",
          outputToken: "usdc",
          chainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "usdc.e",
          outputToken: "usdc",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        dai: 40,
        "usdc.e": 50,
      },
    };
    const balanceChanges = {
      Arbitrum: {
        dai: -40,
        "usdc.e": -50,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("swap all of my grt for usdc on arbitrum, bridge it from arbitrum to base, and swap it for bald on base", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "grt",
          outputToken: "usdc",
          chainName: "arbitrum",
        },
      },
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
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        grt: 1000,
      },
    };
    const balanceChanges = {
      Arbitrum: {
        grt: -1000,
      },
      Base: {
        bald: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 1000000);

  it("bridge all of my DAI to Arbitrum and swap it for ETH", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "dai",
          sourceChainName: "ethereum",
          destinationChainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "dai",
          outputToken: "eth",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        dai: 40,
      },
    };
    const balanceChanges = {
      Ethereum: {
        dai: "-",
      },
      Arbitrum: {
        eth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  // avalanche get avax balance fails
  it.skip("bridge 100 avax to base and swap it for eth", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "100",
          token: "avax",
          sourceChainName: "avalanche",
          destinationChainName: "base",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "avax",
          outputToken: "eth",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      avalanche: {
        avax: 110,
      },
    };
    const balanceChanges = {
      avalanche: {
        avax: "-",
      },
      base: {
        eth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 43114: undefined, 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  // avalanche get avax balance fails
  it.skip("bridge 100 avax to arbitrum and swap it for eth", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "100",
          token: "avax",
          sourceChainName: "avalanche",
          destinationChainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "avax",
          outputToken: "eth",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      avalanche: {
        avax: 110,
      },
    };
    const balanceChanges = {
      avalanche: {
        avax: "-",
      },
      arbitrum: {
        eth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 43114: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  // inference applied, since bnb does not exist on arbitrum
  it.skip("bridge 10 bnb to arbitrum and swap it for eth", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "10",
          token: "bnb",
          sourceChainName: "bsc",
          destinationChainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "bnb",
          outputToken: "eth",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      bsc: {
        bnb: 20,
      },
    };
    const balanceChanges = {
      bsc: {
        bnb: "-",
      },
      arbitrum: {
        eth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "BSC",
      { 56: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it.skip("bridge 1000 busd to arbitrum and swap it for eth", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "1000",
          token: "busd",
          sourceChainName: "bsc",
          destinationChainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "busd",
          outputToken: "eth",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      bsc: {
        bnb: 1,
        busd: 1000,
      },
    };
    const balanceChanges = {
      bsc: {
        bnb: "-",
        busd: "-",
      },
      arbitrum: {
        eth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "BSC",
      { 56: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("swap 0.01 eth on arbitrum for degen on base", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "0.01",
          inputToken: "eth",
          outputToken: "degen",
          chainName: "arbitrum",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "degen",
          sourceChainName: "arbitrum",
          destinationChainName: "base",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", {
      42161: undefined,
      8453: undefined,
    });
  }, 500000);

  it("bridge 1000 ondo to arbitrum and swap it for eth", async () => {
    // FAILS
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "1000",
          token: "ondo",
          sourceChainName: "ethereum",
          destinationChainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "ondo",
          outputToken: "eth",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        ondo: 1000,
      },
    };
    const balanceChanges = {
      ethereum: {
        ondo: "-",
      },
      arbitrum: {
        eth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  // unsupported
  it.skip("withdraw 1 usdc.e from the usdc-usdc.e pool on gmx on arbitrum", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "withdraw",
        args: {
          amount: "1",
          token: "usdc.e",
          poolName: "usdc-usdc.e",
          protocolName: "gmx",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    const balanceChanges = {};
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("long sol with 2.69x leverage using .01 WETH on hyperliquid on Arbitrum", async () => {
    const accountAddress = "0xbB3d4097E9F1279f07E981EAFF384Eb6566fbE2d";
    const actions = [
      {
        name: "long",
        args: {
          inputAmount: ".01",
          leverageMultiplier: "2.69x",
          inputToken: "weth",
          outputToken: "sol",
          protocolName: "hyperliquid",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        weth: 1,
      },
    };
    const balanceChanges = {};
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  // jonesdao not supported
  it.skip("Deposit 5 usdc in jonesdao on arbitrum", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "deposit",
        args: {
          amount: "5",
          token: "usdc",
          protocolName: "jonesdao",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        usdc: 10,
      },
    };
    const balanceChanges = {
      Arbitrum: {
        usdc: -5,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("deposit $50 worth of eth in aave", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "aave",
          amount: "50",
          amount_units: "usd",
          token: "eth",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    const [ethPrice] = await getTokenPrices(accountAddress, ["eth"]);
    const balanceChanges = {
      ethereum: {
        eth: -100 / ethPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  // plutus deposit has been removed because plutus withdraw is impossible
  it.skip("swap usdc.e for 2 spa and deposit it into plutus on arbitrum", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdc.e",
          outputToken: "spa",
          outputAmount: "2",
          chainName: "arbitrum",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "plutus",
          amount: "2",
          token: "spa",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        "usdc.e": 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it("swap my toshi for 3 usdc on base, bridge it from base to arbitrum and sell it for arb on arbitrum", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "toshi",
          outputAmount: "3",
          outputToken: "usdc",
          chainName: "base",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "3",
          token: "usdc",
          sourceChainName: "base",
          destinationChainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "usdc",
          outputToken: "arb",
          chainName: "arbitrum",
          inputAmount: "outputAmount",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
        toshi: 1000000,
      },
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined, 42161: undefined },
      initialBalances,
    );
  }, 500000);

  it("swap all of my ohm and dpi on ethereum for blur", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "ohm",
          outputToken: "blur",
          chainName: "ethereum",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "dpi",
          outputToken: "blur",
          chainName: "ethereum",
          slippage: "5",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        ohm: 100,
        dpi: 10,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  }, 500000);

  // gmx reward router temporarily paused
  it.skip("buy $gmx with 0.01 eth and stake all of the $gmx on gmx on arbitrum", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "0.01",
          inputToken: "eth",
          outputToken: "gmx",
          chainName: "arbitrum",
        },
      },
      {
        name: "stake",
        args: {
          protocolName: "gmx",
          amount: "all",
          token: "gmx",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  // unsupported
  it.skip("buy 30 usdc.e with eth on arbitrum and deposit on gmx", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "usdc.e",
          chainName: "arbitrum",
          outputAmount: "30",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "gmx",
          amount: "30",
          token: "usdc.e",
          chainName: "arbitrum",
          poolName: "usdc-usdc.e",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  }, 500000);

  // gmx reward router temporarily paused
  it.skip("bridge 0.3 $eth from ethereum to arbitrum, buy $gmx with it, stake all of the $gmx on gmx on arbitrum", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "0.3",
          token: "eth",
          sourceChainName: "ethereum",
          destinationChainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "eth",
          outputToken: "gmx",
          chainName: "arbitrum",
        },
      },
      {
        name: "stake",
        args: {
          protocolName: "gmx",
          token: "gmx",
          amount: "all",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
    );
  });

  it("swap 15 dai for eth, swap 15 usdc for eth, bridge all of the eth from ethereum to arbitrum", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "15",
          inputToken: "dai",
          outputToken: "eth",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "15",
          inputToken: "usdc",
          outputToken: "eth",
        },
      },
      {
        name: "bridge",
        args: {
          token: "eth",
          sourceChainName: "ethereum",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 0.4,
        dai: 15,
        usdc: 15,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
    );
  }, 500000);

  it("swap all of my jones for usdc on arbitrum, bridge it from arbitrum to base, and swap it for axl on base", async () => {
    const accountAddress = "0xcf0955df076ca2f3c2f83ca0eb8502bff5f0838a";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "jones",
          outputToken: "usdc",
          chainName: "arbitrum",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
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
          outputToken: "axl",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 0.5,
      },
      base: {
        eth: 0.5,
      },
    };
    await test(
      accountAddress,
      actions,
      "arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
    );
  }, 1000000);

  it("swap my dai and plsspa to usdc on arbitrum", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: ["dai", "plsspa"],
          outputToken: "usdc",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        dai: 100,
        plsSPA: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  }, 500000);

  // unsupported
  it.skip("repay my 3 magic lodestar position on arbitrum", async () => {
    const accountAddress = "0xebf98b683002f278060aa9d0ab01ff66c6590e7b";
    const actions = [
      {
        name: "repay",
        args: {
          amount: "3",
          token: "magic",
          chainName: "arbitrum",
          protocolName: "lodestar",
        },
      },
    ];
    await test(accountAddress, actions, "arbitrum", { 42161: 175999500 });
  });

  it.skip("repay positions on lodestar on arbitrum, unstake positions from lodestar on arbitrum", async () => {
    const accountAddress = "0x3bf39e4677efb07a775437b5e4bd6acf12906858";
    const actions = [
      {
        name: "repay",
        args: {
          token: "all",
          protocolName: "lodestar",
        },
      },
      {
        name: "withdraw",
        args: {
          token: "all",
          protocolName: "lodestar",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdc: 3000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it.skip("repay my usdc.e positions on lodestar", async () => {
    const accountAddress = "0x3bf39e4677efb07a775437b5e4bd6acf12906858";
    const actions = [
      {
        name: "repay",
        args: {
          token: "usdc",
          amount: "100",
          chainName: "arbitrum",
          protocolName: "lodestar",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdc: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it.skip("repay all my lodestar positions", async () => {
    const accountAddress = "0x2d1a0f69ea53d61b4f74648ca1db523610784406";
    const actions = [
      {
        name: "repay",
        args: {
          token: "all",
          chainName: "arbitrum",
          protocolName: "lodestar",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdt: 50,
        "usdc.e": 10,
        dai: 15,
      },
    };
    await test(
      accountAddress,
      actions,
      "arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  }, 1000000);

  it.skip("on zksync, swap 5 eth for usdc, then swap the usdc for eth, then swap the eth for usdc", async () => {
    const accountAddress = "0x1b72bac3772050fdcaf468cce7e20deb3cb02d89";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "5",
          inputToken: "eth",
          outputToken: "usdc",
          chainName: "zksync",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "usdc",
          outputToken: "eth",
          chainName: "zksync",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "eth",
          outputToken: "usdc",
          chainName: "zksync",
        },
      },
    ];
    const balanceChanges = {
      zksync: {
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "zkSync",
      { 324: undefined },
      {},
      balanceChanges,
    );
  }, 1000000);

  it.skip("deposit 0.002 eth and 5 usdc into the uniswap eth-usdc pool on ethereum", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "uniswap",
          poolName: "eth-usdc",
          amount: "0.002",
          token: "eth",
          chainName: "ethereum",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "uniswap",
          poolName: "eth-usdc",
          amount: "5",
          token: "usdc",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdc: 5,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it.skip("deposit 10000 usdc into the uniswap usdt-usdc pool on ethereum", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "uniswap",
          poolName: "usdt-usdc",
          amount: "10000",
          token: "usdc",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdc: 10000,
      },
    };
    await testFail(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      /Insufficient usdt balance to deposit on ethereum. Please onboard [+-]?([0-9]*[.])?[0-9]+ more usdt and try again./i,
      initialBalances,
    );
  });

  it.skip("deposit 10000 usdb into the thruster eth-usdb pool on blast", async () => {
    const accountAddress = "0x3c7902c1c927ceadb56a8d3fb568d77f1e12edb8";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "thruster",
          poolName: "eth-usdb",
          amount: "10000",
          token: "usdb",
          chainName: "blast",
        },
      },
    ];
    const initialBalances = {
      blast: {
        eth: 1,
      },
    };
    await testFail(
      accountAddress,
      actions,
      "blast",
      { 81457: undefined },
      /Not able to deposit usdb,/i,
      initialBalances,
    );
  });

  it.skip("deposit 10000 usdc into the camelot usdt-usdc pool on arbitrum", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "camelot",
          poolName: "usdt-usdc",
          amount: "10000",
          token: "usdc",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdc: 10000,
      },
    };
    await testFail(
      accountAddress,
      actions,
      "arbitrum",
      { 42161: undefined },
      /Insufficient usdt balance to deposit on arbitrum. Please onboard [+-]?([0-9]*[.])?[0-9]+ more usdt and try again./i,
      initialBalances,
    );
  });

  it.skip("deposit 10000 usdc into the aerodrome eth-usdc pool on base", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "aerodrome",
          poolName: "eth-usdc",
          amount: "10000",
          token: "usdc",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
        usdc: 10000,
      },
    };
    await testFail(
      accountAddress,
      actions,
      "base",
      { 8453: undefined },
      /Insufficient eth balance to deposit on base. Please onboard [+-]?([0-9]*[.])?[0-9]+ more eth and try again./i,
      initialBalances,
    );
  });

  it.skip("deposit 10000 usdc into the velodrome usdt-usdc pool on optimism", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "velodrome",
          poolName: "usdt-usdc",
          amount: "10000",
          token: "usdc",
          chainName: "optimism",
        },
      },
    ];
    const initialBalances = {
      optimism: {
        eth: 1,
        usdc: 10000,
      },
    };
    await testFail(
      accountAddress,
      actions,
      "optimism",
      { 10: undefined },
      /Insufficient usdt balance to deposit on optimism. Please onboard [+-]?([0-9]*[.])?[0-9]+ more usdt and try again./i,
      initialBalances,
    );
  });

  it.skip("borrow 3 magic on lodestar on arbitrum", async () => {
    const accountAddress = "0xebf98b683002f278060aa9d0ab01ff66c6590e7b";
    const actions = [
      {
        name: "borrow",
        args: {
          protocolName: "lodestar",
          amount: "3",
          token: "magic",
          chainName: "arbitrum",
        },
      },
    ];
    await test(accountAddress, actions, "Ethereum", { 42161: 175999500 });
  });

  it("sell all of my $grail and $usdc.e for $usdc on arbitrum", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: ["all", "all"],
          inputToken: ["grail", "usdc.e"],
          outputToken: "usdc",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        grail: 1,
        "usdc.e": 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  }, 500000);

  it("swap all of my grt for usdc with 5% slippage on arbitrum, bridge it from arbitrum to base, and swap it for axl with 5% slippage on base", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "grt",
          outputToken: "usdc",
          slippage: "5%",
          chainName: "arbitrum",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
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
          outputToken: "axl",
          slippage: "5%",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        grt: 100,
      },
      base: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
    );
  }, 1500000);

  // unsupported
  it.skip("swap 2 uni for wavax and deposit it into the gmx wavax-usdc pool on arbitrum", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "2",
          inputToken: "uni",
          outputToken: "weth",
          chainName: "arbitrum",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "gmx",
          poolName: "weth-usdc",
          token: "weth",
          amount: "outputAmount",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        uni: 2,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  }, 500000);

  it("borrow half usdt from aave on ethereum, bridge it from ethereum to arbitrum and swap it for $joe on arbitrum", async () => {
    // FAILS
    const accountAddress = "0xa313262a5856021164bd4a5d2dda65bc018bc758";
    const actions = [
      {
        name: "borrow",
        args: {
          protocolName: "aave",
          amount: "half",
          token: "usdt",
          chainName: "ethereum",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "usdt",
          sourceChainName: "ethereum",
          destinationChainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "usdt",
          outputToken: "joe",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
    );
  }, 1000000);

  // unsupported
  it.skip("swap 0.075 eth to usdc on 1inch on arbitrum then lend the usdc on lodestar", async () => {
    const accountAddress = "0xf0840B643eAB3308633330c6bC5854D0167C63e2";
    const actions = [
      {
        name: "swap",
        args: {
          protocolName: "1inch",
          inputAmount: "0.075",
          inputToken: "eth",
          outputToken: "usdc",
          chainName: "arbitrum",
          slippage: "1%",
        },
      },
      {
        name: "lend",
        args: {
          protocolName: "lodestar",
          token: "usdc",
          amount: "outputAmount",
          chainName: "arbitrum one",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it("bridge all ETH from arbitrum to base", async () => {
    const accountAddress = "0x024cDB696a719f37B324a852085A68786D269212";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "eth",
          sourceChainName: "arbitrum",
          destinationChainName: "base",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 2,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
    );
  });

  it("swap $5 worth of eth to usdc on 1inch on arbitrum", async () => {
    const accountAddress = "0xcB63b47aCFf4Edc6ea1A83095956A8236FFd8260";
    const actions = [
      {
        name: "swap",
        args: {
          protocolName: "1inch",
          inputAmount: "5",
          inputAmountUnits: "usd",
          inputToken: "eth",
          outputToken: "usdc",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      arbitrum: {
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap 1000 usdc to eth on velodrome", async () => {
    const accountAddress = "0xf89d7b9c864f589bbf53a82105107622b35eaa40";
    const actions = [
      {
        name: "swap",
        args: {
          protocolName: "velodrome",
          inputAmount: "1000",
          inputToken: "usdc",
          outputToken: "eth",
          chainName: "optimism",
        },
      },
    ];
    await test(accountAddress, actions, "Optimism", { 10: undefined });
  });

  it("swap 1000 usdc to eth on aerodrome", async () => {
    const accountAddress = "0x20fe51a9229eef2cf8ad9e89d91cab9312cf3b7a";
    const actions = [
      {
        name: "swap",
        args: {
          protocolName: "aerodrome",
          inputAmount: "1000",
          inputToken: "usdc",
          outputToken: "eth",
          chainName: "base",
        },
      },
    ];
    await test(accountAddress, actions, "Base", { 8453: undefined });
  });

  it("swap 1.5 matic to ETH on polygon then bridge to base", async () => {
    const accountAddress = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "1.5",
          inputToken: "matic",
          outputToken: "eth",
          chainName: "polygon",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "eth",
          sourceChainName: "polygon",
          destinationChainName: "base",
        },
      },
    ];
    await test(accountAddress, actions, "Polygon", {
      137: undefined,
      8453: undefined,
    });
  });

  it("swap 5 polygon to eth on polygon", async () => {
    const accountAddress = await getTopHolder("pol", 137);
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "5",
          inputToken: "pol",
          outputToken: "eth",
          chainName: "polygon",
        },
      },
    ];
    await test(accountAddress || "", actions, "Polygon", { 137: undefined });
  });

  // unsupported
  it.skip("close my usdc 2x leverage arb position on gmx on arbitrum", async () => {
    const accountAddress = "0x6859dA14835424957a1E6B397D8026B1D9fF7e1E";
    const actions = [
      {
        name: "close",
        args: {
          protocolName: "gmx",
          inputToken: "usdc",
          outputToken: "arb",
          leverageMultiplier: "2x",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 2,
        usdc: 20,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: 235170000 },
      initialBalances,
    );
  });

  it("long BTC using 1 WETH on HL on Arbitrum", async () => {
    const accountAddress = "0xbB3d4097E9F1279f07E981EAFF384Eb6566fbE2d";
    const actions = [
      {
        name: "long",
        args: {
          inputAmount: "1",
          inputToken: "weth",
          outputToken: "btc",
          protocolName: "hyperliquid",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        weth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it("swap all my 0x4ed4e862860bed51a9570b96d89af5e1b0efefed for 0x0d97f261b1e88845184f678e2d1e7a98d9fd38de on base", async () => {
    const accountAddress = "0xF62C0ecBFcD066dD92022918402740B5D48973ab";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "0x4ed4e862860bed51a9570b96d89af5e1b0efefed",
          outputToken: "0x0d97f261b1e88845184f678e2d1e7a98d9fd38de",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
        degen: 40000,
      },
    };
    const balanceChanges = {};
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("withdraw 150.221916980812345741 frax from lodestar", async () => {
    const accountAddress = "0xf0840B643eAB3308633330c6bC5854D0167C63e2";
    const actions = [
      {
        name: "withdraw",
        args: {
          amount: "150.221916980812345741",
          token: "frax",
          protocolName: "lodestar",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    const balanceChanges = {};
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: 182036018 },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("withdraw 7 eth from lodestar", async () => {
    const accountAddress = "0x9F4511984b6c84e20def66F6D2259e3afB4b5f29";
    const actions = [
      {
        name: "withdraw",
        args: {
          amount: "7",
          token: "eth",
          protocolName: "lodestar",
          chainName: "arbitrum",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: 195123721 });
  });

  it.skip("withdraw all my positions on lodestar", async () => {
    const accountAddress = "0xebf98b683002f278060aa9d0ab01ff66c6590e7b";
    const actions = [
      {
        name: "withdraw",
        args: {
          token: "all",
          protocolName: "lodestar",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  }, 1000000);

  it.skip("withdraw all my positions on lodestar 2", async () => {
    const accountAddress = "0x8c11e3af9c1d8718c40c51d4ff0958afcf77fd71";
    const actions = [
      {
        name: "withdraw",
        args: {
          token: "all",
          protocolName: "lodestar",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  }, 1000000);

  it.skip("withdraw all my eth from lodestar on arbitrum", async () => {
    const accountAddress = "0x8c11e3af9c1d8718c40c51d4ff0958afcf77fd71";
    const actions = [
      {
        name: "withdraw",
        args: {
          token: "eth",
          protocolName: "lodestar",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it.skip("lend all my eth to lodestar", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "lend",
        args: {
          protocolName: "lodestar",
          amount: "all",
          token: "eth",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 5,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it.skip("swap 200 usdc to frax using odos and deposit on lodestar on arbitrum", async () => {
    const accountAddress = "0x1a51d0abb33d2a06c93b448528349e4c7fc6fba5";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "200",
          inputToken: "usdc",
          outputToken: "frax",
          protocolName: "odos",
          chainName: "arbitrum",
        },
      },
      {
        name: "deposit",
        args: {
          amount: "outputAmount",
          token: "frax",
          protocolName: "lodestar",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        usdc: 200,
        eth: 1,
      },
    };
    const balanceChanges = {};
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap weth for 6000 usdc with 1 slippage", async () => {
    const accountAddress = "0x024cDB696a719f37B324a852085A68786D269212";
    const actions = [
      {
        name: "swap",
        args: {
          outputAmount: "6000",
          outputToken: "usdc",
          inputToken: "weth",
          chainName: "ethereum",
          slippage: "1",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        weth: 4,
      },
    };
    const [ethPrice] = await getTokenPrices(accountAddress, ["eth"]);
    const balanceChanges = {
      ethereum: {
        weth: -6000 / ethPrice,
        usdc: 6000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("bridge all my eth from arbitrum to optimism and swap for usdt on velodrome", async () => {
    const accountAddress = "0x024cDB696a719f37B324a852085A68786D269212";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "eth",
          sourceChainName: "arbitrum",
          destinationChainName: "optimism",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "eth",
          outputToken: "usdt",
          chainName: "optimism",
          protocolName: "velodrome",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 2,
      },
      optimism: {
        eth: 0.5,
      },
    };
    const balanceChanges = {
      optimism: {
        usdt: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 10: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("long sol with 5 arb on hyperliquid on arbitrum", async () => {
    // FAILS
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "long",
        args: {
          inputAmount: "5",
          inputToken: "arb",
          outputToken: "sol",
          protocolName: "hyperliquid",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        arb: 10,
      },
    };
    const balanceChanges = {};
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("swap 60 velo for op on optimism and deposit it into the op-usdc pool on velodrome", async () => {
    const accountAddress = "0xa5ef861278d7bf18a8a2068a01d66fbded93a1bd";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "60",
          inputToken: "velo",
          outputToken: "op",
          chainName: "optimism",
        },
      },
      {
        name: "deposit",
        args: {
          amount: "outputAmount",
          poolName: "op-usdc",
          token: "op",
          protocolName: "velodrome",
          chainName: "optimism",
        },
      },
    ];
    const initialBalances = {
      optimism: {
        velo: 60,
        eth: 0.5,
        usdc: 500,
      },
    };
    const balanceChanges = {
      optimism: {
        velo: -60,
        usdc: "-",
      },
    };
    await test(
      accountAddress,
      actions,
      "Optimism",
      { 10: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("swap 0.13 weth to eth on blast", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "0.13",
          inputToken: "weth",
          outputToken: "eth",
          chainName: "blast",
        },
      },
    ];
    const balanceChanges = {
      blast: {
        weth: "-0.13",
        eth: "0.13",
      },
    };
    await test(
      accountAddress,
      actions,
      "Blast",
      { 81457: 3759009 },
      {},
      balanceChanges,
    );
  });

  it("swap 100 degen to higher on base", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "100",
          inputToken: "degen",
          outputToken: "higher",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: "0.5",
        degen: "100",
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
      {},
    );
  });

  it("swap all of my tokens to arbitrum to eth", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "all",
          outputToken: "eth",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {};
    const balanceChanges = {};
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 1000000);

  it.skip("withdraw all my frax from lodestar", async () => {
    const accountAddress = "0xf0840B643eAB3308633330c6bC5854D0167C63e2";
    const actions = [
      {
        name: "withdraw",
        args: {
          amount: "all",
          protocolName: "lodestar",
          token: "FRAX",
          chainName: "arbitrum",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      /Could not detect FRAX to withdraw on arbitrum. Available tokens to withdraw are/i,
    );
  });

  // plutus deposit has been removed because plutus withdraw is impossible
  it.skip("buy 15 glp with usdc on arbitrum, deposit it into plutus, stake the plvglp on plutus", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdc",
          outputAmount: "15",
          outputToken: "glp",
          chainName: "arbitrum",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "plutus",
          amount: "15",
          token: "glp",
          chainName: "arbitrum",
        },
      },
      {
        name: "stake",
        args: {
          protocolName: "plutus",
          amount: "outputAmount",
          token: "plvglp",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdc: 15,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it.skip("withdraw all my gmx and repay it all on my borrow position on lodestar on arbitrum", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "withdraw",
        args: {
          amount: "all",
          token: "gmx",
          chainName: "arbitrum",
          protocolName: "lodestar",
        },
      },
      {
        name: "repay",
        args: {
          protocolName: "lodestar",
          amount: "all",
          token: "gmx",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {};
    const balanceChanges = {};
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap eth for 100 usdc on 1inch", async () => {
    // FAILS
    const accountAddress = "0xdD81c6681633Cb26C69d8f52F88b513D6A90a286";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "usdc",
          outputAmount: "100",
          protocolName: "1inch",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      /Please onboard [+-]?([0-9]*[.])?[0-9]+ more ETH into your Slate account on Ethereum and try again./i,
    );
  });

  it("swap eth for 100 dai", async () => {
    // FAILS
    const accountAddress = "0xdD81c6681633Cb26C69d8f52F88b513D6A90a286";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "dai",
          outputAmount: "100",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      /Please onboard [+-]?([0-9]*[.])?[0-9]+ more ETH into your Slate account on Ethereum and try again./i,
    );
  });

  it("swap eth for 100 comp", async () => {
    // FAILS
    const accountAddress = "0xdD81c6681633Cb26C69d8f52F88b513D6A90a286";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "comp",
          outputAmount: "10",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      /Please onboard [+-]?([0-9]*[.])?[0-9]+ more ETH into your Slate account on Ethereum and try again./i,
    );
  });

  it("withdraw from all my positions on pendle", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const actions = [
      {
        name: "withdraw",
        args: {
          token: "all",
          protocolName: "pendle",
          chainName: "ethereum",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      "Could not detect any tokens to withdraw on ethereum. Ensure you have tokens to withdraw on your Slate account.",
    );
  });

  it("Swap 100 usdc to usdt on base", async () => {
    // FAILS
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdc",
          inputAmount: "100",
          outputToken: "usdt",
          chainName: "base",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      /Not able to swap usdc,/i,
    );
  });

  it.skip("repay my USDC position on lodestar", async () => {
    const accountAddress = "0x0d7a60020488F2087f4B8B69f25f84dc89e7836D";
    const actions = [
      {
        name: "repay",
        args: {
          token: "usdc",
          chainName: "arbitrum",
          protocolName: "lodestar",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "arbitrum",
      { 42161: undefined },
      /Not able to repay usdc,/i,
    );
  });

  // unsupported
  it.skip("Unsupported chain test 1", async () => {
    const accountAddress = "0xebf98b683002f278060aa9d0ab01ff66c6590e7b";
    const actions = [
      {
        name: "repay",
        args: {
          token: "usdc",
          chainName: "chain1",
          protocolName: "lodestar",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "arbitrum",
      { 42161: undefined },
      getUnsupportedChainError("chain1"),
    );
  });

  it("Unsupported chain test 2", async () => {
    const accountAddress = "0xebf98b683002f278060aa9d0ab01ff66c6590e7b";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "usdc",
          amount: "1000",
          sourceChainName: "ethereum",
          destinationChainName: "chain2",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      getUnsupportedChainError("chain2"),
    );
  });

  it("stake 10 eth on swell", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "stake",
        args: {
          protocolName: "swell",
          amount: "10",
          token: "eth",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 11,
      },
    };
    const balanceChanges = {
      Ethereum: {
        eth: -10,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("stake 5 cbeth on eigenlayer", async () => {
    const accountAddress = "0xaeab40d5c7d44dad5fbc587e26bd1f362654507c";
    const actions = [
      {
        name: "stake",
        args: {
          protocolName: "eigenlayer",
          amount: "5",
          token: "cbeth",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        cbeth: 5,
      },
    };
    const balanceChanges = {
      Ethereum: {
        cbeth: -5,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: 18840628 },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("withdraw 5 sweth on eigenlayer", async () => {
    const accountAddress = "0x45252B4CDCB82Fbfa22FBd61A38778254C08F7FC";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "eigenlayer",
          amount: "5",
          token: "sweth",
        },
      },
    ];
    await test(accountAddress, actions, "Ethereum", { 1: 19192811 });
  });

  it.skip("swap eth to 10 usdc then swap 10 usdc to weth on zksync", async () => {
    const accountAddress = "0x1b72bac3772050fdcaf468cce7e20deb3cb02d89";
    const actions = [
      {
        name: "swap",
        args: {
          chainName: "zksync",
          inputToken: "eth",
          outputAmount: "10",
          outputToken: "usdc",
        },
      },
      {
        name: "swap",
        args: {
          chainName: "zksync",
          inputAmount: "outputAmount",
          inputToken: "usdc",
          outputToken: "weth",
        },
      },
    ];
    const balanceChanges = {
      zksync: {
        weth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "zkSync",
      { 324: undefined },
      {},
      balanceChanges,
    );
  }, 500000);

  it.skip("swap 1 eth to usdc on zksync", async () => {
    const accountAddress = "0x1b72bac3772050fdcaf468cce7e20deb3cb02d89";
    const actions = [
      {
        name: "swap",
        args: {
          chainName: "zksync",
          inputAmount: "1",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
    ];
    const balanceChanges = {
      zksync: {
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "zkSync",
      { 324: undefined },
      {},
      balanceChanges,
    );
  }, 500000);

  it.skip("transfer 1 eth to niyant.eth on zksync", async () => {
    const accountAddress = "0x1b72bac3772050fdcaf468cce7e20deb3cb02d89";
    const actions = [
      {
        name: "transfer",
        args: {
          chainName: "zksync",
          amount: "1",
          token: "eth",
          recipient: "niyant.eth",
        },
      },
    ];
    await test(accountAddress, actions, "zkSync", { 324: undefined });
  });

  it.skip("swap all to eth on zksync", async () => {
    const accountAddress = "0xe29f5ad2a33c76ccaca2d2e3226ff80085ce4573";
    const actions = [
      {
        name: "swap",
        args: {
          chainName: "zksync",
          inputAmount: "all",
          inputToken: "all",
          outputToken: "eth",
        },
      },
    ];
    await test(accountAddress, actions, "zkSync", { 324: undefined });
  }, 500000);

  it("bridge $5000 worth of wbtc from ethereum to arbitrum", async () => {
    const accountAddress = "0xbB3d4097E9F1279f07E981EAFF384Eb6566fbE2d";
    const actions = [
      {
        name: "bridge",
        args: {
          sourceChainName: "ethereum",
          destinationChainName: "arbitrum",
          amount: "5000",
          amount_units: "usdc",
          token: "wbtc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        wbtc: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      {
        1: undefined,
        42161: undefined,
      },
      initialBalances,
    );
  });

  it.skip("bridge 1000 usdc to ethereum from zksync", async () => {
    const accountAddress = "0x1b2dab8062e1d7ea6d6bff01ae297fede19e3125";
    const actions = [
      {
        name: "bridge",
        args: {
          sourceChainName: "zksync",
          destinationChainName: "ethereum",
          amount: "1000",
          token: "usdc",
        },
      },
    ];
    const balanceChanges = {
      zksync: {
        usdc: -1000,
      },
    };
    await test(
      accountAddress,
      actions,
      "zkSync",
      { 324: undefined, 1: undefined },
      {},
      balanceChanges,
    );
  }, 500000);

  it.skip("bridge 2 eth to ethereum from zksync", async () => {
    const accountAddress = "0x1b72bac3772050fdcaf468cce7e20deb3cb02d89";
    const actions = [
      {
        name: "bridge",
        args: {
          sourceChainName: "zksync",
          destinationChainName: "ethereum",
          amount: "2",
          token: "eth",
        },
      },
    ];
    await test(accountAddress, actions, "zkSync", {
      324: undefined,
      1: undefined,
    });
  });

  it.skip("bridge all eth to ethereum from zksync", async () => {
    const accountAddress = "0x1b72bac3772050fdcaf468cce7e20deb3cb02d89";
    const actions = [
      {
        name: "bridge",
        args: {
          sourceChainName: "zksync",
          destinationChainName: "ethereum",
          amount: "all",
          token: "eth",
        },
      },
    ];
    await test(accountAddress, actions, "zkSync", {
      324: undefined,
      1: undefined,
    });
  });

  it.skip("bridge 10 usdc from ethereum to zksync", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "bridge",
        args: {
          sourceChainName: "ethereum",
          destinationChainName: "zksync",
          amount: "100",
          token: "usdc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdc: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "ethereum",
      { 1: undefined, 324: undefined },
      initialBalances,
    );
  });

  it.skip("bridge 100 usdc from ethereum to zksync then buy weth", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "bridge",
        args: {
          sourceChainName: "ethereum",
          destinationChainName: "zksync",
          amount: "100",
          token: "usdc",
        },
      },
      {
        name: "swap",
        args: {
          chainName: "zksync",
          inputAmount: "outputAmount",
          inputToken: "usdc",
          outputToken: "weth",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "ethereum",
      { 1: undefined, 324: undefined },
      "Simulations for actions after a bridge to zksync are not supported. Try bridging first and then performing the rest of your actions in a new prompt.",
    );
  });

  it.skip("swap 2 eth to usdc and transfer 10 usdc to niyant.eth on zksync", async () => {
    const accountAddress = "0x1b72bac3772050fdcaf468cce7e20deb3cb02d89";
    const actions = [
      {
        name: "swap",
        args: {
          chainName: "zksync",
          inputAmount: "2",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
      {
        name: "transfer",
        args: {
          chainName: "zksync",
          amount: "10",
          token: "usdc",
          recipient: "niyant.eth",
        },
      },
    ];
    const balanceChanges = {
      zksync: {
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "zkSync",
      { 324: undefined },
      {},
      balanceChanges,
    );
  }, 700000);

  it("long doge with 5x leverage with 0.05 weth on HL on arbitrum", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "long",
        args: {
          chainName: "arbitrum",
          inputToken: "weth",
          inputAmount: "0.05",
          outputToken: "doge",
          protocolName: "hyperliquid",
          leverageMultiplier: "5x",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        weth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it("Long BTC with 5x leverage with 100 usdc on hyperliquid on arbitrum", async () => {
    const accountAddress = "0xA4a2F21517073dA2557fCabBca9356A7a82B6A68";
    const actions = [
      {
        name: "long",
        args: {
          chainName: "arbitrum",
          inputToken: "usdc",
          inputAmount: "100",
          outputToken: "btc",
          protocolName: "hyperliquid",
          leverageMultiplier: "5x",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdc: 200,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it.skip("swap eth to usdc on syncswap", async () => {
    const accountAddress = "0x1b2dab8062e1d7ea6d6bff01ae297fede19e3125";
    const actions = [
      {
        name: "swap",
        args: {
          protocolName: "syncswap",
          chainName: "zksync",
          inputAmount: "all",
          inputToken: "eth",
          outputToken: "usdc",
        },
      },
    ];
    const balanceChanges = {
      zksync: {
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "zkSync",
      { 324: undefined },
      {},
      balanceChanges,
    );
  }, 500000);

  it.skip("close weth position on gmx on arbitrum", async () => {
    const accountAddress = "0x6859dA14835424957a1E6B397D8026B1D9fF7e1E";
    const actions = [
      {
        name: "close",
        args: {
          protocolName: "gmx",
          chainName: "arbitrum",
          inputToken: "weth",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: 235170000 });
  });

  it.skip("close eth position on gmx on arbitrum", async () => {
    const accountAddress = "0x6859dA14835424957a1E6B397D8026B1D9fF7e1E";
    const actions = [
      {
        name: "close",
        args: {
          protocolName: "gmx",
          chainName: "arbitrum",
          inputToken: "eth",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: 235170000 });
  });

  it("swap 20 usdc to eth on base, bridge to polygon, and buy matic", async () => {
    const accountAddress = "0x5a22c1eE7b2F8a4886703D18d46002dc5021d2Eb";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "20",
          inputToken: "usdc",
          outputToken: "eth",
          chainName: "base",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "eth",
          sourceChainName: "base",
          destinationChainName: "polygon",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "eth",
          outputToken: "matic",
          chainName: "polygon",
        },
      },
    ];
    const initialBalances = {
      base: {
        usdc: 40,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined, 137: undefined },
      initialBalances,
    );
  }, 750000);

  it("swap weth to eth on base", async () => {
    const accountAddress = "0x5a22c1eE7b2F8a4886703D18d46002dc5021d2Eb";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "weth",
          outputToken: "eth",
          chainName: "base",
        },
      },
    ];
    await test(accountAddress, actions, "Base", { 8453: undefined });
  });

  it.skip("swap 0.008 matic to usdt on polygon, then bridge all of the usdt to arbitrum, then swap the usdt to USDC on arbitrum", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "0.008",
          inputToken: "matic",
          outputToken: "usdt",
          chainName: "polygon",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "usdt",
          destinationChainName: "arbitrum",
          sourceChainName: "polygon",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "usdt",
          outputToken: "usdc",
          chainName: "arbitrum",
          inputAmount: "all",
        },
      },
    ];
    const initialBalances = {
      polygon: {
        matic: 10,
      },
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Polygon",
      { 137: undefined, 42161: undefined },
      initialBalances,
    );
  }, 500000);

  // unsupported
  it.skip("deposit 2 usdc into the gmx weth-usdc pool on arbitrum", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "gmx",
          poolName: "weth-usdc",
          amount: "2",
          token: "usdc",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdc: 2,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it("bridge from 0.1 eth from ethereum to arbitrum using bungee. then bridge it back from arbitrum to ethereum using bungee", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "0.1",
          token: "eth",
          sourceChainName: "ethereum",
          destinationChainName: "arbitrum",
          protocolName: "bungee",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "eth",
          sourceChainName: "arbitrum",
          destinationChainName: "ethereum",
          protocolName: "bungee",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
    );
  });

  it("transfer 0.005 eth on arbitrum to 0x28129f5b8b689edcb7b581654266976ad77c719b", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "transfer",
        args: {
          amount: "0.005",
          token: "eth",
          recipient: "0x28129f5b8b689edcb7b581654266976ad77c719b",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it.skip("bridge 0.1 eth from base to arbitrum using reservoir", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "0.1",
          token: "eth",
          sourceChainName: "base",
          destinationChainName: "arbitrum",
          protocolName: "reservoir",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 42161: undefined, 8453: undefined },
      initialBalances,
    );
  });

  it.skip("close all gmx positions", async () => {
    const accountAddress = "0x6859dA14835424957a1E6B397D8026B1D9fF7e1E";
    const actions = [
      {
        name: "close",
        args: {
          protocolName: "gmx",
          inputAmount: "all",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: 235170000 },
      initialBalances,
    );
  }, 750000);

  // unsupported
  it.skip("close arb short on gmx on arbitrum", async () => {
    const accountAddress = "0x6859dA14835424957a1E6B397D8026B1D9fF7e1E";
    const actions = [
      {
        name: "close",
        args: {
          protocolName: "gmx",
          inputToken: "arb",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: 235170000 },
      initialBalances,
    );
  });

  it.skip("swap all of my uni to grail on arbitrum and deposit it and all of my usdc.e into the grail-usdc.e pool on camelot", async () => {
    const accountAddress = "0xa5ef861278d7bf18a8a2068a01d66fbded93a1bd";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "uni",
          outputToken: "grail",
          chainName: "arbitrum",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "camelot",
          poolName: "grail-usdc.e",
          amount: "outputAmount",
          token: "grail",
          chainName: "arbitrum",
          token2: "usdc.e",
          amount2: "all",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        uni: 100,
        "usdc.e": 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  }, 500000);

  // avalanche get avax balance fails
  it.skip("swap all my avax for usdt on trader joe", async () => {
    const accountAddress = "0x34D3e9B531D2bbdD4593777D2B6FdceA8a6B821f";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "avax",
          outputToken: "usdt",
          protocolName: "traderjoe",
        },
      },
    ];
    const initialBalances = {
      avalanche: {
        avax: 10,
      },
    };
    await test(
      accountAddress,
      actions,
      "Avalanche",
      { 43114: undefined },
      initialBalances,
    );
  });

  it("stake all my eth on swell network", async () => {
    const accountAddress = "0xbB3d4097E9F1279f07E981EAFF384Eb6566fbE2d";
    const actions = [
      {
        name: "stake",
        args: {
          protocolName: "swell",
          amount: "all",
          token: "eth",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 10,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it.skip("deposit 30 usdc and the equivalent eth into uniswap", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "uniswap",
          amount: "30",
          token: "usdc",
          poolName: "eth-usdc",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "uniswap",
          token: "eth",
          amount: "30",
          amount_units: "usdc",
          poolName: "eth-usdc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        usdc: 30,
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it("buy eth with 20 usdc", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "20",
          inputToken: "usdc",
          outputToken: "eth",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdc: 20,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it.skip("repay my 0.0805 gmx borrow position on lodestar on arbitrum", async () => {
    const accountAddress = "0x1cafa49299d4f54ef2030d7b0e0f6749045c8709";
    const actions = [
      {
        name: "repay",
        args: {
          protocolName: "lodestar",
          amount: "0.0805",
          token: "gmx",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        gmx: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: 189210160 },
      initialBalances,
    );
  });

  it("deposit 5 eth into compound", async () => {
    const accountAddress = "0x607DB376b0EDEf8Cbf346443De2395F046140b1E";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "compound",
          amount: "5",
          token: "eth",
          poolName: "usdc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 10,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it("deposit 1 usdc into compound on arbitrum", async () => {
    const accountAddress = "0x607DB376b0EDEf8Cbf346443De2395F046140b1E";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "compound",
          amount: "1",
          token: "usdc",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 10,
        usdc: 10,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it("swap all of my tokens on base to eth, then bridge eth to polygon", async () => {
    const accountAddress = "0x5a22c1eE7b2F8a4886703D18d46002dc5021d2Eb";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "all",
          outputToken: "eth",
          chainName: "base",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "eth",
          destinationChainName: "polygon",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 0.5,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 137: undefined, 8453: undefined },
      initialBalances,
    );
  }, 1500000);

  it("swap all of my gmx for usdc on arbitrum", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "gmx",
          outputToken: "usdc",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        gmx: 20,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  // unsupported
  it.skip("withdraw all positions from lodestar", async () => {
    const accountAddress = "0x58480f6F52fed34f53149D1f323718c678b5ad1e";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "lodestar",
          amount: "all",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it("bridge 600 usdc from optimism to ethereum and buy pepe", async () => {
    // FAILS
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "600",
          token: "usdc",
          sourceChainName: "optimism",
          destinationChainName: "ethereum",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "usdc",
          outputToken: "pepe",
          chainName: "ethereum",
          inputAmount: "outputAmount",
        },
      },
    ];
    const initialBalances = {
      optimism: {
        eth: 1,
        usdc: 600,
        "usdc.e": 600,
      },
      ethereum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Optimism",
      { 1: undefined, 10: undefined },
      initialBalances,
    );
  }, 500000);

  it("swap all of my grt for usdc with 3% slippage on arbitrum, bridge it from arbitrum to base, and swap it for axl with 3% slippage on base", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "grt",
          outputToken: "usdc",
          slippage: "3%",
          chainName: "arbitrum",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
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
          outputToken: "axl",
          slippage: "3%",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        grt: 100,
      },
      base: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
    );
  }, 1500000);

  // unsupported
  it.skip("deposit 2 usdc into the gmx btc-usdc pool on arbitrum", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "gmx",
          poolName: "wbtc-usdc",
          amount: "2",
          token: "usdc",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdc: 2,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it.skip("buy 3 usdc and 3 steur with eth on camelot and deposit both tokens in the camelot steur-usdc pool on arbitrum", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "swap",
        args: {
          protocolName: "camelot",
          inputToken: "eth",
          outputToken: "usdc",
          outputAmount: "3",
          chainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          protocolName: "camelot",
          inputToken: "eth",
          outputToken: "usdt",
          outputAmount: "3",
          chainName: "arbitrum",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "camelot",
          poolName: "usdt-usdc",
          token: "usdc",
          amount: "2.5", // due to slippage
          chainName: "arbitrum",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "camelot",
          poolName: "usdt-usdc",
          token: "usdt",
          amount: "2.5", // due to slippage
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 2,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  }, 600000);

  it("bridge 0.075 eth from arbitrum to ethereum and swap to usdy", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "0.075",
          token: "eth",
          sourceChainName: "arbitrum",
          destinationChainName: "ethereum",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "usdy",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
      ethereum: {
        eth: 2,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 1: undefined },
      initialBalances,
    );
  }, 500000);

  /// inference applied, since usdy does not exist on ethereum
  it("swap 0.075 eth to usdy", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "0.075",
          inputToken: "eth",
          outputToken: "usdy",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
    );
  }, 500000);

  // unsupported
  it.skip("withdraw 100 usdc.e from lodestar on arbitrum and buy 500 rosnet", async () => {
    const accountAddress = "0xe7CE49b0ce6a3C4B9E1c362A614661399B9BaB71";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "lodestar",
          amount: "100",
          token: "usdc.e",
          chainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "usdc.e",
          outputToken: "dai",
          chainName: "arbitrum",
          outputAmount: "50",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it("on arbitrum, swap 20 usdc to grail on camelot", async () => {
    // FAILS
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "swap",
        args: {
          protocolName: "camelot",
          inputAmount: "20",
          inputToken: "usdc",
          outputToken: "grail",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdc: 20,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it("swap half of degen for 0x0d97f261b1e88845184f678e2d1e7a98d9fd38de on base", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "half",
          inputToken: "degen",
          outputToken: "0x0d97f261b1e88845184f678e2d1e7a98d9fd38de",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
        degen: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
    );
  });

  it.skip("swap all of my weth for frax on arbitrum, lend frax on lodestar", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "weth",
          outputToken: "frax",
          chainName: "arbitrum",
        },
      },
      {
        name: "lend",
        args: {
          protocolName: "lodestar",
          token: "frax",
          chainName: "arbitrum",
          amount: "outputAmount",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        weth: 2,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  }, 500000);

  it("transfer 5.4 matic to 0x5b7567ed1bb7c338a20af4efb72e73dd6ef1df61 on polygon", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "transfer",
        args: {
          amount: "5.4",
          token: "matic",
          recipient: "0x5b7567ed1bb7c338a20af4efb72e73dd6ef1df61",
          chainName: "polygon",
        },
      },
    ];
    const initialBalances = {
      polygon: {
        matic: 10,
      },
    };
    const balanceChanges = {
      polygon: {
        matic: -5.4,
      },
    };
    await test(
      accountAddress,
      actions,
      "Polygon",
      { 137: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap all of my dai for uni via openocean on arbitrum", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "swap",
        args: {
          protocolName: "openocean",
          inputAmount: "all",
          inputToken: "dai",
          outputToken: "uni",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        dai: 1000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  // too many simTxs (we limited to 10) to check with third action
  it("swap all of my tokens on base to usdc. bridge usdc from base to polygon. on polygon, swap usdc for yup", async () => {
    const accountAddress = "0x52dc39fb37a5a821ca605dea399e42231966e928";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "all",
          outputToken: "usdc",
          chainName: "base",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "usdc",
          sourceChainName: "base",
          destinationChainName: "polygon",
        },
      },
      // {
      //   name: "swap",
      //   args: {
      //     inputAmount: "outputAmount",
      //     inputToken: "usdc",
      //     outputToken: "yup",
      //     chainName: "polygon",
      //   },
      // },
    ];
    const initialBalances = {
      base: {
        eth: 1,
      },
      polygon: {
        matic: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 137: undefined, 8453: undefined },
      initialBalances,
    );
  }, 1500000);

  it("bridge eth from eth blockchain to arb blockchain", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "eth",
          sourceChainName: "ethereum",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 10,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
    );
  });

  // unsupported
  it.skip("on arbitrum swap 100% of my gmx to eth, lend 0.01 eth to lodestar, and borrow 0.005 usdc from lodestar", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "100%",
          inputToken: "gmx",
          outputToken: "eth",
          chainName: "arbitrum",
        },
      },
      {
        name: "lend",
        args: {
          protocolName: "lodestar",
          amount: "0.7",
          token: "eth",
          chainName: "arbitrum",
        },
      },
      {
        name: "borrow",
        args: {
          protocolName: "lodestar",
          amount: "500",
          token: "usdc",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        gmx: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it.skip("deposit 100 dai into the sy-reth pool on arbitrum", async () => {
    const accountAddress = "0x58cCd9d9F461FC2D821CbaB2E631A348f52dc795";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "pendle",
          poolName: "sy-reth",
          amount: "100",
          token: "dai",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        dai: 100,
      },
    };
    const balanceChanges = {
      arbitrum: {
        dai: -100,
        "sy-reth": "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("deposit 100 susde and 100 pt-susde to pendle on ethereum", async () => {
    const accountAddress = "0x58cCd9d9F461FC2D821CbaB2E631A348f52dc795";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "pendle",
          amount: "100",
          token: "susde",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "pendle",
          amount: "100",
          token: "pt-susde",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        susde: 100,
        "pt-susde": 100,
      },
    };
    const balanceChanges = {
      ethereum: {
        susde: "-",
        "pt-susde": "-",
        "susde-lp": "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it.skip("deposit 1 pt-weeth and 1 sy-weeth to pendle on arbitrum", async () => {
    const accountAddress = "0x58cCd9d9F461FC2D821CbaB2E631A348f52dc795";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "pendle",
          amount: "1",
          token: "pt-weeth",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "pendle",
          amount: "1",
          token: "sy-weeth",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        "pt-weeth": 1,
        "sy-weeth": 1,
      },
    };
    const balanceChanges = {
      arbitrum: {
        "pt-weeth": "-",
        "sy-weeth": "-",
        "weeth-lp": "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it.skip("deposit 1 rseth into pt-rseth pool on arbitrum", async () => {
    const accountAddress = "0x58cCd9d9F461FC2D821CbaB2E631A348f52dc795";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "pendle",
          poolName: "pt-rseth-sep2024",
          amount: "0.01",
          token: "rseth",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        rseth: 0.01,
      },
    };
    const balanceChanges = {
      arbitrum: {
        rseth: -0.01,
        "pt-rseth-26dec2024": "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("deposit 100 susde into the yt-susde pool on ethereum", async () => {
    const accountAddress = "0x58cCd9d9F461FC2D821CbaB2E631A348f52dc795";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "pendle",
          poolName: "yt-susde",
          amount: "100",
          token: "susde",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        susde: 100,
      },
    };
    const balanceChanges = {
      ethereum: {
        susde: -100,
        "yt-susde-26dec2024": "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("deposit 100 susde into the susde-26dec2024-lp pool on ethereum - 1", async () => {
    const accountAddress = "0x58cCd9d9F461FC2D821CbaB2E631A348f52dc795";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "pendle",
          poolName: "susde-26dec2024-lp",
          amount: "100",
          token: "susde",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        susde: 100,
      },
    };
    const balanceChanges = {
      ethereum: {
        susde: -100,
        "0xa0ab94debb3cc9a7ea77f3205ba4ab23276fed08": "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("deposit 100 susde into the susde-26dec2024-lp pool on ethereum - 2", async () => {
    const accountAddress = "0x58cCd9d9F461FC2D821CbaB2E631A348f52dc795";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "pendle",
          poolName: "susde-dec2024-lp",
          amount: "100",
          token: "susde",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        susde: 100,
      },
    };
    const balanceChanges = {
      ethereum: {
        susde: -100,
        "0xa0ab94debb3cc9a7ea77f3205ba4ab23276fed08": "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("deposit 2 eth in the pendle reth lp pool on arbitrum", async () => {
    const accountAddress = "0x58cCd9d9F461FC2D821CbaB2E631A348f52dc795";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "pendle",
          poolName: "reth-lp",
          amount: "2",
          token: "eth",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 3,
      },
    };
    const balanceChanges = {
      arbitrum: {
        eth: -2,
        "0x14fbc760efaf36781cb0eb3cb255ad976117b9bd": "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("deposit 100 susde into the susde pool on ethereum", async () => {
    const accountAddress = "0x58cCd9d9F461FC2D821CbaB2E631A348f52dc795";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "pendle",
          poolName: "susde",
          amount: "100",
          token: "susde",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        susde: 100,
      },
    };
    const balanceChanges = {
      ethereum: {
        susde: -100,
        "0xa0ab94debb3cc9a7ea77f3205ba4ab23276fed08": "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("withdraw 1 ezETH from the YT-ezETH-26sep2024 pool", async () => {
    const accountAddress = "0x5643a8c91aF16778dC8168d4920eC0e6BB059da9";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "pendle",
          poolName: "YT-ezETH",
          amount: "1",
          token: "ezeth",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it.skip("withdraw 1 wstETH from the PT-wstETH pool on Optimism", async () => {
    const accountAddress = await getTopHolder(
      "0xf4225f061e5e01aa59de5e615729a9180301eb07",
      10,
    );
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "pendle",
          poolName: "PT-wstETH-sep2024",
          token: "wstETH",
          chainName: "optimism",
        },
      },
    ];
    const initialBalances = {
      optimism: {
        eth: 1,
      },
    };
    await test(
      accountAddress || "",
      actions,
      "Optimism",
      { 10: undefined },
      initialBalances,
    );
  });

  it("withdraw usdc from the PT-wstETH pool on Optimism", async () => {
    const accountAddress = "0x0d1964af670C06F76Cc5959E0fb4c2Bc187FB8f8";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "pendle",
          poolName: "PT-wstETH",
          token: "usdc",
          chainName: "optimism",
        },
      },
    ];
    const initialBalances = {
      optimism: {
        eth: 1,
      },
    };
    await testFail(
      accountAddress,
      actions,
      "Optimism",
      { 10: undefined },
      /Withdrawing from pendle PT-wstETH pool is not supported with usdc/i,
      initialBalances,
    );
  });

  it("swap bnb for eth", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "bnb",
          outputToken: "eth",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        bnb: 30,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it("swap 0x1f9840a85d5af5bf1d1762f925bdaddc4201f984 to 0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9", async () => {
    const accountAddress = "0x91a38544c01528C41d19f5dB41860ce64A7Ddff1";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
          outputToken: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        uni: 50,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it("swap 0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2 to 0x514910771af9ca656af840dff83e8264ecf986ca", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2",
          outputToken: "0x514910771af9ca656af840dff83e8264ecf986ca",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        mkr: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it("transfer 0xc00e94cb662c3520282e6f5717214004a7f26888 to 0x70d8b972ef2a751f0db12c0e67dd21ae7b646797", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "transfer",
        args: {
          token: "0xc00e94cb662c3520282e6f5717214004a7f26888",
          recipient: "0x70d8b972ef2a751f0db12c0e67dd21ae7b646797",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        comp: 20,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it.skip("deposit my aero into the usdc-aero pool on aerodrome on base", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "aerodrome",
          poolName: "usdc-aero",
          amount: "all",
          token: "aero",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
        usdc: 100,
        aero: 10,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
    );
  });

  it.skip("deposit my weth and usdc into the weth-usdc pool on aerodrome on base", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "aerodrome",
          poolName: "weth-usdc",
          token: "weth",
          chainName: "base",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "aerodrome",
          poolName: "weth-usdc",
          token: "usdc",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
        weth: 1,
        usdc: 1000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
    );
  });

  it.skip("deposit 100 usdc into dai-usdc pool of aerodrome", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "aerodrome",
          poolName: "dai-usdc",
          amount: "100",
          token: "usdc",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
        usdc: 100,
        dai: 200,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
    );
  });

  it.skip("withdraw all of my degen from degen-eth pool on aerodrome", async () => {
    const accountAddress = "0x1667764DD15D6dfaB71fEBfa6D11eaDb7E9BC1ef";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "aerodrome",
          amount: "all",
          token: "degen",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
      },
    };
    const balanceChanges = {
      base: {
        degen: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it.skip("withdraw all of my degen from degen-eth aerodrome pool", async () => {
    const accountAddress = "0x1667764DD15D6dfaB71fEBfa6D11eaDb7E9BC1ef";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "aerodrome",
          poolName: "degen-eth",
          amount: "all",
          token: "degen",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
      },
    };
    const balanceChanges = {
      base: {
        degen: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it.skip("withdraw my eth-grail lp from camelot, swap half of my grail to eth and bridge to optimism", async () => {
    const accountAddress = "0xd06657f02c266746b502df0a79255ae69ebdbb95";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "camelot",
          token: "eth-grail lp",
          amount: "all",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "half",
          inputToken: "grail",
          outputToken: "eth",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "eth",
          destinationChainName: "optimism",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
      optimism: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 10: undefined, 42161: undefined },
      initialBalances,
    );
  });

  it.skip("withdraw my eth-grail lp from camelot", async () => {
    const accountAddress = "0xd06657f02c266746b502df0a79255ae69ebdbb95";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "camelot",
          token: "eth-grail lp",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it("wrap half the eth i have", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "half",
          inputToken: "eth",
          outputToken: "weth",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 10,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it("bridge 25 % of eth to optimism and buy uni", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "25%",
          token: "eth",
          destinationChainName: "optimism",
        },
      },
      {
        name: "swap",
        args: {
          outputToken: "uni",
          chainName: "optimism",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 10,
      },
      optimism: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 10: undefined },
      initialBalances,
    );
  }, 500000);

  it.skip("withdraw from all my camelot positions", async () => {
    const accountAddress = "0xa5ef861278d7bf18a8a2068a01d66fbded93a1bd";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "camelot",
          poolName: "all",
          amount: "all",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it("swap usdc to eth on linea", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdc",
          inputAmount: "all",
          outputToken: "eth",
          chainName: "linea",
        },
      },
    ];
    const initialBalances = {
      linea: {
        eth: 1,
        usdc: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Linea",
      { 59144: undefined },
      initialBalances,
    );
  });

  it("swap eth to usdc on linea", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "1",
          outputToken: "usdc",
          chainName: "linea",
        },
      },
    ];
    const initialBalances = {
      linea: {
        eth: 1.5,
      },
    };
    await test(
      accountAddress,
      actions,
      "Linea",
      { 59144: undefined },
      initialBalances,
    );
  });

  // unsupported
  it.skip("bridge usdc to ethereum from linea", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "usdc",
          amount: "all",
          destinationChainName: "ethereum",
          sourceChainName: "linea",
        },
      },
    ];
    const initialBalances = {
      linea: {
        eth: 1,
        usdc: 200,
      },
    };
    await test(
      accountAddress,
      actions,
      "Linea",
      { 1: undefined, 59144: undefined },
      initialBalances,
    );
  });

  it("bridge usdc from ethereum to linea", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "usdc",
          amount: "all",
          sourceChainName: "ethereum",
          destinationChainName: "linea",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdc: 200,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 59144: undefined },
      initialBalances,
    );
  });

  it("bridge eth to ethereum from linea", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "eth",
          amount: "1",
          destinationChainName: "ethereum",
          sourceChainName: "linea",
        },
      },
    ];
    const initialBalances = {
      linea: {
        eth: 1.5,
      },
    };
    await test(
      accountAddress,
      actions,
      "Linea",
      { 1: undefined, 59144: undefined },
      initialBalances,
    );
  });

  it("bridge eth from ethereum to linea", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "eth",
          amount: "1",
          sourceChainName: "ethereum",
          destinationChainName: "linea",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 59144: undefined },
      initialBalances,
    );
  });

  it("transfer usdc to niyant.eth on linea", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "transfer",
        args: {
          token: "usdc",
          amount: "all",
          chainName: "linea",
          recipient: "niyant.eth",
        },
      },
    ];
    const initialBalances = {
      linea: {
        eth: 1,
        usdc: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Linea",
      { 59144: undefined },
      initialBalances,
    );
  });

  it("transfer eth to niyant.eth on linea", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "transfer",
        args: {
          token: "eth",
          amount: "1",
          chainName: "linea",
          recipient: "niyant.eth",
        },
      },
    ];
    const initialBalances = {
      linea: {
        eth: 1.5,
      },
    };
    await test(
      accountAddress,
      actions,
      "Linea",
      { 59144: undefined },
      initialBalances,
    );
  });

  it("swap usdc to matic on polygon", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdc",
          inputAmount: "all",
          outputToken: "matic",
          chainName: "polygon",
        },
      },
    ];
    const initialBalances = {
      polygon: {
        matic: 1,
        usdc: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Polygon",
      { 137: undefined },
      initialBalances,
    );
  });

  it("swap matic to usdc on polygon", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "matic",
          inputAmount: "50",
          outputToken: "usdc",
          chainName: "polygon",
        },
      },
    ];
    const initialBalances = {
      polygon: {
        matic: 60,
      },
    };
    await test(
      accountAddress,
      actions,
      "Polygon",
      { 137: undefined },
      initialBalances,
    );
  });

  it("bridge usdc to ethereum from polygon", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "usdc",
          amount: "all",
          destinationChainName: "ethereum",
          sourceChainName: "polygon",
        },
      },
    ];
    const initialBalances = {
      polygon: {
        matic: 100,
        usdc: 200,
      },
    };
    await test(
      accountAddress,
      actions,
      "Polygon",
      { 1: undefined, 137: undefined },
      initialBalances,
    );
  });

  it("bridge usdc from ethereum to polygon", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "usdc",
          amount: "all",
          sourceChainName: "ethereum",
          destinationChainName: "polygon",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        matic: 1,
        usdc: 200,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 137: undefined },
      initialBalances,
    );
  });

  it("bridge matic to ethereum from polygon", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "matic",
          amount: "100",
          destinationChainName: "ethereum",
          sourceChainName: "polygon",
        },
      },
    ];
    const initialBalances = {
      polygon: {
        matic: 101,
      },
    };
    await test(
      accountAddress,
      actions,
      "Polygon",
      { 1: undefined, 137: undefined },
      initialBalances,
    );
  });

  it("bridge matic from ethereum to polygon", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "matic",
          amount: "100",
          sourceChainName: "ethereum",
          destinationChainName: "polygon",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        matic: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 137: undefined },
      initialBalances,
    );
  });

  it("transfer usdc to niyant.eth on polygon", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "transfer",
        args: {
          token: "usdc",
          amount: "all",
          chainName: "polygon",
          recipient: "niyant.eth",
        },
      },
    ];
    const initialBalances = {
      polygon: {
        matic: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Polygon",
      { 137: undefined },
      initialBalances,
    );
  });

  it("transfer matic to niyant.eth on polygon", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "transfer",
        args: {
          token: "matic",
          amount: "1",
          chainName: "polygon",
          recipient: "niyant.eth",
        },
      },
    ];
    const initialBalances = {
      polygon: {
        matic: 1.5,
      },
    };
    const balanceChanges = {
      polygon: {
        matic: -1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Polygon",
      { 137: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("swap usdc to ftm on fantom", async () => {
    const accountAddress = "0x406C22b8740ae955b04fD11c2061E053807E2A69";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdc",
          inputAmount: "all",
          outputToken: "ftm",
          chainName: "fantom",
        },
      },
    ];
    const initialBalances = {
      fantom: {
        ftm: 10,
        usdc: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Fantom",
      { 250: undefined },
      initialBalances,
    );
  });

  it.skip("swap ftm to usdc on fantom", async () => {
    const accountAddress = "0x406C22b8740ae955b04fD11c2061E053807E2A69";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "ftm",
          inputAmount: "50",
          outputToken: "usdc",
          chainName: "fantom",
        },
      },
    ];
    const initialBalances = {
      fantom: {
        ftm: 60,
      },
    };
    await test(
      accountAddress,
      actions,
      "Fantom",
      { 250: undefined },
      initialBalances,
    );
  });

  it.skip("bridge usdc to ethereum from fantom", async () => {
    const accountAddress = "0x406C22b8740ae955b04fD11c2061E053807E2A69";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "usdc",
          amount: "all",
          destinationChainName: "ethereum",
          sourceChainName: "fantom",
        },
      },
    ];
    const initialBalances = {
      fantom: {
        ftm: 100,
        usdc: 200,
      },
    };
    await test(
      accountAddress,
      actions,
      "Fantom",
      { 1: undefined, 250: undefined },
      initialBalances,
    );
  });

  it.skip("bridge usdc from ethereum to fantom", async () => {
    const accountAddress = "0x406C22b8740ae955b04fD11c2061E053807E2A69";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "usdc",
          amount: "all",
          sourceChainName: "ethereum",
          destinationChainName: "fantom",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        ftm: 1,
        usdc: 200,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 250: undefined },
      initialBalances,
    );
  });

  it.skip("bridge ftm to ethereum from fantom", async () => {
    const accountAddress = "0x406C22b8740ae955b04fD11c2061E053807E2A69";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "ftm",
          amount: "100",
          destinationChainName: "ethereum",
          sourceChainName: "fantom",
        },
      },
    ];
    const initialBalances = {
      fantom: {
        ftm: 101,
      },
    };
    await test(
      accountAddress,
      actions,
      "Fantom",
      { 1: undefined, 250: undefined },
      initialBalances,
    );
  });

  it.skip("bridge ftm from ethereum to fantom", async () => {
    const accountAddress = "0x406C22b8740ae955b04fD11c2061E053807E2A69";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "ftm",
          amount: "100",
          sourceChainName: "ethereum",
          destinationChainName: "fantom",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        ftm: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 250: undefined },
      initialBalances,
    );
  });

  it.skip("transfer usdt to niyant.eth on fantom", async () => {
    const accountAddress = "0x406C22b8740ae955b04fD11c2061E053807E2A69";
    const actions = [
      {
        name: "transfer",
        args: {
          token: "usdt",
          amount: "all",
          chainName: "fantom",
          recipient: "niyant.eth",
        },
      },
    ];
    const initialBalances = {
      fantom: {
        ftm: 1,
        usdt: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Fantom",
      { 250: undefined },
      initialBalances,
    );
  });

  it.skip("transfer ftm to niyant.eth on fantom", async () => {
    const accountAddress = "0x406C22b8740ae955b04fD11c2061E053807E2A69";
    const actions = [
      {
        name: "transfer",
        args: {
          token: "ftm",
          amount: "1",
          chainName: "fantom",
          recipient: "niyant.eth",
        },
      },
    ];
    const initialBalances = {
      fantom: {
        ftm: 1.5,
      },
    };
    await test(
      accountAddress,
      actions,
      "Fantom",
      { 250: undefined },
      initialBalances,
    );
  });

  it("swap usdc to bnb on bsc", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdc",
          inputAmount: "all",
          outputToken: "bnb",
          chainName: "bsc",
        },
      },
    ];
    const initialBalances = {
      bsc: {
        bnb: 1,
        usdc: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "BSC",
      { 56: undefined },
      initialBalances,
    );
  });

  it("swap bnb to usdc on bsc", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "bnb",
          inputAmount: "50",
          outputToken: "usdc",
          chainName: "bsc",
        },
      },
    ];
    const initialBalances = {
      bsc: {
        bnb: 60,
      },
    };
    await test(
      accountAddress,
      actions,
      "BSC",
      { 56: undefined },
      initialBalances,
    );
  });

  it("bridge usdc to ethereum from bsc", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "usdc",
          amount: "all",
          destinationChainName: "ethereum",
          sourceChainName: "bsc",
        },
      },
    ];
    const initialBalances = {
      bsc: {
        bnb: 100,
        usdc: 200,
      },
    };
    await test(
      accountAddress,
      actions,
      "BSC",
      { 1: undefined, 56: undefined },
      initialBalances,
    );
  });

  it("bridge usdc from ethereum to bsc", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "usdc",
          amount: "all",
          sourceChainName: "ethereum",
          destinationChainName: "bsc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        bnb: 1,
        usdc: 200,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 56: undefined },
      initialBalances,
    );
  });

  // no bridge route found
  it.skip("bridge bnb to ethereum from bsc", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "bnb",
          amount: "100",
          destinationChainName: "ethereum",
          sourceChainName: "bsc",
        },
      },
    ];
    const initialBalances = {
      bsc: {
        bnb: 101,
      },
    };
    await test(
      accountAddress,
      actions,
      "BSC",
      { 1: undefined, 56: undefined },
      initialBalances,
    );
  });

  // BNB approval not works for lifi, even though it quotes bridge
  it.skip("bridge bnb from ethereum to bsc", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "bnb",
          amount: "100",
          sourceChainName: "ethereum",
          destinationChainName: "bsc",
          protocolName: "lifi",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        bnb: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 56: undefined },
      initialBalances,
    );
  });

  it("transfer usdc to niyant.eth on bsc", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "transfer",
        args: {
          token: "usdc",
          amount: "all",
          chainName: "bsc",
          recipient: "niyant.eth",
        },
      },
    ];
    const initialBalances = {
      bsc: {
        bnb: 1,
        usdc: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "BSC",
      { 56: undefined },
      initialBalances,
    );
  });

  it("transfer bnb to niyant.eth on bsc", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "transfer",
        args: {
          token: "bnb",
          amount: "1",
          chainName: "bsc",
          recipient: "niyant.eth",
        },
      },
    ];
    const initialBalances = {
      bsc: {
        bnb: 1.5,
      },
    };
    await test(
      accountAddress,
      actions,
      "BSC",
      { 56: undefined },
      initialBalances,
    );
  });

  // unsupported
  it.skip("close arb position on gmx and swap to usdc", async () => {
    const accountAddress = "0x6859dA14835424957a1E6B397D8026B1D9fF7e1E";
    const actions = [
      {
        name: "close",
        args: {
          protocolName: "gmx",
          inputToken: "arb",
          chainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "arb",
          outputToken: "usdc",
          chainName: "arbitrum",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: 235170000 },
      /GMX returns funds after a delay, so we can't simulate this multi step action. Try close first, then proceed with the rest of the actions./i,
    );
  });

  it.skip("close my 2x leverage weth position on gmx on arbitrum. then bridge it from arbitrum to base and buy $DEGEN", async () => {
    const accountAddress = "0x6859dA14835424957a1E6B397D8026B1D9fF7e1E";
    const actions = [
      {
        name: "close",
        args: {
          protocolName: "gmx",
          inputToken: "weth",
          chainName: "arbitrum",
          leverageMultiplier: "2x",
        },
      },
      {
        name: "bridge",
        args: {
          token: "weth",
          amount: "outputAmount",
          sourceChainName: "arbitrum",
          destinationChainName: "base",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "weth",
          outputToken: "dege",
          chainName: "base",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: 235170000, 8453: undefined },
      /GMX returns funds after a delay, so we can't simulate this multi step action. Try close first, then proceed with the rest of the actions./i,
    );
  });

  it("transfer all eth to niyant.eth on ethereum", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "transfer",
        args: {
          token: "eth",
          amount: "all",
          chainName: "ethereum",
          recipient: "niyant.eth",
        },
      },
    ];
    const initialBalances = {};
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it("transfer all eth to niyant.eth on arbitrum", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "transfer",
        args: {
          token: "eth",
          amount: "all",
          chainName: "arbitrum",
          recipient: "niyant.eth",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it("transfer all eth to niyant.eth on base", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "transfer",
        args: {
          token: "eth",
          amount: "all",
          chainName: "base",
          recipient: "niyant.eth",
        },
      },
    ];
    const initialBalances = {};
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
    );
  });

  it("transfer all matic to niyant.eth on polygon", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "transfer",
        args: {
          token: "matic",
          amount: "all",
          chainName: "polygon",
          recipient: "niyant.eth",
        },
      },
    ];
    const initialBalances = {
      polygon: {
        matic: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Polygon",
      { 137: undefined },
      initialBalances,
    );
  });

  // avalanche get avax balance fails
  it.skip("transfer all avax to niyant.eth on avalanche", async () => {
    const accountAddress = "0x91a88dd9c43e1e6d580abe4c54f1b6b53900a644";
    const actions = [
      {
        name: "transfer",
        args: {
          token: "avax",
          amount: "all",
          chainName: "avalanche",
          recipient: "niyant.eth",
        },
      },
    ];
    const initialBalances = {
      avalanche: {
        avax: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Avalanche",
      { 43114: undefined },
      initialBalances,
    );
  });

  it("swap grail to weth on polygon", async () => {
    const accountAddress = "0x35d2085239e04e9B0BD5082F28044170ac6fbdad";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "grail",
          outputToken: "weth",
          chainName: "polygon",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
      polygon: {
        matic: 10,
      },
    };
    const balanceChanges = {
      arbitrum: {
        grail: "-",
      },
      polygon: {
        weth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Polygon",
      { 137: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("bridge dai to arbitrum from polygon", async () => {
    const accountAddress = "0x35d2085239e04e9B0BD5082F28044170ac6fbdad";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "dai",
          sourceChainName: "polygon",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        dai: 100,
      },
      ethereum: {
        dai: 100,
      },
    };
    await testFail(
      accountAddress,
      actions,
      "Polygon",
      { 137: undefined, 1: undefined, 42161: undefined },
      /Not able to bridge dai, you don't have dai on polygon, only on ethereum, arbitrum./i,
      initialBalances,
    );
  }, 500000);

  it("swap dai to weth on arbitrum", async () => {
    const accountAddress = "0x28129f5B8b689EdcB7B581654266976aD77C719B";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "dai",
          outputToken: "weth",
          chainName: "arbitrum",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      /Not able to swap dai, you don't have dai on arbitrum/i,
    );
  });

  it("swap all tokens to usdc on arbitrum and transfer 10 usdc to niyant.eth", async () => {
    // FAILS
    const accountAddress = "0x4f5ac4c516a6f823f65556f54e6aed0ddadef5ad";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "all",
          outputToken: "usdc",
          outputAmount: "20",
        },
      },
      {
        name: "transfer",
        args: {
          amount: "10",
          token: "usdc",
          recipient: "niyant.eth",
        },
      },
    ];
    const [ethPrice] = await getTokenPrices(accountAddress, ["eth"]);
    const balanceChanges = {
      arbitrum: {
        eth: -20 / ethPrice,
        usdc: 10,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      undefined,
      balanceChanges,
    );
  });

  it("swap all eth to usdc on ethereum", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "all",
          outputToken: "usdc",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {};
    const balanceChanges = {
      ethereum: {
        eth: "-",
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap all eth to usdc on arbitrum", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "all",
          outputToken: "usdc",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      arbitrum: {
        eth: "-",
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap all eth to usdc on base", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "all",
          outputToken: "usdc",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
      },
    };
    const balanceChanges = {
      base: {
        eth: "-",
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap all matic to usdc on polygon", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "matic",
          inputAmount: "all",
          outputToken: "usdc",
          chainName: "polygon",
        },
      },
    ];
    const initialBalances = {
      polygon: {
        matic: 100,
      },
    };
    const balanceChanges = {
      polygon: {
        matic: "-",
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Polygon",
      { 137: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  // avalanche get avax balance fails
  it.skip("swap all avax to usdc on avalanche", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "avax",
          inputAmount: "all",
          outputToken: "usdc",
          chainName: "avalanche",
        },
      },
    ];
    const initialBalances = {
      avalanche: {
        avax: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Avalanche",
      { 43114: undefined },
      initialBalances,
    );
  });

  it("bridge all eth from ethereum to arbitrum", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "eth",
          amount: "all",
          sourceChainName: "ethereum",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {};
    const balanceChanges = {
      ethereum: {
        eth: "-",
      },
      arbitrum: {
        eth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("bridge all eth from arbitrum to ethereum", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "eth",
          amount: "all",
          sourceChainName: "arbitrum",
          destinationChainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      arbitrum: {
        eth: "-",
      },
      ethereum: {
        eth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("bridge all eth from base to ethereum", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "eth",
          amount: "all",
          sourceChainName: "base",
          destinationChainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
      },
    };
    const balanceChanges = {
      base: {
        eth: "-",
      },
      ethereum: {
        eth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined, 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("bridge all matic from polygon to ethereum", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "matic",
          amount: "all",
          sourceChainName: "polygon",
          destinationChainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      polygon: {
        matic: 200,
      },
    };
    await test(
      accountAddress,
      actions,
      "Polygon",
      { 137: undefined, 1: undefined },
      initialBalances,
    );
  });

  // avalanche get avax balance fails
  it.skip("bridge all avax from avalanche to ethereum", async () => {
    const accountAddress = "0xea44fae3f14f1a2a25cd93194ee279cb0af9f528";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "avax",
          amount: "all",
          sourceChainName: "avalanche",
          destinationChainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      avalanche: {
        avax: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Avalanche",
      { 43114: undefined, 1: undefined },
      initialBalances,
    );
  });

  it("swap all eth to usdb on blast", async () => {
    const accountAddress = "0xc502c85aace0b4e81b580523d0668020f9b9ce34";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "all",
          outputToken: "usdb",
          chainName: "blast",
        },
      },
    ];
    const initialBalances = {
      blast: {
        eth: 1,
      },
    };
    const balanceChanges = {
      blast: {
        eth: "-",
        usdb: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Blast",
      { 81457: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap all eth to usdb on blast on thruster", async () => {
    const accountAddress = "0xc502c85aace0b4e81b580523d0668020f9b9ce34";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "all",
          outputToken: "usdb",
          chainName: "blast",
          protocolName: "thruster",
        },
      },
    ];
    const initialBalances = {
      blast: {
        eth: 1,
      },
    };
    const balanceChanges = {
      blast: {
        eth: "-",
        usdb: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Blast",
      { 81457: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap .02 eth on arb to usdc then bridge all of my usdc from arb to base then swap all usdc to bald on base", async () => {
    const accountAddress = "0xc502c85aace0b4e81b580523d0668020f9b9ce34";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "0.02",
          outputToken: "usdc",
          chainName: "arbitrum",
        },
      },
      {
        name: "bridge",
        args: {
          token: "usdc",
          amount: "all",
          sourceChainName: "arbitrum",
          destinationChainName: "base",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "usdc",
          inputAmount: "all",
          outputToken: "bald",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
      base: {
        eth: 1,
      },
    };
    const balanceChanges = {
      arbitrum: {
        eth: "-",
      },
      base: {
        bald: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 700000);

  it("transfer all eth to niyant.eth on blast", async () => {
    const accountAddress = "0xc502c85aace0b4e81b580523d0668020f9b9ce34";
    const actions = [
      {
        name: "transfer",
        args: {
          token: "eth",
          amount: "all",
          chainName: "blast",
          recipient: "niyant.eth",
        },
      },
    ];
    const initialBalances = {
      blast: {
        eth: 1,
      },
    };
    const balanceChanges = {
      blast: {
        eth: 0,
      },
    };
    await test(
      accountAddress,
      actions,
      "Blast",
      { 81457: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("bridge all eth from blast to ethereum", async () => {
    const accountAddress = "0xc502c85aace0b4e81b580523d0668020f9b9ce34";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "eth",
          amount: "all",
          sourceChainName: "blast",
          destinationChainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      blast: {
        eth: 1,
      },
    };
    const balanceChanges = {
      blast: {
        eth: "-",
      },
      ethereum: {
        eth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Blast",
      { 81457: undefined, 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("bridge all eth from ethereum to blast", async () => {
    const accountAddress = "0xc502c85aace0b4e81b580523d0668020f9b9ce34";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "eth",
          amount: "all",
          sourceChainName: "ethereum",
          destinationChainName: "blast",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      ethereum: {
        eth: "-",
      },
      blast: {
        eth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 81457: undefined, 1: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 350000);

  it("bridge all eth from ethereum to blast and swap to usdb", async () => {
    const accountAddress = "0xc502c85aace0b4e81b580523d0668020f9b9ce34";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "eth",
          amount: "all",
          sourceChainName: "ethereum",
          destinationChainName: "blast",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "outputAmount",
          outputToken: "usdb",
          chainName: "blast",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      ethereum: {
        eth: "-",
      },
      blast: {
        usdb: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 81457: undefined, 1: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 350000);

  it("swap all eth to weth, bridge to blast, and swap to usdb", async () => {
    const accountAddress = "0xc502c85aace0b4e81b580523d0668020f9b9ce34";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "all",
          outputToken: "weth",
          chainName: "ethereum",
        },
      },
      {
        name: "bridge",
        args: {
          token: "weth",
          amount: "outputAmount",
          sourceChainName: "ethereum",
          destinationChainName: "blast",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "weth",
          inputAmount: "outputAmount",
          outputToken: "usdb",
          chainName: "blast",
        },
      },
    ];
    // const initialBalances = {
    // ethereum: {
    // eth: 1,
    // },
    // };
    // const balanceChanges = {
    // ethereum: {
    // eth: "-",
    // },
    // blast: {
    // usdb: "+",
    // },
    // };
    await testFail(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 81457: undefined },
      "Simulations for actions after a bridge to blast are not supported. Try bridging first and then performing the rest of your actions in a new prompt.",
    );
    // await test(
    // accountAddress,
    // actions,
    // "Ethereum",
    // { 81457: undefined, 1: undefined },
    // initialBalances,
    // balanceChanges,
    // );
  });

  it("swap 5 yes to weth on blast", async () => {
    const accountAddress = "0xDdA55D2564fF205750dEFB21f4bc3E37c5e6a643";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "yes",
          inputAmount: "5",
          outputToken: "weth",
          chainName: "blast",
        },
      },
    ];
    const initialBalances = {
      blast: {
        yes: 100,
        eth: 1,
      },
    };
    const balanceChanges = {
      blast: {
        yes: "-",
        weth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Blast",
      { 81457: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap 0.01 eth to 0xb8e0b7d0df89673e4f6f82a66ef642a1cd46e010 on base", async () => {
    const accountAddress = "0xDdA55D2564fF205750dEFB21f4bc3E37c5e6a643";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "0.01",
          outputToken: "0xb8e0b7d0df89673e4f6f82a66ef642a1cd46e010",
          chainName: "base",
        },
      },
    ];
    await test(accountAddress, actions, "Base", { 8453: undefined });
  });

  it("unstake from my etherfi position", async () => {
    const accountAddress = "0x4B7D801E954C1A529A3813Cc21410d093A332AeC";
    const actions = [
      {
        name: "unstake",
        args: {
          protocolName: "etherfi",
          chainName: "ethereum",
          token: "ETH",
          amount: "0.025",
        },
      },
    ];
    const initialBalances = {
      Ethereum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      Ethereum: {
        eth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: 19629120 },
      initialBalances,
      balanceChanges,
    );
  });

  it("claim from my etherfi request fail with no position", async () => {
    const accountAddress = "0x4f213bbb34a856f3a7e01353dfa51311683cb616";
    const actions = [
      {
        name: "claim",
        args: {
          protocolName: "etherfi",
          chainName: "ethereum",
          token: "ETH",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Ethereum",
      { 1: 19654630 },
      /No pending request to claim for 0x([0-9a-f])+ on etherfi/i,
    );
  });

  it("swap my eth on arbitrum for 30 usdc and short sol with 15 with 2x on hyperliquid", async () => {
    const accountAddress = "0xa4a2f21517073da2557fcabbca9356a7a82b6a68";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "usdc",
          outputAmount: "30",
          chainName: "arbitrum",
        },
      },
      {
        name: "short",
        args: {
          protocolName: "hyperliquid",
          inputToken: "outputToken",
          inputAmount: "15",
          outputToken: "sol",
          leverageMultiplier: "2x",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  }, 500000);

  it("swap most eth to usdc", async () => {
    const accountAddress = "0x4f213bbb34a856f3a7e01353dfa51311683cb616";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "",
          outputToken: "usdc",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      Ethereum: {
        eth: 1,
      },
    };
    const balance = await getEthBalanceForUser(1, accountAddress);
    actions[0].args.inputAmount = ethers.formatEther(
      balance + ethers.parseEther("0.96"),
    );
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  // degen exists on main chains, improper token pick
  it.skip("bridge 100 ondo from ethereum to arbitrum and swap it for degen", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "100",
          token: "ondo",
          sourceChainName: "ethereum",
          destinationChainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "ondo",
          outputToken: "degen",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        ondo: 100,
      },
      base: {
        eth: 1,
      },
    };
    const balanceChanges = {
      ethereum: {
        ondo: "-",
      },
      base: {
        degen: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 8453: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 1000000);

  // TODO: degen on ethereum has 65k liq, which is detected, even though the highest mcap degen is on base
  it("swap 100 ondo to degen on arbitrum", async () => {
    // FAILS
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "100",
          inputToken: "ondo",
          outputToken: "degen",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        ondo: 100,
      },
      base: {
        eth: 1,
      },
    };
    const balanceChanges = {
      ethereum: {
        ondo: "-",
        "0x1580bfe88f772116fd59b042189746af8f78f00d": "+", // degen
      },
      // base: {
      // degen: "+",
      // },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 8453: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 1000000);

  it("swap 100 ondo to eth on arbitrum and bridge to base", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "100",
          inputToken: "ondo",
          outputToken: "eth",
          chainName: "arbitrum",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "eth",
          sourceChainName: "arbitrum",
          destinationChainName: "base",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        ondo: 100,
      },
    };
    const balanceChanges = {
      ethereum: {
        ondo: "-",
      },
      base: {
        eth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 8453: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 1000000);

  it("bridge 100 ondo from arbitrum to base and swap it for weth", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "100",
          token: "ondo",
          sourceChainName: "arbitrum",
          destinationChainName: "base",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "ondo",
          outputToken: "weth",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        ondo: 100,
      },
    };
    const balanceChanges = {
      ethereum: {
        ondo: "-",
      },
      base: {
        eth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 8453: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 1000000);

  it("bridge 100 usdc from ethereum to base over debridge", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "100",
          token: "usdc",
          sourceChainName: "ethereum",
          destinationChainName: "base",
          protocolName: "debridge",
        },
      },
    ];
    const balanceChanges = {
      ethereum: {
        usdc: "-",
      },
      base: {
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 8453: undefined },
      {},
      balanceChanges,
    );
  }, 500000);

  it("stake 1 steth to kelpdao", async () => {
    const accountAddress = await getTopHolder("steth", 1);
    const actions = [
      {
        name: "stake",
        args: {
          protocolName: "kelpdao",
          amount: "1",
          token: "steth",
          chainName: "ethereum",
        },
      },
    ];
    const balanceChanges = {
      ethereum: {
        steth: "-",
        rseth: "+",
      },
    };
    await test(
      accountAddress || "",
      actions,
      "Ethereum",
      { 1: undefined },
      {},
      balanceChanges,
    );
  });

  it("stake 100 USDe to Ethena and unstake from Ethena", async () => {
    const accountAddress = "0x1c00881a4b935D58E769e7c85F5924B8175D1526";
    const actions = [
      {
        name: "stake",
        args: {
          protocolName: "Ethena",
          chainName: "Ethereum",
          token: "USDe",
          amount: "100",
        },
      },
      {
        name: "unstake",
        args: {
          protocolName: "Ethena",
          chainName: "Ethereum",
          amount: "100",
          token: "sUSDe",
        },
      },
    ];

    await test(accountAddress, actions, "Ethereum", { 1: undefined });
  });

  it("swap all my dai on base to usdc on arbitrum", async () => {
    const accountAddress = "0x024cDB696a719f37B324a852085A68786D269212";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "dai",
          sourceChainName: "base",
          destinationChainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "dai",
          outputToken: "usdc",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      base: {
        dai: 10,
        eth: 1,
      },
      arbitrum: {
        dai: 10,
        eth: 1,
      },
    };
    const balanceChanges = {
      base: {
        dai: "-",
      },
      arbitrum: {
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 8453: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 1000000);

  it("bridge all my usdc from base to arbitrum using across", async () => {
    const accountAddress = "0x024cDB696a719f37B324a852085A68786D269212";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "usdc",
          sourceChainName: "base",
          destinationChainName: "arbitrum",
          protocolName: "across",
        },
      },
    ];
    const initialBalances = {
      base: {
        usdc: 10,
      },
    };
    await testFail(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined, 42161: undefined },
      "Token usdc is not supported on base for Across.",
      initialBalances,
    );
  });

  it.skip("swap 100 usdb to weth and deposit to juice", async () => {
    const accountAddress = "0xe7cbfb8c70d423202033ad4c51ce94ce9e21cfa2";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdb",
          inputAmount: "100",
          outputToken: "weth",
          chainName: "blast",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "juice",
          token: "outputToken",
          amount: "outputAmount",
          chainName: "blast",
        },
      },
    ];
    const balanceChanges = {
      blast: {
        usdb: "-",
        [ProtocolAddresses.juice[81457]?.lweth]: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Blast",
      { 81457: undefined },
      undefined,
      balanceChanges,
    );
  });

  it.skip("swap 100 usdb to ezeth and lend to juice", async () => {
    const accountAddress = "0xe7cbfb8c70d423202033ad4c51ce94ce9e21cfa2";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdb",
          inputAmount: "100",
          outputToken: "ezeth",
          chainName: "blast",
        },
      },
      {
        name: "lend",
        args: {
          protocolName: "juice",
          token: "outputToken",
          amount: "outputAmount",
          chainName: "blast",
        },
      },
    ];
    const balanceChanges = {
      blast: {
        usdb: "-",
        [ProtocolAddresses.juice[81457]?.amezeth]: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Blast",
      { 81457: undefined },
      undefined,
      balanceChanges,
    );
  });

  it("withdraw usdb from juice and swap to weth", async () => {
    const accountAddress = "0xcf7813c6c4886e56b1fc37ff8931037ee01c9877";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "juice",
          token: "usdb",
          amount: "all",
          chainName: "blast",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "outputToken",
          inputAmount: "outputAmount",
          outputToken: "weth",
          chainName: "blast",
        },
      },
    ];
    const balanceChanges = {
      blast: {
        [ProtocolAddresses.juice[81457]?.lusdb]: "-",
        weth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Blast",
      { 81457: undefined },
      undefined,
      balanceChanges,
    );
  }, 500000);

  // juice temporarily disabled
  it.skip("lend 3 weth to juice and borrow usdb then repay", async () => {
    const accountAddress = "0x0301079dabdc9a2c70b856b2c51aca02bac10c3a";
    const actions = [
      {
        name: "lend",
        args: {
          protocolName: "juice",
          token: "weth",
          amount: "3",
          chainName: "blast",
        },
      },
      {
        name: "borrow",
        args: {
          protocolName: "juice",
          token: "usdb",
          amount: "10",
          chainName: "blast",
        },
      },
      {
        name: "repay",
        args: {
          protocolName: "juice",
          token: "usdb",
          amount: "10",
          chainName: "blast",
        },
      },
    ];
    const balanceChanges = {
      blast: {
        [ProtocolAddresses.juice[81457]?.amusdb]: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Blast",
      { 81457: undefined },
      {},
      balanceChanges,
    );
  });

  it("bridge 5 usdc.e from arbitrum to base using stargate", async () => {
    const accountAddress = "0x5458d40e2E8913f7AF6Ffed5B6E89f93e0505acB";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "5",
          token: "usdc.e",
          sourceChainName: "arbitrum",
          destinationChainName: "base",
          protocolName: "stargate",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        "usdc.e": 10,
      },
    };
    const balanceChanges = {
      arbitrum: {
        "usdc.e": "-",
      },
      base: {
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it.skip("stake to ethena on ethereum", async () => {
    const accountAddress = "0xE53FFF67f9f384d20Ebea36F43b93DC49Ed22753";
    const actions = [
      {
        name: "stake",
        args: {
          amount: "all",
          protocolName: "ethena",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usde: 100,
      },
    };
    const balanceChanges = {
      Ethereum: {
        usde: "-",
        susde: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("unstake all usde to ethena on ethereum", async () => {
    const accountAddress = "0x3f843189280a4379eb12b928afd5d96df8076679";
    const actions = [
      {
        name: "unstake",
        args: {
          amount: "all",
          protocolName: "ethena",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it("bridge 10 usdc.e from arbitrum to base", async () => {
    const accountAddress = "0x5458d40e2E8913f7AF6Ffed5B6E89f93e0505acB";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "10",
          token: "usdc.e",
          sourceChainName: "arbitrum",
          destinationChainName: "base",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        "usdc.e": 10,
      },
    };
    const balanceChanges = {
      arbitrum: {
        "usdc.e": "-",
      },
      base: {
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("long sol with 5x leverage with 0.05 weth on HL", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "long",
        args: {
          protocolName: "hyperliquid",
          inputAmount: "0.05",
          inputToken: "weth",
          outputToken: "sol",
          leverageMultiplier: "5x",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        weth: 0.05,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it.skip("close sol position on gmx", async () => {
    const accountAddress = "0x2c2f76429EAB8E2730BE4085dcdd9370B8D1a96c";
    const actions = [
      {
        name: "close",
        args: {
          protocolName: "gmx",
          inputToken: "sol",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      arbitrum: {
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: 242296897 },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap all my shib for usdc on ethereum gmx", async () => {
    const accountAddress = "0x28129f5B8b689EdcB7B581654266976aD77C719B";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "shib",
          outputToken: "usdc",
          inputAmount: "all",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        "0xfcaf0e4498e78d65526a507360f755178b804ba8": 100,
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it("sell all the aero tokens for eth", async () => {
    const accountAddress = "0x28129f5B8b689EdcB7B581654266976aD77C719B";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "aero",
          outputToken: "eth",
          inputAmount: "all",
          chainName: "optimism",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
        aero: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Optimism",
      { 10: undefined, 8453: undefined },
      initialBalances,
    );
  }, 500000);

  it.skip("swap all eth to usdc on mode", async () => {
    const accountAddress = "0xe29f5ad2a33c76ccaca2d2e3226ff80085ce4573";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "all",
          outputToken: "usdc",
        },
      },
    ];
    const initialBalances = {
      mode: {
        eth: 1,
      },
    };
    const balanceChanges = {
      mode: {
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Mode",
      { 34443: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("bridge all eth to ethereum from mode", async () => {
    const accountAddress = "0xe29f5ad2a33c76ccaca2d2e3226ff80085ce4573";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "eth",
          amount: "all",
          sourceChainName: "mode",
          destinationChainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      mode: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Mode",
      { 34443: undefined, 1: undefined },
      initialBalances,
    );
  });

  it("bridge all eth from ethereum to mode", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "eth",
          amount: "all",
          sourceChainName: "ethereum",
          destinationChainName: "mode",
        },
      },
    ];
    await test(accountAddress, actions, "Ethereum", {
      1: undefined,
      34443: undefined,
    });
  });

  it("bridge 5 eth to mode swap half to usdc", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "eth",
          amount: "5",
          sourceChainName: "ethereum",
          destinationChainName: "mode",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "outputToken",
          inputAmount: "half",
          outputToken: "usdc",
          chainName: "mode",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 5,
      },
    };
    const [ethPrice, usdcPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdc",
    ]);
    const balanceChanges = {
      mode: {
        eth: 2.5,
        usdc: (2.5 * ethPrice) / usdcPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 34443: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("swap 500 usdc to weth on mode transfer half to niyant.eth and bridge half to ethereum", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdc",
          inputAmount: "500",
          outputToken: "weth",
          chainName: "mode",
        },
      },
      {
        name: "transfer",
        args: {
          token: "outputToken",
          amount: "half",
          recipient: "niyant.eth",
        },
      },
      {
        name: "bridge",
        args: {
          token: "outputToken",
          amount: "half",
          sourceChainName: "mode",
          destinationChainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      mode: {
        eth: 1,
        usdc: 500,
      },
    };
    const [ethPrice, usdcPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdc",
    ]);
    const balanceChanges = {
      ethereum: {
        weth: (125 * usdcPrice) / ethPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Mode",
      { 1: undefined, 34443: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("bridge all usdc from ethereum to mode", async () => {
    const accountAddress = "0x40D7c3C539b5Bf2102652192Ab39e80e36c67Ce4";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "dai",
          amount: "all",
          sourceChainName: "ethereum",
          destinationChainName: "mode",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 34443: undefined },
      /You can bridge only ETH to Mode chain. Try swapping to ETH first and then bridging to Mode chain./i,
    );
  });

  it("transfer all eth to niyant.eth on mode", async () => {
    const accountAddress = "0xe29f5ad2a33c76ccaca2d2e3226ff80085ce4573";
    const actions = [
      {
        name: "transfer",
        args: {
          token: "eth",
          amount: "all",
          recipient: "niyant.eth",
        },
      },
    ];
    const initialBalances = {
      mode: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Mode",
      { 34443: undefined },
      initialBalances,
    );
  });

  it("swap 5% usdc to dai on ethereum", async () => {
    const accountAddress = "0xf62c0ecbfcd066dd92022918402740b5d48973ab";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdc",
          outputToken: "dai",
          inputAmount: "5%",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdc: 1000,
      },
    };
    const [usdcPrice, daiPrice] = await getTokenPrices(accountAddress, [
      "usdc",
      "dai",
    ]);
    const balanceChanges = {
      ethereum: {
        usdc: -50,
        dai: (50 * usdcPrice) / daiPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap 15% usdt to blur on ethereum", async () => {
    const accountAddress = "0xf62c0ecbfcd066dd92022918402740b5d48973ab";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdt",
          outputToken: "blur",
          inputAmount: "15%",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdt: 1000,
      },
    };
    const [usdtPrice, blurPrice] = await getTokenPrices(accountAddress, [
      "usdt",
      "blur",
    ]);
    const balanceChanges = {
      ethereum: {
        usdt: -150,
        blur: (150 * usdtPrice) / blurPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap 1% weth to dai on ethereum", async () => {
    const accountAddress = "0xf62c0ecbfcd066dd92022918402740b5d48973ab";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "weth",
          outputToken: "dai",
          inputAmount: "5%",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        weth: 10,
      },
    };
    const [ethPrice, daiPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "dai",
    ]);
    const balanceChanges = {
      ethereum: {
        weth: -0.5,
        dai: (0.5 * ethPrice) / daiPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap 50$ usdc to dai on ethereum", async () => {
    const accountAddress = "0xf62c0ecbfcd066dd92022918402740b5d48973ab";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdc",
          outputToken: "dai",
          inputAmount: "50",
          inputAmountUnits: "usd",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdc: 1000,
      },
    };
    const [usdcPrice, daiPrice] = await getTokenPrices(accountAddress, [
      "usdc",
      "dai",
    ]);
    const balanceChanges = {
      ethereum: {
        usdc: -50 / usdcPrice,
        dai: 50 / daiPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap 150 usdc worth usdt to blur on ethereum", async () => {
    const accountAddress = "0xf62c0ecbfcd066dd92022918402740b5d48973ab";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdt",
          outputToken: "blur",
          inputAmount: "150",
          inputAmountUnits: "usdc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdt: 1000,
      },
    };
    const [usdcPrice, usdtPrice, blurPrice] = await getTokenPrices(
      accountAddress,
      ["usdc", "usdt", "blur"],
    );
    const balanceChanges = {
      ethereum: {
        usdt: (-150 * usdcPrice) / usdtPrice,
        blur: (150 * usdcPrice) / blurPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap 100$ worth weth to dai on ethereum", async () => {
    const accountAddress = "0xf62c0ecbfcd066dd92022918402740b5d48973ab";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "weth",
          outputToken: "dai",
          inputAmount: "100",
          inputAmountUnits: "usd",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        weth: 100,
      },
    };
    const [wethPrice, daiPrice] = await getTokenPrices(accountAddress, [
      "weth",
      "dai",
    ]);
    const balanceChanges = {
      ethereum: {
        weth: -100 / wethPrice,
        dai: 100 / daiPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("swap $100 of eth on arbitrum for degen on base. then deposit it into the degen-eth pool on aerodrome", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "degen",
          inputAmount: "100",
          inputAmountUnits: "usd",
        },
      },
      {
        name: "bridge",
        args: {
          token: "degen",
          amount: "outputAmount",
          sourceChainName: "arbitrum",
          destinationChainName: "base",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "aerodrome",
          token: "outputToken",
          amount: "outputAmount",
          poolName: "degen-eth",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
      base: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
    );
  }, 1000000);

  it("swap 0.01 eth to weth on base and deposit into compound weth pool on base", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "weth",
          inputAmount: "0.01",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "compound",
          token: "outputToken",
          amount: "weth",
          poolName: "weth",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
    );
  });

  it.skip("deposit all of my weth into the weth pool on aerodrome on base", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "deposit",
        args: {
          token: "weth",
          amount: "all",
          protocolName: "aerodrome",
          poolName: "weth",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      /Pool weth is not supported for protocol aerodrome on base./i,
    );
  });

  it("fail for bridge from all chains to all chains", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "weth",
          amount: "all",
          sourceChainName: "all",
          destinationChainName: "all",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      /You cannot bridge from all chains to all chains./i,
    );
  });

  // avalanche get avax balance fails
  it.skip("bridge all my usdc across all chains to arbitrum", async () => {
    const address = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "usdc",
          amount: "all",
          sourceChainName: "all",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdc: 100,
      },
      base: {
        eth: 1,
        usdc: 100,
      },
      avalanche: {
        avax: 1,
        usdc: 100,
      },
      polygon: {
        matic: 1,
        usdc: 100,
      },
    };
    const balanceChanges = {
      ethereum: {
        usdc: 0,
      },
      base: {
        usdc: 0,
      },
      avalanche: {
        usdc: 0,
      },
      polygon: {
        usdc: 0,
      },
      arbitrum: {
        usdc: 0,
      },
    };
    await test(
      address,
      actions,
      "Base",
      {
        1: undefined,
        137: undefined,
        8453: undefined,
        42161: undefined,
        43114: undefined,
      },
      initialBalances,
      balanceChanges,
      false,
      { token: "usdc", chain: "arbitrum" },
    );
  }, 1000000);

  // unsupported
  it.skip("close my link position on gmx", async () => {
    const accountAddress = "0x4Cd80aa0CE4881Eb8679EdA1f6fbe3d89AEc0F7F";
    const actions = [
      {
        name: "close",
        args: {
          protocolName: "gmx",
          inputToken: "link",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: 236093120 });
  });

  it("1% threshold check 1", async () => {
    const accountAddress = "0x7807F2155C89B71E146c64a8f2DFFa8CE2a33D05";
    const actions = [
      {
        name: "transfer",
        args: {
          token: "usdc",
          amount: "10",
          recipient: "niyant.eth",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdc: 9.99999,
      },
    };
    const balanceChanges = {
      ethereum: {
        usdc: -9.99999,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("1% threshold check 2", async () => {
    const accountAddress = "0x7807F2155C89B71E146c64a8f2DFFa8CE2a33D05";
    const actions = [
      {
        name: "transfer",
        args: {
          token: "eth",
          amount: "1",
          recipient: "niyant.eth",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 0.9999,
      },
    };
    const balanceChanges = {
      ethereum: {
        eth: 0,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("fee action check for single chain", async () => {
    const accountAddress = "0xf62c0ecbfcd066dd92022918402740b5d48973ab";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "eth",
          amount: "all",
          sourceChainName: "arbitrum",
          destinationChainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 1: undefined, 42161: undefined, 8453: undefined },
      initialBalances,
    );
  });

  // unsupported
  it.skip("withdraw all of my usdc from the eth-usdc pool on gmx on arbitrum", async () => {
    const accountAddress = "0xd468808cC9e30f0Ae5137805fff7ffB213984250";
    const actions = [
      {
        name: "withdraw",
        args: {
          token: "usdc",
          amount: "all",
          poolName: "eth-usdc",
          protocolName: "gmx",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: 235170000 });
  });

  // unsupported
  it.skip("withdraw all of my usdc from the weth-usdc pool on gmx on arbitrum", async () => {
    const accountAddress = "0xd468808cC9e30f0Ae5137805fff7ffB213984250";
    const actions = [
      {
        name: "withdraw",
        args: {
          token: "usdc",
          amount: "all",
          poolName: "weth-usdc",
          protocolName: "gmx",
        },
      },
    ];
    const balanceChanges = {
      arbitrum: {
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: 235170000 },
      {},
      balanceChanges,
    );
  });

  it("swap 0.01 weth to eth on blast then deposit all of my weth into juice", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "weth",
          inputAmount: "0.01",
          outputToken: "eth",
        },
      },
      {
        name: "deposit",
        args: {
          token: "weth",
          amount: "all",
          protocolName: "juice",
        },
      },
    ];
    const initialBalances = {
      blast: {
        eth: 1,
      },
    };
    const balanceChanges = {
      blast: {
        weth: "-",
      },
    };
    await test(
      accountAddress,
      actions,
      "Blast",
      { 81457: 3759372 },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap 1 eth to weth on optimism, bridge to arbitrum and deposit into aave", async () => {
    // FAILS with successful sim but failed execution
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "1",
          outputToken: "weth",
        },
      },
      {
        name: "bridge",
        args: {
          token: "outputToken",
          amount: "outputAmount",
          destinationChainName: "arbitrum",
        },
      },
      {
        name: "deposit",
        args: {
          token: "outputToken",
          amount: "outputAmount",
          protocolName: "aave",
        },
      },
    ];
    const initialBalances = {
      optimism: {
        eth: 2,
      },
      arbitrum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      arbitrum: {
        aweth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Optimism",
      { 10: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("swap all of my ondo on arb for wif on base", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "ondo",
          outputToken: "wif",
          chainName: "arbitrum",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "wif",
          destinationChainName: "base",
          sourceChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        ondo: 100,
      },
    };
    const balanceChanges = {
      ethereum: {
        ondo: "-",
      },
      base: {
        wif: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 1: undefined, 42161: undefined, 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("swap all of my weth on base for eth on arbitrum", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "weth",
          outputToken: "eth",
          chainName: "base",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "eth",
          destinationChainName: "arbitrum",
          sourceChainName: "base",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
        weth: 2,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 42161: undefined, 8453: undefined },
      initialBalances,
    );
  });

  // while fixing, make extra careful that following tests still pass
  // swap grail to weth on polygon
  // swap my virtual on ethereum for usdc
  // buy neiro with 0.01 eth
  // atk doesn't have enough liquidity, so can't detect token
  it.skip("swap 100 atk on optimism for stx on bsc", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "100",
          inputToken: "atk",
          outputToken: "stx",
          chainName: "optimism",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "stx",
          destinationChainName: "bsc",
          sourceChainName: "optimism",
        },
      },
    ];
    const initialBalances = {
      polygon: {
        matic: 100,
        atk: 100,
      },
    };
    const balanceChanges = {
      ethereum: {
        stx: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Optimism",
      { 137: undefined, 10: undefined, 56: undefined, 1: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 1000000);

  it("swap eth for link on arb", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "link",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      arbitrum: {
        link: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("lend all of my usdc on arbitrum on lodestar. swap all of my DEGEN for ETH on base and bridge it to arbitrum. swap all of my WETH on base to eth.", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "lend",
        args: {
          amount: "all",
          token: "usdc",
          chainName: "arbitrum",
          protocolName: "lodestar",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "degen",
          outputToken: "eth",
          chainName: "base",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "eth",
          sourceChainName: "base",
          destinationChainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "weth",
          outputToken: "eth",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdc: 1000,
      },
      base: {
        eth: 1,
        degen: 100,
        weth: 1,
      },
    };
    const balanceChanges = {
      arbitrum: {
        usdc: 0,
      },
      base: {
        degen: 0,
        weth: 0,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("swap $4.5k worth of wbtc for trump on ethereum", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "4500.0",
          inputAmountUnits: "usd",
          inputToken: "wbtc",
          outputToken: "trump",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        wbtc: 1,
      },
    };
    const balanceChanges = {
      ethereum: {
        trump: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap $670 of sol for wbtc for arbitrum", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "670",
          inputAmountUnits: "usd",
          inputToken: "sol",
          outputToken: "wbtc",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        sol: 5,
      },
    };
    const balanceChanges = {
      arbitrum: {
        wbtc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("buy 0.01 eth of maga", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          outputToken: "maga",
          inputAmount: "0.01",
          inputToken: "eth",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      ethereum: {
        maga: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("buy 0.01 eth of pepe", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          outputToken: "pepe",
          inputAmount: "0.01",
          inputToken: "eth",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      ethereum: {
        pepe: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("buy 10 dollars worth of eth of 0x576e2bed8f7b46d34016198911cdf9886f78bea7", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "10",
          inputAmountUnits: "usd",
          inputToken: "eth",
          outputToken: "0x576e2bed8f7b46d34016198911cdf9886f78bea7",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      ethereum: {
        "0x576e2bed8f7b46d34016198911cdf9886f78bea7": "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("deposit 20 dai and 20 usdt into the curve 3pool", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "curve",
          poolName: "3pool",
          amount: "20",
          token: "dai",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "curve",
          poolName: "3pool",
          amount: "20",
          token: "usdt",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        dai: 20,
        usdt: 20,
      },
    };
    const balanceChanges = {
      ethereum: {
        dai: -20,
        usdt: -20,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap .01 eth to usdc on arb", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: ".01",
          inputToken: "eth",
          outputToken: "usdc",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      arbitrum: {
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("bridge 0.03 eth to blast and swap 0.02 eth to usdb on thruster", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "0.03",
          token: "eth",
          destinationChainName: "blast",
        },
      },
      {
        name: "swap",
        args: {
          protocolName: "thruster",
          inputAmount: "0.02",
          inputToken: "eth",
          outputToken: "usdb",
          chainName: "blast",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      blast: {
        usdb: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 81457: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap 84897.30038135161 of my token with contract 0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4 to eth on base", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "84897.30038135161",
          inputToken: "0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4",
          outputToken: "eth",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      base: {
        "0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4": 1000000,
      },
    };
    const balanceChanges = {
      base: {
        "0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4": -84897.30038135161,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap 0.01 eth to usdc on arbitrum one, try using 3% slippage and find me the best rate", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "0.01",
          inputToken: "eth",
          outputToken: "usdc",
          chainName: "arbitrum",
          slippage: "3%",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it("add 10 usdc collateral to my btc position on HL", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "long",
        args: {
          protocolName: "hyperliquid",
          inputAmount: "10",
          inputToken: "usdc",
          outputToken: "btc",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdc: 10,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  // unsupported
  it.skip("withdraw all eth supplied to lodestar", async () => {
    const accountAddress = "0xF62C0ecBFcD066dD92022918402740B5D48973ab";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "lodestar",
          amount: "all",
          token: "eth",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: 208178260 },
      initialBalances,
    );
  });

  it("swap all 0xafb89a09d82fbde58f18ac6437b3fc81724e4df6 for degen on base", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "0xafb89a09d82fbde58f18ac6437b3fc81724e4df6",
          outputToken: "degen",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
        "0xafb89a09d82fbde58f18ac6437b3fc81724e4df6": 100,
      },
    };
    const balanceChanges = {
      base: {
        "0xafb89a09d82fbde58f18ac6437b3fc81724e4df6": 0,
        degen: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap 0.005 eth to 0x576e2bed8f7b46d34016198911cdf9886f78bea7", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "0.005",
          inputToken: "eth",
          outputToken: "0x576e2bed8f7b46d34016198911cdf9886f78bea7",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      ethereum: {
        "0x576e2bed8f7b46d34016198911cdf9886f78bea7": "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("bridge 0.009eth from base to arbitrum", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "0.009",
          token: "eth",
          sourceChainName: "base",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined, 42161: undefined },
      initialBalances,
    );
  });

  // unsupported
  it.skip("withdraw all my eth from lodestar. then long doge with 2x leverage on gmx", async () => {
    const accountAddress = "0x8c11e3af9c1d8718c40c51d4ff0958afcf77fd71";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "lodestar",
          amount: "all",
          token: "eth",
        },
      },
      {
        name: "long",
        args: {
          protocolName: "gmx",
          inputAmount: "outputAmount",
          inputToken: "weth",
          outputToken: "doge",
          leverageMultiplier: "2x",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        weth: 10,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it("swap all matic to usdc on polygon then bridge all usdc from polygon to base", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "matic",
          outputToken: "usdc",
          chainName: "polygon",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "usdc",
          sourceChainName: "polygon",
          destinationChainName: "base",
        },
      },
    ];
    const initialBalances = {
      polygon: {
        matic: 100,
      },
    };
    const balanceChanges = {
      base: {
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Polygon",
      { 137: undefined, 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap blur on eth for pepe on bsc", async () => {
    // FAILS
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "blur",
          outputToken: "pepe",
          chainName: "ethereum",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "pepe",
          sourceChainName: "ethereum",
          destinationChainName: "bsc",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        blur: 100,
      },
    };
    const balanceChanges = {
      bsc: {
        pepe: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 56: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  // shib exists on ethereum and bsc, improper token pick
  it.skip("bridge shib from bsc to ethereum", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "shib",
          sourceChainName: "bsc",
          destinationChainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      bsc: {
        bnb: 10,
        shib: 13,
      },
    };
    const balanceChanges = {
      ethereum: {
        shib: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "BSC",
      { 1: undefined, 56: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  // improper shib pick and no bridge route found
  it.skip("swap ltc on polygon for 100 shib on optimism", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "ltc",
          outputToken: "shib",
          outputAmount: "100",
          chainName: "polygon",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "shib",
          sourceChainName: "polygon",
          destinationChainName: "optimism",
        },
      },
    ];
    const initialBalances = {
      bsc: {
        bnb: 100,
        ltc: 1000,
      },
      optimism: {
        eth: 1,
      },
    };
    await testFail(
      accountAddress,
      actions,
      "Polygon",
      { 56: undefined, 1: undefined, 10: undefined, 137: undefined },
      /Token shib not found on optimism./i,
      initialBalances,
    );
  }, 500000);

  it("swap jasmy on base for 100 gala on arbitrum", async () => {
    // FAILS
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "jasmy",
          outputToken: "gala",
          outputAmount: "100",
          chainName: "base",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "gala",
          sourceChainName: "base",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        jasmy: 1000,
      },
    };
    await testFail(
      accountAddress,
      actions,
      "Base",
      { 1: undefined, 42161: undefined, 8453: undefined },
      /Token gala not found on arbitrum./i,
      initialBalances,
    );
  }, 500000);

  it("swap bonk on eth for floki", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "bonk",
          outputToken: "floki",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        bonk: 100,
      },
    };
    const balanceChanges = {
      ethereum: {
        floki: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap $100 of eth on arbitrum for $brett on base", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmountUnits: "usd",
          inputAmount: "100",
          inputToken: "eth",
          outputToken: "brett",
          chainName: "arbitrum",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "brett",
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
    const balanceChanges = {
      base: {
        brett: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  // avalanche get avax balance fails
  it.skip("swap $100 worth of eth on avalanche for $brett on mainnet", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "100",
          inputAmountUnits: "usd",
          inputToken: "eth",
          outputToken: "brett",
          chainName: "avalanche",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "brett",
          sourceChainName: "avalanche",
          destinationChainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      avalanche: {
        avax: 100,
        weth: 1,
      },
    };
    const balanceChanges = {
      ethereum: {
        brett: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Avalanche",
      { 43114: undefined, 1: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it.skip("swap all of usdc.e on polygon to matic", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "usdc.e",
          outputToken: "matic",
          chainName: "polygon",
        },
      },
    ];
    const initialBalances = {
      polygon: {
        matic: 100,
        "usdc.e": 10,
      },
    };
    await test(
      accountAddress,
      actions,
      "Polygon",
      { 137: undefined },
      initialBalances,
    );
  });

  it("bridge 0.01 eth from arbitrum to optimism, blast, and ethereum", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "0.01",
          token: "eth",
          sourceChainName: "arbitrum",
          destinationChainName: "optimism",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "0.01",
          token: "eth",
          sourceChainName: "arbitrum",
          destinationChainName: "blast",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "0.01",
          token: "eth",
          sourceChainName: "arbitrum",
          destinationChainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 10: undefined, 1: undefined, 81457: undefined },
      initialBalances,
    );
  }, 500000);

  it("bridge 0.01 eth from arbitrum to optimism and to blast", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "0.01",
          token: "eth",
          sourceChainName: "arbitrum",
          destinationChainName: "optimism",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "0.01",
          token: "eth",
          sourceChainName: "arbitrum",
          destinationChainName: "blast",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 81457: undefined, 10: undefined },
      initialBalances,
    );
  });

  it("bridge 0.01 eth to optimism, blast and base", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "0.01",
          token: "eth",
          sourceChainName: "ethereum",
          destinationChainName: "optimism",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "0.01",
          token: "eth",
          sourceChainName: "ethereum",
          destinationChainName: "blast",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "0.01",
          token: "eth",
          sourceChainName: "ethereum",
          destinationChainName: "base",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 2,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 10: undefined, 8453: undefined, 81457: undefined },
      initialBalances,
    );
  }, 500000);

  it("deposit 50 usdc and equivalent wbtc into 0xdef1c0ded9bec7f1a1670819833240f027b25eff", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "deposit",
        args: {
          amount: "50",
          token: "usdc",
          poolName: "0xdef1c0ded9bec7f1a1670819833240f027b25eff",
        },
      },
      {
        name: "deposit",
        args: {
          amount: "outputAmount",
          token: "wbtc",
          poolName: "0xdef1c0ded9bec7f1a1670819833240f027b25eff",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdc: 50,
        wbtc: 1,
      },
    };
    await testFail(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      /Protocol 0x is not supported for deposit./i,
      initialBalances,
    );
  });

  it("withdraw everything from 0x0fe7737956d706bc420f87b69aa4773cfc3b1a44", async () => {
    // FAILS
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "withdraw",
        args: {
          amount: "all",
          poolName: "0x0fe7737956d706bc420f87b69aa4773cfc3b1a44",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    await testFail(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      /is not recognized/i,
      initialBalances,
    );
  });

  it("withdraw my weth from 0x3cd751e6b0078be393132286c442345e5dc49699 and deposit it into 0xf577628a1b2338f27e9331ea945c3b83f8dfd439", async () => {
    // FAILS with Cannot convert undefined or null to object
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "withdraw",
        args: {
          token: "weth",
          poolName: "0x3cd751e6b0078be393132286c442345e5dc49699",
        },
      },
      {
        name: "deposit",
        args: {
          amount: "outputAmount",
          token: "weth",
          poolName: "0xf577628a1b2338f27e9331ea945c3b83f8dfd439",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    await testFail(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      /is not recognized/i,
      initialBalances,
    );
  });

  it.skip("deposit all eth into camelot eth-usdc pool and stake the lp", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "camelot",
          poolName: "eth-usdc",
          amount: "all",
          token: "eth",
        },
      },
      {
        name: "stake",
        args: {
          protocolName: "camelot",
          amount: "outputAmount",
          token: "outputToken",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 2,
        usdc: 100000,
      },
    };
    await testFail(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      /Action stake is not supported/i,
      initialBalances,
    );
  });

  it.skip("bridge 0.001 eth from arbitrum to base and swap half of the eth to usdc and deposit the eth and usdc to aerodrome on base", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "0.1",
          token: "eth",
          sourceChainName: "arbitrum",
          destinationChainName: "base",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "half",
          inputToken: "eth",
          outputToken: "usdc",
          chainName: "base",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "aerodrome",
          amount: "outputAmount",
          token: "eth",
          chainName: "base",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "aerodrome",
          amount: "outputAmount",
          token: "usdc",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
    );
  }, 500000);

  it("bridge .01 eth from arbitrum to base and transfer .009 eth to [0x66e751f8a564be5b796e0e6d5d68fc7fa2c89976]", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: ".01",
          token: "eth",
          sourceChainName: "arbitrum",
          destinationChainName: "base",
        },
      },
      {
        name: "transfer",
        args: {
          amount: ".009",
          token: "eth",
          recipient: "0x66e751f8a564be5b796e0e6d5d68fc7fa2c89976",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
    );
  });

  it.skip("withdraw eth and usdt on lodestar", async () => {
    const accountAddress = "0x8c11e3af9c1d8718c40c51d4ff0958afcf77fd71";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "lodestar",
          token: "eth",
        },
      },
      {
        name: "withdraw",
        args: {
          protocolName: "lodestar",
          token: "usdt",
          amount: "all",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      arbitrum: {
        usdt: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("bridge all of my usdc on arbitrum to ethereum and swap it to friend", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "usdc",
          sourceChainName: "arbitrum",
          destinationChainName: "ethereum",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "usdc",
          outputToken: "friend",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdc: 1000,
      },
      ethereum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      arbitrum: {
        usdc: 0,
      },
      ethereum: {
        friend: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 1: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  // unsupported
  it.skip("on arbitrum, close arb token short position on gmx, repay the usdc on lodestar and withdraw all lent eth on lodestar", async () => {
    const accountAddress = "0x6859dA14835424957a1E6B397D8026B1D9fF7e1E";
    const actions = [
      {
        name: "close",
        args: {
          protocolName: "gmx",
          inputToken: "arb",
          chainName: "arbitrum",
        },
      },
      {
        name: "repay",
        args: {
          protocolName: "lodestar",
          token: "usdc",
          chainName: "arbitrum",
          amount: "outputAmount",
        },
      },
      {
        name: "withdraw",
        args: {
          protocolName: "lodestar",
          amount: "all",
          token: "eth",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await testFail(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: 235170000 },
      /GMX returns funds after a delay, so we can't simulate this multi step action. Try close first, then proceed with the rest of the actions./i,
      initialBalances,
    );
  });

  // avalanche get avax balance fails
  it.skip("claim all of my rewards across all chains from stargate and bridge then to arbitrum", async () => {
    const accountAddress = "0x723071BC13A9A11aF5646d167aCd9C357dC120f1";
    const actions = [
      {
        name: "claim",
        args: {
          protocolName: "stargate",
          token: "all",
          chainName: "all",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "outputToken",
          sourceChainName: "all",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
      bsc: {
        bnb: 1,
      },
      base: {
        eth: 1,
      },
      avalanche: {
        avax: 1,
      },
      polygon: {
        matic: 1,
      },
      arbitrum: {
        eth: 1,
      },
      optimism: {
        eth: 1,
      },
    };
    const balanceChanges = {
      arbitrum: {
        stg: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      {
        1: undefined,
        56: undefined,
        43114: undefined,
        137: undefined,
        42161: undefined,
        10: undefined,
        8453: undefined,
      },
      initialBalances,
      balanceChanges,
    );
  }, 2000000);

  it("bridge all eth from base to arbitrum and swap 0.028 eth to usdc", async () => {
    const accountAddress = "0xf577628a1b2338f27e9331ea945c3b83f8dfd439";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "eth",
          destinationChainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "0.028",
          outputToken: "usdc",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 0.02401353637731231,
      },
      arbitrum: {
        eth: 0.012,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined, 42161: undefined },
      initialBalances,
    );
  }, 500000);

  it("inference check for balance", async () => {
    const accountAddress = "0xf577628a1b2338f27e9331ea945c3b83f8dfd439";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "usdc",
          amount: "all",
          sourceChainName: "arbitrum",
          destinationChainName: "base",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdc: 1000,
      },
    };
    const balanceChanges = {
      ethereum: {
        usdc: 0,
      },
      base: {
        usdc: 1000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 1: undefined, 42161: undefined, 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it.skip("swap half my eth on arbitrum for usde on mainnet. then deposit it in the sy-weeth pool on pendle", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "half",
          outputToken: "weeth",
        },
      },
      {
        name: "bridge",
        args: {
          token: "weeth",
          amount: "outputAmount",
          destinationChainName: "ethereum",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "pendle",
          poolName: "sy-weeth",
          token: "weeth",
          amount: "outputAmount",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", {
      1: undefined,
      42161: undefined,
    });
  }, 750000);

  it("fee action deep check", async () => {
    const accountAddress = "0xa04f7f13a3f0e46cab79de7fceb20338fc7c0c42";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "0.006",
          outputToken: "usdc",
          protocolName: "1inch",
        },
      },
      {
        name: "bridge",
        args: {
          token: "eth",
          amount: "all",
          destinationChainName: "base",
          protocolName: "axelar",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "all",
          outputToken: "usdc",
          protocolName: "1inch",
        },
      },
    ];
    const ethBalance = await getEthBalanceForUser(42161, accountAddress);
    const initialBalances = {
      arbitrum: {
        eth: 0.008 - +ethers.formatEther(ethBalance),
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 8453: undefined, 42161: undefined },
      initialBalances,
    );
  }, 500000);

  it("lend all of my wbtc on aave, borrow 50% of it as eth", async () => {
    // FAILS
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "lend",
        args: {
          token: "wbtc",
          amount: "all",
          protocolName: "aave",
        },
      },
      {
        name: "borrow",
        args: {
          token: "eth",
          amount: "half",
          protocolName: "aave",
        },
      },
    ];
    const balanceChanges = {
      ethereum: {
        wbtc: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      undefined,
      balanceChanges,
    );
  });

  it("correct all amount check", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "transfer",
        args: {
          token: "0xc548e90589b166E1364DE744E6d35d8748996FE8",
          amount: "2",
          recipient: "0x170AAc748Ae04131A7e54a381ce8b1f7C934139F",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        "0xc548e90589b166E1364DE744E6d35d8748996FE8": 5,
      },
    };
    const balanceChanges = {
      ethereum: {
        "0xc548e90589b166E1364DE744E6d35d8748996FE8": -2,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  // virtual added to ethereum with enough liquidity now (was on base only before)
  it("swap my virtual on arbitrum for usdc - old", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "virtual",
          outputToken: "usdc",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        virtual: 1000,
      },
      arbitrum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      ethereum: {
        virtual: 0,
      },
      arbitrum: {
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  // unsupported
  it.skip("repay my lodestar loan", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "repay",
        args: {
          token: "gmx",
          protocolName: "lodestar",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        gmx: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it.skip("bridge $10 of eth to blast, withdraw all of my weth from juice and bridge it to arbitrum, then swap it for DMT", async () => {
    const accountAddress = "0xc76FA7b4E0741cefF79AC2B8eDfCc17C14d2739D";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "eth",
          amount: "10",
          amount_units: "usd",
          destinationChainName: "blast",
        },
      },
      {
        name: "withdraw",
        args: {
          token: "weth",
          amount: "all",
          protocolName: "juice",
        },
      },
      {
        name: "bridge",
        args: {
          token: "weth",
          amount: "outputAmount",
          destinationChainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "weth",
          inputAmount: "outputAmount",
          outputToken: "dmt",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
      },
      blast: {
        eth: 1,
      },
      arbitrum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      arbitrum: {
        dmt: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined, 81457: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 1500000);

  it.skip("bridge $10 of eth to blast, withdraw all of my weth from juice and then swap it for degen on base", async () => {
    const accountAddress = "0xc76FA7b4E0741cefF79AC2B8eDfCc17C14d2739D";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "eth",
          amount: "10",
          amount_units: "usd",
          destinationChainName: "blast",
        },
      },
      {
        name: "withdraw",
        args: {
          token: "weth",
          amount: "all",
          protocolName: "juice",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "weth",
          inputAmount: "outputAmount",
          outputToken: "degen",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
      },
      blast: {
        eth: 1,
      },
    };
    const balanceChanges = {
      base: {
        degen: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined, 81457: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 1000000);

  it("swap all of my gmx for usdc then bridge all of my usdc from arbitrum to base and deposit into aave", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "gmx",
          outputToken: "usdc",
        },
      },
      {
        name: "bridge",
        args: {
          token: "usdc",
          amount: "all",
          destinationChainName: "base",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "aave",
          token: "usdc",
          amount: "outputAmount",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        gmx: 20,
      },
      base: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
    );
  }, 1000000);

  it.skip("swap 19 000 000 meow on zksync to usdc", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "19000000",
          inputToken: "meow",
          outputToken: "usdc",
          chainName: "zksync",
        },
      },
    ];
    const initialBalances = {
      zksync: {
        eth: 1,
        meow: 19000000,
      },
    };
    const balanceChanges = {
      ethereum: {
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "zkSync",
      { 324: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("bridge all eth from base to optimism", async () => {
    const accountAddress = "0x4991933554fbc17d85880eba460d3be7e892dcc6";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "eth",
          sourceChainName: "base",
          destinationChainName: "optimism",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 0.08723,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined, 10: undefined },
      initialBalances,
    );
  });

  it("bridge all my weth from mainnet to base and swap to usdc", async () => {
    const accountAddress = "0xB23a734F49Ed11dc3B0dD3Ff322b5Df95220574e";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "weth",
          amount: "all",
          sourceChainName: "ethereum",
          destinationChainName: "base",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "weth",
          outputToken: "usdc",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
      base: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 8453: undefined },
      initialBalances,
    );
  }, 500000);

  it("long doge with 3x leverage with 0.2 eth on hl on arbitrum", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "long",
        args: {
          chainName: "arbitrum",
          inputToken: "eth",
          inputAmount: "0.2",
          outputToken: "doge",
          protocolName: "hyperliquid",
          leverageMultiplier: "3x",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        weth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it.skip("swap all of 0.0421 eth and then deposit all of my exa and equal amount of eth into the exa/weth pool on velodrome on optimism", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "0.0421",
          outputToken: "exa",
        },
      },
      {
        name: "deposit",
        args: {
          token: "exa",
          amount: "outputAmount",
          protocolName: "velodrome",
          poolName: "exa/weth",
        },
      },
      {
        name: "deposit",
        args: {
          token: "outputToken",
          amount: "outputAmount",
          protocolName: "velodrome",
          poolName: "exa/weth",
        },
      },
    ];
    const initialBalances = {
      optimism: {
        eth: 1,
        weth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Optimism",
      { 10: undefined },
      initialBalances,
    );
  });

  it("sell pacmoon for usdb", async () => {
    const accountAddress = "0xeace03ee098cbf1b31bca427f0a0dc6d573c4d4f";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "pacmoon",
          outputToken: "usdb",
          chainName: "ethereum",
        },
      },
    ];
    await test(accountAddress, actions, "Ethereum", {
      1: undefined,
      81457: undefined,
    });
  }, 750000);

  it("sell 10% of blur for usdc", async () => {
    const accountAddress = "0x024cDB696a719f37B324a852085A68786D269212";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "blur",
          inputAmount: "10%",
          outputToken: "usdc",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        blur: 20000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      {
        42161: undefined,
        1: undefined,
      },
      initialBalances,
    );
  }, 750000);

  it("swap all my weth on base for 0x8B0E6f19Ee57089F7649A455D89D7bC6314D04e8 on arbitrum", async () => {
    const accountAddress = "0xbB3d4097E9F1279f07E981EAFF384Eb6566fbE2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "weth",
          inputAmount: "all",
          outputToken: "0x8B0E6f19Ee57089F7649A455D89D7bC6314D04e8",
          chainName: "base",
        },
      },
      {
        name: "bridge",
        args: {
          token: "0x8B0E6f19Ee57089F7649A455D89D7bC6314D04e8",
          amount: "outputAmount",
          sourceChainName: "base",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
        weth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined, 42161: undefined },
      initialBalances,
    );
  }, 500000);

  // testing expired withdrawals
  it.skip("withdraw all from pt-rseth-27jun2024 pendle pool on arbitrum", async () => {
    const accountAddress = "0xA9A088600Fb0D0dD392445cc6328f07D352f59b0";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "pendle",
          poolName: "pt-rseth-27jun2024",
          token: "rseth",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        "0xAFD22F824D51Fb7EeD4778d303d4388AC644b026": 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it("swap all of my blur for usdc on arbitrum and use it to long sol with 2x leverage", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "blur",
          outputToken: "usdc",
          chainName: "arbitrum",
        },
      },
      {
        name: "long",
        args: {
          protocolName: "hyperliquid",
          inputToken: "usdc",
          outputToken: "sol",
          leverageMultiplier: "2x",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
      ethereum: {
        eth: 1,
        blur: 1000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 1: undefined, 42161: undefined },
      initialBalances,
    );
  }, 2000000);

  it.skip("repay my gmx borrow position on lodestar on arbitrum", async () => {
    const accountAddress = "0x9a070851847fc53F1c96ba3c9e7DCe9acB1d84AC";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdc.e",
          outputAmount: "0.025",
          outputToken: "gmx",
        },
      },
      {
        name: "repay",
        args: {
          protocolName: "lodestar",
          poolName: "gmx",
          chainName: "arbitrum",
          amount: "0.025",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        "usdc.e": 5,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: 234429280 },
      initialBalances,
    );
  });

  it.skip("remove my eth position from aave on mainnet and deposit it on arbitrum pendle weeth pool", async () => {
    const accountAddress = "0x0242dAA8E73776669979715b42Ec7844f16e6D27";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "aave",
          token: "eth",
          chainName: "ethereum",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "pendle",
          amount: "outputAmount",
          token: "eth",
          poolName: "weeth",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
    );
  }, 1000000);

  it.skip("remove my eth position from aave and deposit it on arbitrum pendle weeth pool", async () => {
    const accountAddress = "0x0242dAA8E73776669979715b42Ec7844f16e6D27";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "aave",
          token: "eth",
          chainName: "arbitrum",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "pendle",
          amount: "outputAmount",
          token: "eth",
          poolName: "weeth",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
    );
  }, 1000000);

  it("send link, usdc and dai to 0xae4fdcc420f1409c8b9b2af04db150dd986f66a5", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "transfer",
        args: {
          token: "link",
          recipient: "0xae4fdcc420f1409c8b9b2af04db150dd986f66a5",
        },
      },
      {
        name: "transfer",
        args: {
          token: "usdc",
          recipient: "0xae4fdcc420f1409c8b9b2af04db150dd986f66a5",
        },
      },
      {
        name: "transfer",
        args: {
          token: "dai",
          recipient: "0xae4fdcc420f1409c8b9b2af04db150dd986f66a5",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        link: 100,
        usdc: 50,
        dai: 60,
      },
    };
    const balanceChanges = {
      ethereum: {
        link: 0,
        usdc: 0,
        dai: 0,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("deposit $500 usdc and 0.35eth into an lp on uniswap v3", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "uniswap",
          poolName: "lp",
          amount: "500",
          amount_units: "usd",
          token: "usdc",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "uniswap",
          poolName: "lp",
          amount: "0.35",
          token: "eth",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        usdc: 550,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it("swap all of my blur on eth for dmt on arbitrum", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "blur",
          outputToken: "dmt",
          chainName: "ethereum",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "dmt",
          sourceChainName: "ethereum",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
      ethereum: {
        eth: 1,
        blur: 1000,
      },
    };
    const balanceChanges = {
      ethereum: {
        blur: 0,
      },
      arbitrum: {
        dmt: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 1: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("swap all of my blur for dmt on arbitrum", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "blur",
          outputToken: "dmt",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        blur: 1000,
      },
    };
    const balanceChanges = {
      ethereum: {
        blur: 0,
      },
      arbitrum: {
        dmt: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 1: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 750000);

  it.skip("bridge 0.001 eth from arbitrum to blast. withdraw all of my weth from juice and bridge to arbitrum", async () => {
    const accountAddress = "0xc76FA7b4E0741cefF79AC2B8eDfCc17C14d2739D";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "eth",
          amount: "0.001",
          sourceChainName: "arbitrum",
          destinationChainName: "blast",
        },
      },
      {
        name: "withdraw",
        args: {
          token: "weth",
          amount: "all",
          protocolName: "juice",
          chainName: "blast",
        },
      },
      {
        name: "bridge",
        args: {
          token: "weth",
          amount: "outputAmount",
          sourceChainName: "blast",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      blast: {
        eth: 1,
      },
      arbitrum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      arbitrum: {
        weth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 81457: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("withdraw 0xf82105aa473560cfbf8cbc6fd83db14eb4028117", async () => {
    const accountAddress = "0xd06657f02c266746b502df0a79255ae69ebdbb95";
    const actions = [
      {
        name: "withdraw",
        args: {
          token: "0xf82105aa473560cfbf8cbc6fd83db14eb4028117",
          protocolName: "all",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  }, 500000);

  it("swap all of my weth and eth on base for 0x8B0E6f19Ee57089F7649A455D89D7bC6314D04e8 on arbitrum", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "weth",
          outputToken: "0x8b0e6f19ee57089f7649a455d89d7bc6314d04e8",
          chainName: "base",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "0x8b0e6f19ee57089f7649a455d89d7bc6314d04e8",
          destinationChainName: "arbitrum",
          sourceChainName: "base",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "eth",
          outputToken: "0x8b0e6f19ee57089f7649a455d89d7bc6314d04e8",
          chainName: "base",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "0x8b0e6f19ee57089f7649a455d89d7bc6314d04e8",
          sourceChainName: "base",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
        weth: 1,
      },
      arbitrum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      arbitrum: {
        "0x8b0e6f19ee57089f7649a455d89d7bc6314d04e8": "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 1000000);

  it("swap all of my weth and eth on base for 0x8B0E6f19Ee57089F7649A455D89D7bC6314D04e8 on arbitrum - 2", async () => {
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: ["weth", "eth"],
          outputToken: "0x8b0e6f19ee57089f7649a455d89d7bc6314d04e8",
          chainName: "base",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "0x8b0e6f19ee57089f7649a455d89d7bc6314d04e8",
          destinationChainName: "arbitrum",
          sourceChainName: "base",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
        weth: 1,
      },
      arbitrum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      arbitrum: {
        "0x8b0e6f19ee57089f7649a455d89d7bc6314d04e8": "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 1000000);

  it("swap all of my weth and eth on base for 0x8B0E6f19Ee57089F7649A455D89D7bC6314D04e8 on arbitrum - 3", async () => {
    // FAILS
    const accountAddress = "0xE999bb14881e48934A489cC9B35A4f9449EE87fb";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "weth",
          outputToken: "0x8b0e6f19ee57089f7649a455d89d7bc6314d04e8",
          chainName: "base",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "eth",
          outputToken: "0x8b0e6f19ee57089f7649a455d89d7bc6314d04e8",
          chainName: "base",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "0x8b0e6f19ee57089f7649a455d89d7bc6314d04e8",
          sourceChainName: "base",
          destinationChainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
        weth: 1,
      },
      arbitrum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      arbitrum: {
        "0x8b0e6f19ee57089f7649a455d89d7bc6314d04e8": "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 1000000);

  it.skip("withdraw all of my weth from compound on base. bridge it to arbitrum. swap it and all of my usdc for weeth. deposit all my weeth in the weeth pendle pool", async () => {
    const accountAddress = "0xB0F0ad9f2a7a4F54523C2882E16a3E9286aA3c6c";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "compound",
          amount: "all",
          token: "weth",
          chainName: "base",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "weth",
          sourceChainName: "base",
          destinationChainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "weth",
          outputToken: "weeth",
          chainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "usdc",
          outputToken: "weeth",
          chainName: "arbitrum",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "pendle",
          amount: "outputAmount",
          token: "weeth",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
      },
      arbitrum: {
        eth: 1,
        usdc: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined, 42161: undefined },
      initialBalances,
    );
  }, 750000);

  it("sell my CTO and buy 0x97b959385dfdcaf252223838746beb232ac601aa on base", async () => {
    const accountAddress = "0x35d2085239e04e9B0BD5082F28044170ac6fbdad";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "CTO",
          outputToken: "0x97b959385dfdcaf252223838746beb232ac601aa",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
      },
    };
    const balanceChanges = {
      base: {
        CTO: "-",
        "0x97b959385dfdcaf252223838746beb232ac601aa": "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("withdraw all of my pendle positions on arbitrum and swap them to eth", async () => {
    const accountAddress = "0xCb7AA6711D86D6cA56dca3D858dE9706afb9fF73";
    const actions = [
      {
        name: "withdraw",
        args: {
          token: "all",
          protocolName: "pendle",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "outputToken",
          inputAmount: "outputAmount",
          outputToken: "eth",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  }, 1000000);

  it("bridge 0.4 eth from arbitrum to ethereum and borrow 30% weth from aave", async () => {
    const accountAddress = "0xa313262a5856021164bd4a5d2dda65bc018bc758";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "0.4",
          token: "eth",
          sourceChainName: "arbitrum",
          destinationChainName: "ethereum",
        },
      },
      {
        name: "borrow",
        args: {
          protocolName: "aave",
          amount: "30%",
          token: "weth",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
      arbitrum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      ethereum: {
        weth: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it.skip("borrow 30% eth on lodestar", async () => {
    const accountAddress = "0x3bf39e4677efb07a775437b5e4bd6acf12906858";
    const actions = [
      {
        name: "borrow",
        args: {
          token: "eth",
          amount: "30%",
          chainName: "arbitrum",
          protocolName: "lodestar",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  // unsupported
  it.skip("repay my usdt position on lodestar", async () => {
    const accountAddress = "0x5a4f269d00aeaa2333317e6764ddbf120b5e0b50";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "weth",
          outputToken: "usdt",
          inputAmount: "0.1",
          chainName: "ethereum",
        },
      },
      {
        name: "repay",
        args: {
          token: "usdt",
          amount: "0.1%",
          chainName: "ethereum",
          protocolName: "aave",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        weth: 0.1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  }, 500000);

  it("sell all of my rch on ethereum and buy 0x9aee3c99934c88832399d6c6e08ad802112ebeab with eth on arbitrum", async () => {
    const accountAddress = "0x024cDB696a719f37B324a852085A68786D269212";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "rch",
          outputToken: "eth",
          chainName: "ethereum",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "eth",
          outputToken: "0x9aee3c99934c88832399d6c6e08ad802112ebeab",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        rch: 100,
      },
    };
    const balanceChanges = {
      arbitrum: {
        "0x9aee3c99934c88832399d6c6e08ad802112ebeab": "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 750000);

  it("withdraw all of my eth from compound on base. then swap it for wsteth on arbitrum", async () => {
    const accountAddress = "0xB0F0ad9f2a7a4F54523C2882E16a3E9286aA3c6c";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "compound",
          amount: "all",
          token: "eth",
          chainName: "base",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "eth",
          outputToken: "wsteth",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined, 42161: undefined },
      initialBalances,
    );
  }, 750000);

  it.skip("withdraw 0.001 eth from compound on base, swap it for weeth on arbitrum and deposit to pendle sy-weeth pool on arbitrum", async () => {
    const accountAddress = "0xB0F0ad9f2a7a4F54523C2882E16a3E9286aA3c6c";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "compound",
          amount: "0.001",
          token: "eth",
          chainName: "base",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "eth",
          outputToken: "weeth",
          chainName: "arbitrum",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "pendle",
          amount: "outputAmount",
          token: "weeth",
          poolName: "sy-weeth",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined, 42161: undefined },
      initialBalances,
    );
  }, 750000);

  it("borrow 100 usdc from compound on base", async () => {
    const accountAddress = "0xABEA0e3E392bac621054303EF195FA54c5B5CA9E";
    const actions = [
      {
        name: "borrow",
        args: {
          protocolName: "compound",
          amount: "100",
          token: "usdc",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
      },
    };
    const balanceChanges = {
      base: {
        usdc: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  /// inference applied, with better inferred chains, since boop does not exist on base but exists on ethereum
  /// update: boop on ethereum mc is half a mil, so bad test
  it.skip("bridge all of my boop from arbitrum to base", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "boop",
          sourceChainName: "arbitrum",
          destinationChainName: "base",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        boop: 1000,
      },
    };
    const balanceChanges = {
      ethereum: {
        boop: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 1: undefined, 42161: undefined, 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap 40 usdc to eth on arbitrum", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdc",
          inputAmount: "40",
          outputToken: "eth",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await testFail(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      /Not able to swap usdc, (.*?) on arbitrum/i,
      initialBalances,
    );
  });

  it("short 5x with 500 usdc on hyperliquid", async () => {
    const accountAddress = "0xA7020D973b28A500E022dbABFb6A4572f0B44dB0";
    const actions = [
      {
        name: "short",
        args: {
          protocolName: "hyperliquid",
          inputAmount: "500",
          inputToken: "usdc",
          outputToken: "w",
          leverageMultiplier: 5,
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 0.001,
      },
    };
    await testFail(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      "Not able to deposit usdc, you don't have usdc on arbitrum.",
      initialBalances,
    );
  });

  it("lend 0.01 eth on aave and borrow 0.005 weETH", async () => {
    // FAILS
    const accountAddress = "0xA7020D973b28A500E022dbABFb6A4572f0B44dB0";
    const actions = [
      {
        name: "lend",
        args: {
          protocolName: "aave",
          amount: "0.01",
          token: "eth",
        },
      },
      {
        name: "borrow",
        args: {
          protocolName: "aave",
          amount: "0.005",
          token: "weeth",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it("swap eth for 140 usdc on ethereum", async () => {
    const accountAddress = "0xD7E3DC09d1f7aBD44160b42513f44aB8F4055EDA";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "usdc",
          outputAmount: "140",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    const [ethPrice, usdcPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdc",
    ]);
    const balanceChanges = {
      Ethereum: {
        eth: -140 / ethPrice,
        usdc: 140 / usdcPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("swap eth for 140 usdc on ethereum and bridge to base", async () => {
    const accountAddress = "0xD7E3DC09d1f7aBD44160b42513f44aB8F4055EDA";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "usdc",
          outputAmount: "140",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "140",
          token: "usdc",
          sourceChainName: "ethereum",
          destinationChainName: "base",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    const [ethPrice, usdcPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdc",
    ]);
    const balanceChanges = {
      Ethereum: {
        eth: -140 / ethPrice,
      },
      Base: {
        usdc: 140 / usdcPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("swap eth for 140 usdc on ethereum and bridge to base - 2", async () => {
    const accountAddress = "0xD7E3DC09d1f7aBD44160b42513f44aB8F4055EDA";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "usdc",
          outputAmount: "140",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "usdc",
          sourceChainName: "ethereum",
          destinationChainName: "base",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    const [ethPrice, usdcPrice] = await getTokenPrices(accountAddress, [
      "eth",
      "usdc",
    ]);
    const balanceChanges = {
      Ethereum: {
        eth: -140 / ethPrice,
      },
      Base: {
        usdc: 140 / usdcPrice,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it.skip("deposit 50 USDC and 50 dollars worth of ETH into the CL100-WETH/USDC liquidity pool on aerodrome on base", async () => {
    const accountAddress = "0xA7020D973b28A500E022dbABFb6A4572f0B44dB0";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "aerodrome",
          poolName: "CL100-WETH/USDC",
          amount: "50",
          token: "usdc",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "aerodrome",
          poolName: "CL100-WETH/USDC",
          amount: "50",
          amount_units: "usd",
          token: "eth",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
        usdc: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
    );
  }, 500000);

  it.skip("withdraw all tokens from 0xb2cc224c1c9feE385f8ad6a55b4d94E92359DC59 on aerodrome on base", async () => {
    const accountAddress = "0xAf9b1d88CE1CFc18BF3C3EE7e1906eBbd6c34890";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "aerodrome",
          poolName: "0xb2cc224c1c9feE385f8ad6a55b4d94E92359DC59",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
    );
  });

  it("swap tia to eth", async () => {
    // FAILS with Not able to find a proper chain for first action. Ensure you specify a chain properly in your next prompt.
    const accountAddress = "0xa081a88d8fe15c3da7ac2689b33f3eab82e8f09c";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "tia",
          outputToken: "eth",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    const balanceChanges = {
      arbitrum: {
        "0xD56734d7f9979dD94FAE3d67C7e928234e71cD4C": "-", // tia.n
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("lend all of my eth on compound, borrow 50% of it as usdc", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "lend",
        args: {
          token: "eth",
          amount: "1",
          poolName: "usdc",
          protocolName: "compound",
        },
      },
      {
        name: "borrow",
        args: {
          token: "usdc",
          amount: "half",
          protocolName: "compound",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1.5,
      },
    };
    const balanceChanges = {
      ethereum: {
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  // unsupported
  it.skip("lend all of my eth on lodestar, borrow 50% of it as usdc", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "lend",
        args: {
          token: "eth",
          amount: "1",
          protocolName: "lodestar",
        },
      },
      {
        name: "borrow",
        args: {
          token: "usdc",
          amount: "half",
          protocolName: "lodestar",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1.5,
      },
    };
    const balanceChanges = {
      arbitrum: {
        usdc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
      balanceChanges,
    );
  });

  it("lend 1 weth on juice, borrow 50% of it as usdb", async () => {
    const accountAddress = "0x0301079dabdc9a2c70b856b2c51aca02bac10c3a";
    const actions = [
      {
        name: "lend",
        args: {
          token: "weth",
          amount: "1",
          poolName: "usdb",
          protocolName: "juice",
        },
      },
      {
        name: "borrow",
        args: {
          token: "usdb",
          amount: "half",
          protocolName: "juice",
        },
      },
    ];
    await test(accountAddress, actions, "Blast", { 81457: undefined });
  });

  it("lend 1 weth on juice, borrow all of it as weth", async () => {
    const accountAddress = "0x0301079dabdc9a2c70b856b2c51aca02bac10c3a";
    const actions = [
      {
        name: "lend",
        args: {
          token: "weth",
          amount: "1",
          protocolName: "juice",
        },
      },
      {
        name: "borrow",
        args: {
          token: "weth",
          amount: "all",
          protocolName: "juice",
        },
      },
    ];
    await test(accountAddress, actions, "Blast", { 81457: undefined });
  });

  it("withdraw from the PT-uniETH-26DEC2024 pool on pendle on arbitrum", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "withdraw",
        args: {
          token: "all",
          amount: "all",
          poolName: "pt-unieth-26dec2024",
          protocolName: "pendle",
          chainName: "arbitrum",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  });

  it("withdraw from the PT-rsETH-27JUN2024 pool on pendle on arbitrum", async () => {
    const accountAddress = "0x1d9E267ccf3724ec9B199e6A635ba8515d5E0787";
    const actions = [
      {
        name: "withdraw",
        args: {
          token: "all",
          amount: "all",
          poolName: "pt-rseth-27jun2024",
          protocolName: "pendle",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  });

  it.skip("swap all my weth to usdc on polygon", async () => {
    const accountAddress = "0x148AB830AECF636B1Cdc53c53B455fBc66AC4815";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "weth",
          outputToken: "usdc",
          chainName: "polygon",
        },
      },
    ];
    await test(accountAddress, actions, "Polygon", { 137: 61718163 });
  });

  it("Swap eth to 3875 usdc and transfer 5000 usdc to niyant.eth", async () => {
    const accountAddress = "0x1714400ff23db4af24f9fd64e7039e6597f18c2b";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "usdc",
          outputAmount: "3875",
          chainName: "arbitrum",
        },
      },
      {
        name: "transfer",
        args: {
          amount: "5000",
          token: "usdc",
          recipient: "niyant.eth",
          chainName: "arbitrum",
        },
      },
    ];
    const balanceChanges = {
      arbitrum: {
        usdc: -1125,
        eth: "-",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      {},
      balanceChanges,
    );
  });

  it("sell 0.00151 ETH for usdb on blast", async () => {
    const accountAddress = "0x024cDB696a719f37B324a852085A68786D269212";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "0.00151",
          inputToken: "eth",
          outputToken: "usdb",
          chainName: "blast",
        },
      },
    ];
    await test(accountAddress, actions, "Blast", { 81457: undefined });
  });

  it("swap eth to 10250 usdc", async () => {
    const accountAddress = "0x024cDB696a719f37B324a852085A68786D269212";
    const actions = [
      {
        name: "swap",
        args: {
          // inputAmount: "4",
          inputToken: "eth",
          outputToken: "usdc",
          outputAmount: "10250",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 5,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it.skip("deposit 0.1 eth into yt sfrxeth 26dec2024 pool on ethereum", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const actions = [
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
    await test(accountAddress, actions, "Ethereum", { 1: undefined });
  });

  // unsupported
  it.skip("open 75x long on gmx sol/usdc with 0.005 eth", async () => {
    const accountAddress = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const actions = [
      {
        name: "long",
        args: {
          protocolName: "gmx",
          inputAmount: "0.005",
          inputToken: "eth",
          outputToken: "sol/usdc",
          leverageMultiplier: "75x",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  });

  it("bridge 10 usdc from base to ethereum and swap to 0x4166673521e31ed98801e45e8b068b4bc227a110", async () => {
    const accountAddress = "0x024cDB696a719f37B324a852085A68786D269212";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "usdc",
          amount: "10",
          sourceChainName: "base",
          destinationChainName: "ethereum",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "outputToken",
          inputAmount: "outputAmount",
          outputToken: "0x4166673521e31ed98801e45e8b068b4bc227a110",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
        usdc: 10,
      },
    };
    const balanceChanges = {
      ethereum: {
        "0x4166673521e31ed98801e45e8b068b4bc227a110": "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 1: undefined, 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("bridge 1000 usdc from arbitrum to base", async () => {
    const accountAddress = "0xB13CE3AFd8566C411FD3e16E9Af56D2AB3c5Ccd0";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "usdc",
          amount: "1000",
          sourceChainName: "arbitrum",
          destinationChainName: "base",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        "usdc.e": 1000,
      },
      base: {
        eth: 1,
      },
    };
    const balanceChanges = {
      arbitrum: {
        "usdc.e": -1000,
      },
      base: {
        usdc: +1000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("swap usdc to 0.4 eth and bridge to base", async () => {
    const accountAddress = "0xd99d1db9c23dd90c430db18e9ed6ba63639d6c54";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "0.4",
          token: "eth",
          sourceChainName: "arbitrum",
          destinationChainName: "base",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "0.4",
          inputToken: "eth",
          outputToken: "usdc",
          chainName: "base",
        },
      },
    ];

    const initialBalances = {
      arbitrum: {
        eth: 0.5,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
    );
  });

  // retry with an additional bridge or token substitution, since no balance to proceed with specified amount
  // retry with an additional native token bridge to top up gas
  it("swap all usdc on arbitrum to brett on base", async () => {
    const accountAddress = "0xd99d1db9c23dd90c430db18e9ed6ba63639d6c54";
    const actions = [
      {
        name: "swap",
        args: {
          amount: "all",
          inputToken: "usdc",
          outputToken: "brett",
          chainName: "base",
        },
      },
    ];

    const initialBalances = {
      arbitrum: {
        eth: 0.5,
        usdc: 100,
      },
      base: {
        usdc: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
    );
  }, 750000);

  it("swap all my weth on arbitrum for wbtc on base and deposit it in aave", async () => {
    // FAILS
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "weth",
          outputToken: "wbtc",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "wbtc",
          destinationChainName: "base",
        },
      },
      {
        name: "deposit",
        args: {
          amount: "outputAmount",
          token: "wbtc",
          protocolName: "aave",
        },
      },
    ];

    const initialBalances = {
      arbitrum: {
        eth: 1,
        weth: 1,
      },
    };
    const balanceChanges = {
      base: {
        abascbbtc: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 750000);

  it("bridge usdc from arbitrum to base and swap to bald", async () => {
    const accountAddress = "0x148AB830AECF636B1Cdc53c53B455fBc66AC4815";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "usdc",
          destinationChainName: "base",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          outputToken: "bald",
        },
      },
    ];

    const initialBalances = {
      arbitrum: {
        usdc: 4.002731,
      },
    };
    const balanceChanges = {
      arbitrum: {
        usdc: 0,
      },
      base: {
        bald: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 750000);

  // bug 1062 specific test, will fail in normal run
  it.skip("swap usdc.e to eth on arbitrum", async () => {
    const accountAddress = "0x4F4118cF9aa8bE66FC093912cA609db93E6cDFEC";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdc.e",
          outputToken: "eth",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  }, 750000);

  it("Withdraw 500 USDC from Hyperliquid, and swap to ETH", async () => {
    const accountAddress = "0x6ED5b1F41072ff460105249ab251875c71460770";
    const actions = [
      {
        name: "withdraw",
        args: {
          token: "usdc",
          protocolName: "hyperliquid",
          amount: "500",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "outputToken",
          outputToken: "eth",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  });

  it("Withdraw 500 USDC from Hyperliquid, bridge 0.02 ETH and 500 USDC to Base, and buy RUSSELL with 100 USDC on Base", async () => {
    const accountAddress = "0x6ED5b1F41072ff460105249ab251875c71460770";
    const actions = [
      {
        name: "withdraw",
        args: {
          token: "usdc",
          protocolName: "hyperliquid",
          amount: "500",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "0.02",
          token: "eth",
          destinationChainName: "base",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "500",
          token: "usdc",
          destinationChainName: "base",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "100",
          inputToken: "usdc",
          outputToken: "russell",
          chainname: "base",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 2,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      {
        42161: undefined,
        8453: undefined,
      },
      initialBalances,
    );
  }, 500000);

  it("Withdraw 1 weth from aave", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "withdraw",
        args: {
          token: "weth",
          protocolName: "aave",
          amount: "1",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  });

  it("bridge 1 eth from ethereum to arbitrum on bungee", async () => {
    const accountAddress = "0x6ED5b1F41072ff460105249ab251875c71460770";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "1",
          token: "eth",
          destinationChainName: "arbitrum",
          protocolName: "bungee",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 2,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
    );
  });

  it("bridge 1 eth from ethereum to arbitrum on lifi", async () => {
    const accountAddress = "0x6ED5b1F41072ff460105249ab251875c71460770";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "1",
          token: "eth",
          destinationChainName: "arbitrum",
          protocolName: "lifi",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 2,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
    );
  });

  it("swap lum for eth", async () => {
    const accountAddress = await getTopHolder("lum", 8453);
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "lum",
          outputToken: "eth",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 0.01,
      },
      base: {
        eth: 0.01,
        lum: 300,
      },
    };
    await test(
      accountAddress || "0x36cCdEF4decFa6Ae89707B1737e8Fc56d275414F",
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
    );
  }, 500000);

  it("withdraw 1 weth from aave", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "withdraw",
        args: {
          amount: "1",
          token: "weth",
          protocolName: "aave",
          chainName: "arbitrum",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  });

  it.skip("deposit 1 eth to pt, yt, sy pool for each", async () => {
    const accountAddress = "0xa313262a5856021164bd4a5d2dda65bc018bc758";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "pendle",
          poolName: "pt-wsteth-25jun2025",
          amount: "1",
          token: "eth",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "pendle",
          poolName: "yt-wsteth-25jun2025",
          amount: "1",
          token: "eth",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "pendle",
          poolName: "sy-wsteth-25jun2025",
          amount: "1",
          token: "eth",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 4,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  }, 500000);

  it("swap all paradox to eth", async () => {
    const accountAddress = "0xC76122D73551671A3ecF5809c45ef67b541Ab670";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "paradox",
          outputToken: "eth",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
    );
  });

  it("use $50 worth of my brett to open 2x leverage long position on btc", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "long",
        args: {
          inputToken: "brett",
          inputAmount: "50",
          inputAmountUnits: "usd",
          outputToken: "btc",
          protocolName: "hyperliquid",
          leverageMultiplier: "2x",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
        brett: 4000,
      },
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 42161: undefined, 8453: undefined },
      initialBalances,
    );
  }, 1500000);

  it.skip("buy 9 usdc with bnb and send 8.34 usdc to niyant.eth", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "bnb",
          outputToken: "usdc",
          outputAmount: "9",
        },
      },
      {
        name: "transfer",
        args: {
          recipient: "niyant.eth",
          token: "usdc",
          amount: "8.34",
        },
      },
    ];
    const initialBalances = {
      bsc: {
        bnb: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 56: undefined },
      initialBalances,
    );
  });

  it("bridge 1 weth to mainnet and buy dog", async () => {
    const accountAddress = "0x6DfbFA4AB2890Dec904a29DA24A0B2c07eBb646b";
    const actions = [
      {
        name: "bridge",
        args: {
          token: "weth",
          amount: "1",
          destinationChainName: "ethereum",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "weth",
          inputAmount: "outputAmount",
          outputToken: "dog",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", {
      1: undefined,
      42161: undefined,
    });
  }, 500000);

  it("deposit 2 eth in aave on base, borrow 40% as usdc and deposit it in hyperliquid", async () => {
    const accountAddress = "0x6DfbFA4AB2890Dec904a29DA24A0B2c07eBb646b";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "aave",
          amount: "2",
          token: "eth",
          chainName: "base",
        },
      },
      {
        name: "borrow",
        args: {
          protocolName: "aave",
          amount: "40%",
          token: "usdc",
        },
      },
      {
        name: "deposit",
        args: {
          protocolName: "hyperliquid",
          amount: "outputAmount",
          token: "usdc",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 3,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined, 42161: undefined },
      initialBalances,
    );
  }, 500000);

  it("deposit 0.1 wbtc into aave on arbitrum and borrow $1600 usdc, swap all of the usdc for ohm", async () => {
    const accountAddress = "0x6DfbFA4AB2890Dec904a29DA24A0B2c07eBb646b";
    const actions = [
      {
        name: "deposit",
        args: {
          protocolName: "aave",
          amount: "0.1",
          token: "wbtc",
          chainName: "arbitrum",
        },
      },
      {
        name: "borrow",
        args: {
          protocolName: "aave",
          amount: "1600",
          amount_units: "usd",
          token: "usdc",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "usdc",
          outputToken: "ohm",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        wbtc: 0.1,
        usdc: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  }, 500000);

  it("withdraw 1 weth from aave on arbitrum. swap $2400 of weth to usdc. repay my aave loan. then swap all of my usdc to eth", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "withdraw",
        args: {
          protocolName: "aave",
          amount: "1",
          token: "weth",
          chainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "2400",
          inputAmountUnits: "usd",
          inputToken: "weth",
          outputToken: "usdc",
          chainName: "arbitrum",
        },
      },
      {
        name: "repay",
        args: {
          protocolName: "aave",
          token: "usdc",
          amount: "500",
          chainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "all",
          inputToken: "usdc",
          outputToken: "eth",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 0.1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  }, 500000);

  it("swap my virtual on arbitrum for usdc", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "virtual",
          outputToken: "usdc",
          slippage: "1",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
        virtual: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it("swap ph to usdc", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "ph",
          outputToken: "usdc",
        },
      },
    ];
    const initialBalances = {
      base: {
        "0x6136494DB8A33707b2da36c2608994982EFA04C2": 10000,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
    );
  }, 500000);

  it("swap eth for 100$ of usdc, then bridge th usdc to eth and deposit it into aave", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          outputToken: "usdc",
          outputAmount: "100",
        },
      },
      {
        name: "bridge",
        args: {
          token: "usdc",
          amount: "outputAmount",
          destinationChainName: "ethereum",
        },
      },
      {
        name: "deposit",
        args: {
          token: "usdc",
          amount: "outputAmount",
          protocolName: "aave",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 0.07143,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 1: undefined, 8453: undefined },
      initialBalances,
    );
  }, 750000);

  it("swap 0.01 eth to chaos base", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "0.01",
          outputToken: "chaos",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
    );
  });

  it("swap 0.01 eth to aiblks base", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "0.01",
          outputToken: "aiblks",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
    );
  });

  it("swap 0.01 eth to ph base", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "0.01",
          outputToken: "ph",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
    );
  });

  it("swap 0.01 eth to sqdgn base", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "0.01",
          outputToken: "sqdgn",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
    );
  });

  it("swap 0.01 eth to virtual base", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "0.01",
          outputToken: "virtual",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
    );
  });

  it("sell $30 of keycat for usdc and send it to niyant.eth on arbitrum", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "keycat",
          inputAmount: "30",
          inputAmountUnits: "usd",
          outputToken: "usdc",
          chainName: "arbitrum",
        },
      },
      {
        name: "transfer",
        args: {
          token: "usdc",
          amount: "outputAmount",
          recipient: "niyant.eth",
          chainName: "arbitrum",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 0.4,
      },
      base: {
        eth: 0.5,
        keycat: 168250,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
    );
  }, 750000);

  it("withdraw 30 usdc from hyperliquid and send it to niyant.eth", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "withdraw",
        args: {
          token: "usdc",
          amount: "30",
          protocolName: "hyperliquid",
          chainName: "arbitrum",
        },
      },
      {
        name: "transfer",
        args: {
          token: "usdc",
          amount: "outputAmount",
          recipient: "niyant.eth",
          chainName: "arbitrum",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  });

  it("sell hype, transfer to perps, and long btc", async () => {
    const accountAddress = "0x6DfbFA4AB2890Dec904a29DA24A0B2c07eBb646b";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "hype",
          outputToken: "usdc",
          protocolName: "hyperliquid",
          chainName: "arbitrum",
        },
      },
      {
        name: "transfer",
        args: {
          token: "usdc",
          amount: "outputAmount",
          recipient: "perp",
          protocolName: "hyperliquid",
          chainName: "arbitrum",
        },
      },
      {
        name: "long",
        args: {
          inputToken: "usdc",
          inputAmount: "outputAmount",
          outputToken: "btc",
          protocolName: "hyperliquid",
          chainName: "arbitrum",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  });

  it("swap 10 usdc to purr on hyperliquid", async () => {
    const accountAddress = "0x4F4118cF9aa8bE66FC093912cA609db93E6cDFEC";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdc",
          inputAmount: "10",
          outputToken: "purr",
          protocolName: "hyperliquid",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  });

  it("swap 1 eth to purr on base", async () => {
    const accountAddress = "0x4F4118cF9aa8bE66FC093912cA609db93E6cDFEC";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "1",
          outputToken: "purr",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 2,
      },
      arbitrum: {
        eth: 0.1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined, 42161: undefined },
      initialBalances,
    );
  }, 750000);

  it("swap 1 eth to hype on base", async () => {
    const accountAddress = "0x4F4118cF9aa8bE66FC093912cA609db93E6cDFEC";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "1",
          outputToken: "hype",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 2,
      },
      arbitrum: {
        eth: 0.1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined, 42161: undefined },
      initialBalances,
    );
  }, 750000);

  it("long btc with 4 usdc on hyperliqiud", async () => {
    const accountAddress = "0x4F4118cF9aa8bE66FC093912cA609db93E6cDFEC";
    const actions = [
      {
        name: "long",
        args: {
          inputToken: "usdc",
          inputAmount: "4",
          outputToken: "btc",
          protocolName: "hyperliquid",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      /Hyperliquid only supports long of at least/i,
    );
  });

  it("swap wbtc on eth to jeff on hyperliqiud", async () => {
    const accountAddress = "0x024cDB696a719f37B324a852085A68786D269212";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "wbtc",
          outputToken: "jeff",
          protocolName: "hyperliquid",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        wbtc: 0.1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
    );
  }, 500000);

  it("transfer wbtc on eth to spot on hyperliqiud", async () => {
    const accountAddress = "0x024cDB696a719f37B324a852085A68786D269212";
    const actions = [
      {
        name: "transfer",
        args: {
          token: "wbtc",
          protocolName: "hyperliquid",
          recipient: "spot",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        wbtc: 0.1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
    );
  }, 500000);

  it("deposit wbtc on eth to hyperliqiud", async () => {
    const accountAddress = "0x024cDB696a719f37B324a852085A68786D269212";
    const actions = [
      {
        name: "deposit",
        args: {
          token: "wbtc",
          protocolName: "hyperliquid",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        wbtc: 0.1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined, 42161: undefined },
      initialBalances,
    );
  }, 500000);

  it("withdraw usdc on eth from hyperliqiud", async () => {
    const accountAddress = "0x4F4118cF9aa8bE66FC093912cA609db93E6cDFEC";
    const actions = [
      {
        name: "withdraw",
        args: {
          token: "usdc",
          protocolName: "hyperliquid",
          chainName: "ethereum",
        },
      },
    ];
    await test(accountAddress, actions, "Ethereum", {
      1: undefined,
      42161: undefined,
    });
  }, 500000);

  it("swap half of my weth on arbitrum to hype from hyperliqiud", async () => {
    const accountAddress = "0x6DfbFA4AB2890Dec904a29DA24A0B2c07eBb646b";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "weth",
          inputAmount: "half",
          outputToken: "hype",
          chainName: "arbitrum",
          protocolName: "hyperliquid",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  }, 500000);

  it("long eigen with 3x leverage", async () => {
    // FAILS
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "long",
        args: {
          protocolName: "hyperliquid",
          outputToken: "eigen",
          leverageMultiplier: "3x",
          chainName: "arbitrum",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  }, 750000);

  it("swap 1 weth on arbitrum to jeff on hyperliquid", async () => {
    const accountAddress = "0x6DfbFA4AB2890Dec904a29DA24A0B2c07eBb646b";
    const actions = [
      {
        name: "swap",
        args: {
          protocolName: "hyperliquid",
          inputToken: "weth",
          inputAmount: "1",
          outputToken: "jeff",
          chainName: "arbitrum",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  }, 500000);

  it("twap swap usdc for schizo on hl over the next 10 minutes", async () => {
    const accountAddress = "0x024cDB696a719f37B324a852085A68786D269212";
    const actions = [
      {
        name: "swap",
        args: {
          protocolName: "hyperliquid",
          inputToken: "usdc",
          outputToken: "schizo",
          chainName: "arbitrum",
          runningTime: "10 minutes",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  });

  it("long solana on hyperliquid by selling hype for usdc and using that", async () => {
    const accountAddress = "0x6DfbFA4AB2890Dec904a29DA24A0B2c07eBb646b";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "hype",
          outputToken: "usdc",
          chainName: "arbitrum",
        },
      },
      {
        name: "long",
        args: {
          protocolName: "hyperliquid",
          inputToken: "usdc",
          inputAmount: "outputAmount",
          outputToken: "sol",
          chainName: "arbitrum",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  }, 500000);

  it("sell my hype for jeff on hl", async () => {
    const accountAddress = "0x6DfbFA4AB2890Dec904a29DA24A0B2c07eBb646b";
    const actions = [
      {
        name: "swap",
        args: {
          protocolName: "hyperliquid",
          inputToken: "hype",
          outputToken: "jeff",
          outputAmount: "1000",
          chainName: "arbitrum",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  });

  it("buy $1000 of hype on hl", async () => {
    const accountAddress = "0x024cDB696a719f37B324a852085A68786D269212";
    const actions = [
      {
        name: "swap",
        args: {
          protocolName: "hyperliquid",
          inputToken: "usdc",
          inputAmount: "1000",
          inputAmountUnits: "usd",
          outputToken: "hype",
          chainName: "arbitrum",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      /Not enough usdc on hyperliquid. You have [+-]?([0-9]*[.])?[0-9]+ and need [+-]?([0-9]*[.])?[0-9]+. Please onboard [+-]?([0-9]*[.])?[0-9]+ more usdc and try again./i,
    );
  });

  it("buy 1000 hype on hl", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          protocolName: "hyperliquid",
          inputToken: "usdc",
          outputToken: "hype",
          outputAmount: "1000",
          chainName: "arbitrum",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      /Insufficient balance on hyperliquid spot market./i,
    );
  });

  it("short $500 of FARTCOIN nominal on hl and buy $500 spot of FARTCOIN on hl", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "short",
        args: {
          protocolName: "hyperliquid",
          inputToken: "usdc",
          inputAmount: "166.66",
          outputToken: "fartcoin",
          leverageMultiplier: "3",
          chainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          protocolName: "hyperliquid",
          inputToken: "usdc",
          inputAmount: "500",
          outputToken: "fartcoin",
          chainName: "arbitrum",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      /Token fartcoin not found on hyperliquid spot market./i,
    );
  }, 750000);

  it("sell my usdc for jeff on hl", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "swap",
        args: {
          protocolName: "hyperliquid",
          inputToken: "usdc",
          outputToken: "jeff",
          chainName: "arbitrum",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      "Not able to swap usdc, you don't have spot usdc on hyperliquid.",
    );
  });

  it("transfer usdc to perp on hl", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "transfer",
        args: {
          protocolName: "hyperliquid",
          token: "usdc",
          recipient: "perp",
          chainName: "arbitrum",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      "Not able to transfer usdc, you don't have spot usdc on hyperliquid.",
    );
  });

  it("transfer usdc to spot on hl", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "transfer",
        args: {
          protocolName: "hyperliquid",
          token: "usdc",
          recipient: "spot",
          chainName: "arbitrum",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      "Not able to transfer usdc, you don't have perp usdc on hyperliquid.",
    );
  });

  it("buy $20 of lqna on hl", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          protocolName: "hyperliquid",
          inputToken: "usdc",
          outputToken: "lqna",
          outputAmount: "20",
          chainName: "arbitrum",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  }, 500000);

  it("long sol position with all my usdc on hl", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "long",
        args: {
          protocolName: "hyperliquid",
          inputToken: "usdc",
          outputToken: "sol",
          chainName: "arbitrum",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      "Not able to deposit usdc, you don't have usdc on arbitrum.",
    );
  });

  it("limit perp short $336300 notional SOL (price $224.2)", async () => {
    const accountAddress = "0x96570D876585c77565E3159B9a58f1128af36c42";
    const actions = [
      {
        name: "short",
        args: {
          protocolName: "hyperliquid",
          inputToken: "usdc",
          inputAmount: "840.75",
          limitPrice: "224.2",
          outputToken: "sol",
          chainName: "arbitrum",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      /Not able to deposit usdc/i,
    );
  }, 500000);

  it("swap 0.069 eth on mainnet to cult", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "0.069",
          outputToken: "cult",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 0.177,
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 1: undefined },
      initialBalances,
    );
  });

  it("swap usdc to ftm on base", async () => {
    const accountAddress = "0x406C22b8740ae955b04fD11c2061E053807E2A69";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdc",
          outputToken: "ftm",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
        usdc: 100,
      },
    };
    const balanceChanges = {
      base: {
        ftm: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("swap 0.01 eth to pepe on ethereum", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "0.01",
          outputToken: "pepe",
          chainName: "ethereum",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
      arbitrum: {
        eth: 0.1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 1: undefined },
      initialBalances,
    );
  }, 500000);

  it("close my sol position on hl, withdraw 5 usdc from hl, bridge it to base and buy virtual with it", async () => {
    const accountAddress = "0x4F4118cF9aa8bE66FC093912cA609db93E6cDFEC";
    const actions = [
      {
        name: "close",
        args: {
          protocolName: "hyperliquid",
          outputToken: "sol",
          chainName: "arbitrum",
        },
      },
      {
        name: "withdraw",
        args: {
          protocolName: "hyperliquid",
          amount: "5",
          token: "usdc",
          chainName: "arbitrum",
        },
      },
      {
        name: "bridge",
        args: {
          amount: "outputAmount",
          token: "usdc",
          destinationChainName: "base",
          sourceChainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          inputAmount: "outputAmount",
          inputToken: "usdc",
          outputToken: "virtual",
          chainName: "base",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", {
      42161: undefined,
      8453: undefined,
    });
  }, 750000);

  it("bridge 1 usdc from arbitrum to base and swap it to virtual", async () => {
    const accountAddress = "0xa5Ef861278D7bf18A8A2068a01D66FBdeD93A1BD";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "1",
          token: "usdc",
          sourceChainName: "arbitrum",
          destinationChainName: "base",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "usdc",
          inputAmount: "outputAmount",
          outputToken: "virtual",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        usdc: 1,
      },
    };
    const balanceChanges = {
      base: {
        virtual: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("buy 10 usdc of 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b", async () => {
    const accountAddress = "0x024cDB696a719f37B324a852085A68786D269212";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdc",
          inputAmount: "10",
          outputToken: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        usdc: 1111,
      },
    };
    const balanceChanges = {
      base: {
        virtual: "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Ethereum",
      { 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("swap 0.1 eth to 0x61928bf5f2895B682ecC9B13957AA5a5fE040cC0", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "0.1",
          outputToken: "0x61928bf5f2895B682ecC9B13957AA5a5fE040cc0", // last c lowercased on purpose
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
      },
    };
    const balanceChanges = {
      base: {
        "0x61928bf5f2895B682ecC9B13957AA5a5fE040cC0": "+",
      },
    };
    await test(
      accountAddress,
      actions,
      "Base",
      { 8453: undefined },
      initialBalances,
      balanceChanges,
    );
  }, 500000);

  it("bridge all my ETH to base", async () => {
    const accountAddress = "0x17BEDfb7f8750538562c7fCd0C714b7fFdEAec83";
    const actions = [
      {
        name: "bridge",
        args: {
          amount: "all",
          token: "eth",
          destinationChainName: "base",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 0.2,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
    );
  }, 500000);

  it("swap 0.001 eth on arbitrum to higher on base", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "0.001",
          outputToken: "higher",
          chainName: "arbitrum",
        },
      },
      {
        name: "bridge",
        args: {
          token: "higher",
          amount: "outputAmount",
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
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined, 8453: undefined },
      initialBalances,
    );
  }, 500000);

  it("swap 11 usdc to hype", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "usdc",
          inputAmount: "11",
          outputToken: "hype",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "Arbitrum",
      { 42161: undefined },
      initialBalances,
    );
  }, 500000);

  it("sell 20% of my AIXBT for usdc and use it to long SOL on hl", async () => {
    const accountAddress = "0xbb3d4097e9f1279f07e981eaff384eb6566fbe2d";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "aixbt",
          inputAmount: "20%",
          outputToken: "usdc",
        },
      },
      {
        name: "long",
        args: {
          inputToken: "usdc",
          inputAmount: "outputAmount",
          outputToken: "sol",
          protocolName: "hyperliquid",
          chainName: "arbitrum",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  }, 750000);

  it("close my SOL position and use the funds to buy hype", async () => {
    const accountAddress = "0x4F4118cF9aa8bE66FC093912cA609db93E6cDFEC";
    const actions = [
      {
        name: "close",
        args: {
          outputToken: "sol",
          percentReduction: "100%",
          protocolName: "hyperliquid",
          chainName: "arbitrum",
        },
      },
      {
        name: "swap",
        args: {
          inputToken: "usdc",
          outputToken: "hype",
          protocolName: "hyperliquid",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", { 42161: undefined });
  }, 500000);

  it("withdraw usdc from hyperliquid and bridge to base", async () => {
    const accountAddress = "0x4F4118cF9aa8bE66FC093912cA609db93E6cDFEC";
    const actions = [
      {
        name: "withdraw",
        args: {
          token: "usdc",
          protocolName: "hyperliquid",
          chainName: "arbitrum",
        },
      },
      {
        name: "bridge",
        args: {
          token: "usdc",
          amount: "outputAmount",
          destinationChainName: "base",
        },
      },
    ];
    await test(accountAddress, actions, "Arbitrum", {
      42161: undefined,
      8453: undefined,
    });
  }, 500000);

  it("swap 0x768be13e1680b5ebe0024c42c896e3db59ec0149 to eth on base", async () => {
    const accountAddress = "0x590a4d27bcb4795c2573f255350e3a96f39127bf";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "0x768be13e1680b5ebe0024c42c896e3db59ec0149",
          outputToken: "eth",
          chainName: "base",
        },
      },
    ];
    await test(accountAddress, actions, "Base", { 8453: undefined });
  }, 500000);

  it("borrow 100 dai on aave", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "borrow",
        args: {
          token: "dai",
          amount: "100",
          chainName: "ethereum",
          protocolName: "aave",
        },
      },
    ];
    const initialBalances = {
      ethereum: {
        eth: 1,
      },
    };
    await testFail(
      accountAddress,
      actions,
      "",
      { 1: undefined },
      "Transaction failed with reason: The collateral balance is 0",
      initialBalances,
    );
  });

  it("swap 0.01 eth for virtual token 0x6B41cE9B32218817687767F0a53dcA8354512fCd on base", async () => {
    const accountAddress = "0x117478a1aDd768f9818c23C7D0A5D4cfa42dF0cB";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "0.01",
          outputToken: "0x6B41cE9B32218817687767F0a53dcA8354512fCd",
          chainName: "base",
        },
      },
    ];
    const initialBalances = {
      base: {
        eth: 1,
      },
    };
    await test(
      accountAddress,
      actions,
      "",
      { 8453: undefined },
      initialBalances,
    );
  });

  it("i want to buy 0.1 eth of citadel token on base", async () => {
    const accountAddress = "0xb58b4787CCa97596d312c59e4462F178DF1f0EFB";
    const actions = [
      {
        name: "swap",
        args: {
          inputToken: "eth",
          inputAmount: "0.1",
          outputToken: "citadel",
          chainName: "base",
        },
      },
    ];
    await testFail(
      accountAddress,
      actions,
      "",
      { 8453: undefined },
      "No swap route found with slippage 50%",
    );
  });

  it("long sol with 100 usdc on hyperliquid", async () => {
    const accountAddress = "0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000";
    const actions = [
      {
        name: "long",
        args: {
          inputToken: "usdc",
          inputAmount: "100",
          outputToken: "sol",
          chainName: "arbitrum",
          protocolName: "hyperliquid",
        },
      },
    ];
    const initialBalances = {
      arbitrum: {
        eth: 1,
        usdc: 100,
      },
    };
    await test(
      accountAddress,
      actions,
      "",
      { 42161: undefined },
      initialBalances,
    );
  });

  it("swap usdc to vine", async () => {
    const accountAddress = "5yVFuXUwFGoYFHEaiLmgHFXmn9ERrG5Tg9chCQFu3BBE";
    const action = {
      name: "swap",
      args: {
        inputToken: "usdc",
        outputToken: "vine",
      },
    };
    const { success } = await simulateSolanaActions(accountAddress, action);
    expect(success).toBeTruthy();
  });
});

// fresh new address - 0x428AB2BA90EBa0A4be7af34c9AC451Ab061ac000
