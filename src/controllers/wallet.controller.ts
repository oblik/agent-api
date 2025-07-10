import https from "node:https";
import {
  type Commitment,
  Connection,
  PublicKey,
  type RpcResponseAndContext,
  type SignatureResult,
  Transaction,
} from "@solana/web3.js";
import axios, { type AxiosResponse } from "axios";
import bs58 from "bs58";
import * as chrono from "chrono-node";
import { ethers } from "ethers";
import type { Request, Response } from "express";
import httpStatus from "http-status";
import jwt from "jsonwebtoken";
import moment from "moment-timezone";
import { Op, QueryTypes } from "sequelize";
import nacl from "tweetnacl";
import pkg from "tweetnacl-util";
import type { Event } from "../../analytics_utils/types.js";
import ProtocolActionTokens from "../config/actionToken.js";
import { ignoreTokenList } from "../config/ignoreToken.js";
import { ConditionStatus } from "../db/condition.model.js";
import {
  Analytics,
  Conditions,
  ConditionsDev,
  Dataset,
  Histories,
  Tracking,
  Users,
  sequelize,
} from "../db/index.js";
import { TVL } from "../db/tvl.model.js";
import { getCurrentValues, notifyUser, notifyUserDiscord } from "../handler.js";
import {
  getChainError,
  getNoPositionError,
  getUnsupportedTokenError,
} from "../utils/error.js";
import {
  checkEdited,
  getActionTx,
  getAmountKey,
  getBridgeTx,
  getChainIdFromName,
  getChainKey,
  getCoinData,
  getCurrentTimestamp,
  getErrorMessage,
  getFeeTx,
  getHyperliquidOngoingTwaps,
  getHyperliquidOpenOrders,
  getOwedFee,
  getPerpActionTx,
  getPoolMetadata,
  getProtocolMetadata,
  getProtocolPositions,
  getRpcUrlForChain,
  getSwapTx,
  getTokenAmount,
  getTokenHistoryMemoized,
  getTokenInfoForChain,
  getTokenKey,
  getTokenLogoForChain,
  getTransferTx,
  getUserOwnedTokenBalancesFromDeBank,
  getVerifiedEntities,
  isNaNValue,
  isSolanaAddress,
  sfParseUnits,
  updateOwedFee,
  validatePoolNames,
  validateProtocolNames,
  validateToken,
  withRetry,
} from "../utils/index.js";
import { sfConsoleError, usePrintError, usePrintLog } from "../utils/log.js";
import { getHyperliquidTokenInfo } from "../utils/protocols/hyperliquid.js";
import {
  getAlternativeChain,
  getMarketInfoForProtocol,
} from "../utils/protocols/index.js";
import { getPendlePoolInfo } from "../utils/protocols/pendle.js";
import { RetryProvider } from "../utils/retryProvider.js";
import { getJupiterSwapTx, getSolanaTokenInfo } from "../utils/simulate-sol.js";
import { simulateActions } from "../utils/simulate.js";
import type {
  Call,
  ChainId,
  JSONObject,
  RawAction,
  SimResult,
  TokenInfo,
} from "../utils/types.js";
import { assert, isChainId } from "../utils/types.js";
const { decodeUTF8 } = pkg;

const nonProtocolNames = ["swap", "bridge", "transfer", "notification"];
const supportedTypes = [
  "price",
  "market cap",
  "market_cap",
  "balance",
  "gas",
  "yield",
  "ltv",
  "fdv",
  "health factor",
  "health_factor",
  "funding rate",
  "funding_rate",
  "open interest",
  "tvl",
  "liquidity",
  "time",
  "slippage",
];

const generateToken = (address: string) => {
  return jwt.sign({ address }, process.env.JWT_ACCESS_TOKEN_SECRET || "", {
    expiresIn: "7d",
  });
};

// Types for the signature format
type BufferSignature = {
  type: "Buffer";
  data: number[];
};

type AuthSolRequest = {
  signature: BufferSignature;
  accountAddress: string;
};

const auth_sol = async (req: Request, res: Response) => {
  try {
    const { accountAddress, signature } = req.body as AuthSolRequest;

    if (!accountAddress || !signature) {
      return res.status(httpStatus.BAD_REQUEST).json({
        status: "error",
        message: "Missing required parameters",
      });
    }

    // Validate signature format
    if (signature.type !== "Buffer" || !Array.isArray(signature.data)) {
      return res.status(httpStatus.BAD_REQUEST).json({
        status: "error",
        message: "Invalid signature format: Expected Buffer with data array",
      });
    }

    const message = "I sign authentication";
    const publicKey = new PublicKey(accountAddress);
    const messageBytes = decodeUTF8(message);
    const signatureBytes = new Uint8Array(signature.data);

    try {
      // Verify using tweetnacl
      const verified = nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        publicKey.toBytes(),
      );

      if (!verified) {
        return res.status(httpStatus.UNAUTHORIZED).json({
          status: "error",
          message: "Invalid signature",
        });
      }

      const accessToken = generateToken(accountAddress);
      return res.status(httpStatus.OK).json({
        status: "success",
        accessToken,
        expiresAt: Math.floor(Date.now() / 1000) + 604800, // 7 days
      });
    } catch (error) {
      console.error("Signature verification error:", error);
      return res.status(httpStatus.BAD_REQUEST).json({
        status: "error",
        message: "Invalid signature format: Signature verification failed",
      });
    }
  } catch (error) {
    console.error("Solana verification error:", error);
    return res.status(httpStatus.UNAUTHORIZED).json({
      status: "error",
      message: "Invalid signature or address",
    });
  }
};

const auth_evm = async (req: Request, res: Response) => {
  try {
    const { accountAddress, signature } = req.body;

    if (!accountAddress || !signature) {
      return res.status(httpStatus.BAD_REQUEST).json({
        status: "error",
        message: "Missing required parameters",
      });
    }

    const message = "I sign authentication";
    const address = accountAddress.toLowerCase();
    const recovered = ethers.verifyMessage(message, signature);

    if (address !== recovered.toLowerCase()) {
      return res.status(httpStatus.UNAUTHORIZED).json({
        status: "error",
        message: "Invalid signed message",
      });
    }

    const accessToken = generateToken(address);
    return res.status(httpStatus.OK).json({
      status: "success",
      accessToken,
      expiresAt: Math.floor(Date.now() / 1000) + 604800,
    });
  } catch (error) {
    console.error("EVM verification error:", error);
    return res.status(httpStatus.UNAUTHORIZED).json({
      status: "error",
      message: "Invalid signature or address",
    });
  }
};

// Update user status
const updateUser = async (req: Request, res: Response) => {
  const { accountAddress, survey } = req.body;

  try {
    if (!accountAddress) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json({ status: "error", message: "Failed to update user" });
    }

    let user = await Users.findOne({
      where: { address: accountAddress.toLowerCase() },
    });

    // TODO
    if (user) {
      user.set("survey", survey || user.survey);
    } else {
      const generateReferralCode = (length: number) => {
        const characters =
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

        let result = "";
        const charactersLength = characters.length;
        for (let i = 0; i < length; i++) {
          result += characters.charAt(
            Math.floor(Math.random() * charactersLength),
          );
        }

        return result;
      };
      const generateUniqueReferralCode = async (
        length: number,
      ): Promise<string> => {
        const generateAndCheckCode = async (): Promise<string> => {
          const referralCode = generateReferralCode(length);
          const existentUser = await Users.findOne({
            where: { referral_code: referralCode },
          });
          if (!existentUser) {
            return referralCode;
          }
          return generateAndCheckCode();
        };

        return generateAndCheckCode();
      };

      const referralCode = await generateUniqueReferralCode(8);

      user = await Users.create({
        address: accountAddress.toLowerCase(),
        referral_code: referralCode,
      });
    }

    const id = user.get("id");

    return res.status(httpStatus.CREATED).json({
      status: "success",
      id,
      referralCode: user.referral_code,
    });
  } catch {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ status: "error", message: "Failed to update user" });
  }
};

// Get user settings
const getSettings = async (req: Request, res: Response) => {
  const { accountAddress } = req.body;
  if (!accountAddress) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ status: "error", message: "Missing user address" });
  }
  const printError = usePrintError(accountAddress);

  try {
    const user = await Users.findOne({
      where: { address: accountAddress.toLowerCase() },
    });
    if (user) {
      return res.status(httpStatus.OK).json({
        status: "success",
        settings: user.settings || {},
      });
    }
    printError("Failed to get user settings");
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ status: "error", message: "Failed to get user settings" });
  } catch (err) {
    printError("Error during get user settings");
    printError(err);
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ status: "error", message: "Error during get user settings" });
  }
};

// Update user settings
const updateSettings = async (req: Request, res: Response) => {
  const { accountAddress, settings } = req.body;
  if (!accountAddress) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ status: "error", message: "Missing user address" });
  }
  const printError = usePrintError(accountAddress);

  try {
    const user = await Users.findOne({
      where: { address: accountAddress.toLowerCase() },
    });

    if (user) {
      user.set("settings", settings || {});
      await user.save();

      return res
        .status(httpStatus.OK)
        .json({ status: "success", message: "Success" });
    }
    printError("Failed to set user settings");
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ status: "error", message: "Failed to set user settings" });
  } catch (err) {
    printError("Error during set user settings");
    printError(err);
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ status: "error", message: "Error during set user settings" });
  }
};

