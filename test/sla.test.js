import test from "node:test";
import assert from "node:assert/strict";
import { calendar, timers, day } from "../backend/services/SlaService.js";
const c = calendar("Asia/Kolkata", ["2026-01-26"]);
const at = (s) => new Date(s + ":00+05:30");
const iso = (d) => d.toISOString();
for (const [name, start, p, first, resolution] of [
  [
    "urgent before opening",
    "2026-01-23T07:30",
    "URGENT",
    "2026-01-23T11:30",
    "2026-01-23T18:30",
  ],
  [
    "urgent late Friday crosses weekend and Monday holiday",
    "2026-01-23T18:00",
    "URGENT",
    "2026-01-27T11:00",
    "2026-01-23T18:30",
  ],
  [
    "arrival exactly at close",
    "2026-01-23T18:30",
    "URGENT",
    "2026-01-27T11:30",
    "2026-01-27T18:30",
  ],
  [
    "medium on holiday",
    "2026-01-26T13:00",
    "MEDIUM",
    "2026-01-27T14:00",
    "2026-01-29T18:30",
  ],
  [
    "low on weekend",
    "2026-01-24T10:00",
    "LOW",
    "2026-01-27T18:30",
    "2026-02-02T18:30",
  ],
]) {
  test(name, () => {
    const r = c.deadlines(at(start), p);
    assert.equal(iso(r.firstDue), iso(at(first)));
    assert.equal(iso(r.resolutionDue), iso(at(resolution)));
  });
}
test("five working days from mid-shift skips weekends and festival holiday", () => {
  assert.equal(
    iso(c.add(at("2026-01-23T12:30"), 5 * day)),
    iso(at("2026-02-02T12:30")),
  );
});
test("paused resolution keeps its remaining time across a weekend and holiday", () => {
  const start = at("2026-01-23T17:30"),
    due = at("2026-01-27T10:30");
  const remaining = c.workingMs(start, due);
  assert.equal(remaining, 7200000);
  const t = {
    firstDue: start,
    firstAt: start,
    resolutionDue: due,
    waitSince: start,
    remainingMs: remaining,
  };
  assert.equal(timers(t, at("2026-02-02T12:00")).resolution.state, "PAUSED");
  assert.equal(
    iso(c.add(at("2026-01-30T18:00"), remaining)),
    iso(at("2026-02-02T11:00")),
  );
});
