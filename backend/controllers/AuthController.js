const { Agent, Session } = require("../models");
const { Op } = require("sequelize");
const { field, fail } = require("../middleware/authMiddleware");
const { hashPassword, token, digest, verify } = require("../services/security");
const dummy = hashPassword(token());
const cookie = {
  httpOnly: true,
  sameSite: "strict",
  secure: process.env.NODE_ENV === "production",
  path: "/",
};
async function login(req, res) {
  const email = field(req.body.email, "email", 254).toLowerCase();
  const password = req.body.password;
  if (typeof password !== "string" || !password.length || password.length > 512)
    fail(400, "Invalid password");
  const agent = await Agent.findOne({ where: { email } });
  if (!(await verify(password, agent?.hash || (await dummy))) || !agent)
    fail(401, "Incorrect email or password");
  const key = token(),
    age = 8 * 3600000;
  await Session.destroy({ where: { expires: { [Op.lt]: new Date() } } });
  await Session.create({
    digest: digest(key),
    agentId: agent.id,
    expires: new Date(Date.now() + age),
  });
  res
    .cookie("fd_session", key, { ...cookie, maxAge: age })
    .json({ name: agent.name });
}
async function logout(req, res) {
  await req.session.destroy();
  res.clearCookie("fd_session", cookie).sendStatus(204);
}

module.exports = { login, logout, me: (req, res) => res.json(req.agent) };
