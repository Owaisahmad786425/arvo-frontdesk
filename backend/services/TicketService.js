const { db, Agent, Customer, Ticket } = require("../models");
const sla = require("./SlaService"),
  { timers, day } = sla;
const { token, digest } = require("./security");
const { field, choice, fail } = require("../middleware/authMiddleware");
const { upsert, validId } = require("./CustomerService");
const { record: history } = require("./AuditService");
const messages = require("./MessageService");
const priorities = ["URGENT", "MEDIUM", "LOW"];
const windowEnd = (date) => sla.clock.add(date, 5 * day);
const actorName = (a) => "Agent #" + a.id + " · " + a.name;
function summary(t, now = new Date()) {
  const {
    id,
    subject,
    description,
    customer,
    email,
    agentId,
    priority,
    status,
    createdAt,
    updatedAt,
    resolvedAt,
  } = t;
  return {
    id,
    subject,
    description,
    customer,
    email,
    agentId,
    priority,
    status,
    createdAt,
    updatedAt,
    resolvedAt,
    customerId: t.customerId,
    firstAt: t.firstAt,
    sla: timers(t, now),
    canCloseWaiting: Boolean(t.waitSince && now >= windowEnd(t.waitSince)),
    reopenUntil: resolvedAt && windowEnd(resolvedAt),
  };
}

function values(input) {
  return {
    subject: field(input.subject, "subject", 180),
    description: field(input.description, "description"),
    priority: choice(input.priority, priorities),
  };
}

async function createTicket(input, agent, now = new Date(), outer, parentId) {
  const access = token();
  async function insert(transaction) {
    const contact =
      input.customerId !== undefined
        ? await Customer.findByPk(validId(input.customerId), { transaction })
        : await upsert(input.customer, input.email, transaction);
    if (!contact) fail(404, "Customer not found");
    const data = values(input);
    const t = await Ticket.create(
      {
        ...data,
        customerId: contact.id,
        customer: contact.name,
        email: contact.email,
        agentId: null,
        status: "OPEN",
        tokenHash: digest(access),
        createdAt: now,
        updatedAt: now,
        cycleStart: now,
        ...sla.clock.deadlines(now, data.priority),
      },
      { transaction },
    );
    await history(
      t,
      agent ? actorName(agent) : "Customer · " + t.customer,
      "CREATED",
      {
        status: t.status,
        priority: t.priority,
        subject: t.subject,
        firstDue: t.firstDue,
        resolutionDue: t.resolutionDue,
        ...(parentId ? { previousTicketId: parentId } : {}),
      },
      now,
      transaction,
    );
    return { ticket: summary(t, now), access };
  }
  return outer ? insert(outer) : db.transaction(insert);
}
async function findTicket(where, options = {}) {
  const t = await Ticket.findOne({ where, ...options });
  if (!t) fail(404, "Ticket not found");
  return t;
}

