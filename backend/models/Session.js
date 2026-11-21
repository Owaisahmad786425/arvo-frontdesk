const { db, D, id, ref, required } = require("../config/database");
const Agent = require("./Agent");
module.exports = db.define("session", {
  digest: { type: D.STRING, primaryKey: true },
  agentId: ref(Agent),
  expires: required(D.DATE),
});
