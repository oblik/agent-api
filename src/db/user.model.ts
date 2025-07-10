import {
  type CreationOptional,
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
} from "sequelize";
import type { JSONObject } from "../utils/types.js";
import { sequelize } from "./index.js";

export class Users extends Model<
  InferAttributes<Users>,
  InferCreationAttributes<Users>
> {
  declare id: CreationOptional<number>;
  declare address: string;
  declare referral_code: string;
  declare survey: CreationOptional<boolean>;
  declare conditions: CreationOptional<number>;
  declare actions: CreationOptional<number>;
  declare survey_completed: CreationOptional<number>;
  declare survey_prompt_count: CreationOptional<number>;
  declare operations_after_last_survey: CreationOptional<number>;
  declare distinct_id: CreationOptional<string | null>;
  declare lastres: CreationOptional<Date>;
  declare nonresstreak: CreationOptional<number>;
  declare nextres: CreationOptional<Date>;
  declare settings: CreationOptional<JSONObject>;
}

export const initUserModel = () => {
  Users.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      address: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      referral_code: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      survey: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: true,
      },
      conditions: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: true,
      },
      actions: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: true,
      },
      survey_completed: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: true,
      },
      survey_prompt_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: true,
      },
      operations_after_last_survey: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: true,
      },
      distinct_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      lastres: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      nonresstreak: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
        allowNull: true,
      },
      nextres: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      settings: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
    },
    { sequelize, tableName: "users" },
  );
};
