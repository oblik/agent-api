import axios, { AxiosError } from "axios";
import * as chrono from "chrono-node";
import { ethers } from "ethers";
import { abis } from "../config/abis.js";
import ChainIDs from "../config/common/chainid.js";
import DebankData from "../config/common/debank.js";
import LPAddresses from "../config/lptokens.js";
import { NATIVE_TOKEN, NATIVE_TOKEN2 } from "../constants.js";
import { getViemPublicClientFromEthers } from "../utils/ethers2viem.js";
import {
  getChainIdFromName,
  getChainNameFromId,
  getCurrentTimestamp,
  getErrorMessage,
  getEthBalanceForUser,
  getNativeTokenSymbolForChain,
  getRevertReason,
  getRpcUrlForChain,
  getTokenInfoForChain,
  isNaNValue,
  sfParseUnits,
  withRetry,
} from "../utils/index.js";
import { sfConsoleError } from "../utils/log.js";
import { simulateExecute } from "../utils/protocols/gmx.js";
import { RetryProvider } from "../utils/retryProvider.js";
import type {
  Call,
  ChainId,
  CommonArgs,
  Condition,
  JSONObject,
  TenderlyContainer,
  TokenInfo,
  Transaction,
} from "../utils/types.js";
import { assert, isChainId, isHexStr } from "../utils/types.js";

const vnetrpctoid: JSONObject = {};

export const createVnet = async (
  chainId0?: ChainId | string | number,
  blockNumber: number | JSONObject | undefined = undefined,
) => {
  if (!chainId0) {
    throw new Error("helper: chainId is undefined");
  }
  const chainId1 = +chainId0;
  const chainId = isChainId(chainId1) ? chainId1 : undefined;
  if (!chainId) {
    throw new Error(`helper: chainId ${chainId1} is invalid`);
  }
  let attempts = 0;
  const maxAttempts = 3;
  const baseDelay = 2500; // Base delay in milliseconds

  while (attempts < maxAttempts) {
    try {
      if (chainId === ChainIDs.zksync) {
        const rpc = getRpcUrlForChain(chainId);
        if (!rpc) {
          throw new Error("RPC URL is not available");
        }
        const block =
          typeof blockNumber === "object" ? blockNumber[chainId] : blockNumber;
        const queryParams = {
          server: rpc,
        };
        if (isNaNValue(block)) {
          const res = await axios.get(
            `${process.env.FORK_URL}/testnet?${new URLSearchParams(
              queryParams,
            ).toString()}`,
          );
          return { vnetId: res.data.server, rpcUrl: res.data.server };
        }
        const res = await axios.get(
          `${process.env.FORK_URL}/testnet?${new URLSearchParams(
            queryParams,
          ).toString()}&block=${block}`,
        );
        return { vnetId: res.data.server, rpcUrl: res.data.server };
      }
      const res = await axios.post(
        `https://api.tenderly.co/api/v1/account/${process.env.TENDERLY_USER}/project/${process.env.TENDERLY_PROJECT}/vnets`,
        {
          slug: `slate-${Date.now()}`,
          fork_config: {
            network_id: chainId,
            block_number:
              typeof blockNumber === "object"
                ? blockNumber[chainId]
                : blockNumber,
          },
          virtual_network_config: {
            chain_config: {
              chain_id: +chainId,
            },
          },
        },
        { headers: { "X-Access-Key": process.env.TENDERLY_ACCESS_KEY } },
      );
      const rpcUrl = res.data.rpcs.find(
        (x: { name: string }) => x.name === "Admin RPC",
      )?.url;
      vnetrpctoid[rpcUrl] = res.data.id;
      return { vnetId: res.data.id, rpcUrl };
    } catch (err) {
      if (attempts < maxAttempts - 1) {
        // Only sleep and retry if there are remaining attempts
        const delay = baseDelay * 2 ** attempts; // Exponential backoff formula
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // Handle or rethrow the error if all attempts fail
        console.error(
          `Failed to create testnet: ${chainId} ${blockNumber}`,
          getErrorMessage(err),
        );
        throw new Error(
          "Failed to create testnet for simulation, please try again in a few minutes",
        );
      }
    }
    attempts++;
  }
  return { vnetId: undefined, rpcUrl: undefined };
};

