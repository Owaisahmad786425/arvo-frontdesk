const { Sequelize, DataTypes: D } = require("sequelize");
if (!process.env.DATABASE_URL)
  throw Error("Configure DATABASE_URL before starting Frontdesk");
const db = new Sequelize(process.env.DATABASE_URL, {
  logging: false,
  define: { timestamps: false },
});
const required = (type) => ({ type, allowNull: false });
const id = { type: D.INTEGER, autoIncrement: true, primaryKey: true };
const ref = (model, allowNull = false) => ({
  type: D.INTEGER,
  references: { model, key: "id" },
  allowNull,
});

module.exports = { db, D, id, ref, required };