const addCondition = async (req: Request, res: Response) => {
  const { isDev } = req.query;
  const { accountAddress, query, messageId, conditions, simulationResults } =
    req.body;
  const requestSecret = req.query.secret;
  const ConditionModel =
    isDev === "true" ||
    requestSecret ||
    accountAddress.toLowerCase() ===
      "0x4f4118cf9aa8be66fc093912ca609db93e6cdfec" ||
    accountAddress.toLowerCase() ===
      "0xd4129caf7596b0b8e744608189aee22184328447"
      ? ConditionsDev
      : Conditions;
  if (conditions.length === 0) {
    return res.status(httpStatus.BAD_REQUEST).json({
      status: "error",
      message: "Invalid Request Body",
    });
  }

  const printError = usePrintError(accountAddress);

  try {
    let simstatus = 0;
    conditions.forEach(async (condition: Conditions, index: number) => {
      // If action is `notification`, skip simulation
      if (condition.actions[0].name !== "notification") {
        if (!simulationResults?.[index]?.success) {
          simstatus = 1;
        }
        if (simulationResults?.[index]?.actions) {
          condition.actions = simulationResults[index].actions;
        }
      }
    });

    for (let i = 0; i < conditions.length; i++) {
      for (const condition of conditions[i].conditions) {
        const {
          operator,
          type,
          subject,
          value,
          comparator,
          start_time,
          end_time,
          recurrence,
          protocolName,
        } = condition.body;
        if (type && !supportedTypes.includes(type.toLowerCase())) {
          return res.status(httpStatus.BAD_REQUEST).json({
            status: "error",
            message:
              "something went wrong understanding this conditional prompt. modify it slightly and try again",
          });
        }
        if (operator && !["or", "and"].includes(operator)) {
          printError(`operator ${operator} not supported`);
          return res.status(httpStatus.BAD_REQUEST).json({
            status: "error",
            message: `operator ${operator} not supported`,
          });
        }
        if (type === "yield") {
          if (subject?.includes("borrow")) {
            return res.status(httpStatus.BAD_REQUEST).json({
              status: "error",
              message: "yield type condition specified with borrow apy",
            });
          }
          const protocolActions = conditions[i].actions.filter(
            (x: RawAction) =>
              !nonProtocolNames.includes(x.name) &&
              !!x.args.protocolName &&
              x.args.protocolName !== "all",
          );
          const action = protocolActions.find(
            (x: RawAction) => !!x.args.poolName,
          );
          const token = (subject || "")
            .replace("apy", "")
            .replace("supply", "")
            .replace("implied", "")
            .replace("underlying", "")
            .trim();
          if (!action) {
            if (!token || (protocolActions.length === 0 && !protocolName)) {
              return res.status(httpStatus.BAD_REQUEST).json({
                status: "error",
                message: "yield type condition specified without pool name",
              });
            }
          }
        } else if (["health_factor", "ltv"].includes(type)) {
          const action = conditions[i].actions.find(
            (x: RawAction) =>
              !nonProtocolNames.includes(x.name) &&
              !!x.args.protocolName &&
              x.args.protocolName !== "all",
          );
          if (!action && !protocolName) {
            return res.status(httpStatus.BAD_REQUEST).json({
              status: "error",
              message: `${type} type condition specified without protocol name`,
            });
          }
        } else if (["funding rate", "open interest"].includes(type)) {
          const protocolActions = conditions[i].actions.filter(
            (x: RawAction) =>
              !nonProtocolNames.includes(x.name) &&
              !!x.args.protocolName &&
              x.args.protocolName !== "all",
          );
          const action = protocolActions.find(
            (x: RawAction) => !!x.args.outputToken,
          );
          if (!action) {
            if (!subject || (protocolActions.length === 0 && !protocolName)) {
              return res.status(httpStatus.BAD_REQUEST).json({
                status: "error",
                message: `${type} type condition specified without protocol or market token`,
              });
            }
          }
        } else if (condition.name !== "time" && type !== "time") {
          if (
            value?.includes("%") &&
            value?.startsWith("-") &&
            comparator?.includes(">")
          ) {
            printError("> or >= to under 100% percentage value is meaningless");
            return res.status(httpStatus.BAD_REQUEST).json({
              status: "error",
              message: "> or >= to under 100% percentage value is meaningless",
            });
          }
          if (value?.includes("x") && value?.startsWith("-")) {
            printError("negative multiplier is not supported");
            return res.status(httpStatus.BAD_REQUEST).json({
              status: "error",
              message: "negative multiplier is not supported",
            });
          }
        } else if (end_time && !recurrence) {
          const isTwapAction = conditions[i].actions.some(
            (action: Call) => action.name === "swap",
          );

          if (isTwapAction) {
            // Convert to recurrence with adding interval
            // 2 minutes interval for twap

            const times = Math.floor((end_time - start_time) / (2 * 60));

            for (const action of conditions[i].actions) {
              const args = action.args;
              if (action.name === "swap") {
                action.body = { ...action.args };

                if (!isNaNValue(args.inputAmount)) {
                  args.inputAmount = Number(args.inputAmount) / times;
                }
                if (!isNaNValue(args.outputAmount)) {
                  args.outputAmount = Number(args.outputAmount) / times;
                }
              }
            }

            condition.args.recurrence = condition.body.recurrence = {
              type: "minutes",
              interval: 2,
              times,
            };
            condition.args.isTwap = condition.body.isTwap = true;
            condition.args.end_time = condition.body.end_time = undefined;

            continue;
          }

          if (
            conditions[i].conditions
              .map((x: RawAction) => x.name)
              ?.includes("condition")
          ) {
            continue;
          }
          printError("end_time specified without recurrence");
          return res.status(httpStatus.BAD_REQUEST).json({
            status: "error",
            message: "end_time specified without recurrence",
          });
        }
      }
    }

    const tracking = await Tracking.findOne({
      where: { id: Number.parseInt(messageId, 10) },
    });

    if (tracking) {
      const generatedApiCalls = tracking.get("generated_api_calls");
      const actions: Call[] = [];
      for (const condition of conditions) {
        for (const action of condition.actions) {
          if (actions.map((x) => x.id).indexOf(action.id) < 0) {
            actions.push(action);
          }
        }
      }
      const calls = checkEdited(generatedApiCalls, actions);
      tracking.set("edited_api_calls", calls || []);
      tracking.set("first_simulation_status", simstatus);
      tracking.set("updated", getCurrentTimestamp());
      tracking.set("simulation", simulationResults);
      await tracking.save();
    }

    const ids = await Promise.all(
      conditions.map(async (condition: Conditions) => {
        for (const cond of condition.conditions) {
          if (cond.body) {
            const { start_time, end_time, recurrence } = cond.body;
            if (recurrence) {
              if (recurrence.random) {
                let time = Number.parseInt(start_time || "0", 10);
                let range = 86400;
                if (!isNaNValue(end_time)) {
                  range = Number.parseInt(end_time || "0", 10) - time;
                  if (recurrence.times) {
                    range = Math.floor(range / recurrence.times);
                  }
                }
                time += Math.floor(Math.random() * range);
                cond.body.start_time = time.toString();
              }
            }
          }
        }
        const createdCondition = await ConditionModel.create({
          ...condition,
          useraddress: accountAddress.toLowerCase(),
          messageId,
          query,
          status: ConditionStatus.PENDING,
          simstatus,
        });
        return createdCondition.get("id");
      }),
    );

    return res.status(httpStatus.CREATED).json({ status: "success", ids });
  } catch (err) {
    printError(err);
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ status: "error", message: "Failed to store condition" });
  }
};

const updateCondition = async (req: Request, res: Response) => {
  const { isDev } = req.query;
  const { accountAddress, conditionId, status } = req.body;
  const requestSecret = req.query.secret;
  const ConditionModel =
    isDev === "true" ||
    requestSecret ||
    accountAddress.toLowerCase() ===
      "0x4f4118cf9aa8be66fc093912ca609db93e6cdfec" ||
    accountAddress.toLowerCase() ===
      "0xd4129caf7596b0b8e744608189aee22184328447"
      ? ConditionsDev
      : Conditions;
  const printLog = usePrintLog(accountAddress);
  const printError = usePrintError(accountAddress);
  // pending ready executing completed canceled failed
  let allowedFrom: ConditionStatus[] = [];
  switch (status) {
    case ConditionStatus.PENDING:
      allowedFrom = [ConditionStatus.EXECUTING];
      break;
    case ConditionStatus.EXECUTING:
      allowedFrom = [ConditionStatus.READY];
      break;
    case ConditionStatus.FAILED:
      allowedFrom = [ConditionStatus.READY, ConditionStatus.EXECUTING];
      break;
    case ConditionStatus.CANCELED:
      allowedFrom = [
        ConditionStatus.PENDING,
        ConditionStatus.READY,
        ConditionStatus.EXECUTING,
        ConditionStatus.CANCELED,
      ];
      break;
    case ConditionStatus.COMPLETED:
      allowedFrom = [
        ConditionStatus.READY,
        ConditionStatus.EXECUTING,
        ConditionStatus.COMPLETED,
      ];
      break;
    case ConditionStatus.READY:
      {
        const condition = await ConditionModel.findByPk(
          Number.parseInt(conditionId, 10),
        );

        if (
          condition?.dataValues?.conditions?.some((x) => x.body?.isTwap) &&
          condition?.dataValues?.actions?.some(
            (x) => x.args.protocolName?.toLowerCase() === "hyperliquid",
          )
        ) {
          allowedFrom = [ConditionStatus.PENDING];
        }
      }
      break;
    default:
      allowedFrom = [];
  }
  try {
    const [rowCount] = await ConditionModel.update(
      { status, lastran: Math.floor(Date.now() / 1000) },
      {
        returning: true,
        where: {
          id: Number.parseInt(conditionId, 10),
          useraddress: accountAddress.toLowerCase(),
          status: { [Op.in]: allowedFrom },
        },
      },
    );

    if (rowCount === 0) {
      printLog("no condition to update was found");
      return res
        .status(httpStatus.BAD_REQUEST)
        .json({ status: "error", message: "Failed to update condition" });
    }

    if (status === ConditionStatus.PENDING) {
      const condition = await ConditionModel.findByPk(
        Number.parseInt(conditionId, 10),
      );
      if (!condition) {
        printLog("zero condition to update was found");
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ status: "error", message: "Failed to update the condition" });
      }
      const conditions = [...condition.dataValues.conditions];
      for (let i = 0; i < conditions.length; i++) {
        const cond = conditions[i];
        if (cond.body) {
          const { start_time, end_time, recurrence } = cond.body;
          if (recurrence && start_time) {
            let newTime = Number.parseInt(start_time, 10);
            let { times } = recurrence;
            if (recurrence.random) {
              let range = 86400;
              if (end_time && !isNaNValue(end_time)) {
                range = Number.parseInt(end_time, 10) - newTime;
                if (times) {
                  range = Math.floor(range / times);
                }
              }
              newTime += Math.floor(Math.random() * range);
            } else {
              const nextTime = chrono.parseDate(
                `${recurrence.interval} ${recurrence.type}`,
                new Date(),
                {
                  forwardDate: true,
                },
              );
              if (nextTime) {
                newTime = Math.floor(nextTime.getTime() / 1000);
              }
            }

            if (times) {
              times--;
            }

            if (times === 0) {
              condition.set("status", ConditionStatus.COMPLETED);
            }

            conditions.splice(i, 1, {
              ...cond,
              body: {
                ...cond.body,
                start_time: newTime.toString(),
                recurrence: { ...recurrence, times },
              },
            });
          }
        }
      }
      condition.set("conditions", conditions);
      await condition.save();
    }

    return res.status(httpStatus.OK).json({ status: "success" });
  } catch (err) {
    printError(err);
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ status: "error", message: "Failed to update condition status" });
  }
};

const cancel = async (req: Request, res: Response) => {
  const { isDev } = req.query;
  const { accountAddress, conditionId, signature } = req.body;
  if (!accountAddress || !conditionId || !signature) {
    return res.status(httpStatus.BAD_REQUEST).json({
      status: "error",
      message: "Invalid Request Body",
    });
  }
  const requestSecret = req.query.secret;
  const ConditionModel =
    isDev === "true" ||
    requestSecret ||
    accountAddress.toLowerCase() ===
      "0x4f4118cf9aa8be66fc093912ca609db93e6cdfec" ||
    accountAddress.toLowerCase() ===
      "0xd4129caf7596b0b8e744608189aee22184328447"
      ? ConditionsDev
      : Conditions;

  const printError = usePrintError(accountAddress);

  try {
    const message = `I authorize cancellation #${conditionId}`;
    const recovered = ethers.verifyMessage(message, signature);
    if (accountAddress.toLowerCase() !== recovered.toLowerCase()) {
      return res.status(httpStatus.BAD_REQUEST).json({
        status: "error",
        message: "Unauthorized",
      });
    }
  } catch (err) {
    printError(err);
    return res.status(httpStatus.BAD_REQUEST).json({
      status: "error",
      message: "Unauthorized",
    });
  }

  try {
    const condition = await ConditionModel.findOne({
      where: {
        id: Number.parseInt(conditionId, 10),
        useraddress: accountAddress.toLowerCase(),
        status: {
          [Op.in]: [
            ConditionStatus.PENDING,
            ConditionStatus.READY,
            ConditionStatus.EXECUTING,
            ConditionStatus.CANCELED,
          ],
        },
      },
    });
    if (!condition) {
      const condition = await ConditionModel.findOne({
        where: {
          id: Number.parseInt(conditionId, 10),
          useraddress: accountAddress.toLowerCase(),
          status: { [Op.in]: [ConditionStatus.FAILED] },
        },
      });
      if (!condition) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ status: "error", message: "Condition does not exist" });
      }
      return res.status(httpStatus.OK).json({
        status: "success",
        message: "Condition previously failed, reload the page",
      });
    }

    condition.set("status", ConditionStatus.CANCELED);
    await condition.save();

    return res.status(httpStatus.OK).json({ status: "success" });
  } catch (err) {
    printError(err);
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ status: "error", message: "Failed to cancel condition" });
  }
};

