import {
  type CreationOptional,
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "./index.js";

export class Tokens extends Model<
  InferAttributes<Tokens>,
  InferCreationAttributes<Tokens>
> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare symbol: string;
  declare chainId: number;
  declare address: string;
  declare thumb: CreationOptional<string>;
  declare coingeckoId: CreationOptional<string>;
  declare coinmarketcapId: CreationOptional<string>;
  declare decimals: number;
  declare price: CreationOptional<number>;
}

export const initTokenModel = () => {
  Tokens.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      symbol: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      chainId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      address: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      thumb: {
        type: DataTypes.STRING(1000),
        allowNull: true,
      },
      coingeckoId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      coinmarketcapId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      decimals: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      price: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
    },
    { sequelize, tableName: "tokens" },
  );
};
