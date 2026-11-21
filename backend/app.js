const express = require("express");
const helmet = require("helmet");
const path = require("node:path");
const { api } = require("./routes/api");
const { db } = require("./models/index.js");
const app = express();
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "upgrade-insecure-requests":
          process.env.NODE_ENV === "production" ? [] : null,
      },
    },
    referrerPolicy: { policy: "no-referrer" },
  }),
);
app.get("/health", async (req, res) => {
  await db.authenticate();
  res.json({ status: "ok" });
});
app.use(
  "/api",
  (req, res, next) => {
    res.set("Cache-Control", "no-store");
    const bodylessPatch =
      req.method === "PATCH" &&
      !req.headers["transfer-encoding"] &&
      !Number(req.headers["content-length"]);
    if (
      ["POST", "PATCH"].includes(req.method) &&
      !bodylessPatch &&
      !req.is("application/json")
    )
      return res.status(415).json({ error: "JSON required" });
    next();
  },
  express.json({ limit: "32kb" }),
  (req, res, next) => {
    req.body ??= {};
    if (Array.isArray(req.body))
      return res.status(400).json({ error: "Expected JSON object" });
    next();
  },
  api,
);
app.use(express.static(path.join(__dirname, "../public")));
app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use(require("./middleware/errorMiddleware"));
module.exports = { app };