const cancelDevConditions = async (req: Request, res: Response) => {
  const { accountAddress } = req.body;
  if (!accountAddress) {
    return res.status(httpStatus.BAD_REQUEST).json({
      status: "error",
      message: "Invalid Request Body",
    });
  }

  const printError = usePrintError(accountAddress);

  try {
    await ConditionsDev.destroy({
      where: {
        useraddress: accountAddress.toLowerCase(),
        status: {
          [Op.in]: [
            ConditionStatus.PENDING,
            ConditionStatus.READY,
            ConditionStatus.EXECUTING,
            ConditionStatus.CANCELED,
          ],
        },
      },
    });

    return res.status(httpStatus.OK).json({ status: "success" });
  } catch (err) {
    printError(err);
    return res.status(httpStatus.BAD_REQUEST).json({
      status: "error",
      message: "Failed to cancel all dev conditions",
    });
  }
};

const getConditions = async (req: Request, res: Response) => {
  const { accountAddress, isDev } = req.query;

  if (isSolanaAddress(accountAddress as string)) {
    return res.status(httpStatus.OK).json({
      status: "success",
      conditions: [],
    });
  }

  const requestSecret = req.query.secret;
  const ConditionModel =
    isDev === "true" ||
    requestSecret ||
    `${accountAddress}`.toLowerCase() ===
      "0x4f4118cf9aa8be66fc093912ca609db93e6cdfec" ||
    `${accountAddress}`.toLowerCase() ===
      "0xd4129caf7596b0b8e744608189aee22184328447"
      ? ConditionsDev
      : Conditions;

  const printError = usePrintError(accountAddress);

  try {
    const statuses = [
      ConditionStatus.READY,
      ConditionStatus.PENDING,
      ConditionStatus.EXECUTING,
    ];
    const conditions = await ConditionModel.findAll({
      where: {
        useraddress: `${accountAddress}`.toLowerCase(),
        status: { [Op.in]: statuses },
      },
      raw: true,
    });

    const twapHistories: JSONObject[] = await getHyperliquidOngoingTwaps(
      accountAddress as string,
    );
    const orderHistories: JSONObject[] = await getHyperliquidOpenOrders(
      accountAddress as string,
    );

    return res.status(httpStatus.OK).json({
      status: "success",
      conditions: [...conditions, ...twapHistories, ...orderHistories],
    });
  } catch (err) {
    printError(err);
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ status: "error", message: "Failed to get conditions" });
  }
};

const getReadyConditions = async (req: Request, res: Response) => {
  const { accountAddress, rpcs } = req.body;
  const {
    accountAddress: simulationWallet,
    connectedChainName,
    isDev,
  } = req.query;
  const requestSecret = req.query.secret;
  const ConditionModel =
    isDev === "true" ||
    requestSecret ||
    accountAddress.toLowerCase() ===
      "0x4f4118cf9aa8be66fc093912ca609db93e6cdfec" ||
    accountAddress.toLowerCase() ===
      "0xd4129caf7596b0b8e744608189aee22184328447"
      ? ConditionsDev
      : Conditions;
  const printError = usePrintError(accountAddress);

  try {
    const transaction = await sequelize.transaction();
    let readyConditions: Conditions[];
    try {
      readyConditions = await ConditionModel.findAll({
        attributes: [
          "query",
          "useraddress",
          "id",
          "messageId",
          "actions",
          "conditions",
        ],
        where: {
          status: ConditionStatus.READY,
          useraddress: accountAddress.toLowerCase(),
        },
        transaction,
        lock: true,
      });
      await ConditionModel.update(
        { status: ConditionStatus.EXECUTING },
        {
          where: {
            id: {
              [Op.in]: readyConditions.map((condition) => condition.get("id")),
            },
          },
          transaction,
        },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      printError(error);
      return res
        .status(httpStatus.OK)
        .json({ status: "success", conditions: [], notifications: [] });
    }

    const conditions: JSONObject[] = [];
    const notifications: Conditions[] = [];

    await Promise.allSettled(
      readyConditions.map(async (condition) => {
        if (condition.get("actions")[0]?.name === "notification") {
          notifications.push(condition);
          return;
        }

        const messageId = condition.get("messageId");
        const updatedActions = condition.get("actions");

        const histories = await sequelize.query<Histories>(
          "SELECT * FROM public.histories WHERE (query ->> 'messageId')::int = :messageId",
          {
            replacements: { messageId },
            type: QueryTypes.SELECT,
          },
        );
        const historyActions = [
          ...(histories.find((x) => x.conditions.length === 0)?.actions || []),
        ];
        if (historyActions.length > 0) {
          try {
            historyActions.reverse();

            const action = updatedActions[0];
            const firstToken = action.args[getTokenKey(action.name)];
            const firstAmount = action.args[getAmountKey(action.name)];
            const chainName =
              action.args[getChainKey(action.name)] || connectedChainName;
            const chainId: ChainId = getChainIdFromName(`${chainName}`) || 1;
            const rpc = rpcs[chainId] || getRpcUrlForChain(chainId);
            if (!rpc) {
              throw new Error(`invalid rpc ${chainId}`);
            }
            const provider = new RetryProvider(rpc, chainId);
            const tokenInfo = await getTokenInfoForChain(
              firstToken,
              chainName as string,
              false,
              { account: accountAddress, provider },
            );
            let balance = 0n;
            if (tokenInfo) {
              const { amount } = await getTokenAmount(
                provider,
                tokenInfo,
                accountAddress,
                firstAmount,
              );
              balance = amount;
            }

            let shouldSetOutputAmount =
              firstAmount === "outputAmount" || balance === 0n;
            if (!shouldSetOutputAmount && !firstAmount) {
              shouldSetOutputAmount = !!historyActions.find(
                (x) =>
                  (x.args.outputToken || x.args.token)?.toLowerCase() ===
                    firstToken?.toLowerCase() && x.args.outputAmount,
              );
            }

            let newAmount: string | undefined;
            if (shouldSetOutputAmount) {
              for (const action of historyActions) {
                const token =
                  action.args.outputToken || action.args.token || "";
                if (
                  token.toLowerCase() === firstToken?.toLowerCase() &&
                  action.args.outputAmount
                ) {
                  newAmount = action.args.outputAmount;
                  break;
                }
              }
            }

            if (newAmount) {
              updatedActions[0].args[getAmountKey(updatedActions[0].name)] =
                newAmount;
            }
          } catch (err) {
            sfConsoleError(err);
          }
        }
        let success: boolean;
        let message: string | undefined;
        let actions: Call[] | undefined;
        try {
          ({ success, message, actions } = await simulateActions(
            updatedActions,
            condition.get("conditions"),
            `${simulationWallet}`,
            `${connectedChainName}`,
            rpcs,
          ));
        } catch (err) {
          success = false;
          message = getErrorMessage(err);
        }
        if (success) {
          conditions.push({ ...condition.dataValues, actions });
        } else {
          const msg = `Simulation for <${
            condition.get("query").message
          }> failed: ${message}`;
          printError(msg);

          conditions.push({ id: condition.get("id"), message: msg });

          condition.set("status", ConditionStatus.FAILED);
          condition.save();
          const data = { address: condition.useraddress, message: msg };
          await notifyUser(data);
          await notifyUserDiscord(data);
        }
      }),
    );

    return res
      .status(httpStatus.OK)
      .json({ status: "success", conditions, notifications });
  } catch (err) {
    printError(err);
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ status: "error", message: "Failed to get conditions" });
  }
};

const getConditionCurrentValues = async (req: Request, res: Response) => {
  const { accountAddress, actions, conditions } = req.body;
  const { simulationWallet } = req.query;
  const printError = usePrintError(accountAddress);

  try {
    const currentValues = await getCurrentValues(
      accountAddress,
      actions,
      conditions,
      simulationWallet as string,
    );

    return res.status(httpStatus.OK).json({ status: "success", currentValues });
  } catch (err) {
    printError(err);
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ status: "error", message: "Failed to get current values" });
  }
};

const addHistory = async (req: Request, res: Response) => {
  const { accountAddress, query, conditions, actions } = req.body;

  // Check for required fields
  if (!query || (actions || []).length === 0) {
    return res.status(httpStatus.BAD_REQUEST).json({
      status: "error",
      message: "Invalid Request Body",
    });
  }

  const printError = usePrintError(accountAddress);
  try {
    const history = await Histories.create({
      useraddress: accountAddress.toLowerCase(),
      conditions,
      actions,
      query,
      timestamp: new Date().getTime(),
    });
    const id = history.get("id");
    try {
      const { success: updateSuccess, message: updateMessage } =
        await updateOwedFee(accountAddress);
      if (!updateSuccess) {
        printError(`error updating fee. ${updateMessage}`);
      }
    } catch (err) {
      printError("error updating fee:", err);
    }
    try {
      await updateUserActivity(accountAddress, conditions);
    } catch (err) {
      printError("error updating activity:", err);
    }
    return res.status(httpStatus.CREATED).json({ status: "success", id });
  } catch (err) {
    printError("Error in addHistory:", err);
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ status: "error", message: "Failed to store history" });
  }
};

