const { Customer } = require("../models");
const { upsert } = require("../services/CustomerService");
const { publicView, change, byAccess } = require("../services/TicketService");
async function create(req, res) {
  res.status(201).json(await upsert(req.body.name, req.body.email));
}
async function list(req, res) {
  res.json(await Customer.findAll({ order: [["name", "ASC"]] }));
}
async function view(req, res) {
  const d = await publicView(req.get("X-Ticket-Key"));
  if (req.path.endsWith("export"))
    res.attachment("frontdesk-" + d.id + ".json");
  res.json(d);
}
async function reply(req, res) {
  const d = await change(byAccess(req.get("X-Ticket-Key")), null, {
    action: "reply",
    body: req.body.body,
  });
  res
    .status(d.previousTicketId ? 201 : 200)
    .json({
      id: d.id,
      status: d.status,
      ...(d.access ? { access: d.access } : {}),
    });
}
module.exports = { create, list, view, reply };
