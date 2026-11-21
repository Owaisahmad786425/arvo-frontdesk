const { Router } = require("express");
const { rateLimit } = require("express-rate-limit");
const c = require("../controllers/CustomerController");
const { authenticated } = require("../middleware/authMiddleware");
const router = Router();
router.get(["/customer/ticket", "/customer/export"], c.view);
router.post(
  "/customer/replies",
  rateLimit({ limit: 100, windowMs: 900000 }),
  c.reply,
);
router.route("/customers").all(authenticated).get(c.list).post(c.create);
module.exports = router;