const updateUserActivity = async (
  accountAddress: string,
  conditions: Call[],
) => {
  // Searches for user in users
  const user = await Users.findOne({
    where: { address: accountAddress.toLowerCase() },
  });

  if (!user) {
    return;
  }

  // Initalizing variables.
  let numConditionalOps = user.conditions;
  let numRegOps = user.actions;

  // Incrementing values.
  if (conditions.length > 0) {
    numConditionalOps++;
    user.set("conditions", numConditionalOps);
  } else {
    numRegOps++;
    user.set("actions", numRegOps);
  }

  // Checks if user meets PMF Survey requirements and sets survey to true
  // if requirements are met.
  const oneWeekAgo = new Date().getTime() - 7 * 24 * 60 * 60 * 1000; // Current time minus one week in milliseconds

  const histories = await Histories.findAll({
    attributes: ["totalfees"], // Only select the 'totalfees' column (looking at fees accrued rather than fees paid)
    where: {
      useraddress: accountAddress.toLowerCase(),
      timestamp: {
        [Op.gte]: oneWeekAgo, // Greater than or equal to one week ago
      },
    },
    raw: true,
  });
  const sumOfAccruedFees = histories.reduce(
    (sum, entry) => sum + Number(entry.totalfees),
    0,
  );
  console.log(accountAddress, sumOfAccruedFees);
  if (!user.survey) {
    if (sumOfAccruedFees / 1e6 > 2.5) {
      // 1. Decreasing the threshold from 17.5 usd to 1.75 usd
      // 2. Increasing the threshold from 1.75 usd to 3.5 usd (7/20)
      // 3. Decreasing the threshold from 3.5 usd to 2.5 usd (8/6)
      user.set("survey", true);
      user.set("survey_prompt_count", 1);
    }
    await user.save();
    return;
  }

  // Logic for handling user being displayed PMF survey but ignoring it.
  if (user.survey_completed === 0) {
    // Number of operations after which survey is prompted again.
    const OPERATIONS_THRESHOLD = 2;
    // Maximum number of times the survey can be prompted.
    const MAX_SURVEY_PROMPT_COUNT = 3;

    const numOpsAfterLastSurvey = user.operations_after_last_survey + 1;
    user.set("operations_after_last_survey", numOpsAfterLastSurvey);

    if (
      numOpsAfterLastSurvey >= OPERATIONS_THRESHOLD &&
      user.survey_prompt_count < MAX_SURVEY_PROMPT_COUNT
    ) {
      // Increase prompt count.
      user.set("survey_prompt_count", user.survey_prompt_count + 1);
      // Reset the counter.
      user.set("operations_after_last_survey", 0);
    }
  }

  await user.save();
};

const getSurveyInfo = async (req: Request, res: Response) => {
  const { accountAddress } = req.query;

  if (!accountAddress) {
    return res.status(httpStatus.BAD_REQUEST).json({
      status: "error",
      message: "Account address is required",
    });
  }

  const printError = usePrintError(accountAddress);

  try {
    const user = await Users.findOne({
      where: { address: `${accountAddress}`.toLowerCase() },
    });

    if (!user) {
      return res.status(httpStatus.BAD_REQUEST).json({
        status: "error",
        message: "User not found",
      });
    }

    return res.status(httpStatus.OK).json({
      status: "success",
      data: {
        survey: user.survey,
        completedCount: user.survey_completed,
        promptCount: user.survey_prompt_count,
        operationsAfterLastSurvey: user.operations_after_last_survey,
      },
    });
  } catch (err) {
    printError(err);
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: "error",
      message: "An error occurred while fetching survey info",
    });
  }
};

const surveyCompleted = async (req: Request, res: Response) => {
  const { accountAddress } = req.body;

  // Validate the accountAddress
  if (!accountAddress) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ status: "error", message: "Account address is required" });
  }

  const printError = usePrintError(accountAddress);

  try {
    const user = await Users.findOne({
      where: { address: accountAddress.toLowerCase() },
    });

    if (!user) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json({ status: "error", message: "User not found" });
    }

    // Increment the survey_completed counter
    await user.increment("survey_completed");
    await user.save();

    return res
      .status(httpStatus.OK)
      .json({ status: "success", message: "Survey completion recorded" });
  } catch (error) {
    printError("Error updating survey completion:", error);
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ status: "error", message: "An error occurred" });
  }
};

const getUserOpHist = async (req: Request, res: Response) => {
  const { accountAddress } = req.query;

  if (!accountAddress) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ status: "error", message: "Account address is required" });
  }

  const printError = usePrintError(accountAddress);

  try {
    const user = await Users.findOne({
      where: { address: `${accountAddress}`.toLowerCase() },
      attributes: ["conditions", "actions"], // Fetch only the required fields
    });

    if (!user) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json({ status: "error", message: "User not found" });
    }

    return res.status(httpStatus.OK).json({
      status: "success",
      data: {
        conditions: user.conditions,
        actions: user.actions,
      },
    });
  } catch (error) {
    printError("Error fetching user operational history:", error);
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ status: "error", message: "An error occurred" });
  }
};

const getHistories = async (req: Request, res: Response) => {
  const { accountAddress } = req.query;
  const { page, count } = req.body;

  const printError = usePrintError(accountAddress);

  try {
    let histories: Histories[];
    if (!isNaNValue(page * count)) {
      histories = await Histories.findAll({
        where: { useraddress: `${accountAddress}`.toLowerCase() },
        order: [["createdAt", "DESC"]],
        offset: page * count,
        limit: count,
        raw: true,
      });
    } else {
      histories = await Histories.findAll({
        where: { useraddress: `${accountAddress}`.toLowerCase() },
        order: [["createdAt", "DESC"]],
        raw: true,
      });
    }

    const total = await Histories.count({
      where: { useraddress: `${accountAddress}`.toLowerCase() },
    });

    return res
      .status(httpStatus.OK)
      .json({ status: "success", histories, total });
  } catch (err) {
    printError(err);
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ status: "error", message: "Failed to get histories" });
  }
};

const getNewHistoryEntries = async (req: Request, res: Response) => {
  const { timestamp } = req.query;

  if (!timestamp) {
    return res
      .status(400)
      .json({ status: "error", message: "Timestamp parameter is required" });
  }

  try {
    const historyEntries = await Histories.findAll({
      where: { timestamp: { [Op.gt]: `${timestamp}` } },
    });

    const formattedEntries = historyEntries.map((entry) => {
      return {
        actions: entry.actions.length,
        conditions: entry.conditions.length,
        timestamp: entry.timestamp,
      };
    });

    return res.status(httpStatus.OK).json(formattedEntries);
  } catch (error) {
    sfConsoleError("Error in getNewHistoryEntries:", error);
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ status: "error", message: "An error occurred" });
  }
};

const getNewPrompts = async (req: Request, res: Response) => {
  const { timestamp } = req.query;
  if (!timestamp) {
    return res.status(httpStatus.BAD_REQUEST).json({
      status: "error",
      message: "Timestamp parameter is required",
    });
  }

  try {
    // Retrieve tracking entries
    const trackingEntries = await Tracking.findAll({
      where: {
        created: { [Op.gt]: `${timestamp}` },
        executed_status: 0,
      },
      attributes: ["inputted_query", "created"],
      raw: true,
    });

    // Retrieve condition entries
    const conditionEntries = await Conditions.findAll({
      where: {
        createdAt: {
          [Op.gt]: new Date(Number.parseInt(`${timestamp}`, 10) * 1000),
        },
        status: { [Op.in]: [ConditionStatus.PENDING, ConditionStatus.READY] },
      },
      attributes: ["query", "createdAt"],
      raw: true,
    });

    // Process and combine entries
    const prompts = [
      ...trackingEntries.map((entry) => ({
        prompt: processPrompt(entry.inputted_query),
        timestamp: entry.created,
      })),
      ...conditionEntries
        .map((entry) => {
          if (!entry.query || !entry.query.message || !entry.createdAt) {
            return null;
          }
          return {
            prompt: processPrompt(entry.query.message),
            timestamp: Math.floor(new Date(entry.createdAt).getTime() / 1000),
          };
        })
        .filter((entry) => entry != null), // Filter out null entries
    ];

    prompts.sort((a, b) => a.timestamp - b.timestamp);

    return res.status(httpStatus.OK).json(prompts);
  } catch (error) {
    sfConsoleError("Error in getNewPrompts:", error);
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: "error",
      message: "An error occurred",
    });
  }
};

// Helper function to process and sanitize prompts
function processPrompt(prompt: string) {
  return prompt
    .toLowerCase()
    .replace(/0x[a-fA-F0-9]{40}/g, "[address]")
    .replace(/[a-zA-Z0-9-]+\.eth/g, "[address]");
}

const getUserLevel = async (req: Request, res: Response) => {
  const { accountAddress } = req.query;

  if (!accountAddress) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ status: "error", message: "Account address is required" });
  }

  try {
    const userLevel = await getUserLevelHelper(accountAddress as string);
    res.status(httpStatus.OK).json({ status: "success", level: userLevel });
  } catch (error) {
    sfConsoleError("Error in getUserLevel:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: "error",
      message: "An error occurred while fetching user level",
    });
  }
};

const getUserLevelHelper = async (accountAddress: string) => {
  const userLevel: (number | null)[] = Array.from(
    { length: 11 },
    (_, i) => i + 1,
  );
  const userHistory: { [key: number]: string[] } = {};
  const userConditions: { [key: number]: string[] } = {};

  const histories = await Histories.findAll({
    where: { useraddress: accountAddress.toLowerCase() },
    attributes: ["id", "actions"],
    raw: true,
  });

  const conditions = await Conditions.findAll({
    where: { useraddress: accountAddress.toLowerCase() },
    attributes: ["id", "conditions"],
    raw: true,
  });

  if (histories.length === 0 && conditions.length === 0) {
    return 1;
  }

  for (const history of histories) {
    const historyId = history.id;
    const actionNames = history.actions.map((action) => action.name);
    userHistory[historyId] = actionNames;
  }

  for (const condition of conditions) {
    const conditionId = condition.id;
    const conditionTypes: string[] = [];
    for (const conditionObject of condition.conditions) {
      if (conditionObject.args) {
        if (conditionObject.args.type) {
          conditionTypes.push(conditionObject.args.type);
        }
        if (conditionObject.args.start_time) {
          conditionTypes.push("time");
        }
        if (conditionObject.args.recurrence) {
          conditionTypes.push("recurrence");
        }
      }
    }
    userConditions[conditionId] = conditionTypes;
  }

  if (Object.values(userHistory).some((actions) => actions.includes("swap"))) {
    userLevel[0] = null;
  }

  if (
    Object.values(userHistory).some((actions) => actions.includes("bridge"))
  ) {
    userLevel[0] = null;
    userLevel[1] = null;
  }

  if (Object.values(userConditions).some((types) => types.includes("time"))) {
    userLevel[2] = null;
  }

  if (
    Object.values(userHistory).some(
      (actions) => actions.includes("bridge") && actions.length > 1,
    )
  ) {
    userLevel[3] = null;
  }

  if (
    Object.values(userConditions).some((types) => types.includes("recurrence"))
  ) {
    userLevel[4] = null;
  }

  if (
    Object.values(userHistory).some((actions) => {
      const filteredActions = actions.filter(
        (action) => !["bridge", "transfer", "fee"].includes(action),
      );
      const uniqueActionsWithSingleSwap = [
        ...new Set(
          filteredActions.map((action) =>
            action === "swap" ? "swap" : action,
          ),
        ),
      ];
      return uniqueActionsWithSingleSwap.length > 1;
    })
  ) {
    userLevel[5] = null;
  }

  if (Object.values(userConditions).some((types) => types.includes("price"))) {
    userLevel[6] = null;
  }

  if (
    Object.values(userConditions).some((types) => types.includes("market cap"))
  ) {
    userLevel[7] = null;
  }

  if (Object.values(userConditions).some((types) => types.includes("gas"))) {
    userLevel[8] = null;
  }

  if (Object.values(userConditions).some((types) => types.length > 1)) {
    userLevel[9] = null;
  }

  return userLevel.find((level) => level !== null);
};

