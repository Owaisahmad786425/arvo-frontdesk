const { db, D, id, ref, required } = require("../config/database");
module.exports = db.define("agent", {
  id,
  name: required(D.STRING),
  email: {
    ...required(D.STRING),
    unique: true,
    set(value) {
      this.setDataValue("email", value.trim().toLowerCase());
    },
  },
  hash: required(D.STRING),
});
