# Delivery notes

The agent workflows passed the local calendar, PostgreSQL API, and desktop/mobile browser tests. The Render Blueprint is ready. Hosted verification and the one-week availability period are pending Render sign-in.

- Incoming customer replies can be recorded by an agent or posted with a per-ticket integration key. Connecting a real email or WhatsApp provider would require separate provider credentials.
- The cleanup job runs inside the Express process. A sleeping or stopped host catches up at startup. Closure records both its effective cutoff and the processing time when they differ.
- The dashboard loads the team queue in one response. Large historical datasets would benefit from server-side pagination.
- Holiday edits take effect on restart. Existing absolute deadlines keep their original dates. New calculations use the loaded calendar.
- The migration preserves the recorded audit history. Legacy first-response deadlines overwritten by an earlier priority change cannot be reconstructed if the old system never recorded them.