const getEvents = async (fromDate: string, toDate: string) => {
  const hasTypedEvent = encodeURIComponent('["Has Typed"]');
  const actionExecutedEvent = encodeURIComponent('["Action Executed"]');
  const project_id = process.env.MIXPANEL_PROD_PROJECT_ID;
  const service_account_username =
    process.env.MIXPANEL_SERVICE_ACCOUNT_USERNAME;
  const service_account_secret = process.env.MIXPANEL_SERVICE_ACCOUNT_SECRET;

  const formattedFromDate = moment.utc(fromDate).format("YYYY-MM-DD");
  const formattedToDate = moment.utc(toDate).format("YYYY-MM-DD");

  const getEventData = async (event: string): Promise<Event[]> => {
    const options = {
      hostname: "data.mixpanel.com",
      path: `/api/2.0/export?from_date=${formattedFromDate}&to_date=${formattedToDate}&event=${event}&project_id=${project_id}`,
      method: "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${service_account_username}:${service_account_secret}`,
        ).toString("base64")}`,
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          console.log(
            "API response received with status code:",
            res.statusCode,
          );

          if (res.statusCode !== 200) {
            sfConsoleError("API request failed with status:", res.statusCode);
            sfConsoleError("Error message:", data.trim());
            reject(new Error("API request failed"));
            return;
          }

          if (!data || data.trim() === "") {
            console.warn("Empty response received from Mixpanel API");
            resolve([]);
            return;
          }

          try {
            const eventsData = data.trim().split("\n");
            const events = eventsData.map((eventData) => JSON.parse(eventData));
            resolve(events);
          } catch (error) {
            sfConsoleError("Error parsing response:", error);
            sfConsoleError("Response data:", data);
            reject(error);
          }
        });
      });

      req.on("error", (error) => {
        sfConsoleError("Error making API request:", error);
        reject(error);
      });

      req.end();
    });
  };

  const hasTypedEvents = await getEventData(hasTypedEvent);
  const actionExecutedEvents = await getEventData(actionExecutedEvent);

  const events = [
    ...hasTypedEvents,
    ...actionExecutedEvents.filter(
      (event) => event.properties.Status === "Success",
    ),
  ];

  return events;
};

const getChurnedUsers = async (req: Request, res: Response) => {
  try {
    const churnedUsers: JSONObject[] = [];
    const todayUnix = moment.utc().unix();
    const startDateUnix = moment.utc().subtract(34, "days").unix();

    const users = await Users.findAll({
      where: { distinct_id: { [Op.ne]: null } },
      raw: true,
    });

    const startDate = moment.unix(startDateUnix).utc().format("YYYY-MM-DD");
    const endDate = moment.unix(todayUnix).utc().format("YYYY-MM-DD");
    const events = await getEvents(startDate, endDate);

    await Promise.all(
      users.map(async (user) => {
        const { distinct_id, lastres } = user;

        const userEvents = events.filter((event) => {
          const eventTimestampUnix = event.properties.time;
          const eventDate = moment
            .unix(eventTimestampUnix)
            .utc()
            .format("YYYY-MM-DD");
          return (
            event.properties.distinct_id === distinct_id &&
            eventDate >= moment.utc(lastres).format("YYYY-MM-DD")
          );
        });

        if (userEvents.length > 0) {
          const lastTypedEvent = userEvents.reduce((maxEvent, currentEvent) => {
            return currentEvent.properties.time > maxEvent.properties.time
              ? currentEvent
              : maxEvent;
          });
          const lastTypedUnix = lastTypedEvent.properties.time;
          const lastTypedDate = moment
            .unix(lastTypedUnix)
            .utc()
            .format("YYYY-MM-DD");
          const nextTypedDate = moment
            .unix(lastTypedUnix)
            .utc()
            .add(4, "days")
            .format("YYYY-MM-DD");

          await Users.update(
            {
              lastres: new Date(lastTypedDate),
              nextres: new Date(nextTypedDate),
              nonresstreak: 1,
            },
            { where: { distinct_id } },
          );
        }
      }),
    );

    await Promise.all(
      users.map(async (user) => {
        const { address, lastres, nonresstreak, nextres } = user;
        const nextresUnix = moment(nextres).unix();

        if (nextresUnix <= todayUnix) {
          const updatedNextresUnix = moment
            .unix(todayUnix)
            .utc()
            .add(2 ** (1 + (nonresstreak < 4 ? nonresstreak + 1 : 4)), "days")
            .unix();
          const updatedNextres = moment
            .unix(updatedNextresUnix)
            .utc()
            .format("YYYY-MM-DD");

          churnedUsers.push({
            address,
            lastres: moment.utc(lastres).format("YYYY-MM-DD"),
            nonresstreak,
            nextres: updatedNextres,
          });

          await Users.update(
            {
              lastres: new Date(
                moment.unix(todayUnix).utc().format("YYYY-MM-DD"),
              ),
              nonresstreak: nonresstreak < 4 ? nonresstreak + 1 : 4,
              nextres: new Date(updatedNextres),
            },
            {
              where: {
                address,
              },
            },
          );
        }
      }),
    );

    console.log("Churned users:", churnedUsers);
    res.status(200).json({ status: "success", data: churnedUsers });
  } catch (error) {
    sfConsoleError("Error retrieving churned users:", error);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

const checkAction = async (req: Request, res: Response) => {
  const {
    action: rawAction,
    accountAddress,
    connectedChainName,
    simulationId,
  } = req.body;

  try {
    const { message, actions = [] } = await simulateActions(
      [rawAction],
      [],
      accountAddress,
      connectedChainName,
      simulationId,
    );

    // Send response
    if (message) {
      res.status(httpStatus.BAD_REQUEST).json({ status: "error", message });
    } else {
      res.status(httpStatus.OK).json({ status: "success", actions });
    }
  } catch (error) {
    res.status(httpStatus.BAD_REQUEST).json({
      status: "error",
      message: "Simulation failed",
    });
  }
};

const getTokenHistory = async (req: Request, res: Response) => {
  const { chainId, tokenName } = req.query;
  const { accountAddress } = req.body;
  const printLog = usePrintLog(accountAddress);
  const printError = usePrintError(accountAddress);

  try {
    if (!chainId || !tokenName) {
      return res.status(httpStatus.BAD_REQUEST).json({
        status: "error",
        message: "Chain ID and token name are required",
      });
    }

    const priceData = await getTokenHistoryMemoized(
      Number(chainId) as ChainId,
      tokenName as string,
    );

    res.status(httpStatus.OK).json({
      status: "success",
      data: priceData,
    });
  } catch (err) {
    printLog("Error fetching token history:");
    printError(err);

    res.status(httpStatus.BAD_REQUEST).json({
      status: "error",
      message: "Failed to fetch token history",
    });
  }
};

const swap = async (req: Request, res: Response) => {
  const { blacklist } = req.query;
  const { accountAddress, chainName, inputToken, outputToken, inputAmount } =
    req.body;
  const printLog = usePrintLog(accountAddress);

  // Handle Solana swaps
  if (chainName?.toLowerCase() === "solana") {
    try {
      // Add logging to debug the input values
      console.log("Solana swap params:", {
        accountAddress,
        inputToken,
        outputToken,
        inputAmount,
      });

      // Get token info first
      const inputTokenInfo = await getSolanaTokenInfo(inputToken);
      const outputTokenInfo = await getSolanaTokenInfo(outputToken);

      if (!inputTokenInfo || !outputTokenInfo) {
        return res.status(httpStatus.BAD_REQUEST).json({
          status: "error",
          message: "Invalid input or output token",
        });
      }

      // Convert input amount to proper decimal format
      const parsedAmount = sfParseUnits(inputAmount, inputTokenInfo.decimals);

      try {
        const { status, tx, message } = await getJupiterSwapTx(
          accountAddress,
          inputTokenInfo,
          outputTokenInfo,
          parsedAmount,
        );

        if (status === "error" || !tx) {
          return res.status(httpStatus.BAD_REQUEST).json({
            status: "error",
            message: message || "Failed to get Jupiter swap transaction",
          });
        }

        // Serialize the transaction to base64
        const serializedTx = Buffer.from(tx.serialize()).toString("base64");

        // Return the base64 string
        return res.status(httpStatus.OK).json({
          status: "success",
          transaction: serializedTx, // Send the base64 string instead of the transaction object
          source: "jupiter",
        });
      } catch (err) {
        const printError = usePrintError(accountAddress);
        printError(err);
        return res.status(httpStatus.BAD_REQUEST).json({
          status: "error",
          message: "Failed to create Jupiter swap transaction",
        });
      }
    } catch (err) {
      const printError = usePrintError(accountAddress);
      printError(err);
      res.status(httpStatus.BAD_REQUEST).json({
        status: "error",
        message: "Failed to create Solana swap transaction",
      });
      return;
    }
  }

  // Existing EVM swap logic
  const toIgnore: string[] = [];
  if (typeof blacklist === "string") {
    toIgnore.push(blacklist);
  }
  const { status, message, routes } = await getSwapTx(req.body, toIgnore);
  if (message) {
    res.status(httpStatus.BAD_REQUEST).json({ status, message });
  } else {
    printLog(
      "routes",
      routes?.[0].source,
      routes?.[0].amountIn,
      routes?.[0].amountOutUsd,
    );
    res.status(httpStatus.OK).json({
      status,
      source: routes?.[0].source,
      funcNames: routes?.[0].funcNames,
      transactions: routes?.[0].transactions,
      signData: routes?.[0].signData,
      routes: routes?.map((x) => x.transactions),
    });
  }
};

const bridge = async (req: Request, res: Response) => {
  const { blacklist } = req.query;
  const { accountAddress } = req.body;
  const printLog = usePrintLog(accountAddress);
  const toIgnore: string[] = [];
  if (typeof blacklist === "string") {
    toIgnore.push(blacklist);
  }
  const { status, message, routes } = await getBridgeTx(req.body, toIgnore);
  if (message) {
    res.status(httpStatus.BAD_REQUEST).json({ status, message });
  } else {
    printLog(
      "routes",
      routes?.[0].source,
      routes?.[0].amountIn,
      routes?.[0].amountOutUsd,
    );
    res.status(httpStatus.OK).json({
      status,
      source: routes?.[0].source,
      funcNames: routes?.[0].funcNames,
      transactions: routes?.[0].transactions.map((transaction) => ({
        ...transaction,
        from: req.body.accountAddress,
      })),
      routes: routes?.map((x) => x.transactions),
    });
  }
};

const action = async (req: Request, res: Response, action: string) => {
  let actions = [{ args: req.body, name: action }];
  const account = req.body.accountAddress;
  const protocolName = req.body.protocolName;
  const { chainName, token } = req.body;
  const printError = usePrintError(account);
  try {
    const chainId = getChainIdFromName(`${chainName}`);
    if (!chainId) {
      throw new Error(getChainError(chainName));
    }
    // Validate pool names whether it's associated to the protocol
    await validateProtocolNames(account, actions);
    if (protocolName?.toLowerCase() !== "hyperliquid") {
      await validatePoolNames(account, actions, {
        [chainId]: req.body.rpc,
      } as Record<ChainId, string>);
    }

    if (action === "deposit" || action === "lend") {
      actions = await validateToken(account, actions, {
        [chainId]: req.body.rpc,
      } as Record<ChainId, string>);
    }
  } catch (err) {
    let message = getErrorMessage(err);
    if (!isNaNValue(message)) {
      const curAction = actions[0];
      const chainId = getChainIdFromName(chainName);
      const { chains } = isChainId(chainId)
        ? await getAlternativeChain(account, curAction, chainId)
        : { chains: undefined };
      message = getNoPositionError(curAction.name, chainName, chains);
    } else if (message.includes(":")) {
      message = getUnsupportedTokenError(chainName, protocolName, token);
    }
    printError(message);
    res.status(httpStatus.BAD_REQUEST).json({ status: "error", message });
    return;
  }
  const { status, message, transactions, funcNames, signData } = await ([
    "long",
    "short",
    "close",
  ].includes(action)
    ? getPerpActionTx
    : getActionTx)(action, actions[0].args);
  if (message) {
    res.status(httpStatus.BAD_REQUEST).json({ status, message });
  } else {
    res
      .status(httpStatus.OK)
      .json({ status, transactions, funcNames, signData });
  }
};

const transfer = async (req: Request, res: Response) => {
  const { status, message, transactions, funcNames, signData } =
    await getTransferTx(req.body);
  if (message) {
    res.status(httpStatus.BAD_REQUEST).json({ status, message });
  } else {
    res
      .status(httpStatus.OK)
      .json({ status, transactions, funcNames, signData });
  }
};

const getProtocolInfo = async (req: Request, res: Response) => {
  try {
    const { protocolName } = req.query;

    const protocol = await getProtocolMetadata(protocolName as string);

    res.status(httpStatus.OK).json({
      status: "success",
      protocol,
    });
  } catch (err) {
    sfConsoleError(getErrorMessage(err));
    res.status(httpStatus.BAD_REQUEST).json({
      status: "error",
      message: `Bad request: ${getErrorMessage(err)}`,
    });
  }
};

const getPoolInfo = async (req: Request, res: Response) => {
  try {
    const { chainName, protocolName, poolName, actionName } = req.query;

    const pool = await getPoolMetadata(
      chainName as string,
      protocolName as string,
      poolName as string,
      actionName as string,
    );

    res.status(httpStatus.OK).json({
      status: "success",
      pool,
    });
  } catch (err) {
    sfConsoleError(getErrorMessage(err));
    res.status(httpStatus.BAD_REQUEST).json({
      status: "error",
      message: `Bad request: ${getErrorMessage(err)}`,
    });
  }
};

const getMarketInfo = async (req: Request, res: Response) => {
  try {
    const { protocolName, token, chainId } = req.query;

    const cid0 = +`${chainId}`;
    let cid: ChainId;
    if (isChainId(cid0)) cid = cid0;
    else throw new Error(`getMarketInfo: chainId ${chainId} is not valid`);
    const market = await getMarketInfoForProtocol(
      "",
      `${protocolName}`,
      `${token}`,
      cid,
    );

    res.status(httpStatus.OK).json({
      status: "success",
      market,
    });
  } catch (err) {
    sfConsoleError(getErrorMessage(err));
    res.status(httpStatus.BAD_REQUEST).json({
      status: "error",
      message: `Bad request: ${getErrorMessage(err)}`,
    });
  }
};

const getTokenInfo = async (req: Request, res: Response) => {
  try {
    const { chainName, tokenName } = req.query;
    const { accountAddress } = req.body;

    const chainId = getChainIdFromName(`${chainName}`);
    if (!chainId) {
      throw new Error(getChainError(`${chainName}`));
    }
    const rpc = getRpcUrlForChain(chainId);
    if (!rpc) {
      res.status(httpStatus.OK).json({
        status: "success",
        token: undefined,
      });
    } else {
      let token: TokenInfo | undefined;
      if (chainId !== 101) {
        // Provider is not needed for Solana
        const provider = new RetryProvider(rpc, chainId);
        token = await getTokenInfoForChain(
          tokenName as string,
          chainName as string,
          true,
          { account: accountAddress, provider },
        );
      } else {
        token = await getTokenInfoForChain(
          tokenName as string,
          chainName as string,
          true,
          { account: accountAddress },
        );
      }
      res.status(httpStatus.OK).json({
        status: "success",
        token,
      });
    }
  } catch (err) {
    sfConsoleError(getErrorMessage(err));
    res.status(httpStatus.BAD_REQUEST).json({
      status: "error",
      message: `Bad request: ${getErrorMessage(err)}`,
    });
  }
};

const getTokenPrice = async (req: Request, res: Response) => {
  const { chainId, tokenName } = req.query;
  const { accountAddress } = req.body;
  try {
    const chainId0 = chainId ? +chainId : undefined;
    const chainId1 = isChainId(chainId0) ? chainId0 : undefined;
    assert(typeof tokenName === "string");

    let priceNumber: number | undefined;
    if (chainId1 === 42161) {
      const hyperliquidTokenInfo = await getHyperliquidTokenInfo(
        42161,
        tokenName as string,
        true,
      );
      priceNumber = hyperliquidTokenInfo?.price;
    }

    if (priceNumber) {
      return res.status(httpStatus.OK).json({
        status: "success",
        price: { price: priceNumber },
      });
    }

    const price = await getCoinData(
      accountAddress,
      tokenName as string,
      chainId1,
      false,
    );

    res.status(httpStatus.OK).json({
      status: "success",
      price,
    });
  } catch (err) {
    if (
      !ignoreTokenList.some(
        (item) =>
          item.chainId === `${chainId}`.toString() &&
          item.tokenName.toLowerCase() ===
            `${tokenName}`.toString().toLowerCase(),
      )
    ) {
      sfConsoleError(err);
      sfConsoleError("token not found", chainId, tokenName, accountAddress);
    }
    res.status(httpStatus.BAD_REQUEST).json({
      status: "error",
      message: `Bad request: ${getErrorMessage(err)}`,
    });
  }
};

const getTokenLogo = async (req: Request, res: Response) => {
  try {
    const { tokenName, chainName } = req.query;

    const logo = await getTokenLogoForChain(
      tokenName as string,
      chainName as string,
      false,
    );

    res.status(httpStatus.OK).json({
      status: "success",
      logo,
    });
  } catch (err) {
    sfConsoleError(getErrorMessage(err));
    res.status(httpStatus.BAD_REQUEST).json({
      status: "error",
      message: `Bad request: ${getErrorMessage(err)}`,
    });
  }
};

const simulate = async (req: Request, res: Response) => {
  const {
    messageId,
    actions,
    conditions,
    conditionId,
    accountAddress,
    connectedChainName,
    rpcs,
    blockNumber,
    simulationId,
  } = req.body;

  const { isDev } = req.query;
  const requestSecret = req.query.secret;
  const ConditionModel =
    isDev === "true" ||
    requestSecret ||
    accountAddress.toLowerCase() ===
      "0x4f4118cf9aa8be66fc093912ca609db93e6cdfec" ||
    accountAddress.toLowerCase() ===
      "0xd4129caf7596b0b8e744608189aee22184328447"
      ? ConditionsDev
      : Conditions;

  const printError = usePrintError(accountAddress);

  let simResult: SimResult = {} as SimResult;
  try {
    simResult = await simulateActions(
      actions,
      conditions,
      accountAddress,
      connectedChainName,
      simulationId,
      rpcs,
      blockNumber,
    );
  } catch (err) {
    simResult = {
      success: false,
      message: getErrorMessage(err),
    };
  }
  const {
    success,
    message,
    actions: updatedActions,
    rawActions,
    rpcs: updatedRpcs,
  } = simResult;

  try {
    if (!isNaNValue(Number.parseInt(messageId))) {
      const tracking = await Tracking.findOne({
        where: { id: Number.parseInt(messageId) },
      });
      if (tracking) {
        const generatedApiCalls = tracking.get("generated_api_calls");
        const calls = checkEdited(generatedApiCalls, actions);
        tracking.set("edited_api_calls", calls || []);
        tracking.set(
          isNaNValue(Number.parseInt(conditionId, 10))
            ? "first_simulation_status"
            : "second_simulation_status",
          success ? 0 : 1,
        );
        tracking.set("updated", getCurrentTimestamp());
        tracking.set("simulation", [simResult]);
        await tracking.save();
      }
    }

    if (!isNaNValue(Number.parseInt(conditionId, 10))) {
      const condition = await ConditionModel.findOne({
        where: {
          id: Number.parseInt(conditionId, 10),
          useraddress: accountAddress.toLowerCase(),
          status: {
            [Op.notIn]: [ConditionStatus.COMPLETED, ConditionStatus.CANCELED],
          },
        },
      });

      if (!condition) {
        return res
          .status(httpStatus.NOT_FOUND)
          .json({ status: "error", message: "Condition does not exist" });
      }

      if (condition.simstatus === 1 && !success) {
        condition.set("simstatus", 2);
        await condition.save();
      }
    }
    if (success) {
      res.status(httpStatus.OK).json({
        status: "success",
        actions: updatedActions,
        rawActions,
        rpcs: updatedRpcs,
      });
    } else {
      res.status(httpStatus.BAD_REQUEST).json({ status: "error", message });
    }
  } catch (err) {
    printError(err);
    res
      .status(httpStatus.BAD_REQUEST)
      .json({ status: "error", message: getErrorMessage(err) });
  }
};

const verifiedEntities = async (req: Request, res: Response) => {
  const { simple } = req.query;

  const data = await getVerifiedEntities(simple === "true");

  res.status(httpStatus.OK).json({
    status: "success",
    ...data,
  });
};

const getProtocolTokens = async (req: Request, res: Response) => {
  res.status(httpStatus.OK).json({
    status: "success",
    data: ProtocolActionTokens,
  });
};

const getUserTokenBalances = async (req: Request, res: Response) => {
  const { accountAddress, noCache } = req.query;
  const printError = usePrintError(accountAddress);
  assert(typeof accountAddress === "string" || accountAddress === undefined);
  try {
    const tokens = (await getUserOwnedTokenBalancesFromDeBank(
      accountAddress as string,
      noCache === "true",
    )) as JSONObject;
    await Promise.all(
      Object.keys(tokens).map(async (chainId0) => {
        const chainId = +chainId0;
        if ((tokens[chainId] || []).length === 0) return;

        const prices = await Promise.all(
          tokens[chainId]
            .filter((x: { price: string }) => !x.price)
            .map((x: { address: string }) =>
              getCoinData(
                accountAddress as string,
                x.address,
                isChainId(chainId) ? chainId : undefined,
                false,
                true,
              ),
            ),
        );
        for (const x of prices) {
          const index = tokens[chainId].findIndex(
            (y: { address: string }) =>
              y.address.toLowerCase() === x.address?.toLowerCase(),
          );
          if (index >= 0) tokens[chainId][index].price = x.price || 0;
        }
        tokens[chainId].sort(
          (
            a: { balance: number | undefined; price: number | undefined },
            b: { balance: number | undefined; price: number | undefined },
          ) =>
            (b.balance || 0) * (b.price || 0) -
            (a.balance || 0) * (a.price || 0),
        );
      }),
    );

    res.status(httpStatus.OK).json({
      status: "success",
      tokens,
    });
  } catch (err) {
    printError(err);
    res
      .status(httpStatus.BAD_REQUEST)
      .json({ status: "error", message: `Bad request ${err}` });
  }
};

const getUserTokenBalancesSol = async (req: Request, res: Response) => {
  const { accountAddress } = req.query;
  const printError = usePrintError(accountAddress);
  assert(typeof accountAddress === "string" || accountAddress === undefined);

  if (!accountAddress) {
    return res.status(400).json({ error: "Account address is required" });
  }

  try {
    console.log("Fetching balances for Solana address:", accountAddress);

    const response = await withRetry<AxiosResponse>(
      accountAddress,
      async () => {
        return axios.get(
          `https://api.helius.xyz/v0/addresses/${accountAddress}/balances?api-key=${process.env.HELIUS_API_KEY}`,
        );
      },
    );

    // Ensure we have the native SOL token in the response
    const tokenList = response.data.tokens || [];
    const nativeSol = response.data.nativeBalance;

    if (nativeSol) {
      tokenList.unshift({
        mint: "So11111111111111111111111111111111111111112",
        amount: nativeSol,
        decimals: 9,
      });
    }

    interface HeliusToken {
      mint: string;
      amount: number;
      decimals: number;
    }

    const tokens = await Promise.all(
      tokenList
        .filter((token: HeliusToken) => Number(token.amount) > 0)
        .map(async (token: HeliusToken) => {
          const metadata = await getTokenInfoForChain(
            token.mint,
            "solana",
            true,
            { account: accountAddress },
          );
          const price =
            (await getCoinData(accountAddress, token.mint, 101, false))
              ?.price || 0;

          const isSOL =
            token.mint === "So11111111111111111111111111111111111111112";

          const balance = Number(token.amount) / 10 ** token.decimals;
          const usdValue = balance * price;

          return {
            symbol: metadata?.symbol?.toUpperCase() || token.mint.slice(0, 4),
            name: isSOL ? "Solana" : metadata?.name || "Unknown Token",
            address: token.mint,
            decimals: token.decimals,
            balance,
            price,
            usdValue,
            logo: metadata?.thumb || "/default-token-logo.png",
          };
        }),
    );

    return res.json({ tokens });
  } catch (error) {
    printError("Error fetching Solana token balances:", error);
    return res.status(500).json({ error: "Failed to fetch token balances" });
  }
};

