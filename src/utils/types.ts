import type { BridgeRoute } from "./bridge.js";
import type { RetryProvider } from "./retryProvider.js";
import type { SwapRoute } from "./swap.js";

export type CommonArgs = {
  protocolName?: string;
  poolName?: string;
  inputAmount?: string;
  inputAmountUnits?: string;
  inputToken?: string;
  outputAmount?: string;
  isOutAmountUsed?: boolean;
  outputToken?: string;
  chainName?: string;
  slippage?: string;
  limitPrice?: string | number;
  percentReduction?: string;
  side?: "buy" | "sell";
  amount?: string;
  amount_units?: string;
  token?: string;
  sourceChainName?: string;
  destinationChainName?: string;
  range?: string;
  operator?: "and" | "or";
  subject?: string;
  comparator?: string;
  value?: string;
  period?: string;
  start_time?: string;
  end_time?: string;
  recurrence?: {
    type?: "seconds" | "minutes" | "hours" | "days" | "weeks" | "months";
    interval?: number;
    times?: number;
    random?: boolean;
  };
  isTwap?: boolean;
  recipient?: string;
  leverageMultiplier?: string;
  provider?: string;
  value_token?: string;
  value_units?: string;
  type?: string;
  currentValue?: number;
  accountAddress?: string;
  realAmount?: string;
  chainId?: ChainId;
  account?: string;
  action?: string;
  token1Address?: string;
  token2Address?: string;
  rpc?: string;
  rpc_hyperliquid?: JSONObject[];
  isAllAmount?: boolean;
  token2?: string;
  amount2?: string;
  repayAll?: boolean;
  tokenId?: string;
  liquidity0?: string;
  liquidity1?: string;
  lowerTick?: number;
  upperTick?: number;
};

const chainIds = [
  1, 10, 56, 137, 324, 5000, 8453, 34443, 42161, 43114, 42220, 59144, 81457,
  101,
] as const;
type ChainIdArray = typeof chainIds;
export type ChainId = ChainIdArray[number];
export function isChainId(value?: number | bigint): value is ChainId {
  return !!value && chainIds.includes(Number(value) as ChainId);
}

export function isDefined<T>(val: T): val is NonNullable<T> {
  if (val !== undefined && val !== null) return true;
  return false;
}
export function assert(condition: boolean, msg?: string): asserts condition {
  if (!condition) {
    throw new Error(msg || "Assertion failed!");
  }
}

export function isHexStr(value?: string | null): value is `0x${string}` {
  return (
    typeof value === "string" &&
    value.startsWith("0x") &&
    /^[0-9a-fA-F]+$/.test(value.slice(2))
  );
}

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export type JSONObject = { [key: string]: any };

export type RawAction = {
  name: string;
  args: CommonArgs;
};

export type SimAction = RawAction & {
  origin: number;
  lp?: TokenInfo | null;
  gasCheck?: boolean;
  amountOut?: string;
};

export type SimResultAction = SimAction & {
  balanceChanges: JSONObject;
  tokens: JSONObject;
  gasCosts: JSONObject;
  txBalanceChanges: JSONObject[];
  txNames?: string[];
  txGasUsed: string[];
  contracts?: string[];
  protocolsUsed?: string[];
};

export type Call = {
  id?: string;
  name: string;
  args: CommonArgs;
  body: CommonArgs;
  lp?: TokenInfo;
  chainName?: string;
  origin?: number;
  gasCosts?: JSONObject;
  balanceChanges?: JSONObject;
  tokens?: JSONObject;
};

export type Condition = {
  conditions: Call[];
  actions: Call[];
};

export type Query = {
  id?: string;
  message: string;
  messageId: number;
  calls: Call[];
  description: string;
  conditionId?: string;
  historyId?: number;
  conditions: Call[];
  actions: Call[];
  currentValues?: Call[];
  status?: string;
  simstatus?: number;
  date?: string;
  groups?: string[][];
};

export type CoinCache = {
  price?: number;
  market_cap?: number;
  fdv?: number;
  not_found?: number;
  timestamp?: number;
};

export type TokenInfo = {
  id?: number;
  coingeckoId?: string;
  coinmarketcapId?: string;
  address?: string;
  symbol: string;
  decimals?: number;
  chainId?: ChainId;
  chainName?: string;
  isMultiple?: boolean;
  name?: string;
  thumb?: string;
  onHyperSpot?: boolean;
};

export type ContractInfo = {
  contractname: string;
  address: string;
};

export type TransactionInfo = {
  fromAddress: string;
  toAddress: string;
};

export type BalanceChange = {
  symbol: string;
  address: string;
  amount: number;
};

export type GMXPosition = {
  addresses: { market: string; swapPath: string[] };
  numbers: {
    collateralAmount: bigint;
    sizeInUsd: bigint;
    updatedAtTime: bigint;
  };
  flags: { isLong: boolean };
};

export type DebankTokenInfo = {
  chain: string;
  id: string;
  symbol: string;
  amount: string;
};

