import EntityData from "../config/common/entity.js";
import ProtocolPools from "../config/pools.js";
import ProtocolTokens from "../config/token.js";
import { getChainIdFromName } from "./index.js";
import { getUserPositions } from "./protocols/index.js";

export const getUnsupportedChainError = (chainName: unknown) => {
  return `Chain ${chainName} is not supported.
  Supported chains are ${EntityData.chains.join(", ")}`;
};

export const getUnsupportedProtocolError = (
  protocol: unknown,
  action: string,
) => {
  return `Protocol ${protocol} is not supported for ${action}. Supported protocols are ${EntityData.actions[action].join(", ")}`;
};

export const getUnsupportedPoolError = (
  chainName: string,
  protocol: string,
  pool: string,
  pools: string[] | undefined = undefined,
) => {
  const protocolPools = ProtocolPools[protocol.toLowerCase()];
  const poolList = protocolPools[getChainIdFromName(chainName) || ""];
  if ((pools || poolList).join(", ").trim() !== "") {
    return `Pool ${pool} is not supported for protocol ${protocol} on ${chainName}. Supported pools are ${(pools || poolList).join(", ")}`;
  }
  return `Pool ${pool} is not supported for protocol ${protocol} on ${chainName}.`;
};

export const getUnsupportedTokenError = (
  chainName: string,
  protocol: string,
  token: string,
) => {
  const protocolTokens = ProtocolTokens[protocol.toLowerCase()];
  const tokenList = protocolTokens[
    getChainIdFromName(chainName) || ""
  ] as string[];
  const token_ = token.startsWith("w") ? token.slice(1) : token;
  const similarTokens = tokenList.filter((x) =>
    x.toLowerCase().includes(token_.toLowerCase()),
  );
  if (similarTokens.length === 1)
    return `Token ${token} is not supported. Did you mean ${similarTokens[0]}?`;
  if (similarTokens.length > 1)
    return `Token ${token} is not supported. Did you mean ${similarTokens.slice(0, -1).join(", ")} or ${similarTokens[similarTokens.length - 1]}?`;
  return `Depositing into ${protocol.toLowerCase()} is not supported with ${token}. Available tokens to deposit are ${tokenList.join(", ")}`;
};

export const getUnsupportedPoolTokenError = (
  chainName: string,
  protocol: string,
  pool: string,
  token: string,
) => {
  const protocolTokens = ProtocolTokens[protocol.toLowerCase()];
  const tokenList = protocolTokens[getChainIdFromName(chainName) || ""];
  const poolTokenlist = tokenList[pool.toLowerCase()] as string[];
  return `Depositing into ${protocol.toLowerCase()} ${pool} pool is not supported with ${token}. Available tokens to deposit are ${poolTokenlist.join(", ")}`;
};

export const getMissingPoolNameError = (
  chainName: string,
  protocol: string,
  token: string | undefined,
  action = "deposit",
) => {
  const chainId = getChainIdFromName(chainName);
  const protocolTokens = ProtocolTokens[protocol.toLowerCase()];
  const tokenList: Record<string, string[]> = protocolTokens[chainId || ""];
  const poolList: string[] = [];
  for (const name of Object.keys(tokenList)) {
    if (
      tokenList[name].find(
        (element) => element.toLowerCase() === token?.toLowerCase(),
      )
    ) {
      poolList.push(name);
    }
  }
  if (poolList.length > 0) {
    return `The pool name must be provided. Available pools to ${action} using ${token?.toUpperCase()} token are ${poolList.join(", ")}.`;
  }
  return `There is no pool to ${action} using ${token?.toUpperCase()} token. You might need to try a wrapped or bridged version of the token.`;
};

export const getMissingPoolNameWithdrawError = async (
  chainName: string,
  protocol: string,
  accountAddress: string,
) => {
  const chainId = getChainIdFromName(chainName);
  if (!chainId) {
    console.log(`protocols: ${chainId} chainId is not valid`);
    return;
  }
  const positionList = await getUserPositions(
    chainId,
    accountAddress,
    protocol.toLowerCase(),
  );
  const poolNameList: string[] = [];

  if (positionList[0]) {
    let positionCount = 0;
    const positionData = positionList[0].positions;
    for (let i = 0; i < positionData.length; i++) {
      if (
        (positionData[i].supply || []).length > 0 &&
        positionData[i].poolName
      ) {
        positionCount++;
        poolNameList.push(positionData[i].poolName || "");
      }
    }
    if (positionCount === 0) {
      return `There is no position to withdraw using ${accountAddress}`;
    }
    if (positionCount === 1 && !poolNameList[0]) {
      return `There is no position to withdraw using ${accountAddress}`;
    }
    if (positionCount > 1) {
      poolNameList.sort();
      return `Available positions to withdraw using ${accountAddress} are ${poolNameList.join(", ")} pool.`;
    }
  } else {
    return "The pool name must be provided.";
  }
};

export const getUnsupportedActionError = (
  action: string,
  supported: string[],
  protocol: string | undefined = undefined,
) => {
  return `Action ${action} is not supported${protocol ? ` for ${protocol}` : ""}. Supported actions are ${supported.join(", ")}`;
};

export const getNoSwapRouteError = (
  inputToken?: string,
  outputToken?: string,
  chainName?: string,
  slippage?: string | number,
) => {
  if (slippage) {
    const slippage_ =
      typeof slippage === "string"
        ? Number.parseFloat(slippage.replace("%", ""))
        : slippage;
    return `No swap route found for ${inputToken} to ${outputToken} on ${chainName} with ${slippage_}% slippage. Try requesting a higher slippage percentage for your swap or try again in a few minutes.`;
  }
  return `No swap route found for ${inputToken} to ${outputToken} on ${chainName}. Try again in a few minutes.`;
};

export const getNoBridgeRouteError = (
  token?: string,
  sourceChainName?: string,
  destinationChainName?: string,
) => {
  return `No bridge route found for ${token} from ${sourceChainName} to ${destinationChainName}.`;
};

export const getNoPositionError = (
  action: string,
  chain: string | undefined, // current chain
  chains_?: (string | undefined)[], // alternative chains
  protocol?: string,
  token?: string, // target token
  tokens_?: string[], // alternative tokens
) => {
  const chains = chains_ ?? [];
  const tokens = tokens_ ?? [];
  const tailing =
    chains.length > 0
      ? `Available positions to ${action} are on ${chains.join(",")}.`
      : tokens.length > 0
        ? `Available tokens to ${action} are ${tokens.join(", ")}.`
        : `Ensure you have tokens to ${action} on your Slate account.`;
  return `Could not detect ${token || "any tokens"} to ${action}${protocol ? ` from ${protocol}` : ""} on ${chain}. ${tailing}`;
};

export const getChainError = (
  chain1: string,
  chain2: string | undefined = undefined,
) => {
  const chain2Str = chain2 ? ` or ${chain2}` : "";
  return `Chain name ${chain1}${chain2Str} is invalid.`;
};
