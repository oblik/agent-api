import type { Chain } from "viem";
import { http, createPublicClient } from "viem";
import {
  arbitrum,
  avalanche,
  base,
  blast,
  bsc,
  celo,
  fantom,
  linea,
  mainnet,
  mantle,
  mode,
  optimism,
  polygon,
  zksync,
} from "viem/chains";
import type { RetryProvider } from "./retryProvider.js";
import type { ChainId } from "./types.js";
import { assert, isChainId } from "./types.js";

function getViemChainById(chainId: number): Chain {
  const chainMap: Record<number, Chain> = {
    1: mainnet, // Ethereum Mainnet
    10: optimism, // Optimism
    56: bsc, // BNB Smart Chain
    137: polygon, // Polygon
    // 250: fantom, // Fantom
    324: zksync, // zkSync Era
    5000: mantle, // Mantle
    8453: base, // Base
    34443: mode, // Mode
    42161: arbitrum, // Arbitrum One
    42220: celo, // Celo
    43114: avalanche, // Avalanche
    59144: linea, // Linea
    81457: blast, // Blast
  };

  const chain = chainMap[chainId];
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  return chain;
}

async function getViemClientParamsFromEthers(provider: RetryProvider) {
  const chainId = (await provider.getNetwork()).chainId;
  assert(isChainId(chainId));
  return {
    chain: getViemChainById(chainId),
    transport: http(provider._getConnection().url),
  };
}

export async function getViemPublicClientFromEthers(provider: RetryProvider) {
  return createPublicClient(await getViemClientParamsFromEthers(provider));
}
