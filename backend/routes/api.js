const { Router } = require("express");
const api = Router();
api.use(
  require("./authRoutes"),
  require("./customerRoutes"),
  require("./ticketRoutes"),
);
module.exports = { api };
