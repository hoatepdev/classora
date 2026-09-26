# LOCAL-11 — Communication & Notifications

## Scope

LOCAL-11 defines **how** Classora resolves, renders, persists, and delivers transactional communications:

```text
Domain Event
→ Recipient Resolution
→ Effective Template
→ Rendered Message Snapshot
→ CommunicationMessage
→ Channel Adapter
```

It does not schedule automated work or connect external providers:

- LOCAL-11 owns **how** a communication is produced and delivered.
- LOCAL-18 owns **when** time-based communications run.
- LOCAL-22 owns **which** external email, SMS, or messaging provider is used.

No public dispatch API is exposed to the browser.

## Event Registry

Immediate events are created by their owning domain transaction:

| Event | Source | Integration |
|---|---|---|
| `PAYMENT_RECEIVED` | Payment | Invoice payment recording |
| `ATTENDANCE_ABSENCE` | Finalized Session / AttendanceRecord | Attendance finalization |
| `SCHEDULE_CHANGED` | Session | Reschedule and cancellation |

Time-based events expose internal service contracts for LOCAL-18:

| Event | Source eligibility |
|---|---|
| `SESSION_REMINDER` | Scheduled Session |
| `TUITION_DUE` | Issued invoice with an outstanding, non-overdue balance |
| `TUITION_OVERDUE` | Issued invoice with an outstanding overdue balance |
| `TRIAL_REMINDER` | Booked trial on an upcoming scheduled Session |
| `ENROLLMENT_EXPIRING` | Active Enrollment with `expectedEndDate` |

LOCAL-11 does not include cron, queues, or automation rules. The enrollment-expiring contract relies on `expectedEndDate`; LOCAL-18 decides which eligible records are due for dispatch.

## Channels and Provider Semantics

Supported channels:

- `IN_APP`: the persisted `CommunicationMessage` is the notification. No external side effect occurs.
- `EMAIL`: routed through the deterministic `LOCAL` adapter. It performs no network request.

For provider `LOCAL`, `SENT` means the adapter accepted the message. It does not mean delivery to a real mailbox. A real provider and its operational delivery model belong to LOCAL-22.

Message statuses are `PENDING`, `SENT`, `FAILED`, and `CANCELLED`.

## Templates

Every event and channel has a built-in default. A tenant may create one override per `(eventType, channel)` and may edit, disable, re-enable, preview, or reset it.

A disabled tenant override disables that event/channel. Reset deletes the override and restores the built-in default.

Templates use only allowlisted flat placeholders such as `{{studentName}}` and `{{invoiceNumber}}`. Rendering provides no evaluation, code execution, loops, arbitrary object access, or rich HTML. Unknown variables, missing required context, blank bodies, and missing email subjects are rejected. Preview uses fixed safe fixture data and sends nothing.

Rendered subject and body are immutable message snapshots. Later template changes do not alter existing messages.

## Recipient Resolution

Billing events select:

1. billing-contact guardians;
2. otherwise the primary guardian;
3. otherwise the student.

Academic events select:

1. the primary guardian;
2. otherwise the student.

Trial reminders prefer the materialized Guardian or Student attached to the `TrialBooking`. Lead contact data is a fallback only when no materialized contact exists.

A recipient without an email address still receives an `IN_APP` message. Only the `EMAIL` row is skipped. Classora does not guess another guardian, route to staff, or substitute an unrelated contact.

Email destinations are normalized by trimming and lowercasing. Shared guardian mailboxes deduplicate to one logical email for the same source event and include the relevant student names in the safe context. Financial details are sent only through billing-contact, primary-contact, or student fallback rules.

## Persistence, Dedupe, and Retry

`communication_messages` is the durable communication intent. Domain integrations insert message rows inside the business transaction under a savepoint. Planning or rendering failure rolls back only the communication savepoint and cannot roll back a valid payment, attendance finalization, reschedule, or cancellation.

Delivery runs after the business transaction commits. The local adapter result updates the existing message row:

- success → `SENT`, provider metadata, `sentAt`, incremented attempts;
- failure → `FAILED`, sanitized bounded error, `failedAt`, incremented attempts.

The unique `(tenantId, dedupeKey)` constraint and `ON CONFLICT DO NOTHING` make concurrent or repeated dispatch idempotent. The key includes event, source entity, optional scope, logical recipient/destination, and channel.

Manual retry accepts only `PENDING` or `FAILED`. It keeps the same message ID, destination, subject, and body, locks the row, and performs one serialized local delivery attempt. `SENT` and `CANCELLED` messages cannot be retried. Retry requests are audited in the same transaction as the validated attempt.

Holding the row lock while sending is intentionally limited to the local no-network adapters. LOCAL-22 must move a real provider to a claim/in-flight worker model rather than holding a database transaction over network I/O.

## Authorization and Audit

Permissions:

- `communication.read`: history, message detail, templates, and preview.
- `communication.manage`: template changes and manual retry.

The current role matrix grants these through the existing full-permission OWNER and CENTER_ADMIN roles only. Domain actions do not require communication permissions; for example, an authorized billing collector can record a payment while communication generation remains an internal side effect.

Audited actions:

- `communication.template_updated`
- `communication.template_reset`
- `communication.template_enabled`
- `communication.template_disabled`
- `communication.retry_requested`

## Tenant Isolation and Privacy

Every API route follows authenticated identity, trusted hostname tenant resolution, active membership authorization, permission authorization, and tenant database resolution before querying tenant data.

Every communication query is scoped by the trusted tenant context. Event resolvers qualify joins by `tenant_id`; history, detail, retry, templates, and dedupe are tenant-scoped. Client-supplied tenant identifiers and database selectors are not accepted.

Normal application logs never include recipient email addresses, message bodies, guardian phones, or lead contacts. Delivery failures are sanitized and truncated before persistence or logging. Provider credentials, tokens, connection strings, and stack traces are never stored in communication records.

## User Interface

The communication workspace provides:

- filterable, cursor-paginated history;
- message detail with immutable content, delivery state, attempts, related entity, and sanitized failure;
- manual retry for eligible messages;
- tenant template management, safe preview, enable/disable, and reset;
- read-only Student 360 and CRM Lead communication history.

The UI is Vietnamese-first, permission-aware, and states the LOCAL provider semantics explicitly.

## Verification

LOCAL-11 is covered by renderer and authorization tests plus a real PostgreSQL acceptance suite for immediate and time-based events, recipient rules, template isolation, snapshot immutability, failure/retry behavior, concurrent dedupe, tenant isolation, database constraints, audit actions, and history filtering/pagination. The tenant schema gate verifies fresh deployment, supported upgrade, catalog equivalence, drift rejection, and idempotent rerun.
