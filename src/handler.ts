import axios from "axios";
import { Client, GatewayIntentBits } from "discord.js";
import { ethers } from "ethers";
import { Op } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import ProtocolAddresses from "./config/addresses.js";
import { Conditions, ConditionsDev, Users, initModels } from "./db/index.js";
import {
  compareValues,
  convertPoolNameToDefillamaSymbol,
  convertProtocolNameToDefillamaProject,
  getChainIdFromName,
  getChainNameFromId,
  getCurrentTimestamp,
  getErrorMessage,
  getPoolApy,
  getPoolMetadata,
  getRpcUrlForChain,
  getTokenBalance,
  isNaNValue,
  splitPool,
  withRetry,
} from "./utils/index.js";
import { sfConsoleError, usePrintError, usePrintLog } from "./utils/log.js";
import {
  getLoanValueForProtocol,
  getMarketInfoForProtocol,
  getUserPositions,
} from "./utils/protocols/index.js";
import { RetryProvider } from "./utils/retryProvider.js";
import { simulateActions } from "./utils/simulate.js";
import type {
  Call,
  ChainId,
  JSONObject,
  Recurrence,
  UserMsg,
} from "./utils/types.js";
import { assert, type CoinCache, isChainId, isDefined } from "./utils/types.js";

const nonProtocolNames = ["swap", "bridge", "transfer", "notification"];
const simulationId = uuidv4();

export const walletAPI = axios.create({
  baseURL: process.env.WALLET_API_URL,
  timeout: 125000, // Timeout in milliseconds (125 seconds)
});

