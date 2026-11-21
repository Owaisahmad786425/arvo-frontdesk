import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

const labels = {
  OPEN: "Open",
  WAITING_FOR_CUSTOMER: "Waiting for customer",
  RESOLVED: "Resolved",
  URGENT: "Urgent",
  MEDIUM: "Medium",
  LOW: "Low",
  MET: "Met",
  MISSED: "Missed",
  OVERDUE: "Overdue",
  ON_TRACK: "On track",
  PAUSED: "Paused",
};
const groups = [
  "All tickets",
  "My tickets",
  "Unassigned",
  "Overdue",
  "Waiting",
];
const icons = ["▦", "◉", "◇", "◷", "◌"];
const matches = (t, g, agentId) =>
  g === groups[0] ||
  (g === "My tickets" && t.agentId === agentId) ||
  (g === "Unassigned" && t.agentId == null) ||
  (g === "Overdue" &&
    Object.values(t.sla).some((s) => s.state === "OVERDUE")) ||
  (g === "Waiting" && t.status === "WAITING_FOR_CUSTOMER");
const num = (id) => "FD-" + String(id).padStart(4, "0");
const date = (t) =>
  new Date(t).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
const fields = (form) => Object.fromEntries(new FormData(form));
async function api(path, method = "GET", body) {
  const r = await fetch("/api" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = r.status === 204 ? null : await r.json();
  if (!r.ok)
    throw Object.assign(Error(d?.error || "Request failed"), {
      status: r.status,
    });
  return d;
}
function Brand() {
  return (
    <span className="brand">
      <i className="mark" aria-hidden="true" />
      Frontdesk
    </span>
  );
}
function Badge({ value }) {
  return (
    <span
      className={
        "badge " + (value === "WAITING_FOR_CUSTOMER" ? "WAITING" : value)
      }
    >
      {labels[value] || value}
    </span>
  );
}
function Login({ submit, busy }) {
  return (
    <div className="login">
      <section className="identity">
        <Brand />
        <div className="loginArt" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div>
          <div className="eyebrow">ARVO SYSTEMS</div>
          <h1>
            Support
            <br />
            workspace<span>.</span>
          </h1>
        </div>
      </section>
      <section className="sign">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(fields(e.currentTarget));
          }}
        >
          <div className="eyebrow">AGENT ACCESS</div>
          <h2>Welcome back</h2>
          <label>
            Email address
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="primary" disabled={busy}>
            Sign in
          </button>
        </form>
      </section>
    </div>
  );
}
function Modal({ children, close, error }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.showModal();
  }, []);
  return (
    <dialog ref={ref} aria-label="Ticket workspace" onCancel={close}>
      <button className="close" aria-label="Close dialog" onClick={close}>
        ×
      </button>
      {error && (
        <p role="alert" className="dialogNotice">
          {error}
        </p>
      )}
      {children}
    </dialog>
  );
}
function NewTicket({ submit, busy }) {
  return (
    <>
      <h2>New ticket</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(fields(e.currentTarget));
        }}
      >
        <label>
          Subject
          <input name="subject" maxLength="180" required />
        </label>
        <label>
          Description
          <textarea name="description" maxLength="8000" required />
        </label>
        <div className="pair">
          <label>
            Customer name
            <input name="customer" maxLength="120" required />
          </label>
          <label>
            Customer email
            <input name="email" type="email" required />
          </label>
        </div>
        <label>
          Priority
          <select name="priority" defaultValue="MEDIUM">
            {["URGENT", "MEDIUM", "LOW"].map((p) => (
              <option key={p} value={p}>
                {labels[p]}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" disabled={busy}>
          Create ticket
        </button>
      </form>
    </>
  );
}
function Detail({ t, owner, agentId, update, busy }) {
  const [body, setBody] = useState(""),
    [kind, setKind] = useState("PUBLIC");
  const base = "/tickets/" + t.id;
  function patch(op, payload = {}) {
    update(base + "/" + op, "PATCH", payload);
  }
  return (
    <>
      <div className="eyebrow">{num(t.id)}</div>
      <h2>{t.subject}</h2>
      <p>
        {t.customer} · {t.email}
      </p>
      <p className="message">{t.description}</p>
      <Badge value={t.status} />
      <p>Assigned to {owner(t.agentId)}</p>
      <div className="pair deadlines">
        {Object.entries(t.sla).map(([k, s]) => (
          <div key={k}>
            <strong>
              {k === "resolution" ? "Resolution" : "First response"}
            </strong>
            <Badge value={s.state} />
            <small>
              {s.due
                ? date(s.due)
                : Math.ceil(s.remainingMs / 60000) +
                  " working minutes remaining"}
            </small>
          </div>
        ))}
      </div>
      <label>
        Priority
        <select
          value={t.priority}
          disabled={busy || !!t.resolvedAt}
          onChange={(e) => patch("priority", { priority: e.target.value })}
        >
          {["URGENT", "MEDIUM", "LOW"].map((p) => (
            <option key={p} value={p}>
              {labels[p]}
            </option>
          ))}
        </select>
      </label>
      <div className="actions">
        {!t.agentId && (
          <button disabled={busy} onClick={() => patch("claim")}>
            Claim ticket
          </button>
        )}
        {t.status === "OPEN" && t.firstAt && (
          <button
            disabled={busy}
            onClick={() => patch("status", { status: "WAITING_FOR_CUSTOMER" })}
          >
            Wait for customer
          </button>
        )}
        {t.status === "WAITING_FOR_CUSTOMER" && (
          <button
            disabled={busy}
            onClick={() => patch("status", { status: "OPEN" })}
          >
            Resume ticket
          </button>
        )}
        {!t.resolvedAt && t.firstAt && (
          <button
            disabled={busy}
            onClick={() => patch("status", { status: "RESOLVED" })}
          >
            Resolve
          </button>
        )}
        {t.resolvedAt && (
          <button disabled={busy} onClick={() => patch("reopen")}>
            {Date.now() > Date.parse(t.reopenUntil)
              ? "Create follow-up ticket"
              : "Reopen ticket"}
          </button>
        )}
      </div>
      <h3>Conversation</h3>
      {t.messages.length === 0 && <p>No messages yet.</p>}
      {t.messages.map((m) => (
        <article key={m.id} className={m.kind === "INTERNAL" ? "private" : ""}>
          <small>
            {m.kind === "INTERNAL" ? "Internal note" : "Public reply"} ·{" "}
            {m.author} · {date(m.at)}
          </small>
          <p className="message">{m.body}</p>
        </article>
      ))}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await update(base + "/messages", "POST", {
              body,
              type: kind === "INTERNAL" ? "INTERNAL" : "PUBLIC",
              source: kind === "incoming" ? "customer" : "agent",
            })
          )
            setBody("");
        }}
      >
        <label>
          Message type
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="PUBLIC">Public agent reply</option>
            <option value="INTERNAL">Private internal note</option>
            <option value="incoming">Incoming customer reply</option>
          </select>
        </label>
        <label>
          Message
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength="8000"
            required
          />
        </label>
        <button
          disabled={
            busy ||
            (kind === "PUBLIC" &&
              (t.resolvedAt || (t.agentId !== null && t.agentId !== agentId)))
          }
          className="primary"
        >
          Add message
        </button>
      </form>
      <details>
        <summary>Ticket history ({t.audit.length})</summary>
        {t.audit.map((a) => (
          <article key={a.id}>
            <strong>{a.event.replaceAll("_", " ").toLowerCase()}</strong>
            <small>
              {a.actor} · {date(a.at)}
            </small>
            <code>{JSON.stringify(a.changes)}</code>
          </article>
        ))}
      </details>
    </>
  );
}
function App() {
  const [data, setData] = useState(null),
    [ready, setReady] = useState(false),
    [group, setGroup] = useState(groups[0]),
    [query, setQuery] = useState(""),
    [modal, setModal] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = async () => setData(await api("/dashboard"));
  function handle(e) {
    if (e.status === 401) {
      setData(null);
      setModal(null);
    }
    setError(e.message);
  }
  useEffect(() => {
    refresh()
      .catch((e) => {
        if (e.status !== 401) handle(e);
      })
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!data || modal) return;
    const timer = setInterval(() => refresh().catch(handle), 60000);
    return () => clearInterval(timer);
  }, [!!data, !!modal]);
  async function run(work) {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await work();
      return true;
    } catch (e) {
      handle(e);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const owner = (id) =>
    data?.agents.find((a) => a.id === id)?.name || "Unassigned";
  const open = (id) => run(async () => setModal(await api("/tickets/" + id)));
  const mutate = (path, method, body) =>
    run(async () => {
      const result = await api(path, method, body);
      setModal(await api("/tickets/" + (result.ticket?.id || result.id)));
      await refresh();
    });
  if (!ready) return <p>Loading workspace…</p>;
  const count = (g) =>
    data.tickets.filter((t) => matches(t, g, data.me.id)).length;
  return (
    <>
      {!data ? (
        <Login
          busy={busy}
          submit={(body) =>
            run(async () => {
              await api("/auth/login", "POST", body);
              await refresh();
            })
          }
        />
      ) : (
        <div className="shell">
          <aside>
            <Brand />
            <div className="workspace">
              Arvo Systems<small>Support workspace</small>
            </div>
            <div className="eyebrow">TICKET QUEUES</div>
            <nav>
              {groups.map((g, i) => (
                <button
                  key={g}
                  onClick={() => setGroup(g)}
                  className={group === g ? "selected" : ""}
                >
                  <span aria-hidden="true">{icons[i]}</span>
                  {g}
                  <b>{count(g)}</b>
                </button>
              ))}
            </nav>
            <div className="account">
              <strong>{data.me.name}</strong>
              <button
                onClick={() =>
                  run(async () => {
                    await api("/auth/logout", "POST", {});
                    setData(null);
                    setQuery("");
                  })
                }
              >
                Sign out
              </button>
            </div>
          </aside>
          <main>
            <header>
              <span>Workspace &nbsp; / &nbsp; Tickets</span>
              <div className="avatar">{data.me.name[0]}</div>
            </header>
            <section className="content">
              <div className="heading">
                <div>
                  <div className="eyebrow">SUPPORT OPERATIONS</div>
                  <h1>Ticket overview</h1>
                </div>
                <button
                  className="primary"
                  onClick={() => {
                    setError("");
                    setModal("new");
                  }}
                >
                  ＋ New ticket
                </button>
              </div>
              <div className="metrics">
                {groups.slice(1).map((g, i) => (
                  <button key={g} onClick={() => setGroup(g)}>
                    <span>{g}</span>
                    <strong>{count(g)}</strong>
                    <i aria-hidden="true">{icons[i + 1]}</i>
                  </button>
                ))}
              </div>
              <section className="queue">
                <div className="toolbar">
                  <h2>{group}</h2>
                  <input
                    aria-label="Search tickets"
                    placeholder="Search tickets…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="scroll">
                  <table>
                    <thead>
                      <tr>
                        {[
                          "Ticket / Customer",
                          "Priority",
                          "Status",
                          "Assignee",
                          "First response",
                          "Resolution",
                        ].map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.tickets
                        .filter(
                          (t) =>
                            matches(t, group, data.me.id) &&
                            [num(t.id), t.subject, t.customer, owner(t.agentId)]
                              .join(" ")
                              .toLowerCase()
                              .includes(query.toLowerCase()),
                        )
                        .map((t) => (
                          <tr key={t.id}>
                            <td>
                              <small>
                                {num(t.id)} · {t.customer}
                              </small>
                              <button
                                className="subject"
                                onClick={() => open(t.id)}
                              >
                                {t.subject}
                              </button>
                            </td>
                            <td>
                              <Badge value={t.priority} />
                            </td>
                            <td>
                              <Badge value={t.status} />
                            </td>
                            <td>{owner(t.agentId)}</td>
                            <td>
                              <Badge value={t.sla.firstResponse.state} />
                            </td>
                            <td>
                              <Badge value={t.sla.resolution.state} />
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </section>
          </main>
        </div>
      )}
      {modal && (
        <Modal
          error={error}
          close={() => {
            setModal(null);
            setError("");
          }}
        >
          {modal === "new" ? (
            <NewTicket
              busy={busy}
              submit={(body) => mutate("/tickets", "POST", body)}
            />
          ) : (
            <Detail
              key={modal.id}
              t={modal}
              agentId={data.me.id}
              owner={owner}
              update={mutate}
              busy={busy}
            />
          )}
        </Modal>
      )}
      {error && !modal && (
        <div id="notice" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
