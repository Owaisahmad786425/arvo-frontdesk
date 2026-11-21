const { Audit } = require("../models");
const record = (t, actor, event, changes, at, transaction) =>
  Audit.create({ ticketId: t.id, actor, event, changes, at }, { transaction });
const list = (ticketId) =>
  Audit.findAll({ where: { ticketId }, order: [["id", "ASC"]] });
module.exports = { record, list };
