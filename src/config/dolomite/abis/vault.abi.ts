export default [
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_toAccountNumber",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_amountWei",
        type: "uint256",
      },
    ],
    name: "depositIntoVaultForDolomiteMargin",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_fromAccountNumber",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_amountWei",
        type: "uint256",
      },
    ],
    name: "withdrawFromVaultForDolomiteMargin",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_amount",
        type: "uint256",
      },
    ],
    name: "stakeEsGmx",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_amount",
        type: "uint256",
      },
    ],
    name: "stakeGmx",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_amount",
        type: "uint256",
      },
    ],
    name: "unstakeEsGmx",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_amount",
        type: "uint256",
      },
    ],
    name: "unstakeGmx",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_amount",
        type: "uint256",
      },
    ],
    name: "stake",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_amount",
        type: "uint256",
      },
    ],
    name: "unstake",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint96",
        name: "_amount",
        type: "uint96",
      },
    ],
    name: "stakePlvGlp",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint96",
        name: "_amount",
        type: "uint96",
      },
    ],
    name: "unstakePlvGlp",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "harvestRewards",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bool",
        name: "_shouldClaimGmx",
        type: "bool",
      },
      {
        internalType: "bool",
        name: "_shouldStakeGmx",
        type: "bool",
      },
      {
        internalType: "bool",
        name: "_shouldClaimEsGmx",
        type: "bool",
      },
      {
        internalType: "bool",
        name: "_shouldStakeEsGmx",
        type: "bool",
      },
      {
        internalType: "bool",
        name: "_shouldStakeMultiplierPoints",
        type: "bool",
      },
      {
        internalType: "bool",
        name: "_shouldClaimWeth",
        type: "bool",
      },
      {
        internalType: "bool",
        name: "_shouldDepositWethIntoDolomite",
        type: "bool",
      },
    ],
    name: "handleRewards",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "harvest",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
