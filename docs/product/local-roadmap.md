# Classora Local Roadmap

Execution ledger for the local product roadmap. LOCAL-00 is the foundation
verification gate; later work must not be started until its hard gates pass.

| ID | Stage | Status |
|---|---|---|
| LOCAL-00 | Baseline & Foundation Verification | DONE |
| LOCAL-01 | Identity, Authorization & Team | DONE |
| LOCAL-02 | Audit Log | DONE |
| LOCAL-03 | Student 360 + Guardians | DONE |
| LOCAL-04 | Branch + Room + Teacher/Course completion | DONE |
| LOCAL-05 | Enrollment Lifecycle | DONE |
| LOCAL-06 | Scheduling + Session Engine | DONE |
| LOCAL-07 | Attendance + Makeup | DONE |
| LOCAL-08 | Billing / Tuition | DONE |
| LOCAL-09 | Teacher Compensation | Planned |
| LOCAL-10 | CRM | Planned |
| LOCAL-11 | Communication | Planned |
| LOCAL-12 | Parent / Student Portal | Planned |
| LOCAL-13 | Progress / Assessment | Planned |
| LOCAL-14 | Dashboard | Planned |
| LOCAL-15 | Reporting | Planned |
| LOCAL-16 | Import / Export | Planned |
| LOCAL-17 | Files | Planned |
| LOCAL-18 | Automations | Planned |
| LOCAL-19 | Multi-branch | Planned |
| LOCAL-20 | Tenant Administration | Planned |
| LOCAL-21 | SaaS Plans / Entitlements | Planned |
| LOCAL-22 | Integrations | Planned |
| LOCAL-23 | AI Features | Planned |
| LOCAL-24 | UX Consistency Pass | Planned |
| LOCAL-25 | Full Local Acceptance | Planned |

## LOCAL-04 notes

Adds operational Branch and managed Room records, Teacher specialties and
Branch assignments, ordered CourseLevels, and relationship-aware Class fields.
All mutations write transactional audit events on the same connection, and
cross-tenant relationships are rejected by composite foreign keys. The
disposable PostgreSQL gate passed (fresh/legacy equivalence, drift rejection,
idempotent rerun, cross-tenant composite-FK rejection). Branch is now an
operational data dimension, but branch-scoped authorization remains deferred
to LOCAL-19. The existing free-text schedule room is unchanged; a Class
default Room is not occurrence scheduling.

## LOCAL-08 notes

Adds tenant-scoped pricing plans, effective-dated enrollment pricing, immutable
invoice discount snapshots, issue-time tenant-local invoice and credit-note
numbering, partial and multi-invoice payment allocations, unallocated customer
credit, reversals, allocated refunds, credit notes, receivables, and historical
`asOf` invoice balances/status. Financial ledgers and status history are
append-only, issued invoices and items are immutable, money remains BIGINT in
PostgreSQL and decimal strings at API boundaries, and every mutation writes its
audit event on the same tenant transaction. Permissions separate billing read,
management, collection, refund, and finance reporting. The billing workspace
and Student 360 billing section use the real API and gate visibility with
`billing.read`. Cross-tenant access, concurrent numbering/allocation,
idempotent retries, refund and credit-note accounting, append-only constraints,
and historical balances are covered by the real PostgreSQL integration suite.
API tests passed (21 files, 180 tests); API/web typechecks and builds passed; the
disposable PostgreSQL gate passed fresh deployment, supported legacy upgrade,
catalog equivalence, drift rejection, and idempotent rerun. The web build retains
the existing non-blocking chunk-size warning.

## LOCAL-07 notes

Adds attendance sheets with OPEN/LOCKED finalization over the authoritative Session
occurrence model. Rosters snapshot TRIAL/ACTIVE enrollments idempotently, ordinary
writes stop after lock, and corrections require attendance.correct permission plus
an append-only reasoned history and audit event. Excused absences create expiring
makeup entitlements; bookings, cancellation, rebooking, use, no-show reconciliation,
academic compatibility, unique-student capacity, destination cancellation, and
rescheduling preserve tenant-qualified history under transactional row locks. The
Student 360 attendance section exposes history and the makeup entitlement workflow,
using the existing Session calendar endpoint for destination selection. API and web
typechecks, builds, and the full API suite passed (19 files, 140 tests). The disposable
PostgreSQL gate passed (fresh/legacy catalog equivalence, LOCAL-07 constraint
assertions — cross-tenant sheet/entitlement rejection, booking composite-FK integrity,
makeup status CHECK, duplicate-active-booking index — drift rejection, idempotent
rerun). Makeup concurrency is guaranteed by transactional FOR UPDATE row locks plus
those B5-verified partial unique indexes and composite foreign keys; the real-database
integration suite already covers two-client scheduling races.

## LOCAL-06 notes

Replaces the legacy weekly schedule and attendance-session rows with one
authoritative Class -> SchedulePattern -> Session occurrence path, evolving the
existing tables in place while preserving every legacy ID and AttendanceRecord
link. Generation is deterministic, bounded, intersects class lifecycle dates
and pattern effective ranges, and is idempotent through a partial
generated-occurrence uniqueness constraint. Conflicts use half-open intervals
across class, teacher, and room for operational sessions only; adjacent
sessions are allowed. Manual overrides preserve the source slot and survive
regeneration; cancellation and rescheduling keep history rows (a replacement
copies the roster and links back to its origin). All writes run in one
transaction under a per-tenant advisory lock; exclusions are tenant-wide or
branch-scoped with unique dates. schedule.read/schedule.write gate every
endpoint, sensitive actions write audit events, and calendar and detail
integrations use bounded filtered queries. The disposable PostgreSQL gate
passed (fresh/legacy catalog equivalence, LOCAL-06 constraint assertions,
drift rejection, idempotent rerun), and a real-database integration suite
covers generation, exclusions, overrides, lifecycle, conflicts, cross-tenant
isolation, and two-client races asserting one valid outcome or a domain
conflict with no partial state.

## LOCAL-05 notes

Adds an explicit enrollment lifecycle: PENDING/TRIAL/ACTIVE/PAUSED operational
statuses and COMPLETED/WITHDRAWN/CANCELLED terminal statuses, driven by
dedicated command routes with an allowed-transition map instead of arbitrary
status writes. Each command writes the enrollment, an EnrollmentEvent history
record, and an audit event in one transaction with row locks and capacity
checks. A partial unique index allows one operational enrollment per
student+class while preserving full history, and composite foreign keys keep
enrollments, source-enrollment links, and events tenant-bound. The disposable
PostgreSQL gate passed for both a fresh tenant and a supported legacy upgrade
(fresh/legacy catalog equivalence, LOCAL-05 constraint assertions, drift
rejection, idempotent rerun). Re-enrollment always creates a new enrollment
linked via source_enrollment_id; terminal rows are never reopened.

## LOCAL-00 notes

Verified foundation areas include the locked dependency install, TypeScript
checks, web/API builds, API tests, tenant hostname authorization ordering,
provisioning failure handling, migration fail-closed behavior, and the
same-origin gateway contract. The disposable Compose smoke remains the
real-database acceptance path.

Non-blocking follow-up: configure a repository lint policy/toolchain and add
focused web tests when a concrete frontend regression boundary exists.
