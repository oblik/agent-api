import {
  type CreationOptional,
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "./index.js";

export class Protocols extends Model<
  InferAttributes<Protocols>,
  InferCreationAttributes<Protocols>
> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare thumb: string;
  declare url: string;
}

export const initProtocolModel = () => {
  Protocols.init(
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
      thumb: {
        type: DataTypes.STRING(1000),
        allowNull: true,
      },
      url: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    { sequelize, tableName: "protocols" },
  );
};
