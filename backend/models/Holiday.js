const { db, D } = require("../config/database");
module.exports = db.define("holiday", {
  date: { type: D.DATEONLY, primaryKey: true },
  name: D.STRING,
});
