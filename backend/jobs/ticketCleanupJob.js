const { Ticket } = require("../models");
const { change, windowEnd } = require("../services/TicketService");
async function sweep(now = new Date()) {
  const waiting = await Ticket.findAll({
    where: { status: "WAITING_FOR_CUSTOMER" },
    attributes: ["id", "waitSince"],
  });
  for (const t of waiting)
    if (now >= windowEnd(t.waitSince))
      await change({ id: t.id }, null, { action: "cleanup" }, now);
}
function schedule() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await sweep();
    } catch (err) {
      console.error("Ticket cleanup failed", err.name);
    } finally {
      running = false;
    }
  };
  tick();
  const handle = setInterval(tick, 60000);
  handle.unref();
  return () => clearInterval(handle);
}
module.exports = { sweep, schedule };
