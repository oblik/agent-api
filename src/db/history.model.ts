import {
  type CreationOptional,
  DataTypes,
  type InferAttributes,
  Model,
} from "sequelize";
import type { Call, Query } from "../utils/types.js";
import { sequelize } from "./index.js";

type HistoriesCreationAttributes = {
  useraddress: string;
  conditions: Call[];
  actions: Call[];
  query: Query;
  timestamp: number;
  totalfees: number | null;
  paidfees: number | null;
  volume: number | null;
};

export class Histories extends Model<
  InferAttributes<Histories>,
  HistoriesCreationAttributes
> {
  declare id: CreationOptional<number>;
  declare useraddress: string;
  declare conditions: Call[];
  declare actions: Call[];
  declare query: Query;
  declare timestamp: number;
  declare totalfees: CreationOptional<number>;
  declare paidfees: CreationOptional<number>;
  declare volume: CreationOptional<number>;
}

export const initHistoryModel = () => {
  Histories.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      useraddress: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      conditions: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      actions: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      query: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      timestamp: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      totalfees: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      paidfees: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      volume: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
    },
    { sequelize, tableName: "histories" },
  );
};
