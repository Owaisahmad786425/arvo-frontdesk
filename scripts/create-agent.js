import { Agent, db, init } from "../backend/models/index.js";
import { hashPassword } from "../backend/services/security.js";
import { field } from "../backend/middleware/authMiddleware.js";

try {
  const name = field(process.env.AGENT_NAME, "AGENT_NAME", 120);
  const email = field(
    process.env.AGENT_EMAIL,
    "AGENT_EMAIL",
    254,
  ).toLowerCase();
  const password = process.env.AGENT_PASSWORD;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw Error("Invalid AGENT_EMAIL");
  if (!password || password.length < 12 || password.length > 512)
    throw Error("AGENT_PASSWORD must contain 12 to 512 characters");
  await init();
  const [, created] = await Agent.findOrCreate({
    where: { email },
    defaults: { name, hash: await hashPassword(password) },
  });
  console.log(created ? "Agent created." : "Agent already exists.");
} finally {
  await db.close();
}
