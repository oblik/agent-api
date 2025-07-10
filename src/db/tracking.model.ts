import {
  type CreationOptional,
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
} from "sequelize";
import type { Call } from "../utils/types.js";
import { sequelize } from "./index.js";

export class Tracking extends Model<
  InferAttributes<Tracking>,
  InferCreationAttributes<Tracking>
> {
  declare id: CreationOptional<number>;
  declare user_address: string;
  declare inputted_query: string;
  declare generated_api_calls: Call[];
  declare edited_api_calls: Call[];
  declare generated_transactions: object[];
  declare first_simulation_status: number;
  declare second_simulation_status: number;
  declare executed_status: number;
  declare created: number;
  declare updated: number;
  declare simulation: object;
  declare posthog: string;
  declare logs: string;
}

export const initTrackingModel = () => {
  Tracking.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      user_address: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      inputted_query: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      generated_api_calls: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      edited_api_calls: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      generated_transactions: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      first_simulation_status: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      second_simulation_status: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      executed_status: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      created: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      updated: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      simulation: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      posthog: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      logs: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: "tracking",
      freezeTableName: true,
      timestamps: false,
    },
  );
};
