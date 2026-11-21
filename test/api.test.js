import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !new URL(url).pathname.endsWith("_test") ||
  url === process.env.DATABASE_URL
)
  throw Error("Provide a separate TEST_DATABASE_URL ending in _test");
process.env.DATABASE_URL = url;
const { app } = await import("../backend/app.js");
const { db, init, Agent, Audit } = await import("../backend/models/index.js");
const { hashPassword } = await import("../backend/services/security.js");
const { change, createTicket } =
  await import("../backend/services/TicketService.js");
const { default: sla } = await import("../backend/services/SlaService.js");
const { sweep } = await import("../backend/jobs/ticketCleanupJob.js");
test("PostgreSQL and HTTP workflows", async (t) => {
  await init();
  await init();
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  });
  const base = "http://127.0.0.1:" + server.address().port + "/api";
  const password = randomUUID(),
    run = randomUUID();
  const actors = await Promise.all(
    ["A", "B"].map(async (name) =>
      Agent.create({
        name,
        email: name + run + "@example.org",
        hash: await hashPassword(password),
      }),
    ),
  );
  const call = (path, { cookie, body, key, method } = {}) =>
    fetch(base + path, {
      method: method || (body ? "POST" : "GET"),
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(key ? { "X-Ticket-Key": key } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  const cookies = [];
  await t.test("login, protected routes and session cookies", async () => {
    assert.equal((await call("/dashboard")).status, 401);
    assert.equal(
      (
        await call("/auth/login", {
          body: { email: actors[0].email, password: "incorrect" },
        })
      ).status,
      401,
    );
    for (const a of actors) {
      const r = await call("/auth/login", {
        body: { email: a.email, password },
      });
      assert.equal(r.status, 200);
      const sc = r.headers.get("set-cookie");
      assert.match(sc, /HttpOnly/);
      cookies.push(sc.split(";")[0]);
    }
  });
  let cookie = cookies[0];
  const fields = {
    subject: "Printer connection",
    description: "Unable to connect",
    email: "case@example.org",
    customer: "Customer",
    priority: "MEDIUM",
  };
  const cust = await call("/customers", {
    cookie,
    body: { name: "Customer", email: run + "@example.org" },
  });
  assert.equal(cust.status, 201);
  fields.customerId = (await cust.json()).id;
  assert.ok(
    (await (await call("/customers", { cookie })).json()).some(
      (c) => c.id === fields.customerId,
    ),
  );
  assert.equal((await call("/auth/me", { cookie })).status, 200);
  const r = await call("/tickets", { cookie, body: fields });
  assert.equal(r.status, 201);
  const { ticket, access } = await r.json(),
    path = "/tickets/" + ticket.id;
  const act = (body, c = cookie) =>
    call(path + "/actions", { cookie: c, body });
  await t.test(
    "two simultaneous claimants produce one assignment",
    async () => {
      const rs = await Promise.all(
        cookies.map((c) =>
          call(path + "/claim", { cookie: c, body: {}, method: "PATCH" }),
        ),
      );
      assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409]);
      cookie = cookies[rs.findIndex((r) => r.status === 200)];
      const loser = cookies[rs.findIndex((r) => r.status === 409)];
      assert.equal(
        (
          await call(path + "/messages", {
            cookie: loser,
            body: { type: "PUBLIC", body: "Conflicting answer" },
          })
        ).status,
        409,
      );
      assert.equal(
        (await act({ action: "assign", agentId: null }, loser)).status,
        409,
      );
      assert.equal(
        await Audit.count({
          where: { ticketId: ticket.id, event: "ASSIGNMENT" },
        }),
        1,
      );
    },
  );
  await t.test(
    "private notes stay out of customer view, export, and first response",
    async () => {
      assert.equal(
        (
          await call(path + "/messages", {
            cookie,
            body: { type: "INTERNAL", body: "internal-only-" + run },
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await call(path + "/status", {
            cookie,
            method: "PATCH",
            body: { status: "WAITING_FOR_CUSTOMER" },
          })
        ).status,
        409,
      );
      assert.equal(
        (await act({ action: "reply", body: "Please send logs" })).status,
        200,
      );
      assert.equal(
        (
          await call(path + "/priority", {
            cookie,
            method: "PATCH",
            body: { priority: "URGENT" },
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await call(path + "/status", {
            cookie,
            method: "PATCH",
            body: { status: "WAITING_FOR_CUSTOMER" },
          })
        ).status,
        200,
      );
      const paused = await (await call(path, { cookie })).json();
      assert.ok(["OVERDUE", "PAUSED"].includes(paused.sla.resolution.state));
      for (const endpoint of ["/customer/ticket", "/customer/export"]) {
        const d = await (await call(endpoint, { key: access })).json();
        assert.deepEqual(
          d.messages.map((m) => m.body),
          ["Please send logs"],
        );
        assert.ok(!JSON.stringify(d).includes(run));
        assert.ok(!("audit" in d));
      }
      assert.equal((await call(path, { key: access })).status, 401);
      assert.equal(
        (await call("/customer/ticket", { key: "invalid" })).status,
        404,
      );
      const d = await (await call(path, { cookie })).json();
      assert.equal(d.messages.length, 2);
      assert.ok(d.audit.some((e) => e.event === "PRIORITY"));
      assert.equal(
        (
          await (
            await call("/customer/replies", {
              key: access,
              body: { body: "Here are the logs" },
            })
          ).json()
        ).status,
        "OPEN",
      );
      assert.equal((await act({ action: "resolve" })).status, 200);
      assert.equal(
        (
          await (
            await call("/customer/replies", {
              key: access,
              body: { body: "Same problem again" },
            })
          ).json()
        ).status,
        "OPEN",
      );
    },
  );
  await t.test(
    "five-day close and reopen boundaries use working hours",
    async () => {
      const start = new Date("2026-01-23T12:00:00+05:30"),
        a = actors[0];
      const { ticket: t } = await createTicket(fields, a, start);
      const w = { id: t.id };
      await change(w, a, { action: "reply", body: "More details?" }, start);
      await change(w, a, { action: "wait" }, start);
      const close = sla.clock.add(start, 5 * sla.day);
      await sweep(new Date(+close - 1));
      assert.equal(
        (await (await call("/tickets/" + t.id, { cookie })).json()).status,
        "WAITING_FOR_CUSTOMER",
      );
      await Promise.all([sweep(close), sweep(close)]);
      const resolved = await (
        await call("/tickets/" + t.id, { cookie })
      ).json();
      assert.equal(resolved.status, "RESOLVED");
      assert.equal(resolved.sla.resolution.state, "MET");
      assert.equal(
        resolved.audit.filter((x) => x.event === "AUTO_CLOSED").length,
        1,
      );
      const end = sla.clock.add(close, 5 * sla.day);
      assert.equal(
        (await change(w, a, { action: "reopen" }, end)).status,
        "OPEN",
      );
      await change(w, a, { action: "resolve" }, end);
      const follow = await change(
        w,
        null,
        { action: "reply", body: "After window" },
        new Date(+sla.clock.add(end, 5 * sla.day) + 1),
      );
      assert.notEqual(follow.id, t.id);
      assert.equal(follow.previousTicketId, t.id);
    },
  );
  await t.test("REST reads, reopen, validation, and revoked keys", async () => {
    for (const suffix of ["/messages", "/audit-logs"]) {
      assert.equal((await call(path + suffix, { key: access })).status, 401);
      assert.ok((await (await call(path + suffix, { cookie })).json()).length);
    }
    assert.equal((await call("/tickets", { cookie })).status, 200);
    assert.equal(
      (
        await call("/customers", {
          cookie,
          body: { name: "Bad", email: "invalid" },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call(path + "/status", {
          cookie,
          method: "PATCH",
          body: { status: "RESOLVED" },
        })
      ).status,
      200,
    );
    assert.equal(
      (await call(path + "/reopen", { cookie, method: "PATCH", body: {} }))
        .status,
      200,
    );
    const rotated = await (await act({ action: "link" })).json();
    assert.equal((await call("/customer/export", { key: access })).status, 404);
    assert.equal(
      (await call("/customer/export", { key: rotated.access })).status,
      200,
    );
  });
  await t.test(
    "database rejects audit mutations, including truncation",
    async () => {
      for (const sql of [
        "UPDATE audits SET actor=actor WHERE false",
        "DELETE FROM audits WHERE false",
        "TRUNCATE audits",
      ]) {
        await assert.rejects(
          db.transaction((transaction) =>
            db.query(sql, { transaction }).then(() => {
              throw Error("Mutation unexpectedly allowed");
            }),
          ),
          /immutable/,
        );
      }
    },
  );
  await t.test(
    "remaining time resumes exactly and earlier breaches survive reprioritization",
    async () => {
      const start = new Date("2026-01-20T10:30:00+05:30"),
        a = actors[0];
      const { ticket } = await createTicket(
        { ...fields, priority: "URGENT" },
        a,
        start,
      );
      const w = { id: ticket.id },
        pause = new Date(+start + 2 * 3600000),
        resume = new Date("2026-01-22T17:30:00+05:30");
      await change(w, a, { action: "reply", body: "More information?" }, pause);
      const frozen = await change(w, a, { action: "wait" }, pause);
      assert.equal(Number(frozen.sla.resolution.remainingMs), 6 * 3600000);
      const active = await change(
        w,
        a,
        { action: "incoming", body: "Details supplied" },
        resume,
      );
      assert.equal(
        +new Date(active.sla.resolution.due),
        +sla.clock.add(resume, 6 * 3600000),
      );
      const late = new Date(+new Date(active.sla.resolution.due) + 1);
      const moved = await change(
        w,
        a,
        { action: "priority", priority: "LOW" },
        late,
      );
      assert.equal(moved.sla.firstResponse.state, "MET");
      assert.equal(moved.sla.resolution.state, "OVERDUE");
      const finished = await change(w, a, { action: "resolve" }, late);
      assert.equal(finished.sla.resolution.state, "MISSED");
      const events = await Audit.findAll({
        where: { ticketId: w.id },
        order: [["id", "ASC"]],
      });
      assert.ok(events.some((e) => e.event === "SLA_PAUSED"));
      assert.ok(events.some((e) => e.event === "SLA_RESUMED"));
      assert.equal(
        events.find((e) => e.event === "PRIORITY").changes.resolutionBreached,
        true,
      );
    },
  );
  await t.test(
    "Holiday table feeds the working calendar at startup",
    async () => {
      const { Holiday } = await import("../backend/models/index.js");
      const monday = new Date("2099-01-01T04:00:00Z");
      while (monday.getUTCDay() !== 1)
        monday.setUTCDate(monday.getUTCDate() + 1);
      const date = monday.toISOString().slice(0, 10);
      const [holiday, created] = await Holiday.findOrCreate({
        where: { date },
        defaults: { name: "Test festival" },
      });
      try {
        await init();
        assert.ok(
          +sla.clock.deadlines(monday, "URGENT").firstDue >= +monday + 86400000,
        );
      } finally {
        if (created) await holiday.destroy();
        await init();
      }
    },
  );
  await t.test("dashboard and logout", async () => {
    const d = await (await call("/dashboard", { cookie })).json();
    assert.ok(d.tickets.some((t) => t.id === ticket.id));
    assert.ok(d.agents.length >= 2);
    assert.ok(!JSON.stringify(d).includes("tokenHash"));
    assert.equal((await call("/logout", { cookie, body: {} })).status, 204);
    assert.equal((await call("/dashboard", { cookie })).status, 401);
  });
});
