import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";

const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !new URL(url).pathname.endsWith("_test") ||
  url === process.env.DATABASE_URL
)
  throw Error("Set a dedicated TEST_DATABASE_URL ending in _test");
process.env.DATABASE_URL = url;
const { app } = await import("../backend/app.js");
const { db, Agent, init } = await import("../backend/models/index.js");
const { hashPassword } = await import("../backend/services/security.js");

test("React agent ticket lifecycle on desktop and mobile", async (t) => {
  await init();
  t.after(() => db.close());
  const email = randomUUID() + "@example.org",
    password = randomUUID();
  await Agent.create({
    name: "Browser tester",
    email,
    hash: await hashPassword(password),
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  t.after(() => browser.close());
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto(base);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("heading", { name: "Ticket overview" }).waitFor();
  await page.getByRole("button", { name: "New ticket" }).click();
  const subject = "Browser case " + randomUUID().slice(0, 8);
  await page.getByLabel("Subject").fill(subject);
  await page.getByLabel("Description").fill("Need help with a browser issue.");
  await page.getByLabel("Customer name").fill("Demo customer");
  await page.getByLabel("Customer email").fill("browser@example.org");
  await page.getByRole("button", { name: "Create ticket" }).click();
  await page.getByRole("button", { name: "Claim ticket" }).click();
  await page.getByText("Assigned to Browser tester").waitFor();
  await page.getByLabel("Message type").selectOption("INTERNAL");
  await page.getByLabel("Message", { exact: true }).fill("PRIVATE MARKER");
  await page.getByRole("button", { name: "Add message" }).click();
  await page.getByText("PRIVATE MARKER", { exact: true }).waitFor();
  await page.getByLabel("Message type").selectOption("PUBLIC");
  await page
    .getByLabel("Message", { exact: true })
    .fill("Please confirm the browser version.");
  await page.getByRole("button", { name: "Add message" }).click();
  await page.getByRole("button", { name: "Wait for customer" }).click();
  await page.locator("dialog .badge.PAUSED").waitFor();
  await page.getByLabel("Message type").selectOption("incoming");
  await page.getByLabel("Message", { exact: true }).fill("Version confirmed.");
  await page.getByRole("button", { name: "Add message" }).click();
  await page.locator("dialog .badge.OPEN").waitFor();
  await page.getByLabel("Priority").selectOption("LOW");
  await page.getByRole("button", { name: "Resolve", exact: true }).click();
  await page.getByRole("button", { name: "Reopen ticket" }).click();
  await page.locator("dialog .badge.OPEN").waitFor();
  await page.getByText(/Ticket history/).click();
  await page.getByText("sla resumed", { exact: true }).waitFor();
  await page.getByLabel("Close dialog").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Search tickets").fill(subject);
  await page.getByRole("button", { name: subject }).waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  assert.deepEqual(errors, []);
});