const getUserProtocolPositions = async (req: Request, res: Response) => {
  const { accountAddress, noCache } = req.query;
  const printError = usePrintError(accountAddress);

  try {
    const protocols = await getProtocolPositions(
      accountAddress as string,
      noCache === "true",
    );

    res.status(httpStatus.OK).json({
      status: "success",
      protocols,
    });
  } catch (err) {
    printError(err);
    res
      .status(httpStatus.BAD_REQUEST)
      .json({ status: "error", message: `Bad request ${err}` });
  }
};

const getTracking = async (messageId: string) => {
  const tracking = await Tracking.findOne({
    where: { id: Number.parseInt(messageId, 10) },
  });

  return tracking;
};

const storeGeneratedTxs = async (req: Request, res: Response) => {
  try {
    const { messageId, transactions } = req.body;
    const tracking = await getTracking(messageId);

    if (!tracking) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json({ status: "error", message: "Tracking does not exist" });
    }

    const generatedTxs = (await tracking.get("generated_transactions")) || [];
    generatedTxs.push(transactions);
    tracking.set("generated_transactions", generatedTxs);
    tracking.set("updated", getCurrentTimestamp());
    await tracking.save();

    res.status(httpStatus.OK).json({
      status: "success",
    });
  } catch (err) {
    sfConsoleError(err);
    res
      .status(httpStatus.BAD_REQUEST)
      .json({ status: "error", message: `Bad request ${err}` });
  }
};

