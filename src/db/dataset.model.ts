import {
  type CreationOptional,
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "./index.js";

export class Dataset extends Model<
  InferAttributes<Dataset>,
  InferCreationAttributes<Dataset>
> {
  declare id: CreationOptional<number>;
  declare query_id: number;
  declare generated_correct: boolean;
  declare edited_correct: boolean;
  declare created: number;
  declare updated: number;
}

export const initDatasetModel = () => {
  Dataset.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      query_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      generated_correct: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
      },
      edited_correct: {
        type: DataTypes.BOOLEAN,
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
    },
    {
      sequelize,
      tableName: "dataset",
      timestamps: false,
      freezeTableName: true,
    },
  );
};
