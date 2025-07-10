export default {
  0: ["", ""],
  1: [
    "First Mission: ",
    'Onboard 0.1 ETH onto your Slate Account on Arbitrum. Try executing "swap 0.01 eth to usdc on arbitrum."',
  ],
  2: [
    "Next Mission - Bridge Prompt: ",
    'Double check you have enough ETH (gas + 0.01) on Arbitrum in Slate. Try executing "bridge 0.01 ETH from arbitrum to base."',
  ],
  3: [
    "Next Mission - Time Condition: ",
    'Double check you have enough ETH (0.01 + gas) on Arbitrum and ETH (gas) on Base in Slate. Try executing "bridge 0.01 eth from arbitrum to base and buy toshi with it at 12pm tomorrow."',
  ],
  4: [
    "Next Mission - Multi-Chain Combo Prompt: ",
    'Double check you have enough USDC and ETH (gas) on Arbitrum and ETH (gas) on Base in Slate. Try executing "bridge all of my usdc on arbitrum to base and swap it for bald."',
  ],
  5: [
    "Next Mission - Recurring Condition: ",
    'Double check you have enough USDC and ETH (gas) on Arbitrum. Try executing "bridge 1 usdc from arbitrum to optimism using bungee every 5 minutes for 30 minutes."',
  ],
  6: [
    "Next Mission - Multi-Protocol Combo Prompt: ",
    'Double check you have enough ETH (0.1 + gas) on Arbitrum in Slate. Try executing "lend 0.1 eth on aave on arbitrum, borrow 20 usdc from aave, and short arb with 2x leverage with the usdc on gmx."',
  ],
  7: [
    "Next Mission - Price Condition: ",
    'Double check you have enough USDC and ETH (gas) on Arbitrum. Try executing "buy eth with 10 usdc on arbitrum when eth price goes below $3000."',
  ],
  8: [
    "Next Mission - Market Cap Condition: ",
    'Double check you have enough USDC and ETH (gas) on Base. Try executing "buy DEGEN with 10 usdc on base when DEGEN market cap hits $700,000,000."',
  ],
  9: [
    "Next Mission - Gas Condition: ",
    'Double check you have enough ETH (0.01 + gas) on Ethereum in Slate. Try executing "bridge 0.01 eth from ethereum to arbitrum when gas goes below 35."',
  ],
  10: [
    "Next Mission - Combo Conditions: ",
    'Double check you have enough USDC and ETH (0.01 + gas) on Ethereum in Slate. Try executing "swap 10 usdc to eth on ethereum when gas goes below 35 and eth price hits $3000"',
  ],
  11: ["", ""],
} as { [key: number]: [string, string] };
