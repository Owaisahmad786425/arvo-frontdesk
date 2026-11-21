const { Agent, Ticket, Message, Audit } = require("../models");
const { fail, choice } = require("../middleware/authMiddleware");
const {
  createTicket,
  findTicket,
  change,
  summary,
} = require("../services/TicketService");
async function overview(req, res) {
  const agents = await Agent.findAll({
    attributes: ["id", "name"],
    order: [["name", "ASC"]],
  });
  const tickets = await Ticket.findAll({
    order: [
      ["updatedAt", "DESC"],
      ["id", "DESC"],
    ],
  });
  res.json({ me: req.agent, agents, tickets: tickets.map((t) => summary(t)) });
}
async function create(req, res) {
  const result = await createTicket(req.body, req.agent);
  res
    .status(201)
    .json(req.agent ? result : { id: result.ticket.id, access: result.access });
}
async function detail(req, res) {
  const t = await findTicket({ id: req.ticketId });
  const related = { where: { ticketId: t.id }, order: [["id", "ASC"]] };
  res.json({
    ...summary(t),
    messages: await Message.findAll(related),
    audit: await Audit.findAll(related),
  });
}
async function action(req, res) {
  if (req.body.action === "cleanup") fail(400, "Invalid action");
  res.json(await change({ id: req.ticketId }, req.agent, req.body));
}

async function list(req, res) {
  res.json(
    (
      await Ticket.findAll({
        order: [
          ["updatedAt", "DESC"],
          ["id", "DESC"],
        ],
      })
    ).map((t) => summary(t)),
  );
}
const patch = (action) => async (req, res) => {
  const op =
    action === "status"
      ? { OPEN: "open", WAITING_FOR_CUSTOMER: "wait", RESOLVED: "resolve" }[
          choice(req.body.status, ["OPEN", "WAITING_FOR_CUSTOMER", "RESOLVED"])
        ]
      : action;
  const d = await change({ id: req.ticketId }, req.agent, {
    action: op,
    priority: req.body.priority,
  });
  res.status(d.previousTicketId ? 201 : 200).json(d);
};
module.exports = { overview, create, detail, action, list, patch };
