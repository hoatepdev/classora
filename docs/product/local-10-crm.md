# LOCAL-10 — CRM / Lead-to-Enrollment

Adds the sales-side vertical slice: Lead capture, assignment, follow-up,
qualification, trial over the real academic system, and conversion into
Student + Guardian + Enrollment without re-entering prospect data.

## Product chain

```text
Lead
  ↓ contact / qualify
QUALIFIED
  ↓ TrialBooking (materializes Student + Guardian + TRIAL Enrollment)
Session (real, from Class → SchedulePattern → Session)
  ↓ attendance marked + finalized
Trial Outcome (from finalized AttendanceRecord only)
  ↓ convert
Student + Guardian + Enrollment (existing modules)
  ↓
WON
```

Direct sales skip the trial: `Lead → QUALIFIED → convert → WON`.

After conversion, Student, Guardian, Enrollment, Session, Attendance, and
Billing remain owned by their existing modules; CRM never duplicates them.

## Model

- **Lead** — tenant-scoped prospect. Separate student contact fields
  (`studentName/Phone/Email`) and optional guardian contact fields
  (`guardianName/Phone/Email`); a lead phone is never implicitly the student
  or guardian phone. Controlled `source` vocabulary
  (REFERRAL/FACEBOOK/GOOGLE/WALK_IN/EXISTING_CUSTOMER/OTHER) plus free-text
  `campaign`. Interest references (`interestedCourseId`,
  `interestedCourseLevelId`, `preferredBranchId`) are tenant-qualified
  foreign keys. `assignedMembershipId` is a validated scalar (see
  Assignment). `nextFollowUpAt` stores the next follow-up.
- **LeadNote** — append-only internal staff notes with author snapshot.
- **LeadEvent** — the business CRM timeline (created/assigned/contacted/
  qualified/follow-up/note/trial events/converted/lost) with from/to status.
  This is domain history visible to `crm.read`; it does not replace
  AuditEvent, which remains the security/operational audit trail.
- **TrialBooking** — one lead's trial participation: real `sessionId`, the
  materialized `studentId`, optional `guardianId`, and the real
  `trialEnrollmentId`. Status `BOOKED/COMPLETED/NO_SHOW/CANCELLED`; outcome
  `ENROLL/FOLLOW_UP/LOST` recorded after attendance finalization. A partial
  unique index allows one active `BOOKED` booking per lead; cancelled and
  concluded bookings are preserved as history.

Database constraints enforce: `LOST` requires a `lostReason`; `WON` requires a
`convertedEnrollmentId`; converted links exist only on terminal leads; booking
status/timestamp coherence; tenant-qualified composite foreign keys for every
relationship. `assignedMembershipId` cannot have a foreign key because
TenantMembership lives in the control database while Lead lives in the tenant
database — the boundary is enforced by application validation instead.

## Lead lifecycle

```text
NEW          → CONTACTED | QUALIFIED | LOST
CONTACTED    → QUALIFIED | LOST
QUALIFIED    → TRIAL_BOOKED | WON | LOST
TRIAL_BOOKED → TRIAL_COMPLETED | QUALIFIED | LOST
TRIAL_COMPLETED → WON | QUALIFIED | LOST
WON, LOST    terminal
```

Driven by explicit commands (`POST /leads/:id/contact|qualify|lost|convert`),
never by status patches; `PATCH /leads/:id` edits non-lifecycle fields only.
`TRIAL_BOOKED` arises only from a successful booking, `TRIAL_COMPLETED` only
from an outcome over finalized attendance, `WON` only from conversion, and
`LOST` only from the explicit lost command with a controlled reason
(PRICE/SCHEDULE/NO_RESPONSE/COMPETITOR/NOT_INTERESTED/LOCATION/OTHER) plus
optional detail.

## Assignment & follow-up

`assignedMembershipId` is validated before storing: the membership must
exist, belong to the current tenant, and be active (control-database lookup).
Cross-tenant membership IDs are rejected.

`nextFollowUpAt` supports set/change/clear via PATCH; the list and board
expose follow-up filters (`OVERDUE`, `TODAY`, `UPCOMING`, `NONE`) and card
chips (Quá hạn / Hôm nay / Sắp tới). No notifications are sent — LOCAL-11
owns those.

## Trial flow

1. Booking requires `status = QUALIFIED` and no other active booking.
2. The session must be `SCHEDULED`, not in the past, with an `ACTIVE` class.
3. Student is reused (`studentId`) or materialized from Lead data
   (`createStudent`): generated code `STU<suffix>` under a tenant-wide
   advisory lock; Guardian is optionally created and linked via
   `StudentGuardian` with an explicit relationship
   (MOTHER/FATHER/GRANDPARENT/GUARDIAN/OTHER). On rebooking/conversion the
   lead's previously materialized student is the default, so staff never
   re-enter data.
