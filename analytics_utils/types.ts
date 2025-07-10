import type { CommonArgs, JSONObject } from "../src/utils/types.js";

// this is incorrect, but instead of fixing just ignore types in analytics_utils
export type Event = {
  event: string;
  properties: Property;
  hasCondition?: boolean;
  isResearch?: boolean;
};

export type NewEvent = {
  submit: Event;
  hasCondition?: boolean;
  isResearch?: boolean;
  report?: string;
  userAddress?: string;
};

type Property = JSONObject & {
  messageId: number;
  Status: string;
  time: number;
  distinct_id: string;
  $user_id: string;
  $insert_id: string;
  Prompt: string;
  hasCondition: boolean;
  isResearch: boolean;
  mp_country_code?: string;
  Message?: string;
};

export interface Statistics {
  distinctId: string;
  maxActionsExecuted: number;
  maxTimeRanges: string[][];
}

export type BotStartData = {
  startDate: string;
  endDate: string;
  userLogIns: number;
  totalLogIns: number;
  userHasTypes: number;
  totalHasTypes: number;
  discordMsgs: number;
  discordUsers: number;
};

export type BucketError = {
  userID: string;
  timeStamp: string;
  error: string;
  bucket: string;
  prompt: string;
};

export type SubmitError = {
  user: string;
  prompt: string;
  error_message: string;
  time: string;
  country: string;
};

export type WalletData = {
  address: string;
  tvl: string;
  onboardDate: string;
  onboardAmountUSD: string;
  tokenDetails: object;
};

export type Transaction = {
  name: string;
  price: number;
  type?: string;
  token1?: string | null;
  amount1?: string | number | JSONObject;
  chain1?: string;
  args: JSONObject;
  body: JSONObject;
  balanceChanges: JSONObject;
  dependent: boolean;
};

export type CohortCount = {
  retainedSessions: number;
  totalSessions: number;
};
