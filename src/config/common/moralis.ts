import { EvmChain } from "@moralisweb3/common-evm-utils";

export default {
  chainIds: {
    1: EvmChain.ETHEREUM,
    10: EvmChain.OPTIMISM,
    // 25: EvmChain.CRONOS,
    56: EvmChain.BSC,
    // 61: "ETH",
    // 100: "xdai",
    137: EvmChain.POLYGON,
    250: EvmChain.FANTOM,
    // 314: "FIL",
    // 1284: "mobm",
    // 1285: "moonriver",
    // 2222: "kava",
    // 5000: "MNT",
    // 7700: "canto",
    8453: "0x2105",
    42161: EvmChain.ARBITRUM,
    // 42220: "celo",
    43114: EvmChain.AVALANCHE,
    59144: EvmChain.LINEA,
    // Add more chainId-rpcUrl mappings here as needed
  },
};