export const getCoinDataClient = async (
  account: string | undefined,
  symbol: string | undefined,
  chainId: ChainId,
  throwError = true,
): Promise<CoinCache> => {
  const printError = usePrintError(account);
  try {
    const [{ data }] = await Promise.all([
      withRetry(`${account}`, () =>
        walletAPI.post(
          `${process.env.WALLET_API_URL}/token-price?chainId=${chainId}&tokenName=${symbol}&secret=${process.env.BACKEND_TOKEN_SECRET}`,
        ),
      ),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    return data.price;
  } catch (err) {
    if (throwError) {
      throw err;
    }
    printError(getErrorMessage(err));
    return {};
  }
};

export const checkTx = async (
  ids: number[] | undefined = undefined,
  prod = false,
) => {
  await initModels();
  const newReadyIds = await syncConditionTx(ids, prod);
  if (ids) return;

  const conditions = await findConditionTx(prod);
  const counts: Record<string, number> = {};
  const conditionIds: Record<string, number[]> = {};

  for (const { useraddress, id } of conditions) {
    const address = useraddress.toLowerCase();
    if (!counts[address]) {
      counts[address] = 1;
      conditionIds[address] = [id];
    } else {
      counts[address]++;
      conditionIds[address].push(id);
    }
  }

  const users = Object.keys(counts);
  const datas: UserMsg[] = [];
  for (const user of users) {
    if (counts[user] > 0) {
      const data = {
        address: user,
        count: counts[user],
        ids: conditionIds[user],
      };
      // await notifyUser(data);
      if (
        new Date().getMinutes() % 15 === 0 ||
        newReadyIds.some((element) => new Set(data.ids).has(element))
      ) {
        datas.push(data);
      }
    }
  }
  if (datas.length > 0 && prod) {
    await notifyUsersDiscord(datas);
  }
};

type CurrentValue = {
  currentValue: number | undefined;
  multiplier: number;
  protocol: string;
  pool: string;
  chainId: ChainId;
};

export const getCurrentValues = async (
  useraddress: string,
  actions: Call[],
  conditions: Call[],
  simulationWallet?: string,
) => {
  const printLog = usePrintLog(useraddress);
  const printError = usePrintError(useraddress);

  const currentValues: (CurrentValue | undefined)[] = [];

  /* eslint-disable no-await-in-loop */
  for (let i = 0; i < conditions.length; i++) {
    let isTime = false;
    let currentValue: number | null | undefined;

    try {
      const {
        name,
        args: {
          type,
          subject,
          value: val,
          value_token,
          value_units,
          start_time,
          protocolName,
          chainName,
          comparator,
        },
      } = conditions[i];

      let multiplier = 1;

      const percentTypes = [
        "yield",
        "health_factor",
        "health factor",
        "ltv",
        "funding rate",
      ];
      if (
        !isTime &&
        !percentTypes.includes(type || "") &&
        typeof val === "string"
      ) {
        if (val.includes("%")) {
          if (comparator?.includes(">")) {
            multiplier += Number.parseFloat(val) / 100;
          } else if (comparator?.includes("<")) {
            multiplier -= Math.abs(Number.parseFloat(val)) / 100;
          } else if (!val.startsWith("-")) {
            multiplier = Number.parseFloat(val) / 100;
          } else {
            multiplier += Number.parseFloat(val) / 100;
          }
        } else if (val.includes("x")) {
          multiplier = Number.parseFloat(val);
        }
      }

      isTime = name === "time" || type === "time";
      const value = name === "condition" ? val : start_time;

      if (!value) {
        currentValues.push(undefined);
        break;
      }

      let chain = "";
      if (actions[0]) {
        chain =
          actions[0].body?.sourceChainName ||
          actions[0].args?.sourceChainName ||
          actions[0].body?.chainName ||
          actions[0].args?.chainName ||
          "";
      }
      if (chainName) chain ||= chainName;
      chain ||= "";

      let protocol = "";
      let pool = "";
      let chainId: ChainId = getChainIdFromName(chain) || 1;
      ({ protocol, pool, currentValue, chainId } = await getProtocolNChain(
        type,
        subject,
        actions,
        multiplier,
        protocol,
        pool,
        currentValue,
        simulationWallet || useraddress,
        chain,
        chainId,
        isTime,
        value_token,
        value_units,
        protocolName,
      ));
      if (currentValue === null) {
        currentValue = undefined;
      }

      currentValues.push({
        currentValue,
        multiplier,
        protocol,
        pool,
        chainId: chainId || 1,
      });
    } catch (err) {
      currentValues.push(undefined);
      printLog(JSON.stringify({ actions, conditions }, null, 2));
      printError(err);
    }
  }

  return currentValues;
};

const syncConditionTx = async (
  ids: number[] | undefined = undefined,
  prod = false,
) => {
  const ConditionModel = prod ? Conditions : ConditionsDev;
  let conditions = await ConditionModel.findAll({
    where: { status: { [Op.in]: ["pending", "ready"] } },
  });
  if (ids) conditions = conditions.filter((x) => ids.includes(x.id));
  const ret: (number | null)[] = await Promise.all(
    conditions.map(async (condition) => {
      const { useraddress, status, lastran, updatedAt } = condition.dataValues;
      const printLog = usePrintLog(useraddress);
      const printError = usePrintError(useraddress);
      if (!updatedAt) {
        return null;
      }
      // Check if updatedAt is more than 24 hours ago
      const unixUpdatedAt = Math.floor(updatedAt?.getTime() / 1000);
      const unixTimestampInSeconds = Math.floor(Date.now() / 1000);
      if (
        unixUpdatedAt < unixTimestampInSeconds - 86400 * 3 &&
        status === "ready"
      ) {
        printLog(
          JSON.stringify(condition.dataValues, null, 2),
          "ready -> canceled",
        );
        condition.set("status", "canceled");
        await condition.save();
        return null;
      }
      const wasReady = status === "ready";
      const isReadies: {
        isTime: boolean;
        isReady: boolean;
        operator: string;
      }[] = [];
      const isExpired: boolean[] = [];
      const conditionCurrentValues: Call[] = [];
      let hasRecurrence = false;
      let noValue = false;

      const currentValues = await getCurrentValues(
        useraddress,
        condition.actions,
        condition.dataValues.conditions.map((x) => {
          return {
            name: x.name,
            args: x.body || {},
            body: {},
          };
        }),
      );

      /* eslint-disable no-await-in-loop */
      for (let i = 0; i < condition.dataValues.conditions.length; i++) {
        const { multiplier, protocol, pool, chainId, currentValue } =
          currentValues[i] || {};
        let isReady = false;
        let isTime = false;
        let operator = "";

        try {
          const {
            name,
            args,
            body: {
              type,
              operator: op,
              subject,
              comparator,
              value: val,
              start_time,
              end_time,
              recurrence,
              value_token,
              value_units,
            },
          } = condition.dataValues.conditions[i];

          isTime = name === "time" || type === "time";
          operator = op || "and";
          const value = name === "condition" ? val : start_time;

          if (!value) {
            noValue = true;
            break;
          }

          let expired = false;
          ({ isReady, hasRecurrence, expired } = await checkCondition(
            type,
            subject,
            condition,
            protocol,
            pool,
            currentValue,
            isReady,
            value,
            useraddress,
            comparator,
            i,
            multiplier || 1,
            isTime,
            wasReady,
            recurrence,
            hasRecurrence,
            lastran,
            end_time,
            expired,
            value_token || value_units,
            chainId,
          ));
          isReadies.push({ isReady, isTime, operator });
          isExpired.push(expired);
          conditionCurrentValues.push({
            name,
            args: { ...args, currentValue, protocolName: protocol },
            body: {},
          });
        } catch (err) {
          printLog(JSON.stringify(condition.dataValues, null, 2));
          printError(err);
          isReadies.push({ isReady: false, isTime, operator });
          isExpired.push(false);
        }
      }
      if (noValue) {
        printLog(
          JSON.stringify(condition.dataValues, null, 2),
          "canceled (no value)",
        );
        condition.set("status", "canceled");
        await condition.save();
        return null;
      }
      const isReady = checkStatus(isReadies);
      let newStatus = status;

      if (isReady && !wasReady) {
        newStatus = "ready";
      }
      if (wasReady && !isReady) {
        newStatus = "pending";
      }
      if (isExpired.find(Boolean)) {
        newStatus = "completed";
      }
      if (status === newStatus) {
        if (conditionCurrentValues.length > 0) {
          condition.set("currentValues", conditionCurrentValues);
          await condition.save();
        }
        return null;
      }

      if (prod) {
        printLog(
          JSON.stringify(condition.dataValues, null, 2),
          `${status} -> ${newStatus}, ${prod}`,
        );
      }

      if (newStatus === "ready" && !lastran && hasRecurrence) {
        condition.set("lastran", unixUpdatedAt);
      }

      condition.set("status", newStatus);
      condition.set("currentValues", conditionCurrentValues);
      await condition.save();

      if (status === "pending" && newStatus === "ready") {
        return condition.id;
      }
      return null;
    }),
  );
  return ret.filter((item) => item !== null);
};

const checkStatus = (
  statuses: { isTime: boolean; isReady: boolean; operator: string }[],
) => {
  let ret = true;
  [true, false].forEach((isTime, _) => {
    const options = statuses.filter((x) => x.isTime === isTime);
    options.sort((a, b) => (a.operator > b.operator ? 1 : -1));
    let ready: boolean | undefined = true;
    if (options.length > 0) {
      ready = undefined;
      for (const { isReady, operator } of options) {
        if (ready === undefined) {
          ready = isReady;
        } else if (operator === "or") {
          ready ||= isReady;
        } else {
          ready &&= isReady;
        }
      }
    }
    ret &&= Boolean(ready);
  });
  return ret;
};

const updateValue = async (
  condition: Conditions,
  index: number,
  key: string,
  value: unknown,
) => {
  const newConditions = [...condition.dataValues.conditions];
  newConditions.splice(index, 1, {
    ...newConditions[index],
    body: {
      ...newConditions[index].body,
      [key]: value,
    },
  });
  condition.set("conditions", newConditions);
  await condition.save();
};

const getInterval = (recurrence: Recurrence) => {
  let range = 0;
  switch (recurrence.type) {
    case "hours":
    case "hourly":
      range = 3600;
      break;
    case "days":
    case "daily":
      range = 86400;
      break;
    case "weeks":
    case "weekly":
      range = 604800;
      break;
    case "months":
    case "monthly":
      range = 2592000;
      break;
    case "years":
    case "yearly":
      range = 31536000;
      break;
    case "minutes":
      range = 60;
      break;
    case "seconds":
      range = 1;
      break;
    default:
      range = 0;
  }
  return (recurrence.interval || 0) * range;
};

const findConditionTx = async (prod = false) => {
  const ConditionModel = prod ? Conditions : ConditionsDev;
  return await ConditionModel.findAll({
    attributes: [
      "query",
      "useraddress",
      "id",
      "messageId",
      "actions",
      "conditions",
    ],
    where: { status: "ready" },
  });
};

export const notifyUser = async (data: unknown) => {
  console.log("notifyUser", data);
  // const subscriptions = await Subscriptions.findAll({
  //   where: { address: data.address },
  //   raw: true,
  // });
  // const printLog = usePrintLog(data.address);
  // for (const subscription of subscriptions) {
  //   printLog("sending", data.address, data, subscription.subscription);
  //   try {
  //     await webpush.sendNotification(
  //       subscription.subscription,
  //       JSON.stringify(data),
  //     );
  //   } catch (err) {
  //     if (
  //       err.statusCode === 410 ||
  //       err.statusCode === 401 ||
  //       err.statusCode === 403
  //     ) {
  //       printLog(err?.statusCode, err?.body);
  //       printLog("destroying since invalid subscription");
  //       await Subscriptions.destroy({ where: { id: subscription.id } });
  //     } else {
  //       throw err;
  //     }
  //   }
  // }
};

const discord_users: Record<string, string> = {
  "0xa23095b6c20cd2ad4c523b29db64cd2bc2e06d7c": "0xivan",
  "0x1f1ee2505493ef4aedea80fbfd12cb2e4e5248b5": "manito3369",
  "0x73f49321f63a2e8af0af25bb2a21a329882a4281": "pussy5layer666",
  "0xd36dae16cb4e04011362dd0264c9430807b24227": "astha22",
  "0xcb63b47acff4edc6ea1a83095956a8236ffd8260": "0xkp",
  "0xeb683293576c20b20ebd90a405fbe778360d4d55": "manuelmindx",
  "0xf0840b643eab3308633330c6bc5854d0167c63e2": "hwxfrank",
  "0xce43d9418e23f213a226fc271837aa7821e63f44": "busty_jd",
  "0xce8f6f360c8bb844fd053868e00b699b5b2c9ee4": "jshugs",
  "0x75fe63f977a1e8b38364cd5b9f53d53f3f63a47f": "witcheer",
  "0x1d8b23388ad7993a063376af045c97cd2e061462": "zk0t",
  "0xf4b157126e43e3d0a2e63e0773d30e12b2a66af5": "d_knght",
  "0x090ba43ecc815890adf49b46104b45c1f657f797": "mehdi.mhd",
  "0xfc86850cca5be10db978f39c6c51b5670bf56b81": ".meaningoflife",
  "0x72129d701c262a50ff6d1dd384b2bd8079b2b572": "_bagg",
  "0x35d2085239e04e9b0bd5082f28044170ac6fbdad": "verquer",
  "0xf62c0ecbfcd066dd92022918402740b5d48973ab": "0x009",
  "0x0155f5d9630ff76ae836fb3e3a89315ffb0b0dc0": "cryoncrypto",
  "0xd611aa078c127e16c8df8f0d2631b59d1e3c8fa4": "meynad#4251",
  "0x5ec6ce228c0dd6026113860fe5dcb1f1e7f664cf": "noral",
  "0x9e9e61e4466483fd525095e13618dbe235c375ff": "jerame20",
  "0xa4a2f21517073da2557fcabbca9356a7a82b6a68": "ndscrypt",
  "0xe1a702577f49d8bbb5a8853da07dcfd34b1082f0": "thebigskuu",
  "0xd528af2e2047666f7dc99ed588c0526b987a82cc": "_xhades_",
  "0xcc4926027504af72646b06ea43d35990aea0f2c7": "chadnik",
  "0xdf6abb568cefa2a18d822e040981d6d4df9956cc": "mrlaidbacc_",
  "0xdda55d2564ff205750defb21f4bc3e37c5e6a643": "gemhunter8679",
  "0x17bedfb7f8750538562c7fcd0c714b7ffdeaec83": "grimmonacci",
  "0xac6ae21323d8afb99305478802927fe1c3939e10": "daochemist",
  "0xf5528b8b998cafc28725c8b2d0b47b305ef3872b": "outperforming",
  "0x10e4e150cc93c105b1a91c1d89f1d5dcf4423881": "akig",
  "0x8b48e4b407af5d6da673348a9ea5153fce2f73a4": "dippuccino",
  "0x5458d40e2e8913f7af6ffed5b6e89f93e0505acb": "saltypickle24",
  "0x7843b322a9002620730ec1d7807325875efad333": "hydroboat",
  "0x50e030361e76c1bafbb9577eeb1bd9bc2efcf91c": "voiced_007",
  "0x70f534da4ecb8b5da335894864477b5a2e4fdf10": "0xn4r",
  "0x03c2c38da985ebfe3f83930c942dee29480ef824": "philipp668",
  "0x4991933554fbc17d85880eba460d3be7e892dcc6": "gokubutwithnohair",
  "0xa5cbf6e7b302b0d34186a6328e5406d2b8c1063b": "kayy0727",
  "0x8f38be15c2ffbc9a155fa4562d6db5978bb8f057": "darkfingah",
  "0x024cdb696a719f37b324a852085a68786d269212": "tnayin",
  "0xa5ef861278d7bf18a8a2068a01d66fbded93a1bd": "bicep_pump",
  "0x959227b5732704a2c17c903bccec467c9c89cd36": "lazer420",
  "0xd7e3dc09d1f7abd44160b42513f44ab8f4055eda": "degenoccultist",
  "0x1ea96df4469166fdb40b6233da049d40372e3c57": "thade",
  "0xe6767a0c53556b9580ac3b59fac8180aa0cb4e85": "yedamax",
  "0xeed612894dfcc7dabae20b7124b66fe39791eb3f": "coolthecool",
  "0x279b02bee5674b4ae21cff2443f5eb324dbf932c": "bill_researcher",
  "0x03f5bf9c577813b967137390bc7276d18e2dd360": "dr.bouma",
  "0x9170da9a5ebc352c31ad8f27586cdce288392110": "veggiechicken",
  "0x0969fcf4d4c8ee3962ffa5fa340d826c11f0640f": "0xsik",
  "0xa04f7f13a3f0e46cab79de7fceb20338fc7c0c42": "frans6cur",
  "0x51e54a1e35783102123fd08a71dec31ef3001a6a": "jacq404",
  "0x95f308fde5d2a3960937d1d7d2f0be174d587b93": "btcjev",
};

export const notifyUserDiscord = async (data: UserMsg) => {
  const printLog = usePrintLog(data.address);
  const printError = usePrintError(data.address);

  const userAddress = data.address.toLowerCase();
  const user = await Users.findOne({ where: { address: userAddress } });
  const count = data.count ?? 1;
  const message =
    data.message ||
    `${count > 1 ? count : "A"} condition${count > 1 ? "s" : ""} ${count > 1 ? "are" : "is"} ready to be executed! Make sure your Slate browser tab (desktop) or app (mobile) is running: [slate.ceo](https://slate.ceo?utm_source=condition)`;
  try {
    if (userAddress in discord_users && user?.settings?.notification?.discord) {
      const discord_recipient = discord_users[userAddress];
      const bot = createBot(discord_recipient, message, data.address);
      await bot.login(process.env.BOT_TOKEN_DM);
    } else {
      printLog("couldn't send discord notification 1");
    }
  } catch (err) {
    printError(err);
  }
};

async function getProtocolNChain(
  type: string | undefined,
  subject: string | undefined,
  actions: Call[],
  multiplier: number,
  protocol0: string,
  pool0: string,
  currentValue0: number | null | undefined,
  useraddress: string,
  chain: string,
  chainId0: ChainId,
  isTime: boolean,
  value_token: string | undefined,
  value_units: string | undefined,
  protocolName: string | undefined,
) {
  const printError = usePrintError(useraddress);

  let protocol = protocol0;
  let pool = pool0;
  let currentValue = currentValue0;
  let chainId = chainId0;

  const protocolActions = actions.filter(
    (x) =>
      !nonProtocolNames.includes(x.name) &&
      !!x.args.protocolName &&
      x.args.protocolName !== "all",
  );

  if (type === "yield") {
    const token = subject
      ?.replace("apy", "")
      .replace("supply", "")
      .replace("implied", "")
      .replace("underlying", "")
      .trim();
    let action = protocolActions.find((x) => !!x.args.poolName);
    if (!action) action = protocolActions[0];
    else pool = action.args.poolName || "";
    protocol = (action?.args?.protocolName || protocolName || "").toLowerCase();
    pool = (pool || token || "").toLowerCase();

    if (protocol) {
      if (protocol === "pendle") {
        let pendleApyType = "implied";
        if (subject?.includes("underlying")) {
          pendleApyType = "underlying";
        }
        //Explore adding a filter for whether poolName is a string
        const poolMetadata = await getPoolMetadata(
          chain || "ethereum",
          protocol,
          pool,
          undefined,
          {},
          pendleApyType,
        );
        currentValue = poolMetadata?.apy;
      } else {
        const project = convertProtocolNameToDefillamaProject(protocol);
        const symbol = convertPoolNameToDefillamaSymbol(protocol, pool);
        if (project && symbol) {
          protocol = project;
          pool = symbol;
          currentValue = await getPoolApy(
            useraddress,
            chainId,
            project,
            symbol,
          );
        }
      }
    }
  } else if (
    type === "health factor" ||
    type === "health_factor" ||
    type === "ltv"
  ) {
    const action = protocolActions[0];
    protocol = (action?.args.protocolName || protocolName || "").toLowerCase();
    if (protocol) {
      currentValue = await getLoanValueForProtocol(
        useraddress,
        protocol,
        type === "health_factor" || type === "health factor",
      );
    }
  } else if (type === "funding rate" || type === "open interest") {
    let action = protocolActions.find((x) => !!x.args.outputToken);
    if (!action) action = protocolActions[0];
    else pool = action.args.outputToken || "";
    protocol = (action?.args?.protocolName || protocolName || "").toLowerCase();
    pool = (pool || subject || "").toLowerCase();

    if (protocol) {
      if (!chain) {
        if (protocol === "hyperliquid") {
          chainId = 42161;
        } else if (protocol === "juice") {
          chainId = 81457;
        } else {
          const chainIds = Object.keys(ProtocolAddresses[protocol]).map(Number);
          if (chainIds.length > 0) chainId = chainIds[0] as ChainId;
        }
      }
      const data = chainId
        ? await getMarketInfoForProtocol(
            useraddress,
            protocol,
            `${action?.args.outputToken?.toLowerCase()}`,
            chainId,
          )
        : undefined;
      currentValue = type === "funding rate" ? data?.funding : data?.interest;
    }
  } else if (isTime) {
    currentValue = getCurrentTimestamp();
  } else if (type === "gas") {
    const unit = value_token || value_units;
    if (!unit || unit.includes("wei") || multiplier !== 1) {
      currentValue = await getGasPrice(useraddress, chainId || 1);
    } else {
      const {
        success,
        message,
        actions: actions_,
      } = await simulateActions(
        actions,
        [],
        useraddress,
        chain || "ethereum",
        simulationId,
      );
      if (!success) {
        printError("simulation failed for gas check with reason", message);
      } else {
        currentValue = 0;
        for (const action of actions_ || []) {
          for (const value of Object.values(action.gasCosts || {})) {
            currentValue += +value;
          }
        }
        currentValue /= 3;
      }
    }
  } else if (type === "price") {
    const symbol = subject
      ?.replace("price", "")
      .replace(" ", "")
      .replace("_", "");
    if (symbol === "gas") {
      if (value_token === "usd" || value_units === "usd") {
        currentValue = await getGasPriceInUsd(useraddress, chainId || 1);
      } else {
        currentValue = await getGasPrice(useraddress, chainId || 1);
      }
    } else {
      if (symbol?.includes("/")) {
        const parts = splitPool(symbol);
        const token0 = await getCoinDataClient(
          useraddress,
          parts[0],
          chainId || 1,
          false,
        );
        const token1 = await getCoinDataClient(
          useraddress,
          parts[1],
          chainId || 1,
          false,
        );
        if (token0.price && token1.price) {
          currentValue = token0.price / token1.price;
        }
      } else if (value_token && value_token !== "usd") {
        const token0 = await getCoinDataClient(
          useraddress,
          symbol,
          chainId || 1,
          false,
        );
        const token1 = await getCoinDataClient(
          useraddress,
          value_token,
          chainId || 1,
          false,
        );
        if (token0.price && token1.price) {
          currentValue = token0.price / token1.price;
        }
      } else if (value_units && value_units !== "usd") {
        const token0 = await getCoinDataClient(
          useraddress,
          symbol,
          chainId || 1,
          false,
        );
        const token1 = await getCoinDataClient(
          useraddress,
          value_units,
          chainId || 1,
          false,
        );
        if (token0.price && token1.price) {
          currentValue = token0.price / token1.price;
        }
      } else {
        const token = await getCoinDataClient(
          useraddress,
          symbol,
          chainId || 1,
          false,
        );
        currentValue = token.price;
      }
    }
  } else if (type === "market cap" || type === "fdv") {
    const symbol = subject
      ?.replace("market", "")
      .replace("cap", "")
      .replace("fdv", "")
      .replace(" ", "")
      .replace("_", "");
    const key = type === "market cap" ? "market_cap" : "fdv";
    if (value_token && value_token !== "usd") {
      const token0 = await getCoinDataClient(
        useraddress,
        symbol,
        chainId || 1,
        false,
      );
      const token1 = await getCoinDataClient(
        useraddress,
        value_token,
        chainId || 1,
        false,
      );
      if (token0[key] && token1[key]) {
        currentValue = token0[key] / token1[key];
      }
    } else if (value_units && value_units !== "usd") {
      const token0 = await getCoinDataClient(
        useraddress,
        symbol,
        chainId || 1,
        false,
      );
      const token1 = await getCoinDataClient(
        useraddress,
        value_units,
        chainId || 1,
        false,
      );
      if (token0[key] && token1[key]) {
        currentValue = token0[key] / token1[key];
      }
    } else {
      const token = await getCoinDataClient(
        useraddress,
        symbol,
        chainId || 1,
        false,
      );
      currentValue = token[key];
    }
  } else if (type === "balance")
    ({ currentValue, protocol, chainId } = await get4Balance(
      subject,
      currentValue,
      protocol,
      chain,
      chainId,
      useraddress,
      value_token,
      value_units,
    ));
  else if (type === "slippage") {
    const {
      success,
      message,
      actions: actions_,
    } = await simulateActions(
      actions,
      [],
      useraddress,
      chain || "ethereum",
      simulationId,
    );
    if (!success) {
      printError("simulation failed for slippage check with reason", message);
    } else {
      const filtered = (actions_ || []).filter((x) =>
        ["swap", "deposit", "withdraw"].includes(x.name),
      );

      let totalIn = 0;
      let totalOut = 0;
      await Promise.all(
        filtered.map(async (action) => {
          const balanceChange: JSONObject = Object.values(
            action.balanceChanges || {},
          )[0];
          if (!balanceChange) return;

          // Create array of promises for all price fetching operations
          const pricePromises = Object.entries(balanceChange).map(
            async ([token, amount]) => {
              const price = await getCoinDataClient(
                useraddress,
                token,
                chainId || 1,
                false,
              );

              if (!price?.price) {
                printError(`not able to fetch price for ${token}`);
                return null;
              }

              return {
                amount: Number(amount),
                price: price.price,
              };
            },
          );

          // Wait for all price fetches to complete
          const results = await Promise.all(pricePromises);

          // Process results
          for (const result of results) {
            if (!result) return;

            if (result.amount < 0) {
              totalIn += result.amount * result.price;
            } else {
              totalOut += result.amount * result.price;
            }
          }
        }),
      );
      if (totalIn) currentValue = Math.abs(Math.abs(totalOut / totalIn) - 1);
    }
  }
  return { protocol, pool, currentValue, chainId };
}

async function get4Balance(
  subject: string | undefined,
  currentValue0: number | null | undefined,
  protocol0: string,
  chain: string,
  chainId0: ChainId,
  useraddress: string,
  value_token: string | undefined,
  value_units: string | undefined,
) {
  let currentValue = currentValue0;
  let protocol = protocol0;
  let chainId = chainId0;
  const symbol = subject
    ?.replace("balance", "")
    .replace(" ", "")
    .replace("_", "");
  currentValue = 0;
  if (symbol?.includes("rewards")) {
    protocol = symbol?.replace("rewards", "").replace(" ", "");
    if (!chain) {
      if (protocol === "hyperliquid") {
        chainId = 1;
      } else if (protocol === "juice") {
        chainId = 81457;
      } else {
        const chainIds = Object.keys(ProtocolAddresses[protocol]).map(Number);
        if (chainIds.length > 0) chainId = chainIds[0] as ChainId;
      }
    }
    const protocols = await getUserPositions(
      chainId || 1,
      useraddress,
      protocol,
    );
    for (const protocol of protocols) {
      for (const position of protocol.positions) {
        /* eslint-disable no-await-in-loop */
        for (const token of position.reward || []) {
          const tokenData = await getCoinDataClient(
            useraddress,
            token.symbol,
            chainId || 1,
            false,
          );
          if (tokenData.price) {
            currentValue +=
              tokenData.price *
              +ethers.formatUnits(token.amount, token.decimals);
          }
        }
      }
    }
  } else {
    currentValue = await getTokenBalance(
      useraddress,
      chain || "ethereum",
      symbol ?? null,
    );
  }
  const unit = value_token || value_units;
  if (unit) {
    if (!symbol?.includes("rewards")) {
      // convert balance to usd amount
      const tokenData = await getCoinDataClient(
        useraddress,
        symbol,
        chainId || 1,
        false,
      );
      if (tokenData.price) {
        currentValue *= tokenData.price;
      } else {
        currentValue = null;
      }
    }
    if (unit !== "usd" && currentValue) {
      // convert balance to match unit
      const tokenData = await getCoinDataClient(
        useraddress,
        unit,
        chainId || 1,
        false,
      );
      if (tokenData.price) {
        currentValue /= tokenData.price;
      } else {
        currentValue = null;
      }
    }
  }
  return { currentValue, protocol, chainId };
}

async function checkCondition(
  type: string | undefined,
  subject: string | undefined,
  condition: Conditions,
  protocol: string | undefined,
  pool: string | undefined,
  currentValue: number | undefined,
  isReady0: boolean,
  value: string,
  useraddress: string,
  comparator: string | undefined,
  i: number,
  multiplier: number,
  isTime: boolean,
  wasReady: boolean,
  recurrence:
    | {
        type?: "seconds" | "minutes" | "hours" | "days" | "weeks" | "months";
        interval?: number;
        times?: number;
        random?: boolean;
      }
    | undefined,
  hasRecurrence0: boolean,
  lastran: number,
  end_time: string | undefined,
  expired0: boolean,
  value_units: string | undefined,
  chainId: ChainId | undefined,
) {
  const chain = getChainNameFromId(chainId || 1) || "ethereum";
  const ethPrice = (await getCoinDataClient(useraddress, "eth", chainId || 1))
    .price;

  let isReady = isReady0;
  let expired = expired0;
  let hasRecurrence = hasRecurrence0;
  if (type === "yield") {
    ({ isReady } = await checkConditionYield(
      subject,
      condition,
      protocol,
      pool,
      currentValue,
      isReady,
      value,
      useraddress,
      comparator,
      i,
      chain,
      chainId || 1,
    ));
  } else if (
    type === "health factor" ||
    type === "health_factor" ||
    type === "ltv" ||
    type === "funding rate" ||
    type === "open interest"
  )
    ({ isReady } = await handleRateOInt(
      condition,
      protocol,
      currentValue,
      isReady,
      multiplier,
      value,
      i,
      comparator,
    ));
  else if (isTime)
    ({ isReady, hasRecurrence, expired } = handleTime(
      wasReady,
      isReady,
      currentValue,
      value,
      recurrence,
      hasRecurrence,
      lastran,
      end_time,
      expired,
    ));
  else if (type === "gas") {
    if (!currentValue) {
      isReady = false;
    } else {
      let value_ =
        multiplier !== 1 ? currentValue * multiplier : Number.parseFloat(value);
      if (multiplier !== 1) {
        await updateValue(condition, i, "value", value_);
      } else if (value_units && !value_units.includes("wei")) {
        let price = 1;
        if (value_units !== "usd") {
          const token = await getCoinDataClient(
            useraddress,
            value_units,
            chainId || 1,
          );
          price = token.price || 0;
        }
        value_ *= price;
        if (ethPrice) value_ /= ethPrice;
      }
      isReady = compareValues(currentValue, value_, comparator);
      if (!isReady && comparator === "==") {
        await updateValue(
          condition,
          i,
          "comparator",
          currentValue > value_ ? "<=" : ">=",
        );
      }
    }
  } else if (type === "price") {
    const symbol = subject
      ?.replace("price", "")
      .replace(" ", "")
      .replace("_", "");
    if (symbol === "gas") {
      if (!currentValue) {
        isReady = false;
      } else {
        const value_ =
          multiplier !== 1
            ? currentValue * multiplier
            : Number.parseFloat(value);
        if (multiplier !== 1) {
          await updateValue(condition, i, "value", value_);
        }
        isReady = compareValues(currentValue, value_, comparator);
        if (!isReady && comparator === "==") {
          await updateValue(
            condition,
            i,
            "comparator",
            currentValue > value_ ? "<=" : ">=",
          );
        }
      }
    } else {
      if (!currentValue) {
        isReady = false;
      } else {
        const value_ =
          multiplier !== 1
            ? currentValue * multiplier
            : Number.parseFloat(value);
        if (multiplier !== 1) {
          await updateValue(condition, i, "value", value_);
        }
        isReady = compareValues(currentValue, value_, comparator);
        if (!isReady && comparator === "==") {
          await updateValue(
            condition,
            i,
            "comparator",
            currentValue > value_ ? "<=" : ">=",
          );
        }
      }
    }
  } else if (type === "market cap" || type === "fdv") {
    if (!currentValue) {
      isReady = false;
    } else {
      const value_ =
        multiplier !== 1 ? currentValue * multiplier : Number.parseFloat(value);
      if (multiplier !== 1) {
        await updateValue(condition, i, "value", value_);
      }
      isReady = compareValues(currentValue, value_, comparator);
      if (!isReady && comparator === "==") {
        await updateValue(
          condition,
          i,
          "comparator",
          currentValue > value_ ? "<=" : ">=",
        );
      }
    }
  } else if (type === "balance") {
    if (!currentValue) {
      isReady = false;
    } else {
      const value_ =
        multiplier !== 1 ? currentValue * multiplier : Number.parseFloat(value);
      if (multiplier !== 1) {
        await updateValue(condition, i, "value", value_);
      }
      isReady = compareValues(currentValue, value_, comparator);
      if (!isReady && comparator === "==") {
        await updateValue(
          condition,
          i,
          "comparator",
          currentValue > value_ ? "<=" : ">=",
        );
      }
    }
  } else if (type === "slippage") {
    if (!currentValue) {
      isReady = false;
    } else {
      isReady = compareValues(
        currentValue,
        Number.parseFloat(value) / 100,
        comparator,
      );
    }
  }
  return { isReady, hasRecurrence, expired };
}

async function handleRateOInt(
  condition: Conditions,
  protocol: string | undefined,
  currentValue: number | undefined,
  isReady0: boolean,
  multiplier: number,
  value: string,
  i: number,
  comparator: string | undefined,
) {
  let isReady = isReady0;
  if (protocol) {
    if (!currentValue) {
      isReady = false;
    } else {
      const value_ =
        multiplier !== 1 ? currentValue * multiplier : Number.parseFloat(value);
      if (multiplier !== 1) {
        await updateValue(condition, i, "value", value_);
      }
      isReady = compareValues(currentValue, value_, comparator);
      if (!isReady && comparator === "==") {
        await updateValue(
          condition,
          i,
          "comparator",
          currentValue > value_ ? "<=" : ">=",
        );
      }
    }
  }
  return { isReady };
}

function handleTime(
  wasReady: boolean,
  isReady0: boolean,
  currentValue: number | undefined,
  value: string,
  recurrence: Recurrence | undefined,
  hasRecurrence0: boolean,
  lastran: number,
  end_time: string | undefined,
  expired0: boolean,
) {
  let isReady = isReady0;
  let hasRecurrence = hasRecurrence0;
  let expired = expired0;
  if (wasReady) {
    isReady = true;
  } else if (currentValue) {
    const _value = Number.parseInt(value, 10);
    isReady = !recurrence && currentValue >= _value;
    hasRecurrence ||= !!recurrence;

    if (currentValue >= _value && !isReady && recurrence) {
      const interval = getInterval(recurrence);
      if (interval !== 0) {
        if (lastran) {
          isReady = currentValue - lastran >= interval;
        } else {
          isReady = currentValue >= _value;
        }
      } else {
        const { times, random } = recurrence;
        if (random) {
          if (lastran) {
            isReady = currentValue - lastran >= interval;
          } else {
            isReady = currentValue >= _value;
          }
        } else if (times) {
          isReady = true;
        }
      }
    }
  }
  if (end_time && currentValue) {
    if (end_time === "forever") {
      isReady = true;
      expired = false;
    } else {
      expired = currentValue > Number.parseInt(end_time, 10);
    }
    isReady &&= !expired;
  }
  return { isReady, hasRecurrence, expired };
}

async function checkConditionYield(
  subject: string | undefined,
  condition: Conditions,
  protocol: string | undefined,
  pool: string | undefined,
  currentValue: number | undefined,
  isReady0: boolean,
  value: string,
  useraddress: string,
  comparator: string | undefined,
  i: number,
  chain: string,
  chainId: ChainId,
) {
  let isReady = isReady0;
  let project = protocol;
  let symbol = pool;
  let isPendle = project === "pendle" && !!symbol;
  if (project && symbol) {
    if (!currentValue) {
      isReady = false;
    } else {
      let value_: number | undefined;
      if (
        !(typeof value === "string" && value.includes("%")) &&
        isNaNValue(value)
      ) {
        const values = value.split(" ");
        let apy: number | undefined;
        if (values.length > 1) {
          isPendle = values[0].toLowerCase() === "pendle";
          if (isPendle) {
            project = values[0];
            symbol = values[1];
          } else {
            // values.length > 1 and not pendle
            project = values[0];
            symbol = convertPoolNameToDefillamaSymbol(project, values[1]);
            apy = await getPoolApy(useraddress, chainId, project, symbol);
          }
        } else if (!isPendle) {
          // values.length <= 1 and not pendle
          symbol = convertPoolNameToDefillamaSymbol(project, value);
          apy = await getPoolApy(useraddress, chainId, project, symbol);
        }
        if (isPendle) {
          // pendle and any values.length
          let pendleApyType = "implied";
          if (subject?.includes("underlying")) {
            pendleApyType = "underlying";
          }
          const poolMetadata = await getPoolMetadata(
            chain,
            project,
            symbol,
            undefined,
            {},
            pendleApyType,
          );
          apy = poolMetadata?.apy;
        }
        if (apy) {
          value_ = apy;
        }
      } else {
        value_ = Number.parseFloat(value);
      }
      if (!value_) {
        isReady = false;
      } else {
        let value_: number | undefined;
        if (
          !(typeof value === "string" && value.includes("%")) &&
          isNaNValue(value)
        ) {
          const values = value.split(" ");
          let apy: number | undefined;
          if (values.length > 1) {
            isPendle = values[0].toLowerCase() === "pendle";
            if (isPendle) {
              project = values[0];
              symbol = values[1];
            } else {
              // values.length > 1 and not pendle
              project = values[0];
              symbol = convertPoolNameToDefillamaSymbol(project, values[1]);
              apy = await getPoolApy(useraddress, chainId, project, symbol);
            }
          } else if (!isPendle) {
            // values.length <= 1 and not pendle
            symbol = convertPoolNameToDefillamaSymbol(project, value);
            apy = await getPoolApy(useraddress, chainId, project, symbol);
          }
          if (isPendle) {
            // pendle and any values.length
            let pendleApyType = "implied";
            if (subject?.includes("underlying")) {
              pendleApyType = "underlying";
            }
            const poolMetadata = await getPoolMetadata(
              chain,
              project,
              symbol || "",
              undefined,
              {},
              pendleApyType,
            );
            apy = poolMetadata?.apy;
          }
          if (apy) {
            value_ = apy;
          }
        } else {
          value_ = Number.parseFloat(value);
        }
        if (!value_) {
          isReady = false;
        } else {
          isReady = compareValues(currentValue, value_, comparator);
          if (!isReady && comparator === "==") {
            await updateValue(
              condition,
              i,
              "comparator",
              currentValue > value_ ? "<=" : ">=",
            );
          }
        }
      }
    }
  }
  return { isReady };
}

// Function to create the bot client
function createBot(username: string, message: string, address: string) {
  const printLog = usePrintLog(address);
  const printError = usePrintError(address);
  const bot = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessages,
    ],
  });

  bot.once("ready", async () => {
    printLog(`Logged in as ${bot.user?.tag} (ID: ${bot.user?.id})`);
    const guild = bot.guilds.resolve("1163873322275184743");
    const usernames = await guild?.members
      .fetch()
      .then((members) => members.map((member) => member.user));
    const users = usernames?.filter((u) => u.username === username);

    if (users?.length === 1) {
      try {
        const user = users[0];
        const dmChannel = await user.createDM();
        await dmChannel.send(message);
        printLog(`Sent DM to ${user.username} (ID: ${user.id})`);
      } catch (ex) {
        printError(ex);
      }
    } else {
      printLog("User not found", users);
    }
    await bot.destroy();
  });

  bot.on("error", (error) => {
    sfConsoleError("Bot encountered an error:", error);
  });

  return bot;
}