const setExecutedStatus = async (req: Request, res: Response) => {
  try {
    let { status } = req.body;
    const { messageId } = req.body;
    const tracking = await getTracking(messageId);

    if (!tracking || isNaNValue(Number.parseInt(status, 10))) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json({ status: "error", message: "Tracking does not exist" });
    }
    status = Number.parseInt(status, 10);

    tracking.set("executed_status", status);
    tracking.set("updated", getCurrentTimestamp());
    await tracking.save();

    const editedApiCalls = await tracking.get("edited_api_calls");
    const data = await Dataset.findOne({
      where: { query_id: Number.parseInt(messageId, 10) },
    });
    if (data) {
      if (editedApiCalls) {
        data.set("edited_correct", !status);
        data.set("generated_correct", false);
      } else data.set("generated_correct", !status);
      data.set("updated", getCurrentTimestamp());
      await data.save();
    }

    res.status(httpStatus.OK).json({ status: "success" });
  } catch (err) {
    sfConsoleError(err);
    res
      .status(httpStatus.BAD_REQUEST)
      .json({ status: "error", message: `Bad request ${err}` });
  }
};

const processErrors = (req: Request, res: Response) => {
  const { title, accountAddress, error } = req.body;
  // Check if error is an object and not null
  if (!(title.includes("request auth"))) {
    sfConsoleError(`${accountAddress}: The error is '${title}'.\n${error}`);
  }
  res.status(httpStatus.OK).json({
    status: "success",
  });
};

const fee = async (req: Request, res: Response) => {
  const { accountAddress } = req.body;
  const printError = usePrintError(accountAddress);
  try {
    // await resetHistoryFees(accountAddress);
    const { status, message, transactions, chainName } =
      await getFeeTx(accountAddress);
    if (message) {
      res.status(httpStatus.BAD_REQUEST).json({ status, message });
    } else {
      res.status(httpStatus.OK).json({ status, transactions, chainName });
    }
  } catch (err) {
    printError("Error:", err);
    res.status(httpStatus.BAD_REQUEST).json({
      status: "error",
      message: `Bad request ${getErrorMessage(err)}`,
    });
  }
};

const accruedFees = async (req: Request, res: Response) => {
  const { accountAddress } = req.body;
  const printError = usePrintError(accountAddress);
  try {
    // await resetHistoryFees(accountAddress);
    const { success, fee, message } = await getOwedFee(accountAddress);

    if (!success) {
      res.status(httpStatus.BAD_REQUEST).json({ status: "error", message });
    } else {
      const ethPrice = (await getCoinData(accountAddress, "eth", 1, false))
        ?.price;
      const usdFee = fee / 1e6;

      if (!ethPrice || ethPrice <= 0) {
        printError("Invalid ETH price", ethPrice, usdFee);
        return {
          success: false,
          fee: -1,
          message:
            "Error fetching ETH price while calculating accumulated fees.",
        };
      }

      res
        .status(httpStatus.OK)
        .json({ status: "success", fee: usdFee / ethPrice });
    }
  } catch (err) {
    printError("Error:", err);
    res.status(httpStatus.BAD_REQUEST).json({
      status: "error",
      message: `Bad request ${getErrorMessage(err)}`,
    });
  }
};

const analyticsUserId = async (req: Request, res: Response) => {
  const { externalAddress, embeddedAddress, discord_id } = req.query;
  const printError = usePrintError(externalAddress || embeddedAddress);
  try {
    let analytics: Analytics | null = null;
    let lowercaseAddress: string;

    if (discord_id) {
      // Find analytics by Discord ID
      analytics = await Analytics.findOne({
        where: { discord_id: `${discord_id}` },
      });
    } else if (externalAddress) {
      lowercaseAddress = `${externalAddress}`.toLowerCase();
      // Find analytics by External Address
      analytics = await Analytics.findOne({
        where: { externalAddresses: { [Op.contains]: [lowercaseAddress] } },
      });
    } else if (embeddedAddress) {
      lowercaseAddress = `${embeddedAddress}`.toLowerCase();
      // Find analytics by Embedded Address
      analytics = await Analytics.findOne({
        where: { embeddedAddresses: { [Op.contains]: [lowercaseAddress] } },
      });
    } else {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json({ status: "error", message: "No identifier provided" });
    }

    if (!analytics) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json({ status: "error", message: "User does not exist" });
    }

    res.status(httpStatus.OK).json({
      status: "success",
      user_id: analytics.user_id,
    });
  } catch (err) {
    printError(err);
    res
      .status(httpStatus.BAD_REQUEST)
      .json({ status: "error", message: `Bad request ${err}` });
  }
};

const addAnalyticsUser = async (req: Request, res: Response) => {
  try {
    const { discord_id } = req.body;
    // Attempt to find user by Discord ID
    const user = await Analytics.findOne({ where: { discord_id } });

    if (user) {
      return res
        .status(httpStatus.CONFLICT)
        .json({ status: "info", message: "User already exists", user });
    }
    // Create new user
    const newUser = await Analytics.create({ discord_id });
    return res
      .status(httpStatus.CREATED)
      .json({ status: "success", user: newUser });
  } catch (err) {
    sfConsoleError(err);
    res.status(httpStatus.BAD_REQUEST).json({
      status: "error",
      message: `Bad request ${getErrorMessage(err)}`,
    });
  }
};

const updateAnalyticsUser = async (req: Request, res: Response) => {
  const { externalAddress, userId } = req.body;
  const printError = usePrintError(externalAddress);

  try {
    // Find user by user_id
    const user = await Analytics.findOne({ where: { user_id: userId } });

    if (!user) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json({ status: "error", message: "Cannot find user_id" });
    }

    // Initialize externalAddresses if it's null or not an array
    if (!Array.isArray(user.externalAddresses)) {
      user.externalAddresses = [];
    }

    const lowercaseAddress = externalAddress.toLowerCase();
    if (user.externalAddresses.includes(lowercaseAddress)) {
      return res.status(httpStatus.OK).json({
        status: "error",
        message: "External wallet already exists for this user",
        user,
      });
    }
    // Check if externalAddress already exists for another user
    const existingUser = await Analytics.findOne({
      where: {
        externalAddresses: { [Op.contains]: [lowercaseAddress] },
        user_id: { [Op.ne]: userId },
      },
    });

    if (existingUser) {
      return res.status(httpStatus.CONFLICT).json({
        status: "error",
        message:
          "Critical error - this external address already exists for another user. Please reconcile.",
        user: existingUser,
      });
    }

    // Add external address to user
    user.set("externalAddresses", [
      ...user.externalAddresses,
      lowercaseAddress,
    ]);
    await user.save();
    return res.status(httpStatus.OK).json({ status: "success", user });
  } catch (err) {
    printError(err);
    res.status(httpStatus.BAD_REQUEST).json({
      status: "error",
      message: `Bad request ${getErrorMessage(err)}`,
    });
  }
};

let trendingTokens: JSONObject[] = [];
let newTokens: JSONObject[] = [];
let lastUpdateTime: number | null = null;
const UPDATE_INTERVAL = 1 * 24 * 60 * 60 * 1000; // 1 days in milliseconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

