const { change, findTicket } = require("../services/TicketService");
const messages = require("../services/MessageService");
const { choice, fail } = require("../middleware/authMiddleware");
async function list(req, res) {
  await findTicket({ id: req.ticketId });
  res.json(await messages.list(req.ticketId));
}
async function create(req, res) {
  const kind = choice(req.body.type, ["PUBLIC", "INTERNAL"]),
    source = choice(req.body.source ?? "agent", ["customer", "agent"]);
  if (kind === "INTERNAL" && source === "customer")
    fail(400, "Only agents can add internal notes");
  res
    .status(201)
    .json(
      await change({ id: req.ticketId }, req.agent, {
        action:
          kind === "INTERNAL"
            ? "note"
            : source === "customer"
              ? "incoming"
              : "reply",
        body: req.body.body,
      }),
    );
}
module.exports = { list, create };
