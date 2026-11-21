const { db, D, id, ref, required } = require("../config/database");
const Ticket = require("./Ticket");
module.exports = db.define("message", {
  id,
  ticketId: ref(Ticket),
  kind: required(D.ENUM("PUBLIC", "INTERNAL")),
  author: required(D.STRING),
  body: required(D.TEXT),
  at: required(D.DATE),
});
