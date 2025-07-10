import {
  type CreationOptional,
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "./index.js";

export class Analytics extends Model<
  InferAttributes<Analytics>,
  InferCreationAttributes<Analytics>
> {
  declare user_id: CreationOptional<string>;
  declare externalAddresses: CreationOptional<string[]>;
  declare discord_id: string;
  declare embeddedAddresses: CreationOptional<string[]>;
}

export const initAnalyticsModel = () => {
  Analytics.init(
    {
      user_id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      externalAddresses: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: true,
      },
      discord_id: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: true,
      },
      embeddedAddresses: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: true,
      },
    },
    { sequelize, tableName: "analytics_users" },
  );
};
