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
| LOCAL-06 | Scheduling + Session Engine | Planned |
| LOCAL-07 | Attendance + Makeup | Planned |
| LOCAL-08 | Billing / Tuition | Planned |
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
