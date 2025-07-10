export default [
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "governor",
            type: "address",
          },
          {
            internalType: "UD60x18",
            name: "optimalUtilizationRate",
            type: "uint256",
          },
          {
            internalType: "UD60x18",
            name: "baseBorrowRate",
            type: "uint256",
          },
          {
            internalType: "UD60x18",
            name: "borrowRateSlope1",
            type: "uint256",
          },
          {
            internalType: "UD60x18",
            name: "borrowRateSlope2",
            type: "uint256",
          },
          {
            internalType: "UD60x18",
            name: "utilizationRateCap",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "minimumLendingPoolBalance",
            type: "uint256",
          },
        ],
        internalType: "struct InterestRateStrategyV2.InitParams",
        name: "params",
        type: "tuple",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [],
    name: "LendingPoolBalanceTooLow",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "x",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "y",
        type: "uint256",
      },
    ],
    name: "PRBMath_MulDiv18_Overflow",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
      {
        internalType: "string",
        name: "role",
        type: "string",
      },
    ],
    name: "UnauthorizedRole",
    type: "error",
  },
  {
    inputs: [],
    name: "UtilizationRateTooHigh",
    type: "error",
  },
  {
    inputs: [],
    name: "baseBorrowRate",
    outputs: [
      {
        internalType: "UD60x18",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "borrowRateSlope1",
    outputs: [
      {
        internalType: "UD60x18",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "borrowRateSlope2",
    outputs: [
      {
        internalType: "UD60x18",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "UD60x18",
        name: "utilization",
        type: "uint256",
      },
    ],
    name: "calculateInterestRate",
    outputs: [
      {
        internalType: "UD60x18",
        name: "liquidityRate",
        type: "uint256",
      },
      {
        internalType: "UD60x18",
        name: "borrowRate",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getProtocolGovernor",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "minimumLendingPoolBalance",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "optimalUtilizationRate",
    outputs: [
      {
        internalType: "UD60x18",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_minimumLendingPoolBalance",
        type: "uint256",
      },
    ],
    name: "updateMinimumLendingPoolBalance",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "UD60x18",
        name: "_optimalUtilizationRate",
        type: "uint256",
      },
      {
        internalType: "UD60x18",
        name: "_baseBorrowRate",
        type: "uint256",
      },
      {
        internalType: "UD60x18",
        name: "_borrowRateSlope1",
        type: "uint256",
      },
      {
        internalType: "UD60x18",
        name: "_borrowRateSlope2",
        type: "uint256",
      },
    ],
    name: "updateRateParameters",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "UD60x18",
        name: "_utilizationRateCap",
        type: "uint256",
      },
    ],
    name: "updateUtilizationRateCap",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "utilizationRateCap",
    outputs: [
      {
        internalType: "UD60x18",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;
