# Frontdesk

Frontdesk is Arvo Systems’ shared support queue. Express serves a React agent dashboard and JSON API. Sequelize stores tickets, customers, holidays, sessions, messages and audit history in PostgreSQL.

## Open this checkout

Open [the local dashboard](http://127.0.0.1:3000/) and sign in as **maya@arvo.example** with `DEMO_PASSWORD` from the project’s private `.env`. Open a ticket to claim it, reply, record an incoming customer message, add an internal note, change priority, or view its history.

From the project root, start the existing local database after a Windows reboot if needed, then run the app:

```powershell
pg_ctl -D .local/database -l .local/database.log -o "-h 127.0.0.1 -p 54541" -w start
npm.cmd start
```

If PostgreSQL is already running, skip the first command. Startup builds React, runs pending schema migrations, starts Express, and schedules cleanup. Use Ctrl+C to stop a foreground app. To stop this checkout's database, run `pg_ctl -D .local/database -m fast stop`.

## Fresh installation

1. Install Node 22.9+ and PostgreSQL. Create an empty application database and a separate integration-test database whose name ends in `_test`. The configured role needs schema creation and migration privileges.
2. From the repository root run `npm ci`. Copy `.env.example` to `.env` on a fresh checkout and configure the values below.
3. Run `npm run seed` for nine demonstration accounts and sample tickets. For individual accounts set the three `AGENT_*` variables and run `npm run agent:create` for each person.
4. Run `npm start`. For development, `npm run dev` watches the backend. Run `npm run build` after editing React, then refresh the browser. Dependencies are managed by the root lockfile.

| Environment | Purpose |
| --- | --- |
| DATABASE_URL | PostgreSQL URI. URL-encode special characters in credentials. |
| TEST_DATABASE_URL | Separate test database. Each suite creates its own fixtures. |
| HOST, PORT | Listen address and port. Local example uses 127.0.0.1 and 3000. |
| BUSINESS_ZONE | Calendar time zone, initially Asia/Kolkata. Restart after changing. |
| HOLIDAYS | Optional comma-separated ISO dates imported when the Holiday table is first created. Thereafter the table is authoritative. |
| DEMO_PASSWORD | Initial seed password, at least 12 characters. Repeated seeds preserve existing agent passwords. |
| AGENT_NAME, AGENT_EMAIL, AGENT_PASSWORD | Individual account provisioning inputs. Password length is 12–512 characters. |
| NODE_ENV | Set to production behind HTTPS to enable Secure session cookies. |
| BROWSER_CHANNEL | Optional Playwright channel for browser tests. Defaults to chrome. Edge uses msedge. |

The root `.env` and `.local` are excluded from Git. The backend uses salted scrypt password hashes, eight-hour HTTP-only SameSite sessions, and hashed customer and session tokens.

## Business rules

The business day runs Monday–Friday from 09:30 through 18:30, excluding dates in `holidays`. Store a local calendar date and optional name, then restart the service to load it. For example:

```sql
INSERT INTO holidays (date, name) VALUES ('2027-01-26', 'Republic Day')
ON CONFLICT (date) DO NOTHING;
```

| Priority | First public agent response | Resolution |
| --- | --- | --- |
| URGENT | 2 working hours | End of the working day on which work can begin |
| MEDIUM | 4.5 working hours | 27 working hours |
| LOW | 9 working hours | 45 working hours |

- An urgent ticket received Friday at 18:00 is due for resolution at 18:30 Friday. Its first response can fall on the next working day. Arrival at or after closing starts the clock at the next opening. An event exactly at its deadline is on time.
- Waiting requires a prior public agent response. Entering `WAITING_FOR_CUSTOMER` freezes the remaining working milliseconds for resolution. Recording a customer reply or explicitly resuming an active waiting ticket schedules its deadline using that balance. Notes do not change either clock.
- Five working days means 45 working hours from entry into waiting. The server checks at startup and every minute. Closure uses the five-day cutoff as its effective resolution time. Competing workers and incoming messages recheck the ticket under a row lock. A customer reply that arrives after the cutoff follows the reopening rules.
- A resolved ticket can reopen through the exact five-day boundary. Reopening gives the same ticket a fresh resolution period and preserves its first-response result and previous breaches. Later requests create a new ticket, link both histories, and retain the new customer message when supplied.
- A priority change gives outstanding targets a new budget at the new priority from the change time. A paused resolution remains paused with its new budget. Completed first responses retain their original deadline. Breach flags are sticky for the lifetime of the ticket, including across priority changes and reopening. History records the transition and the old and new deadlines.
- Agents share the team queue. Claim is serialized by a PostgreSQL row lock. A losing claimant receives 409. Ticket mutations, messages, follow-up creation, and audit events use the same transaction. PostgreSQL rejects audit updates, deletes, and truncation. Database owners and DDL privileges remain an administrative trust boundary.

## API

Prefix the paths below with `/api`. Send JSON bodies and the session cookie for agent requests. A successful ticket creation returns `{ticket, access}`. The customer-scoped token can be used by an integration. Ticket IDs in API paths are integers.

| Method and path | Request / result |
| --- | --- |
| POST /auth/login | email, password. Sets an agent session cookie. |
| GET /auth/me | Current agent ID, name, email. |
| POST /auth/logout | Empty JSON object. Revokes the session. |
| POST /customers | name, email. Gets or creates the contact identified by normalized email. |
| GET /customers | Agent-only contact directory. |
| POST /tickets | subject, description, priority and either customerId or customer name (field `customer`) plus email. |
| GET /tickets | Team tickets with separate SLA states. |
| GET /tickets/:id | Ticket, agent-visible messages, and audit trail. |
| PATCH /tickets/:id/claim | Claims an unassigned ticket for the current agent. |
| PATCH /tickets/:id/status | status is OPEN, WAITING_FOR_CUSTOMER, or RESOLVED. Use reopen for a resolved ticket. |
| PATCH /tickets/:id/priority | priority is URGENT, MEDIUM, or LOW. |
| PATCH /tickets/:id/reopen | Reopens the ticket or returns 201 and a new follow-up after expiry. |
| POST /tickets/:id/messages | type is PUBLIC or INTERNAL, plus body. Use source=customer for an agent-recorded incoming public reply. Audit identifies the recording agent. |
| GET /tickets/:id/messages | Agent conversation, including internal notes. |
| GET /tickets/:id/audit-logs | Ordered, agent-only append-only history. |
| GET /dashboard | Current agent, agent directory and team queues. |
| GET /customer/ticket, GET /customer/export | Customer-safe ticket and public messages, authorized by X-Ticket-Key. Export returns JSON as an attachment. |
| POST /customer/replies | X-Ticket-Key plus body. Records an incoming reply, resumes, reopens or creates a follow-up. |
| POST /tickets/:id/actions | Compatibility endpoint. Includes assign with integer or null agentId, and link to rotate a customer key. |

The agent-only message list can display both types. Customer reads and exports share an allowlisted projection and query only PUBLIC messages. Customer access is scoped to a single ticket. All errors return an error message. Common codes are 400 for invalid fields, 401 for an absent session, 404 for unknown tickets or keys, 409 for state conflicts, and 429 for throttled requests. The database health endpoint is `GET /health` outside the API prefix.

## Architecture and migration

The CommonJS backend lives in `backend/`. Individual model files preserve the existing Sequelize table names and fields. `models/index.js` declares associations and runs versioned migrations under a PostgreSQL advisory lock. The upgrade backfills customers from existing ticket snapshots, adds customer foreign keys, imports holidays, records remaining SLA time, renames status and message enum values, and carries forward known resolution breaches evidenced by legacy audit history. Existing waiting tickets begin pausing at upgrade; time previously charged under the earlier policy stays charged.

`controllers/` adapts HTTP, `routes/` defines the endpoints, `services/` owns ticket transitions, SLA arithmetic, messages and auditing, `middleware/` handles sessions and errors, and `jobs/ticketCleanupJob.js` runs inactivity closure. The React source is `frontend/main.jsx`. The build writes a local bundle into `public/`.

## Verification

```sh
npm test
npm run test:api
npm run test:browser
```

The first command checks working-hour arithmetic. The API suite uses a real PostgreSQL database and a temporary HTTP listener. It exercises claims, privacy, pause/resume, historical breaches, cleanup races, holiday records, the reopening boundary and audit immutability. The browser suite requires installed Chrome or Edge. It builds React, signs in, creates and claims a ticket, records private and public messages, pauses and resumes the SLA, resolves and reopens the ticket, reads history, and checks a mobile viewport.

## Hosting

For a hosted demonstration, create a Render Blueprint from this repository using `render.yaml`. It provisions a free Node web service and PostgreSQL database, builds the dashboard, and seeds nine demo accounts. After the health check passes, open the service URL and sign in as `maya@arvo.example` with the generated `DEMO_PASSWORD` from the service environment. Share that password privately with the reviewer. Use synthetic tickets in this shared-password demonstration. The free service sleeps when idle and processes overdue closures when it wakes.

Use a Node web service and managed PostgreSQL, for example on Render. Build with `npm ci && npm run build` and start with `node backend/server.js`. Supply DATABASE_URL, NODE_ENV=production and the business time zone through the host. Leave HOST unset, use the host-provided port, and configure /health. Use an always-on service for predictable cleanup timing and a persistent database with backups for live operations. [Render Express deployment](https://render.com/docs/deploy-node-express-app) · [Render free-tier limits](https://render.com/docs/free)

See [delivery notes](LIMITATIONS.md) for operational limits.