export const duplicateVnet = async (vnetId: string) => {
  let attempts = 0;
  const maxAttempts = 1;
  const baseDelay = 2500; // Base delay in milliseconds
  const maxWaitTime = 10000; // Maximum time to wait for VNet to be running (10 seconds)
  const pollInterval = 500; // Time between status checks (500ms)

  while (attempts < maxAttempts) {
    try {
      // Clone the VNet
      const cloneResponse = await axios.post(
        `https://api.tenderly.co/api/v1/account/${process.env.TENDERLY_USER}/project/${process.env.TENDERLY_PROJECT}/testnet/clone`,
        {
          srcContainerId: vnetId,
          dstContainerDisplayName: null,
        },
        { headers: { "X-Access-Key": process.env.TENDERLY_ACCESS_KEY } },
      );

      const newVnetId = cloneResponse.data.id;
      const rpcUrl = cloneResponse.data.connectivityConfig.endpoints.find(
        (x: { displayName: string }) => x.displayName === "Admin RPC",
      )?.uri;

      // Wait for VNet to be running
      const startTime = Date.now();
      while (Date.now() - startTime < maxWaitTime) {
        const statusResponse = await axios.get(
          `https://api.tenderly.co/api/v1/account/${process.env.TENDERLY_USER}/project/${process.env.TENDERLY_PROJECT}/testnet/container/${newVnetId}`,
          { headers: { "X-Access-Key": process.env.TENDERLY_ACCESS_KEY } },
        );

        if (statusResponse.data.container.status === "RUNNING") {
          vnetrpctoid[rpcUrl] = newVnetId;
          return { vnetId: newVnetId, rpcUrl };
        }

        // Wait before checking again
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }

      throw new Error("Timed out waiting for VNet to be running");
    } catch (err) {
      if (attempts < maxAttempts - 1) {
        // Only sleep and retry if there are remaining attempts
        const delay = baseDelay * 2 ** attempts; // Exponential backoff formula
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // Handle or rethrow the error if all attempts fail
        console.error(
          `Failed to clone testnet: ${vnetId}`,
          getErrorMessage(err),
        );
        throw new Error(
          "Failed to clone testnet for simulation, please try again in a few minutes",
        );
      }
    }
    attempts++;
  }
  return { vnetId: undefined, rpcUrl: undefined };
};

export const recreateVnet = async (rpcUrl: string) => {
  const parts = rpcUrl.split(":");
  const port = parts[parts.length - 1];
  if (isNaNValue(port)) return;

  let attempts = 0;
  const maxAttempts = 3;
  const baseDelay = 2500; // Base delay in milliseconds

  while (attempts < maxAttempts) {
    try {
      await axios.get(
        `${process.env.FORK_URL}/recreate?${new URLSearchParams({
          port,
        }).toString()}`,
      );
      return; // Return on successful response
    } catch (err) {
      if (attempts < maxAttempts - 1) {
        // Only sleep and retry if there are remaining attempts
        const delay = baseDelay * 2 ** attempts; // Exponential backoff formula
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // Handle or rethrow the error if all attempts fail
        console.error(
          `Failed to recreate testnet: ${rpcUrl}`,
          getErrorMessage(err),
        );
        throw new Error(
          "Failed to recreate testnet for simulation, please try again in a few minutes",
        );
      }
    }
    attempts++;
  }
};

export const destroyVnet = async (rpcUrl: string) => {
  const parts = rpcUrl.split(":");
  const port = parts[parts.length - 1];
  if (isNaNValue(port)) return;

  let attempts = 0;
  const maxAttempts = 3;
  const baseDelay = 2500; // Base delay in milliseconds

  while (attempts < maxAttempts) {
    try {
      await axios.get(
        `${process.env.FORK_URL}/destroy?${new URLSearchParams({
          port,
        }).toString()}`,
      );
      return; // Return on successful response
    } catch (err) {
      if (attempts < maxAttempts - 1) {
        // Only sleep and retry if there are remaining attempts
        const delay = baseDelay * 2 ** attempts; // Exponential backoff formula
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // Handle or rethrow the error if all attempts fail
        console.error(
          `Failed to destroy testnet: ${rpcUrl}`,
          getErrorMessage(err),
        );
        throw new Error(
          "Failed to destroy testnet for simulation, please try again in a few minutes",
        );
      }
    }
    attempts++;
  }
};

