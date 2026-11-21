const { DateTime, IANAZone } = require("luxon");

const hour = 3600000;
const day = 9 * hour;
const response = { URGENT: 2 * hour, MEDIUM: day / 2, LOW: day };
function calendar(
  zone = process.env.BUSINESS_ZONE || "Asia/Kolkata",
  holidays = (process.env.HOLIDAYS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
) {
  if (!IANAZone.isValidZone(zone)) throw Error("Invalid BUSINESS_ZONE");
  const excluded = new Set(holidays);
  for (const date of excluded) {
    if (DateTime.fromISO(date).toISODate() !== date)
      throw Error("Invalid holiday date");
  }
  const local = (date) => DateTime.fromJSDate(new Date(date), { zone });
  function next(date) {
    let t = local(date);
    if (!t.isValid) throw Error("Invalid timestamp");
    for (;;) {
      const open = t.startOf("day").plus({ hours: 9, minutes: 30 });
      const close = open.plus({ hours: 9 });
      if (t.weekday <= 5 && !excluded.has(t.toISODate()) && t < close) {
        return { start: Math.max(+t, +open), end: +close };
      }
      t = t.plus({ days: 1 }).startOf("day");
    }
  }
  function add(date, ms) {
    let cursor = +new Date(date);
    while (ms > 0) {
      const { start, end } = next(cursor);
      if (ms <= end - start) return new Date(start + ms);
      ms -= end - start;
      cursor = end;
    }
    return new Date(cursor);
  }
  function deadlines(from, priority) {
    return {
      firstDue: add(from, response[priority]),
      resolutionDue:
        priority === "URGENT"
          ? new Date(next(from).end)
          : add(from, (priority === "MEDIUM" ? 3 : 5) * day),
    };
  }
  return {
    add,
    deadlines,
    workingMs(from, to) {
      let cursor = +new Date(from),
        total = 0;
      while (cursor < +to) {
        const { start, end } = next(cursor);
        total += Math.max(0, Math.min(end, +to) - start);
        cursor = end;
      }
      return total;
    },
  };
}
let clock = calendar();
function configure(dates) {
  clock = calendar(process.env.BUSINESS_ZONE, dates);
}

function timers(t, now = new Date()) {
  function timer(due, done, breached) {
    const late = breached || +new Date(done || now) > +new Date(due);
    return {
      due,
      state: done ? (late ? "MISSED" : "MET") : late ? "OVERDUE" : "ON_TRACK",
    };
  }
  return {
    firstResponse: timer(t.firstDue, t.firstAt, t.firstBreached),
    resolution: t.waitSince
      ? {
          due: null,
          state: t.resolutionBreached ? "OVERDUE" : "PAUSED",
          remainingMs: Number(t.remainingMs),
        }
      : timer(t.resolutionDue, t.resolvedAt, t.resolutionBreached),
  };
}

module.exports = {
  calendar,
  day,
  timers,
  configure,
  get clock() {
    return clock;
  },
};
