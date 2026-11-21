const { findTicket } = require("../services/TicketService");
const audit = require("../services/AuditService");
exports.list = async (req, res) => {
  await findTicket({ id: req.ticketId });
  res.json(await audit.list(req.ticketId));
};