export const getVnetIdFromRpc = (rpc: string | undefined) => {
  if (!rpc) return undefined;

  if (vnetrpctoid[rpc]) {
    return vnetrpctoid[rpc];
  }
  /* 
  const parts = (rpc || "").split("rpc.tenderly.co/");
  if (parts.length !== 2) return undefined;

  let vnetId: string | undefined;
  let page = 1;
  while (true) {
    const res = await withRetry(undefined, () =>
      axios.get(
        `https://api.tenderly.co/api/v1/account/${process.env.TENDERLY_USER}/project/${process.env.TENDERLY_PROJECT}/testnet/container?page=${page}&pageSize=20`,
        { headers: { "X-Access-Key": process.env.TENDERLY_ACCESS_KEY } },
      ),
    );
    page++;
    const containers: TenderlyContainer[] = res?.data?.containers || [];
    const container = containers.find(
      (x) => x.connectivityConfig.endpoints[0].id === parts[1].toLowerCase(),
    );
    if (container) {
      vnetId = container.id;
      break;
    }
    if (containers.length === 0 || containers.length < 20) break;
  }
  return vnetId; */
};

export const simulateTxs = async (
  chainId: ChainId | undefined,
  transactions: Transaction[],
  account: string | undefined,
  blockNumber: number | undefined = undefined,
) => {
  const { vnetId, rpcUrl } = await createVnet(chainId, blockNumber);
  const provider = new RetryProvider(rpcUrl, chainId);
  return runTxsOnVnet(provider, account || "", transactions, {
    chainId,
    vnetId,
  });
};

export const increaseTime = async (provider: RetryProvider, time: unknown) => {
  await provider.send("evm_increaseTime", [time]);
  await provider.send("evm_mine", []);
};

export const setBlockTimestamp = async (
  provider: RetryProvider,
  timestamp: unknown,
) => {
  await provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await provider.send("evm_mine", []);
};

export const addBalance = async (
  provider: RetryProvider,
  user: unknown,
  balance: unknown,
) => {
  let attempts = 0;
  const maxAttempts = 3;

  /* eslint-disable no-await-in-loop */
  while (attempts < maxAttempts) {
    try {
      await provider.send("tenderly_addBalance", [
        user,
        convertToHexString(balance),
      ]);
      break; // Exit the loop if the operation is successful
    } catch (err) {
      if (attempts < maxAttempts - 1) {
        // Only sleep and retry if there are remaining attempts
        await new Promise((resolve) => setTimeout(resolve, 3000));
      } else {
        // Handle or rethrow the error if all attempts fail
        console.error(getErrorMessage(err));
        throw new Error(
          "Failed to edit balance on vnet for simulation, please try again in a few minutes",
        );
      }
    }
    attempts++;
  }
};

export const setBalance = async (
  provider: RetryProvider,
  user: unknown,
  balance: unknown,
) => {
  let attempts = 0;
  const maxAttempts = 3;

  /* eslint-disable no-await-in-loop */
  while (attempts < maxAttempts) {
    try {
      await provider.send("tenderly_setBalance", [
        user,
        convertToHexString(balance),
      ]);
      break; // Exit the loop if the operation is successful
    } catch (err) {
      if (attempts < maxAttempts - 1) {
        // Only sleep and retry if there are remaining attempts
        await new Promise((resolve) => setTimeout(resolve, 3000));
      } else {
        // Handle or rethrow the error if all attempts fail
        console.error(getErrorMessage(err));
        throw new Error(
          "Failed to set balance on vnet for simulation, please try again in a few minutes",
        );
      }
    }
    attempts++;
  }
};

