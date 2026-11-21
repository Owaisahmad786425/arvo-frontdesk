const { Message } = require("../models");
const list = (ticketId, publicOnly = false) =>
  Message.findAll({
    where: publicOnly ? { ticketId, kind: "PUBLIC" } : { ticketId },
    attributes: publicOnly ? ["author", "body", "at"] : undefined,
    order: [["id", "ASC"]],
  });
const append = (ticketId, kind, author, body, at, transaction) =>
  Message.create({ ticketId, kind, author, body, at }, { transaction });
module.exports = { list, append };