export type DebankPoolInfo = {
  chain: string;
  project: string;
  symbol: string;
  description: string;
  apy?: number;
  health_rate?: number;
  supply_token_list: DebankTokenInfo[];
  borrow_token_list: DebankTokenInfo[];
  reward_token_list: DebankTokenInfo[];
};

export type DebankTokenInfoR = Partial<TokenInfo> & {
  amount: number;
  logo: string;
};

export type DebankPositionInfo = {
  id: string;
  name: string;
  type: string;
  tokens: DebankTokenInfoR[];
  detail: DebankPoolInfo;
  subType?: string;
  position_index?: string;
  pool: JSONObject;
};

export type DebankProtocolInfo = {
  id: string;
  chain: string;
  portfolio_item_list: DebankPositionInfo[];
};

export type PortfolioToken = {
  symbol: string;
  amount: bigint;
  decimals?: number;
  poolName?: string;
  lowerTick?: number;
  upperTick?: number;
  positionIndex?: string;
};

export type PortfolioPosition = {
  name: string;
  poolName?: string;
  supply?: PortfolioToken[];
  borrow?: PortfolioToken[];
  reward?: PortfolioToken[];
  lowerTick?: number;
  upperTick?: number;
  positionIndex?: string;
  healthRate?: number;
};

export type Portfolio = {
  name: string;
  positions: PortfolioPosition[];
};

export type CoinData = {
  price?: number;
  market_cap?: number;
  fully_diluted_market_cap?: number;
};

export type SimResult = {
  success: boolean;
  message?: string;
  actions?: Call[];
  rawActions?: RawAction[];
  lp?: TokenInfo;
  chainId?: ChainId;
  rpcs?: JSONObject;
  index?: number;
};

export type CleanedAction = Call & {
  type: string;
  chain1?: string;
  amount1?: string | number | object;
  token1?: string | null;
  dependent?: boolean;
  price: number;
};

export type SwapRealRoute = Partial<SwapRoute> & {
  transactions: Transaction[];
  funcNames: string[];
};

export type SwapResponse = {
  status: string;
  message?: string;
  routes?: SwapRealRoute[];
};

export type BridgeRealRoute = Partial<BridgeRoute> & {
  transactions: Transaction[];
  funcNames: string[];
  amountOut?: string;
};

export type BridgeResponse = {
  status: string;
  message?: string;
  routes?: BridgeRealRoute[];
};

export type Entities = {
  actions: JSONObject;
  conditions: JSONObject;
  protocols: JSONObject;
  chains: JSONObject;
};

export type Transaction = {
  to: string;
  value: string;
  data: string;
  gas?: string | null;
  from?: string;
};

export type ProtocolActionData = {
  accountAddress: string;
  protocolName?: string;
  provider: RetryProvider;
  amount?: bigint;
  amount2?: bigint;
  chainName?: string;
  sourceChainName?: string;
  chainId: ChainId;
  token?: string;
  inputToken?: string;
  amount_units?: string;
  realAmount?: string;
  tokenInfo?: TokenInfo;
  tokenInfo2?: TokenInfo;
  rpc?: string;
  token1Address?: string;
  token2Address?: string;
  poolName?: string;
  range?: string;
  tokenId?: string;
  liquidity0?: number;
  liquidity1?: number;
  isAllAmount?: boolean;
  slippage?: number;
  repayAll?: boolean;
  inputTokenInfo?: TokenInfo;
  inputAmount?: bigint;
  limitPrice?: number | string;
  leverageMultiplier?: number | string;
  percentReduction?: number | string;
  outputToken?: string;
  lowerTick?: number;
  upperTick?: number;
  outputTokenInfo?: TokenInfo;
};

export type ContractCallParam = string | bigint | number | boolean | JSONObject;

export type UserMsg = {
  address: string;
  message?: string;
  count?: number;
};

export enum Flow {
  Return = 0,
  Continue = 1,
  Redo = 2,
  Break = 3,
}

export class Unwind extends Error {
  flow: Flow;
  label: string;
  value?: unknown;
  constructor(flow: Flow, label: string, value?: unknown) {
    super();
    this.label = label;
    this.flow = flow;
    this.value = value;
  }
}

export type TokenPoolResponse = {
  attributes: {
    reserve_in_usd: string;
  };
};

export const noop = () => {};

export type Recurrence = {
  type?: "seconds" | "minutes" | "hours" | "days" | "weeks" | "months" | string;
  interval?: number;
  times?: number;
  random?: boolean;
};

export type FeeConfig = {
  chainName: string;
  chainId: ChainId;
  nativeSymbol: string | undefined;
  value: bigint;
};

export type HeliusTokenAccount = {
  address: string;
  mint: string;
  amount: string;
};

export type HeliusSimAccountInfo = {
  mint: string;
  tokenAmount: {
    amount: string;
  };
};

export type HyperliquidSpotTokenR = {
  name: string;
  szDecimals: number;
  tokenId: string;
};

export type TenderlyContainer = {
  id: string;
  connectivityConfig: {
    endpoints: {
      id: string;
      uri: string;
    }[];
  };
};
