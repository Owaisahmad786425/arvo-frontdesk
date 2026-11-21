const { Router } = require("express");
const { authenticated, fail } = require("../middleware/authMiddleware");
const c = require("../controllers/TicketController");
const router = Router();
router.use(authenticated);
router.param("id", (req, res, next, id) => {
  if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647)
    fail(404, "Ticket not found");
  req.ticketId = Number(id);
  next();
});
router.get("/dashboard", c.overview);
router.route("/tickets").post(c.create).get(c.list);
router.get("/tickets/:id", c.detail);
for (const op of ["claim", "priority", "status", "reopen"])
  router.patch("/tickets/:id/" + op, c.patch(op));
router.post("/tickets/:id/actions", c.action);
require("./messageRoutes")(router);
router.get(
  "/tickets/:id/audit-logs",
  require("../controllers/AuditLogController").list,
);
module.exports = router;
