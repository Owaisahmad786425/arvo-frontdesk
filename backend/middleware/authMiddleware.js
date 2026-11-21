const { Agent, Session } = require("../models/index.js");
const { digest } = require("../services/security.js");
function fail(status, message) {
  throw Object.assign(Error(message), { status });
}
function field(value, name, max = 8000) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    fail(400, "Invalid " + name);
  return value.trim();
}
function choice(value, options) {
  if (!options.includes(value))
    fail(400, "Choose one of " + options.join(", "));
  return value;
}
async function authenticated(req, res, next) {
  const cookie = /(?:^|;\s*)fd_session=([a-f0-9]{64})(?:;|$)/.exec(
    req.headers.cookie || "",
  );
  const session = cookie && (await Session.findByPk(digest(cookie[1])));
  if (!session || session.expires <= new Date())
    fail(401, "Sign in to continue");
  req.session = session;
  req.agent = await Agent.findByPk(session.agentId, {
    attributes: ["id", "name", "email"],
  });
  next();
}

module.exports = { field, fail, choice, authenticated };
