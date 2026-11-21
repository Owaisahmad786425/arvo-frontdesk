const { Router } = require("express");
const { rateLimit } = require("express-rate-limit");
const auth = require("../controllers/AuthController");
const { authenticated } = require("../middleware/authMiddleware");
const router = Router();
router.post(
  ["/auth/login", "/login"],
  rateLimit({
    limit: 30,
    windowMs: 900000,
    message: { error: "Too many sign-in attempts" },
  }),
  auth.login,
);
router.get("/auth/me", authenticated, auth.me);
router.post(["/auth/logout", "/logout"], authenticated, auth.logout);
module.exports = router;
