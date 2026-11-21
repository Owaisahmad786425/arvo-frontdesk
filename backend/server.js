const { app } = require("./app");
const { init, db } = require("./models");
const { schedule } = require("./jobs/ticketCleanupJob");
async function start() {
  await init();
  const stop = schedule();
  const server = app.listen(
    Number(process.env.PORT || 3000),
    process.env.HOST || "0.0.0.0",
    () => console.log("Frontdesk listening on port", server.address().port),
  );
  function shutdown() {
    stop();
    server.close(() => db.close());
  }
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
start().catch((err) => {
  console.error(
    "Frontdesk startup failed",
    err.name,
    err.original?.code || err.message,
  );
  process.exitCode = 1;
});