export const notifyUsersDiscord = async (datas: UserMsg[]) => {
  const users = await Users.findAll({
    where: {
      address: { [Op.or]: datas.map((data) => data.address.toLowerCase()) },
    },
  });

  const umas: [string, string, string][] = [];
  for (const data of datas) {
    const printLog = usePrintLog(data.address);
    const count = data.count ?? 1;
    const message =
      data.message ||
      `${count > 1 ? data.count : "A"} condition${count > 1 ? "s" : ""} ${count > 1 ? "are" : "is"} ready to be executed! Make sure your Slate browser tab (desktop) or app (mobile) is running: [slate.ceo](https://slate.ceo?utm_source=condition)`;
    const userAddress = data.address.toLowerCase();
    const user = users.find((u) => u.address === userAddress);
    if (userAddress in discord_users && user?.settings?.notification?.discord) {
      const discord_recipient = discord_users[userAddress];
      umas.push([discord_recipient, message, data.address]);
    } else {
      printLog("couldn't send discord notification 1");
    }
  }
  try {
    if (umas.length > 0) {
      const bot = createBots(umas);
      await bot.login(process.env.BOT_TOKEN_DM);
    }
  } catch (err) {
    sfConsoleError(err);
  }
};

// Function to create the bot client
function createBots(umas: [string, string, string][]) {
  const bot = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessages,
    ],
  });

  bot.once("ready", async () => {
    console.log(`Logged in as ${bot.user?.tag} (ID: ${bot.user?.id})`);
    const guild = bot.guilds.resolve("1163873322275184743");
    const usernames = await guild?.members
      .fetch()
      .then((members) => members.map((member) => member.user));
    await Promise.all(
      umas.map(async ([username, message, address]) => {
        const printLog = usePrintLog(address);
        const printError = usePrintError(address);
        const users = usernames?.filter((u) => u.username === username);
        if (users?.length === 1) {
          try {
            const user = users[0];
            const dmChannel = await user.createDM();
            await dmChannel.send(message);
            printLog("Sent DM");
          } catch (ex) {
            if (
              address === "0x8f38be15c2ffbc9a155fa4562d6db5978bb8f057" ||
              address === "0x7843b322a9002620730ec1d7807325875efad333"
            ) {
              printLog("couldn't send DM to user");
            } else {
              printError(ex);
            }
          }
        } else {
          printError("not found");
        }
      }),
    );
    await bot.destroy();
  });

  bot.on("error", (error) => {
    sfConsoleError("Bot encountered an error:", error);
  });

  return bot;
}