4. A TRIAL Enrollment is created through the normal enrollment path —
   existing capacity locking and the operational per-student-class unique
   index apply unchanged. No CRM seat counter exists.
5. Cancel keeps the booking (`CANCELLED` + reason), withdraws the TRIAL
   enrollment, and returns the lead to `QUALIFIED`. Reschedule = cancel +
   new booking; both rows are preserved.
6. Outcome requires the session's attendance sheet to be `LOCKED`.
   `PRESENT/LATE/ONLINE` → booking `COMPLETED`; absences → `NO_SHOW`.
   Then: `ENROLL` → lead `TRIAL_COMPLETED`; `FOLLOW_UP` → `QUALIFIED`;
   `LOST` → lost flow with required reason. Attendance is the only source of
   truth.
7. TRIAL absences do not create normal makeup entitlements
   (`createEntitlements` excludes TRIAL enrollments).

If the booked session later becomes `CANCELLED`/`RESCHEDULED`, the lead
detail surfaces "cần đặt lại" (needs rebooking); staff cancel and rebook
explicitly. Nothing moves automatically.

## Duplicate detection & reuse

`GET /leads/:id/duplicates` returns exact/normalized phone/email matches
across Students, Guardians, and open Leads (bounded), labeled
"possible duplicate". Matching contact data is never proof of identity;
there is no fuzzy or automatic merge. Booking and conversion require an
explicit reuse-or-create decision when candidates exist.

## Conversion

`POST /leads/:id/convert` (`classId` required; student reuse/create choice;
optional guardian choice + relationship). Allowed from `QUALIFIED` or
`TRIAL_COMPLETED` only; repeated conversion after `WON` returns 409 with the
existing converted IDs.

- **Same class as the trial** — the TRIAL enrollment is promoted
  `TRIAL → ACTIVE` (single enrollment, full event history).
- **Different class** — the TRIAL enrollment is withdrawn (reason
  "Converted into a different class") and a new ACTIVE enrollment is created
  from it via re-enrollment, preserving `sourceEnrollmentId` linkage and trial
  history.
- **Direct (no trial)** — a new ACTIVE enrollment is created through the
  standard path.

The whole operation (student, guardian, link, enrollment, lead links, WON
status, LeadEvent, audit) is one transaction under a lead row lock. Winning a
lead performs no billing actions; finance staff price the enrollment through
LOCAL-08 as usual.

## Permissions

`crm.read` gates all CRM reads and lookups; `crm.write` gates all mutations
including the constrained conversion command. SALE holds only these two
permissions: CRM works end-to-end while direct Student/Enrollment/Schedule
write APIs stay denied. Small CRM lookup endpoints
(`/crm/lookups/courses|branches|classes|assignees`, `/crm/trial-sessions`)
return only the fields CRM forms need, so SALE never needs broad academic
read permissions. Teachers without `crm.read` see no CRM navigation, list,
search, or contact data.

## Tenant isolation & concurrency

Every table is tenant-qualified with composite foreign keys; cross-tenant
Course/Branch/Student/Guardian/Enrollment/Session references are rejected by
the database, and service queries always resolve the tenant from trusted
request context. Cross-tenant membership assignment is rejected by control-DB
validation. Conversion and booking run under row locks plus the enrollment
capacity lock: double conversion, double booking, last-seat races, and
convert-vs-lost races each produce exactly one coherent outcome (covered by
the real-PostgreSQL integration suite).

## Audit coverage

`lead.created`, `lead.updated`, `lead.assigned`, `lead.status_changed`,
`lead.lost`, `lead.converted`, `trial_booking.created`,
`trial_booking.cancelled`, `trial_booking.completed`,
`trial_booking.outcome_recorded`. Reads are not audited.

## UI

`/leads` — pipeline board (NEW → TRIAL_COMPLETED columns; WON/LOST via
filters) plus a table list with server-side search, filters, and cursor
pagination. Compact cards show student name, contact, course, owner, source,
and follow-up chip; lifecycle moves are explicit actions (no drag-and-drop
dependency). Lead detail shows overview sections, trial bookings with
needs-rebooking flags, append-only notes, and the LeadEvent activity
timeline, with dialogs for follow-up, trial booking, outcome, conversion
(duplicate reuse/create choice), and lost. All navigation and actions are
permission-aware and Vietnamese-first.
