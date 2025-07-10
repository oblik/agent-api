import dotEnv from "dotenv";
import { Sequelize } from "sequelize";
import { Analytics, initAnalyticsModel } from "./analytics.model.js";
import { Conditions, initConditionModel } from "./condition.model.js";
import { ConditionsDev, initConditionDevModel } from "./conditionDev.model.js";
import { Dataset, initDatasetModel } from "./dataset.model.js";
import { Histories, initHistoryModel } from "./history.model.js";
import { Protocols, initProtocolModel } from "./protocol.model.js";
import { Subscriptions, initSubscriptionModel } from "./subscription.model.js";
import { Tokens, initTokenModel } from "./token.model.js";
import { Tracking, initTrackingModel } from "./tracking.model.js";
import { TVL, initTVLModel } from "./tvl.model.js";
import { Users, initUserModel } from "./user.model.js";

dotEnv.config();

export const sequelize = new Sequelize(
  process.env.PG_DATABASE || "",
  process.env.PG_USER || "",
  process.env.PG_PASSWORD,
  {
    host: process.env.PG_HOST,
    port: +(process.env.PG_PORT || 0),
    dialect: "postgres",
    logging: false,
    pool: { maxUses: 1, acquire: 90000 },
  },
);

let modelInitialized = false;
export const initModels = async () => {
  if (modelInitialized) return;
  await sequelize.sync();
  initConditionModel();
  initConditionDevModel();
  initDatasetModel();
  initHistoryModel();
  initProtocolModel();
  initSubscriptionModel();
  initTokenModel();
  initTrackingModel();
  initUserModel();
  initAnalyticsModel();
  initTVLModel();
  modelInitialized = true;
};

export {
  Analytics,
  Conditions,
  ConditionsDev,
  Dataset,
  Histories,
  Protocols,
  Subscriptions,
  Tokens,
  Tracking,
  TVL,
  Users,
};