export async function increaseTokenBalance(
  rpc: string,
  account: string,
  chainName: string | undefined,
  token: unknown,
  increment: string | number,
  tokenInfo_: TokenInfo | undefined = undefined,
  currentBalance: bigint | null = null,
) {
  if (typeof token !== "string" || !chainName) {
    console.log(`helper: token type ${typeof token}, chainName ${chainName}`);
    return;
  }
  const chainId = getChainIdFromName(chainName);
  if (chainId === ChainIDs.zksync) {
    return;
  }

  const provider = new RetryProvider(rpc, chainId);
  let tokenInfo = tokenInfo_;
  if (!chainId) {
    return;
  }
  const nativeSymbol = getNativeTokenSymbolForChain(chainId);
  if (!tokenInfo) {
    const isoData = (LPAddresses.dolomite as JSONObject)[chainId.toString()];
    let lpList: string[] = [];
    if (isoData) {
      lpList = Object.keys(isoData);
    }
    if (lpList.includes(token.toLowerCase())) {
      const tAddr = isoData[token.toLowerCase()].token;
      tokenInfo = await getTokenInfoForChain(tAddr, chainName);
    } else {
      tokenInfo = await getTokenInfoForChain(token, chainName);
    }
  }

  const _amount = sfParseUnits(increment, tokenInfo?.decimals);
  if (
    token.toLowerCase() === nativeSymbol?.toLowerCase() ||
    tokenInfo?.address === NATIVE_TOKEN
  ) {
    await addBalance(provider, account, _amount);
  } else {
    let balance = currentBalance;
    if (!balance && tokenInfo?.address) {
      assert(isHexStr(tokenInfo.address));
      assert(isHexStr(account));
      balance = await (
        await getViemPublicClientFromEthers(provider)
      ).readContract({
        address: tokenInfo.address,
        abi: abis.erc20,
        functionName: "balanceOf",
        args: [account],
      });
    }
    const newBalance = (balance || 0n) + _amount;
    await setErc20Balance(provider, tokenInfo?.address, account, newBalance);
  }
}

export const setErc20Balance = async (
  provider: RetryProvider,
  token: unknown,
  user: unknown,
  balance: unknown,
) => {
  let attempts = 0;
  const maxAttempts = 3;

  /* eslint-disable no-await-in-loop */
  while (attempts < maxAttempts) {
    try {
      await provider.send("tenderly_setErc20Balance", [
        token,
        user,
        convertToHexString(balance),
      ]);
      break; // Exit the loop if the operation is successful
    } catch (err) {
      if (attempts < maxAttempts - 1) {
        // Only sleep and retry if there are remaining attempts
        await new Promise((resolve) => setTimeout(resolve, 3000));
      } else {
        // Handle or rethrow the error if all attempts fail
        console.error(getErrorMessage(err));
        throw new Error(
          "Failed to set balance on vnet for simulation, please try again in a few minutes",
        );
      }
    }
    attempts++;
  }
};

export const runTxsOnVnet = async (
  provider: RetryProvider,
  user: string,
  transactions: Transaction[],
  extraArgs: {
    chainId?: ChainId;
    vnetId?: string;
    action?: string;
  } = {},
) => {
  const { action, chainId, vnetId } = extraArgs;
  try {
    let gmxKey: `0x${string}` | undefined;
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      const txWithoutGas = { ...tx };
      txWithoutGas.gas = undefined;
      let gath: ethers.FeeData | undefined;
      let gaath = 0n;
      if (chainId === ChainIDs.zksync) {
        await provider.send("hardhat_impersonateAccount", [user]);
        const tempProvider = new RetryProvider(
          getRpcUrlForChain(ChainIDs.zksync),
          ChainIDs.zksync,
        );
        gath = await tempProvider.getFeeData();
        gaath = await withRetry(ethers.getAddress(user), () =>
          provider.estimateGas({
            ...txWithoutGas,
            from: ethers.getAddress(user),
            value: convertToHexString(tx.value || "0"),
            maxFeePerGas:
              chainId === ChainIDs.zksync
                ? convertToHexString(gath?.maxFeePerGas || "0")
                : null,
          }),
        );
      }

      const hash = await provider.send("eth_sendTransaction", [
        {
          ...txWithoutGas,
          from: ethers.getAddress(user),
          value: convertToHexString(tx.value || "0"),
          maxFeePerGas:
            chainId === ChainIDs.zksync
              ? convertToHexString(gath?.maxFeePerGas || "0")
              : null,
          gas:
            chainId === ChainIDs.zksync
              ? convertToHexString((gaath * 6n) / 5n || "0")
              : null, // "0xffcfffff"
        },
      ]);
      const receipt = await withRetry("", () =>
        provider.waitForTransaction(hash),
      );

      if (gmxKey) {
        const error = await getRevertReason(user, vnetId, hash);
        if (error.includes("EndOfOracleSimulation")) continue;
      }

      if (receipt?.status === 0) {
        console.log(vnetId, receipt);
        return false;
      }

      const gmxLogs = receipt?.logs.filter(
        (log) =>
          log.topics[0] ===
          "0x468a25a7ba624ceea6e540ad6f49171b52495b648417ae91bca21676d8a24dc5",
      );
      if (!gmxKey && gmxLogs && gmxLogs.length > 0 && chainId) {
        gmxKey = gmxLogs[0].topics[2] as `0x${string}`;
        transactions.push(
          await simulateExecute(provider, chainId, gmxKey, action),
        );
      }
    }
    return true;
  } catch (err) {
    console.log(vnetId, err);
    return false;
  }
};

