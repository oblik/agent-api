import {
  type CreationOptional,
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "./index.js";

export class TVL extends Model<
  InferAttributes<TVL>,
  InferCreationAttributes<TVL>
> {
  declare user_id: string;
  declare user_address: string;
  declare daily_tvl: CreationOptional<number | null>;
  declare hl_tvl: CreationOptional<number | null>;
  declare date: Date;
  declare created_at: CreationOptional<Date>;
}

export const initTVLModel = () => {
  TVL.init(
    {
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true,
        comment: "UUID from analytics_users table",
      },
      user_address: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: "User's wallet address",
      },
      daily_tvl: {
        type: DataTypes.DECIMAL(24, 8),
        allowNull: true,
        comment: "Daily Total Value Locked for the user",
      },
      hl_tvl: {
        type: DataTypes.DECIMAL(24, 8),
        allowNull: true,
        comment: "Total Value Locked for Hyperliquid",
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        primaryKey: true,
        comment: "The date for this TVL record",
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
        comment: "Timestamp when this record was created",
      },
    },
    {
      sequelize,
      tableName: "tvl_tracking",
      timestamps: false,
      freezeTableName: true,
      indexes: [
        {
          fields: ["user_address"],
          name: "tvl_address_idx",
        },
      ],
    },
  );
};
