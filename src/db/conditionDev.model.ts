import {
  type CreationOptional,
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
} from "sequelize";
import type { Call, Query } from "../utils/types.js";
import { ConditionStatus } from "./condition.model.js";
import { sequelize } from "./index.js";

export class ConditionsDev extends Model<
  InferAttributes<ConditionsDev>,
  InferCreationAttributes<ConditionsDev>
> {
  declare id: CreationOptional<number>;
  declare useraddress: string;
  declare messageId: number;
  declare conditions: Call[];
  declare actions: Call[];
  declare query: Query;
  declare status: string;
  declare simstatus: number;
  declare lastran: number;
  declare currentValues: Call[];
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export const initConditionDevModel = () => {
  ConditionsDev.init(
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
      messageId: {
        type: DataTypes.INTEGER,
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
      status: {
        type: DataTypes.ENUM(...Object.values(ConditionStatus)),
        allowNull: true,
      },
      simstatus: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      lastran: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      currentValues: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, tableName: "conditionsdev" },
  );
};
