# ADR 0006: Enrollment lifecycle

## Decision

Enrollment is the authoritative Student–Class relationship. Operational statuses are `PENDING`, `TRIAL`, `ACTIVE`, and `PAUSED`; terminal statuses are `COMPLETED`, `WITHDRAWN`, and `CANCELLED`. The database partial unique index prevents more than one operational enrollment for the same student and class.

Lifecycle commands are explicit REST actions and write the Enrollment row, an `EnrollmentEvent`, and the tenant `AuditEvent` in one transaction. Capacity-consuming statuses are `PENDING`, `TRIAL`, `ACTIVE`, and `PAUSED`; the class row is locked before counting seats.

Transfers close the source enrollment as `WITHDRAWN` and create a destination enrollment linked by `sourceEnrollmentId`. Re-enrollment creates a new enrollment and does not reopen terminal history. Enrollment history is domain history; AuditEvent remains security/operational history.

Classes cannot change `branchId` or `courseLevelId` after any enrollment history exists. Tenant scope is always resolved from the trusted host and membership flow; request IDs are never accepted as tenant selectors.

## Transition diagram

```text
PENDING ── ACTIVE ── PAUSED ── ACTIVE
   │         │          └────── WITHDRAWN
   │         ├── COMPLETED
   │         └── WITHDRAWN
   ├── TRIAL ── ACTIVE
   │      ├── CANCELLED
   │      └── WITHDRAWN
   └── CANCELLED
```

Terminal records remain readable and require re-enrollment for future participation.
