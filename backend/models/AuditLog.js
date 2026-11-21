const { db, D, id, ref, required } = require("../config/database");
const Ticket = require("./Ticket");
module.exports = db.define("audit", {
  id,
  ticketId: ref(Ticket),
  actor: required(D.STRING),
  event: required(D.STRING),
  changes: required(D.JSONB),
  at: required(D.DATE),
});