const byAccess = (key) => ({
  tokenHash: digest(field(key, "ticket key", 128)),
});
async function publicView(key) {
  const t = await findTicket(byAccess(key));
  return {
    id: t.id,
    subject: t.subject,
    description: t.description,
    customer: t.customer,
    status: t.status,
    priority: t.priority,
    createdAt: t.createdAt,
    messages: await messages.list(t.id, true),
  };
}
async function change(where, agent, input, time) {
  return db.transaction(async (transaction) => {
    const t = await findTicket(where, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const now = time || new Date(),
      system = input.action === "cleanup",
      inbound = !agent || input.action === "incoming";
    const actor = system
      ? "System"
      : agent
        ? actorName(agent)
        : "Customer · " + t.customer;
    const record = (event, changes, at = now, who = actor) =>
      history(
        t,
        who,
        event,
        +at === +now ? changes : { ...changes, effectiveAt: at },
        now,
        transaction,
      );
    const result = () => summary(t, now);
    if (!agent && !["reply", "cleanup"].includes(input.action))
      fail(403, "Customer reply required");
    function remember() {
      t.firstBreached ||= (t.firstAt || now) > t.firstDue;
      if (!t.waitSince)
        t.resolutionBreached ||= (t.resolvedAt || now) > t.resolutionDue;
    }
    async function status(next, at = now, who = actor) {
      await record("STATUS", { from: t.status, to: next }, at, who);
      t.status = next;
      t.waitSince = next === "WAITING_FOR_CUSTOMER" ? at : null;
      t.resolvedAt = next === "RESOLVED" ? at : null;
    }
    async function resume(at = now, who = actor) {
      const remainingMs = Number(t.remainingMs);
      t.resolutionDue = sla.clock.add(at, remainingMs);
      await record(
        "SLA_RESUMED",
        { remainingMs, due: t.resolutionDue, breached: t.resolutionBreached },
        at,
        who,
      );
      t.remainingMs = null;
    }
    async function resolve(at, who, event) {
      if (t.waitSince) await resume(at, who);
      await status("RESOLVED", at, who);
      await record(
        event,
        { due: t.resolutionDue, result: timers(t, at).resolution.state },
        at,
        who,
      );
    }
    const expired = t.waitSince && now >= windowEnd(t.waitSince);
    if (system && !expired) return result();
    remember();
    if (expired) {
      await resolve(windowEnd(t.waitSince), "System", "AUTO_CLOSED");
    }
    async function reopenOrFollowup(body) {
      if (now > windowEnd(t.resolvedAt)) {
        const next = await createTicket(
          {
            customerId: t.customerId,
            subject: t.subject,
            description: body || t.description,
            priority: t.priority,
          },
          agent,
          now,
          transaction,
          t.id,
        );
        if (body) {
          const m = await messages.append(
            next.ticket.id,
            "PUBLIC",
            t.customer,
            body,
            now,
            transaction,
          );
          await history(
            next.ticket,
            actor,
            "PUBLIC_REPLY",
            { messageId: m.id, source: "customer" },
            now,
            transaction,
          );
        }
        await record("FOLLOWUP_CREATED", { ticketId: next.ticket.id });
        t.updatedAt = now;
        await t.save({ transaction });
        return { ...next.ticket, access: next.access, previousTicketId: t.id };
      }
      await status("OPEN");
      t.cycleStart = now;
      t.resolutionDue = sla.clock.deadlines(now, t.priority).resolutionDue;
      await record("REOPENED", {
        due: t.resolutionDue,
        previousBreach: t.resolutionBreached,
      });
    }
    switch (input.action) {
      case "cleanup":
        break;
      case "claim":
      case "assign": {
        const next = input.action === "claim" ? agent.id : input.agentId;
        if (t.agentId !== null && t.agentId !== agent.id)
          fail(409, "This ticket belongs to another agent");
        if (input.action === "claim" && t.agentId !== null)
          fail(409, "Ticket already claimed");
        if (
          next !== null &&
          (!Number.isSafeInteger(next) ||
            !(await Agent.findByPk(next, { transaction })))
        )
          fail(400, "Unknown agent");
        if (next !== t.agentId)
          await record("ASSIGNMENT", { from: t.agentId, to: next });
        t.agentId = next;
        break;
      }
      case "priority": {
        if (t.resolvedAt) fail(409, "Ticket is resolved");
        const next = choice(input.priority, priorities);
        if (next === t.priority) break;
        const deadlines = sla.clock.deadlines(now, next);
        await record("PRIORITY", {
          from: t.priority,
          to: next,
          oldFirstDue: t.firstDue,
          oldResolutionDue: t.resolutionDue,
          firstBreached: t.firstBreached,
          resolutionBreached: t.resolutionBreached,
          ...deadlines,
          firstDue: t.firstAt ? t.firstDue : deadlines.firstDue,
        });
        t.priority = next;
        if (!t.firstAt) t.firstDue = deadlines.firstDue;
        t.resolutionDue = deadlines.resolutionDue;
        if (t.waitSince)
          t.remainingMs = sla.clock.workingMs(now, t.resolutionDue);
        break;
      }
      case "note":
      case "reply":
      case "incoming": {
        const body = field(input.body, "message"),
          note = input.action === "note";
        if (!note && t.resolvedAt) {
          if (!inbound) fail(409, "Reopen the ticket first");
          const followup = await reopenOrFollowup(body);
          if (followup) return followup;
        }
        if (!note && !inbound) {
          if (t.agentId !== null && t.agentId !== agent.id)
            fail(409, "Only the assigned agent can reply");
          if (t.agentId === null) {
            await record("ASSIGNMENT", { from: null, to: agent.id });
            t.agentId = agent.id;
          }
        }
        const m = await messages.append(
          t.id,
          note ? "INTERNAL" : "PUBLIC",
          inbound ? t.customer : agent.name,
          body,
          now,
          transaction,
        );
        await record(note ? "INTERNAL_NOTE" : "PUBLIC_REPLY", {
          messageId: m.id,
          source: inbound ? "customer" : "agent",
        });
        if (!note && !inbound && !t.firstAt) t.firstAt = now;
        if (inbound && t.waitSince) {
          await resume();
          await status("OPEN");
        }
        break;
      }
      case "open":
        if (!t.waitSince) fail(409, "Only waiting tickets can resume");
        await resume();
        await status("OPEN");
        break;
      case "wait":
        if (t.status !== "OPEN" || !t.firstAt)
          fail(409, "Send a public response on an open ticket before waiting");
        t.remainingMs = sla.clock.workingMs(now, t.resolutionDue);
        await status("WAITING_FOR_CUSTOMER");
        await record("SLA_PAUSED", {
          remainingMs: t.remainingMs,
          previousDue: t.resolutionDue,
          breached: t.resolutionBreached,
        });
        break;
      case "resolve":
        if (t.resolvedAt || !t.firstAt)
          fail(
            409,
            "An active ticket needs a public response before resolution",
          );
        await resolve(now, actor, "RESOLUTION");
        break;
      case "reopen": {
        if (!t.resolvedAt) fail(409, "Only resolved tickets can reopen");
        const followup = await reopenOrFollowup();
        if (followup) return followup;
        break;
      }
      case "link": {
        const access = token();
        t.tokenHash = digest(access);
        await record("CUSTOMER_LINK_REPLACED", {});
        await t.save({ transaction });
        return { access };
      }
      default:
        fail(400, "Unknown ticket action");
    }
    t.updatedAt = now;
    await t.save({ transaction });
    return agent || system ? result() : { id: t.id, status: t.status };
  });
}
module.exports = {
  createTicket,
  findTicket,
  byAccess,
  publicView,
  summary,
  change,
  windowEnd,
};