const fetchPools = async (
  endpoint: string,
  maxPages = 3,
): Promise<JSONObject[]> => {
  const fetchPage = async (page: number) => {
    try {
      const response = await withRetry("", () =>
        axios.get(
          `https://pro-api.coingecko.com/api/v3/onchain/networks/${endpoint}?page=${page}`,
          {
            headers: {
              Accept: "application/json",
              "x-cg-pro-api-key": process.env.CGC_API_KEY,
            },
            timeout: 30000,
          },
        ),
      );

      return response.data?.data || [];
    } catch (error) {
      sfConsoleError(
        `Error fetching ${endpoint} page ${page}:`,
        getErrorMessage(error),
      );
      return [];
    }
  };

  const pagePromises = Array.from({ length: maxPages }, (_, i) =>
    fetchPage(i + 1),
  );
  const results = await Promise.all(pagePromises);
  return results.flat();
};

const processTokens = (pools: JSONObject[], verifiedChains: string[]) => {
  const emojiRegex =
    /[\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F900}-\u{1F9FF}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/u;

  return pools
    .map((pool) => {
      const name = pool.attributes.name.split(" / ")[0].trim();
      return {
        name,
        base_token_price_usd: pool.attributes.base_token_price_usd,
        address: pool.attributes.address,
        market_cap_usd: pool.attributes.market_cap_usd,
        fdv_usd: pool.attributes.fdv_usd,
        price_change_percentage: pool.attributes.price_change_percentage,
        volume_usd: pool.attributes.volume_usd,
        transactions: pool.attributes.transactions,
        network: pool.relationships.network.data.id,
        trendingFactor: calculateTrendingFactor(pool.attributes),
      };
    })
    .filter((token) => {
      const price = Number.parseFloat(token.base_token_price_usd);
      const hasEmoji = emojiRegex.test(token.name);
      const FDV = Number.parseFloat(token.fdv_usd);
      return (
        verifiedChains.includes(token.network.toLowerCase()) &&
        !hasEmoji &&
        !token.name.includes(" ") &&
        (isNaNValue(price) || price < 0.97 || price > 1.03) &&
        FDV >= 50000000
      );
    })
    .sort((a, b) => b.trendingFactor - a.trendingFactor)
    .slice(0, 10);
};

const calculateTrendingFactor = (pool: JSONObject) => {
  const volumeWeight = 0.5;
  const priceChangeWeight = 0.3;
  const transactionCountWeight = 0.2;

  const normalizedVolume = Number.parseFloat(pool.volume_usd.h24) / 1000000;
  const normalizedPriceChange = Math.abs(
    Number.parseFloat(pool.price_change_percentage.h24) / 100,
  );
  const normalizedTransactionCount =
    (pool.transactions.h24.buys + pool.transactions.h24.sells) / 1000;

  return (
    normalizedVolume * volumeWeight +
    normalizedPriceChange * priceChangeWeight +
    normalizedTransactionCount * transactionCountWeight
  );
};

const updateTokenSuggestions = async (retryCount = 0) => {
  try {
    const [trendingPools, newPools, { chains }] = await Promise.all([
      fetchPools("trending_pools"),
      fetchPools("new_pools"),
      getVerifiedEntities(true),
    ]);

    const verifiedChains = chains.map((chain: { name: string }) =>
      chain.name.toLowerCase(),
    );
    trendingTokens = processTokens(trendingPools, verifiedChains);
    newTokens = processTokens(newPools, verifiedChains);

    lastUpdateTime = Date.now();
  } catch (error) {
    sfConsoleError("Error in updateTokenSuggestions:", error);
    if (retryCount < MAX_RETRIES) {
      setTimeout(() => updateTokenSuggestions(retryCount + 1), RETRY_DELAY);
    }
  }
};

const getTokenSuggestions = async (req: Request, res: Response) => {
  try {
    if (!lastUpdateTime || Date.now() - lastUpdateTime > UPDATE_INTERVAL) {
      await updateTokenSuggestions();
    }

    res.status(200).json({
      status: "success",
      trendingTokens,
      newTokens,
    });
  } catch (err) {
    sfConsoleError("Error in getTokenSuggestions:", err);
    res.status(500).json({
      status: "error",
      message: "An error occurred while fetching token suggestions",
    });
  }
};

const pendlePoolInfo = async (req: Request, res: Response) => {
  try {
    const data = await getPendlePoolInfo();
    res.status(httpStatus.OK).json({
      status: "success",
      data, // Encapsulate the data under the 'data' key
    });
  } catch (error) {
    console.error("Error in pendlePoolInfo:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: "error",
      message: "Failed to fetch Pendle pool info",
    });
  }
};

const getTvlTracking = async (req: Request, res: Response) => {
  try {
    const { user_address } = req.body;

    const tvlData = await TVL.findAll({
      where: {
        user_address: String(user_address),
      },
      attributes: [
        "user_id",
        "user_address",
        "daily_tvl",
        "hl_tvl",
        "date",
        "created_at",
      ],
      order: [["date", "ASC"]],
    });

    res.status(httpStatus.OK).json({
      status: "success",
      data: tvlData,
    });
  } catch (err) {
    sfConsoleError(getErrorMessage(err));
    res.status(httpStatus.BAD_REQUEST).json({
      status: "error",
      message: `Bad request: ${getErrorMessage(err)}`,
    });
  }
};

const getSolanaBlockInfo = async (req: Request, res: Response) => {
  try {
    const { commitment } = req.query;
    const connection = new Connection(
      `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
    );

    let latestBlockhashResult = null;
    let blockHeightResult = null;

    // Split the calls to identify which one fails
    try {
      latestBlockhashResult = await connection.getLatestBlockhash(
        commitment as Commitment,
      );
    } catch (error) {
      console.error("Error fetching latest blockhash:", error);
    }

    try {
      blockHeightResult = await connection.getBlockHeight();
    } catch (error) {
      console.error("Error fetching block height:", error);
    }

    if (!latestBlockhashResult && !blockHeightResult) {
      return res.status(500).json({
        error: "Both RPC calls failed. Check server logs for details.",
      });
    }

    return res.json({
      blockhash: latestBlockhashResult?.blockhash,
      lastValidBlockHeight: latestBlockhashResult?.lastValidBlockHeight,
      blockHeight: blockHeightResult,
    });
  } catch (error) {
    console.error("Error fetching Solana block info:", error);
    return res.status(500).json({ error: "Failed to fetch block info" });
  }
};

const getSolanaSignatureStatus = async (req: Request, res: Response) => {
  try {
    const { signature } = req.query;
    if (!signature) {
      return res.status(400).json({ error: "Signature is required" });
    }

    console.log("Signature:", signature as string);

    const connection = new Connection(
      `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
    );
    const status = await connection.getSignatureStatus(signature as string);

    console.log("Signature status:", status);

    return res.json(status);
  } catch (error) {
    console.error("Error fetching signature status:", error);
    return res.status(500).json({ error: "Failed to fetch signature status" });
  }
};

const sendSolanaTx = async (req: Request, res: Response) => {
  try {
    const { serializedTransaction } = req.body;
    if (!serializedTransaction) {
      return res
        .status(400)
        .json({ error: "Serialized transaction is required" });
    }

    const connection = new Connection(
      `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
    );

    // Deserialize and send the transaction
    const transaction = Transaction.from(
      Buffer.from(serializedTransaction, "base64"),
    );
    const signature = await connection.sendRawTransaction(
      transaction.serialize(),
    );

    return res.json({ signature });
  } catch (error) {
    console.error("Error sending transaction:", error);
    return res.status(500).json({ error: "Failed to send transaction" });
  }
};

const sendSolanaRawTx = async (req: Request, res: Response) => {
  try {
    const { rawTransaction } = req.body;
    if (!rawTransaction) {
      return res.status(400).json({ error: "Raw transaction is required" });
    }

    const connection = new Connection(
      `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
    );

    // Convert array-like object to Uint8Array
    const transactionBuffer = Uint8Array.from(Object.values(rawTransaction));

    const signature = await connection.sendRawTransaction(transactionBuffer, {
      skipPreflight: true,
      preflightCommitment: "confirmed",
      maxRetries: 0,
    });

    return res.json({ signature });
  } catch (error) {
    console.error("Error sending raw transaction:", error);
    return res.status(500).json({ error: "Failed to send raw transaction" });
  }
};

const confirmSolanaTx = async (req: Request, res: Response) => {
  try {
    const { signature, blockhash, lastValidBlockHeight, commitment } = req.body;
    if (!signature) {
      return res.status(400).json({ error: "Signature is required" });
    }

    const connection = new Connection(
      `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
    );

    // If blockhash and lastValidBlockHeight are provided, use BlockheightBasedStrategy
    let confirmation: RpcResponseAndContext<SignatureResult> | undefined;
    if (blockhash && lastValidBlockHeight) {
      confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight: Number(lastValidBlockHeight),
        },
        commitment as Commitment,
      );
    } else {
      // Fall back to simple signature-based confirmation
      confirmation = await connection.confirmTransaction(
        signature,
        commitment as Commitment,
      );
    }

    return res.json(confirmation);
  } catch (error) {
    console.error("Error confirming transaction:", error);
    return res.status(500).json({ error: "Failed to confirm transaction" });
  }
};

const getSolanaAccountInfo = async (req: Request, res: Response) => {
  try {
    const { address } = req.query;
    if (!address) {
      return res.status(400).json({ error: "Account address is required" });
    }

    const connection = new Connection(
      `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
    );

    // Get account info
    const accountInfo = await connection.getAccountInfo(
      new PublicKey(address as string),
    );

    if (!accountInfo) {
      return res.status(404).json({ error: "Account not found" });
    }

    return res.json({
      lamports: accountInfo.lamports,
      owner: accountInfo.owner.toBase58(),
      executable: accountInfo.executable,
      rentEpoch: accountInfo.rentEpoch,
      data: accountInfo.data,
    });
  } catch (error) {
    console.error("Error fetching account info:", error);
    return res.status(500).json({ error: "Failed to fetch account info" });
  }
};

export default {
  auth_evm,
  auth_sol,
  updateUser,
  updateSettings,
  addCondition,
  updateCondition,
  cancel,
  cancelDevConditions,
  getConditions,
  getReadyConditions,
  getConditionCurrentValues,
  addHistory,
  getHistories,
  checkAction,
  swap,
  bridge,
  action,
  transfer,
  getProtocolInfo,
  getMarketInfo,
  getPoolInfo,
  getTokenInfo,
  getTokenPrice,
  getTokenLogo,
  simulate,
  verifiedEntities,
  getProtocolTokens,
  getUserTokenBalances,
  getUserTokenBalancesSol,
  getUserProtocolPositions,
  storeGeneratedTxs,
  setExecutedStatus,
  processErrors,
  getSurveyInfo,
  fee,
  accruedFees,
  surveyCompleted,
  analyticsUserId,
  addAnalyticsUser,
  updateAnalyticsUser,
  getUserOpHist,
  getNewHistoryEntries,
  getNewPrompts,
  getUserLevel,
  getSettings,
  getChurnedUsers,
  getTokenSuggestions,
  getTokenHistory,
  pendlePoolInfo,
  getTvlTracking,
  getSolanaBlockInfo,
  getSolanaSignatureStatus,
  sendSolanaTx,
  sendSolanaRawTx,
  confirmSolanaTx,
  getSolanaAccountInfo,
};
