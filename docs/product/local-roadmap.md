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
| LOCAL-09 | Teacher Compensation | DONE |
| LOCAL-10 | CRM | DONE |
| LOCAL-11 | Communication | DONE |
| LOCAL-12 | Parent / Student Portal | DONE |
| LOCAL-13 | Progress / Assessment | DONE |
| LOCAL-14 | Dashboard | NEXT |
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

## LOCAL-13 notes

Adds the tenant-scoped academic chain `Enrollment → Class → Assessment →
AssessmentResult → Progress Summary → ProgressReport → Parent / Student Portal`.
Assessments belong to concrete Classes and support the fixed assessment-type
vocabulary, SIMPLE and RUBRIC scoring, exact PostgreSQL `NUMERIC(8,2)` scores
exchanged as decimal strings, enrollment-safe bounded gradebook saves, derived
rubric totals, and database constraints/triggers for tenant-qualified entity
integrity and score bounds. Explicit publication freezes structure and ordinary
result edits; published corrections require `progress.publish`, a reason,
server-generated before/after revisions, row-lock serialization, and tenant
audit events. Append-only ProgressNotes remain staff-only. The central summary
reuses LOCAL-07 locked-attendance truth and computes an unweighted normalized
average from PUBLISHED + GRADED results only.

ProgressReports use DRAFT/PUBLISHED/SUPERSEDED lifecycle, authoritative
server-side previews, immutable versioned publication snapshots, and deliberate
replacement drafts that supersede the previous official report only when the
replacement publishes. Permissions are `progress.read`, `progress.write`, and
`progress.publish`: OWNER/CENTER_ADMIN/ACADEMIC_MANAGER receive all three,
TEACHER receives read/write, and STAFF/ACCOUNTANT/SALE receive none. Teacher
row-level ownership remains deferred because there is still no trustworthy
Teacher↔User mapping. Dedicated Portal projections reuse current PortalAccess
student authorization, expose only published current results/summaries and
published/superseded report snapshots, and never expose drafts, ProgressNotes,
correction reasons, revisions, or audit data.

The tenant migration passed fresh deployment, supported legacy upgrade,
catalog equivalence, drift rejection, idempotent rerun, tenant-qualified graph
constraints, exact-score constraints, result/criterion uniqueness, append-only
history, and report version invariants. Real PostgreSQL tests cover SIMPLE,
RUBRIC, TRIAL exclusion, cross-entity/tenant rejection, publish/write ordering,
serialized corrections, note privacy, report snapshot/replacement concurrency,
and portal IDOR. Repository typecheck, web/API builds, and the canonical
32-file/265-test suite passed. Browser acceptance covered Class assessment
creation, gradebook save, publication, explicit correction + revision history,
Student 360 summary/internal notes/report preview/publication, current corrected
Portal result, report history, internal-note exclusion, no console errors, and
no horizontal overflow at 390px, tablet, or desktop. LOCAL-14 remains
unimplemented.

## LOCAL-12 notes

Adds the parent/student portal as a separate authorization branch over the same
global User, JWT, hostname tenant resolution, and tenant databases:
`User → PortalAccess → Guardian/Student` never becomes a TenantMembership or
TenantRole. The control database gains PortalAccess (one row per tenant
subject, disable/re-enable/remove without touching the global User or staff
membership) and PortalInvitation (SHA-256 token hashes, 48h expiry, resend
revokes the previous token, subject advisory lock plus a partial unique
pending-subject index, conditional single-use acceptance so concurrent
acceptance yields exactly one access row). Guardian invitations and acceptance
validate the subject and its current normalized email inside the
hostname-resolved tenant database. Staff administration runs on the new
`portal.manage` permission (OWNER/CENTER_ADMIN/ACADEMIC_MANAGER only) with
control audit events for invite/resend/revoke/activate/disable/enable/remove;
the raw activation token is returned once and never persisted or logged.
Portal routes use an explicit `@PortalTenantRoute()` marker with a dedicated
PortalAccessGuard that re-derives accessible Students from current
StudentGuardian rows on every request, while `@TenantRoute()` staff
authorization remains unchanged and rejects portal-only users. Portal
projections are dedicated allowlisted DTOs: profile/enrollment summary,
bounded schedule filtered to current TRIAL/ACTIVE participation, LOCKED
attendance only (no notes, one shared summary formula), read-only makeup
status, billing visible only while the current relationship has
`isBillingContact = true` reusing the LOCAL-08 effective-ledger calculation,
and LOCAL-11 IN_APP messages filtered to the exact authenticated subject
recipient. The web app gains `/portal/*` routes with a lightweight
mobile-first shell, portal login/acceptance pages reusing the same
`/auth/login`, a child switcher, and a staff `/settings/portal-access` page
with one-time activation-link copying. Real PostgreSQL coverage includes
token hashing, new/existing-user acceptance, replay, resend revocation,
concurrent acceptance, dual staff/portal identity, relationship and
billing-contact revocation, recipient isolation, cross-tenant subject/Student
rejection, and an HTTP-level guard-pipeline test over the booted
application. Browser verification covered staff invite/resend/revoke/
disable/enable, new and existing-user activation, parent two-child switcher,
schedule, locked attendance, makeup, billing allow/deny, notifications,
student self-only access with direct billing/staff API denial, and
desktop/tablet/390px responsive checks with no horizontal overflow. The
control migration passed fresh deploy, LOCAL-11 upgrade on the local
database, and idempotent rerun; tenant schemas are unchanged and the tenant
equivalence gate still passes fresh/legacy/drift/idempotency. Repository
typecheck, build, and the full 30-file/255-test suite (including the
real-DB portal gates) passed. LOCAL-13 was not implemented.