async function attemptFetchGasPrice(account: string, retryChainId: ChainId) {
  const printError = usePrintError(account);

  const maxAttempts = 3;
  /* eslint-disable no-await-in-loop */
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const provider = new RetryProvider(
        getRpcUrlForChain(retryChainId),
        retryChainId,
      );
      const { gasPrice } = await provider.getFeeData();
      if (!gasPrice) {
        throw new Error("Gas price is undefined");
      }
      return Number.parseFloat(ethers.formatUnits(gasPrice, 9));
    } catch (err) {
      if (attempt >= maxAttempts) {
        printError(
          err,
          `error Failed to fetch gas price after ${maxAttempts} attempts for chainId ${retryChainId}`,
        );
        throw err;
      }
      // printError(
      // `error Attempt ${attempt} failed for chainId ${retryChainId}, retrying...`,
      // );
      await new Promise((resolve) =>
        setTimeout(resolve, 2 ** (attempt - 1) * 1000),
      );
    }
  }
}

export const getGasPrice = async (account: string, chainId: ChainId) => {
  const printError = usePrintError(account);

  try {
    // First try with the original chainId
    return await attemptFetchGasPrice(account, chainId);
  } catch {
    // If all retries fail, try with the fallback chainId (1)
    printError(
      `error Retrying with fallback chainId 1 after failure with chainId ${chainId}`,
    );
    return await attemptFetchGasPrice(account, 1);
  }
};

export const getGasPriceInUsd = async (account: string, chainId: ChainId) => {
  const printError = usePrintError(account);
  try {
    const gasPriceEth = await attemptFetchGasPrice(account, chainId);
    if (!gasPriceEth) {
      throw new Error("Gas price is undefined");
    }
    const ethPriceInDollars = await getCoinDataClient(account, "eth", chainId);
    assert(isDefined(ethPriceInDollars.price));
    return gasPriceEth * ethPriceInDollars.price;
  } catch {
    printError(
      `error Couldn't fetch USD gas price for chainId ${chainId}, trying with fallback chainId 1`,
    );
    try {
      const gasPriceEth = await attemptFetchGasPrice(account, 1);
      if (!gasPriceEth) {
        throw new Error("Gas price is undefined");
      }
      const ethPriceInDollars = await getCoinDataClient(account, "eth", 1);
      assert(isDefined(ethPriceInDollars.price));
      return gasPriceEth * ethPriceInDollars.price;
    } catch (fallbackErr) {
      printError("Error Failed to fetch USD gas price with fallback chainId 1");
      throw fallbackErr;
    }
  }
};