const convertToHexString = (value: unknown) => {
  let bn: bigint;
  if (typeof value === "string") {
    bn = ethers.getBigInt(value);
  } else {
    bn = value as bigint;
  }

  if (bn === 0n) return "0x0";
  const res = ethers.toBeHex(bn);
  return res.replace("0x0", "0x");
};

export const parseTime = (name: unknown, args: CommonArgs) => {
  const { start_time, end_time } = args;
  const newArgs: CommonArgs = { ...args };
  if (!start_time) {
    if (name === "time") {
      newArgs.start_time = `${getCurrentTimestamp() + 60}`;
      newArgs.type = "time";
    }
  } else if (typeof start_time === "string") {
    const parsedDate = chrono.parseDate(
      start_time.replace(/\bnoon\b/, "12pm"),
      new Date(),
      { forwardDate: true },
    );
    if (parsedDate) {
      newArgs.start_time = `${Math.floor(parsedDate.getTime() / 1000)}`;
      newArgs.type = "time";
    } else {
      console.error("start time couldn't be parsed", args);
    }
  } else {
    console.error("start time isn't a string", args);
  }
  if (typeof end_time === "string") {
    const parsedDate = chrono.parseDate(
      end_time.replace(/\bnoon\b/, "12pm"),
      new Date(),
      { forwardDate: true },
    );
    if (parsedDate) {
      newArgs.end_time = `${Math.floor(parsedDate.getTime() / 1000)}`;
      newArgs.type = "time";
      if (!newArgs.start_time)
        newArgs.start_time = `${getCurrentTimestamp() + 60}`;
    } else {
      console.error("end time couldn't be parsed", args);
    }
  } else if (end_time !== undefined && name === "time") {
    console.error("end time isn't a string", args);
  }
  return newArgs;
};

export const groupConditions = (calls: Call[], groups: string[][] = []) => {
  const CONDITIONS = ["condition", "time"];
  if (calls.filter((x) => CONDITIONS.includes(x.name)).length === 0)
    return { status: 0, calls };
  if (calls.filter((x) => !CONDITIONS.includes(x.name)).length === 0)
    return {
      status: 1,
      conditions: [
        {
          conditions: calls,
          actions: [{ name: "notification", args: {}, body: {} }],
        },
      ],
    };

  const timesWithoutRecurrence: { [key: number]: number } = {};
  for (let i = 0; i < calls.length; i++) {
    if (
      calls[i].name === "time" &&
      calls[i].args.end_time &&
      !calls[i].args.recurrence
    ) {
      let found = -1;
      if (i + 1 < calls.length && calls[i + 1].name === "condition")
        found = i + 1;
      if (i > 0 && calls[i - 1].name === "condition") found = i - 1;
      if (found < 0) {
        return {
          status: -1,
          message: "end_time specified without recurrence or nearby condition",
        };
      }

      timesWithoutRecurrence[i + 1] = found + 1;
    }
  }

  const ret: Condition[] = [];
  if (groups.length === 0) {
    const callsWithOrigin = calls.map((x, i) => ({ ...x, origin: i + 1 }));
    const total = getMapping(callsWithOrigin, 0);
    const times = getMapping(callsWithOrigin, 1);
    for (const [origin, conditions] of Object.entries(times)) {
      if (!total[+origin]) {
        total[+origin] = conditions || [];
      } else {
        total[+origin] = [...total[+origin], ...(conditions || [])];
      }
    }
    for (const [origin, conditions] of Object.entries(total)) {
      for (const [time, condition] of Object.entries(timesWithoutRecurrence)) {
        if (conditions.includes(condition)) {
          total[+origin] = [...total[+origin], +time];
        }
      }
    }

    let actions: Call[] = [];
    const actionsOrigin = callsWithOrigin
      .filter((x) => !CONDITIONS.includes(x.name))
      .map((x) => x.origin);
    for (let i = 0; i < actionsOrigin.length; i++) {
      const origin = actionsOrigin[i];
      actions.push(calls[origin - 1]);
      if (!hasSameCondition(total[origin], total[origin + 1])) {
        ret.push({
          actions,
          conditions: total[origin].map((x) => calls[x - 1]),
        });
        actions = [];
      }
    }
  } else {
    const calls_ = [...calls];
    const indexes: number[] = [];
    groups.forEach((group, index) => {
      if (!group.find((a) => !CONDITIONS.includes(a))) {
        indexes.push(index);
      }
    });
    const onlyConditions: Call[] = [];
    for (let i = 0; i < groups.length; i++) {
      if (indexes.includes(i)) {
        for (const action of groups[i]) {
          const index = calls_.findIndex((x) => x.name === action);
          const call = calls_.splice(index, 1);
          onlyConditions.push(call[0]);
        }
        continue;
      }

      const conditions: Call[] = [];
      const actions: Call[] = [];
      for (const action of groups[i]) {
        const index = calls_.findIndex((x) => x.name === action);
        const call = calls_.splice(index, 1);
        if (CONDITIONS.includes(action)) {
          conditions.push(call[0]);
        } else {
          actions.push(call[0]);
        }
      }
      ret.push({ actions, conditions });
    }
    if (onlyConditions.length) {
      for (const resp of ret) {
        resp.conditions.push(...onlyConditions);
      }
    }
  }
  return { status: 1, conditions: ret };
};