## LOCAL-11 notes

Adds the tenant-scoped communication path from a fixed event registry through
recipient resolution, safe allowlisted templates, immutable rendered message
snapshots, durable `CommunicationMessage` rows, and `IN_APP` / `EMAIL` channel
adapters. Immediate integrations cover payment receipt, finalized absence,
reschedule, and cancellation without allowing communication failure to roll
back valid domain work; internal contracts cover session, tuition, trial, and
enrollment reminders for LOCAL-18 to schedule later. Tenant overrides support
preview, enable/disable, reset, and audit history. Recipient precedence,
missing-email handling, shared-mailbox dedupe, concurrent dispatch, immutable
retry, provider-error sanitization, permissions, and cross-tenant isolation are
covered by the real PostgreSQL acceptance suite. The Communication workspace,
message detail, templates, Student 360 history, and CRM Lead history were
browser-verified on the demo tenant, including a 390px narrow viewport with no
page overflow or application console errors (the existing missing favicon still
returns 404). The tenant schema gate passed fresh deployment,
supported upgrade, catalog equivalence, drift rejection, and idempotent rerun;
repository typechecks and builds passed, and the API suite passed 27 files / 245
tests. EMAIL remains the no-network `LOCAL` provider; automation remains
LOCAL-18 and external providers remain LOCAL-22. LOCAL-12 was not implemented.

## LOCAL-10 notes

Adds the CRM vertical slice over the existing academic system: Lead with
separate student/guardian prospect contacts, an explicit validated status
lifecycle (NEW → CONTACTED → QUALIFIED → TRIAL_BOOKED → TRIAL_COMPLETED →
WON/LOST) driven only by domain commands, sales assignment validated against
the control database (cross-DB membership is a validated scalar, not an FK),
next-follow-up with overdue/today/upcoming filters, append-only LeadNotes,
and LeadEvent as the business timeline alongside AuditEvent. Trials use the
real Session/TRIAL Enrollment/Attendance chain: booking materializes
Student + Guardian + StudentGuardian from lead data (no re-entry), respects
existing enrollment capacity, and one active booking per lead is index-
enforced; outcomes derive only from finalized AttendanceRecord (attended vs
NO_SHOW) and TRIAL absences no longer create makeup entitlements.
Conversion (direct, same-class promotion, or different-class re-enrollment
with source linkage) is one atomic transaction under lead row locks with
explicit duplicate reuse/create decisions and idempotent rejection after
WON. crm.read/crm.write gate everything; SALE stays out of direct
Student/Enrollment writes, and bounded CRM lookups replace broad academic
reads. The pipeline board, list, detail, notes, activity, follow-up, trial,
and conversion UI shipped and was browser-verified on the demo tenant. The
disposable PostgreSQL gate passed fresh deployment, LOCAL-09 upgrade, catalog
equivalence, LOCAL-10 constraint assertions, drift rejection, and idempotent
rerun; API tests passed (24 files, 206 tests) including real-PostgreSQL
integration coverage of the 16 acceptance scenarios (full path, no-show,
different-class, duplicates, lost, rebook, concurrency races, cross-tenant
attacks). LOCAL-11 remains planned and was not implemented.

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

## LOCAL-09 notes

Adds effective-dated teacher compensation agreements, explicit Class completion, completed-Session and completed-Class eligibility, integer-only VND calculation, unresolved configuration handling, period generation/regeneration, itemized statements, signed adjustments, finalization revalidation, immutable finalized history, tenant-qualified source constraints, compensation-specific permissions, audit events, and finance UI navigation. The disposable PostgreSQL schema gate passed fresh deployment, supported legacy upgrade, catalog equivalence, drift rejection, and idempotent rerun. API tests passed (22 files, 185 tests); API/web typechecks and production builds passed. Browser verification passed on the disposable `demo` tenant for workspace, agreements, generated statements, finalized read-only behavior, finance navigation, narrow viewport layout, and compensation API requests. LOCAL-10 remains planned and was not implemented.

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
