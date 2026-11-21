const { db } = require("../config/database");
const Agent = require("./Agent"),
  Customer = require("./Customer"),
  Session = require("./Session"),
  Ticket = require("./Ticket"),
  Holiday = require("./Holiday"),
  Message = require("./Message"),
  Audit = require("./AuditLog");
const sla = require("../services/SlaService");
for (const [parent, child, foreignKey, as] of [
  [Agent, Session, "agentId", "loginAgent"],
  [Agent, Ticket, "agentId", "assignee"],
  [Customer, Ticket, "customerId", "contact"],
  [Ticket, Message, "ticketId", "ticket"],
  [Ticket, Audit, "ticketId", "ticket"],
]) {
  parent.hasMany(child, { foreignKey });
  child.belongsTo(parent, { foreignKey, as });
}
async function init() {
  await db.transaction(async (transaction) => {
    const query = (sql) => db.query(sql, { transaction });
    await query("SELECT pg_advisory_xact_lock(63971001)");
    await query(
      "CREATE TABLE IF NOT EXISTS frontdesk_migrations(version integer PRIMARY KEY)",
    );
    const [versions] = await query("SELECT version FROM frontdesk_migrations");
    if (!versions.length) {
      await db.sync({ transaction });
      await query(
        `CREATE FUNCTION frontdesk_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Frontdesk audit history is immutable'; END; $$`,
      );
      await query(
        "CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON audits FOR EACH STATEMENT EXECUTE FUNCTION frontdesk_immutable()",
      );
      await query(
        'CREATE INDEX ticket_wait_idx ON tickets ("waitSince") WHERE "waitSince" IS NOT NULL',
      );
      await query(
        'CREATE INDEX message_ticket_idx ON messages ("ticketId",id)',
      );
      await query('CREATE INDEX audit_ticket_idx ON audits ("ticketId",id)');
      await query("INSERT INTO frontdesk_migrations VALUES (1)");
    } else if (!versions.some((v) => v.version === 2)) {
      await Customer.sync({ transaction });
      await Holiday.sync({ transaction });
      await query(
        `ALTER TYPE enum_tickets_status RENAME VALUE 'WAITING' TO 'WAITING_FOR_CUSTOMER'`,
      );
      await query(
        `ALTER TYPE enum_messages_kind RENAME VALUE 'PRIVATE' TO 'INTERNAL'`,
      );
      await query(
        `ALTER TABLE tickets ADD COLUMN "customerId" integer REFERENCES customers(id), ADD COLUMN "remainingMs" bigint, ADD COLUMN "firstBreached" boolean NOT NULL DEFAULT false, ADD COLUMN "resolutionBreached" boolean NOT NULL DEFAULT false`,
      );
      await query(
        `INSERT INTO customers(name,email) SELECT DISTINCT ON (lower(email)) customer,lower(email) FROM tickets ORDER BY lower(email),id`,
      );
      await query(
        `UPDATE tickets t SET "customerId"=c.id FROM customers c WHERE c.email=lower(t.email)`,
      );
      await query('ALTER TABLE tickets ALTER COLUMN "customerId" SET NOT NULL');
    }
    if (!versions.some((v) => v.version === 2)) {
      const dates = (process.env.HOLIDAYS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const date of dates)
        await Holiday.findOrCreate({ where: { date }, transaction });
    }
    sla.configure((await Holiday.findAll({ transaction })).map((h) => h.date));
    if (!versions.some((v) => v.version === 2)) {
      const now = new Date();
      for (const t of await Ticket.findAll({
        where: { status: "WAITING_FOR_CUSTOMER" },
        transaction,
      })) {
        t.remainingMs = sla.clock.workingMs(now, t.resolutionDue);
        t.resolutionBreached = now > t.resolutionDue;
        await t.save({ transaction });
        await Audit.create(
          {
            ticketId: t.id,
            actor: "System",
            event: "SLA_PAUSED",
            changes: {
              reason: "Policy migration",
              remainingMs: t.remainingMs,
              previousDue: t.resolutionDue,
              breached: t.resolutionBreached,
            },
            at: now,
          },
          { transaction },
        );
      }
      await query("INSERT INTO frontdesk_migrations VALUES (2)");
    }
    if (!versions.some((v) => v.version === 3)) {
      await query(`UPDATE tickets t SET "resolutionBreached"=true WHERE EXISTS
 (SELECT 1 FROM audits a WHERE a."ticketId"=t.id AND
 ((a.event='RESOLUTION' AND a.changes->>'result'='MISSED') OR
 (a.event='PRIORITY' AND (a.changes->>'previousResolutionDue')::timestamptz < a.at)))`);
      await query("INSERT INTO frontdesk_migrations VALUES (3)");
    }
  });
}
module.exports = {
  db,
  Agent,
  Session,
  Ticket,
  Message,
  Audit,
  Customer,
  Holiday,
  init,
};