const hasSameCondition = (a: number[], b: number[]) => {
  if (!b) return false;

  a.sort();
  b.sort();
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const getMapping = (
  calls: Call[],
  mode: number,
): { [key: number]: number[] } => {
  const checkKey = ["condition", "time"][mode];
  const removeKey = ["time", "condition"][mode];

  let filtered: Call[] = calls.filter((x) => x.name !== removeKey);
  if (mode)
    filtered = filtered.filter((x) => !x.args.end_time || x.args.recurrence);
  if (filtered.filter((x) => x.name === checkKey).length === 0) return {};

  const group: Condition[] = [];
  const firstCall = filtered[0];
  const lastCall = filtered[filtered.length - 1];
  let conditions: Call[] = [];
  let actions: Call[] = [];
  if (firstCall.name === checkKey || lastCall.name === checkKey) {
    if (firstCall.name === checkKey && lastCall.name === checkKey) {
      let i = 0;
      let j = filtered.length - 1;
      const temp: Call[] = [];
      while (filtered[i].name === checkKey) conditions.push(filtered[i++]);
      while (filtered[j].name === checkKey) temp.push(filtered[j--]);
      for (let k = i; k <= j; k++) {
        if (filtered[k].name !== checkKey) {
          actions.push(filtered[k]);
          continue;
        }
        if (actions.length > 0) {
          group.push({ conditions, actions });
          conditions = [];
        }
        actions = [];
        conditions.push(filtered[k]);
      }
      if (actions.length > 0)
        group.push({ conditions: [...conditions, ...temp], actions });
    } else {
      const startIndex = firstCall.name === checkKey ? 0 : filtered.length - 1;
      const endIndex = firstCall.name === checkKey ? filtered.length - 1 : 0;
      const delta = firstCall.name === checkKey ? 1 : -1;
      for (
        let i = startIndex;
        firstCall.name === checkKey ? i <= endIndex : i >= endIndex;
        i += delta
      ) {
        if (filtered[i].name !== checkKey) {
          actions.push(filtered[i]);
          continue;
        }
        if (actions.length > 0) {
          if (startIndex > 0) actions.reverse();
          group.push({ conditions, actions });
          conditions = [];
        }
        actions = [];
        conditions.push(filtered[i]);
      }
      if (actions.length > 0) {
        if (startIndex > 0) actions.reverse();
        group.push({ conditions, actions });
      }
    }
  } else {
    let shouldApplyConditionBefore = false;
    for (let i = filtered.length - 1; i >= 0; i--) {
      if (filtered[i].name !== checkKey) {
        actions.push(filtered[i]);
        continue;
      }
      let k = i;
      while (k > 0) {
        if (filtered[k].name !== checkKey) break;
        conditions.push(filtered[k--]);
      }
      i = k + 1;
      if (actions.length > 0) {
        actions.reverse();
        shouldApplyConditionBefore = conditions.length > 1;
        if (conditions.length > 1) {
          group.push({ conditions: [conditions[0]], actions });
          conditions = conditions.slice(1);
        } else {
          group.push({ conditions: [...conditions], actions });
          conditions = [];
        }
        actions = [];
      }
    }
    if (actions.length > 0) {
      actions.reverse();
      group.push({
        conditions: shouldApplyConditionBefore ? [...conditions] : [],
        actions,
      });
    }
  }
  const ret: { [key: number]: number[] } = {};
  loopGroupActions(group, ret);
  return ret;
};

const getTopHolderI = async (
  token: string,
  chainId: ChainId,
  rpc: string | undefined = undefined,
): Promise<string | undefined> => {
  const chain_id = DebankData.chainIds[chainId];
  let token_ = token;
  if (!token_.startsWith("0x")) {
    if (
      token_.toLowerCase() ===
      getNativeTokenSymbolForChain(chainId)?.toLowerCase()
    ) {
      token_ = chain_id;
    } else {
      const chainName = getChainNameFromId(chainId);
      const tokenInfo = await getTokenInfoForChain(token, chainName);
      token_ = tokenInfo?.address || token_;
    }
  } else if (token_ === NATIVE_TOKEN || token_ === NATIVE_TOKEN2) {
    token_ = chain_id;
  }
  const queryParams = new URLSearchParams({ id: token_, chain_id });
  const DEBANK_API = "https://pro-openapi.debank.com/v1/token/top_holders";
  try {
    let start = 0;
    while (true) {
      const { data } = await withRetry("", () =>
        axios.get(`${DEBANK_API}?${queryParams}&start=${start}`, {
          headers: { AccessKey: process.env.DEBANK_ACCESS_KEY },
        }),
      );
      if (data.length > 0 && token_ === chain_id) {
        return data[0][0];
      }
      let i = 0;
      for (; i < data.length; i++) {
        const balance = await getEthBalanceForUser(chainId, data[i][0], rpc);
        if (balance > ethers.parseEther("1")) {
          return data[i][0];
        }
      }
      if (i < 100) break;
      start += 100;
    }
  } catch (error) {
    const message = getErrorMessage(error);
    sfConsoleError(error instanceof AxiosError ? message.message : message);
  }
};

const memoizeCache: JSONObject = {};

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
const memoizeWithExpiration = <T extends (...args: any[]) => any>(
  fn: T,
  ttl: number,
): ((
  ...args: [...Parameters<T>, boolean?]
) => Promise<Awaited<ReturnType<T>>>) => {
  // Create a unique identifier for the function
  const fnId = fn.name || fn.toString().slice(0, 100);

  return async (
    ...args: [...Parameters<T>, boolean?]
  ): Promise<Awaited<ReturnType<T>>> => {
    const noCache =
      typeof args[args.length - 1] === "boolean"
        ? (args.pop() as boolean)
        : false;
    // Include function identifier in the cache key
    const key = `${fnId}:${JSON.stringify(args)}`;
    const now = Date.now();

    if (
      noCache ||
      !(memoizeCache[key] && now - memoizeCache[key].timestamp < ttl)
    ) {
      const result = await fn(...args);
      memoizeCache[key] = { value: result, timestamp: now };
    }
    return memoizeCache[key].value;
  };
};

export const getTopHolder = memoizeWithExpiration(
  getTopHolderI as (...args: unknown[]) => Promise<string | undefined>,
  3 * 60 * 60 * 1000,
);

function loopGroupActions(
  group: Condition[],
  ret: { [key: number]: number[] },
) {
  for (const { conditions, actions } of group) {
    for (const x of actions) {
      if (x.origin) {
        if (!ret[x.origin]) {
          ret[x.origin] = conditions.map((x) => x.origin ?? 1);
        } else {
          ret[x.origin] = [
            ...ret[x.origin],
            ...conditions.map((x) => x.origin ?? 1),
          ];
        }
      }
    }
  }
}
