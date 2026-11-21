import { db, init, Agent, Ticket } from "../backend/models/index.js";
import { hashPassword } from "../backend/services/security.js";
import { createTicket, change } from "../backend/services/TicketService.js";

const names = [
  "Maya Patel",
  "Dev Shah",
  "Leah Chen",
  "Omar Ali",
  "Isha Rao",
  "Sam Park",
  "Nina Cole",
  "Theo Bell",
  "Ava Singh",
];
const samples = [
  ["Billing portal returns an error", "Northstar Studio", "URGENT", 0],
  ["Unable to invite a teammate", "Atlas Supply", "MEDIUM", 1],
  ["Export is missing recent orders", "Fieldwork Design", "MEDIUM", 2],
  ["Update the invoice address", "Cedar Works", "LOW", null],
  ["Dashboard takes too long to load", "Morrow Labs", "URGENT", null],
  ["Reset access to the shared inbox", "Juniper House", "LOW", 0],
];
try {
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 12)
    throw Error("Set DEMO_PASSWORD to at least 12 characters");
  await init();
  const agents = [];
  for (const name of names) {
    const email = name.split(" ")[0].toLowerCase() + "@arvo.example";
    const [a] = await Agent.findOrCreate({
      where: { email },
      defaults: { name, hash: await hashPassword(password) },
    });
    agents.push(a);
  }
  for (const [
    i,
    [subject, customer, priority, assignee],
  ] of samples.entries()) {
    const email = "support" + i + "@example.org";
    if (await Ticket.findOne({ where: { subject, email } })) continue;
    const now = new Date(
      Date.now() - (i === 0 ? 7 : i === 2 ? 9 : 1) * 86400000,
    );
    const { ticket } = await createTicket(
      {
        subject,
        customer,
        priority,
        email,
        description: subject + ". Please investigate and advise on next steps.",
      },
      agents[0],
      now,
    );
    const where = { id: ticket.id };
    if (assignee !== null)
      await change(where, agents[assignee], { action: "claim" }, now);
    if (i === 2 || i === 5) {
      await change(
        where,
        agents[assignee],
        {
          action: "reply",
          body:
            i === 2
              ? "Could you share the date range used for the export?"
              : "Your shared inbox access has been restored.",
        },
        now,
      );
      await change(
        where,
        agents[assignee],
        { action: i === 2 ? "wait" : "resolve" },
        now,
      );
    }
  }
  console.log(
    "Demo ready. Sign in as maya@arvo.example with DEMO_PASSWORD from your environment.",
  );
} finally {
  await db.close();
}
