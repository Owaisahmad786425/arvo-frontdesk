const { db, D, id, ref, required } = require("../config/database");
const Agent = require("./Agent");
const Customer = require("./Customer");
module.exports = db.define("ticket", {
  id,
  customerId: ref(Customer),
  remainingMs: D.BIGINT,
  firstBreached: { type: D.BOOLEAN, allowNull: false, defaultValue: false },
  resolutionBreached: {
    type: D.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  subject: required(D.STRING),
  description: required(D.TEXT),
  customer: required(D.STRING),
  email: required(D.STRING),
  agentId: ref(Agent, true),
  priority: required(D.ENUM("URGENT", "MEDIUM", "LOW")),
  status: required(D.ENUM("OPEN", "WAITING_FOR_CUSTOMER", "RESOLVED")),
  createdAt: required(D.DATE),
  updatedAt: required(D.DATE),
  cycleStart: required(D.DATE),
  firstDue: required(D.DATE),
  resolutionDue: required(D.DATE),
  firstAt: D.DATE,
  resolvedAt: D.DATE,
  waitSince: D.DATE,
  tokenHash: { ...required(D.STRING), unique: true },
});
