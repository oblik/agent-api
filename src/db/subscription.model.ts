import {
  type CreationOptional,
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "./index.js";

export class Subscriptions extends Model<
  InferAttributes<Subscriptions>,
  InferCreationAttributes<Subscriptions>
> {
  declare id: CreationOptional<number>;
  declare address: string;
  declare subscription: object;
}

export const initSubscriptionModel = () => {
  Subscriptions.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      address: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      subscription: {
        type: DataTypes.JSONB,
        allowNull: false,
        unique: true,
      },
    },
    { sequelize, tableName: "subscriptions" },
  );
};
