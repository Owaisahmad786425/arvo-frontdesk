const { db, D, id, required } = require("../config/database");
module.exports = db.define("customer", {
  id,
  name: required(D.STRING),
  email: { ...required(D.STRING), unique: true },
});
