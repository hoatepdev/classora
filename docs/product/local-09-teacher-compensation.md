# LOCAL-09 — Teacher Compensation

## Boundary

Teacher compensation ends at a finalized payable statement. It does not create
payouts, bank transfers, payment gateways, tax, social insurance, HR records,
employment contracts, payslips, or student billing records. `Payable` is not
`Paid`.

## Payable source

Only completed operational work is payable:

- A completed `Session` uses `attendance_sessions.teacher_id` as the actual
  teacher. `Class.primary_teacher_id` is not the earning source.
- A completed Session is calculated independently of attendance, present
  students, absences, makeups, or attendance percentage.
- A completed Class is eligible for `FIXED_CLASS` compensation on its explicit
  `completed_on` date. Expected end dates and disabled Classes are not
  completion events.
- Scheduled, cancelled, and rescheduled occurrences are not payable.

## Agreements and calculation

Agreements are effective-dated and scoped to a teacher, optionally to a Class.
For a Session, a valid Class-specific agreement takes precedence over the
teacher default agreement. Missing teacher or agreement configuration creates
explicit unresolved compensation; it never becomes zero-value earnings.

Supported bases are `PER_SESSION`, `PER_HOUR`, and `FIXED_CLASS`. Rates and
amounts are PostgreSQL `BIGINT` VND values and decimal integer strings at the
API boundary. Hourly amounts use integer round-half-up arithmetic:

```text
(rateVnd * durationMinutes + 30) / 60
```

Item snapshots preserve the source date/time, teacher and Class identity,
agreement, basis, rate, duration, amount, and descriptions for historical
explanation.

## Period workflow

A compensation period starts as `DRAFT`. Generation and regeneration are
explicit commands. Regeneration rebuilds generated work while preserving
manual adjustments. Missing configuration remains visible as unresolved work.
A period cannot be finalized while unresolved rows exist, source data has
changed since generation, or any statement payable is negative.

Finalization is transactional and locks the tenant compensation domain. It
revalidates the canonical source set, snapshots the statement totals, and makes
the period, statements, items, and adjustments immutable. A completed Session
can be claimed only once, and a completed fixed Class can be claimed only once
for its agreement.

## Adjustments and audit

Manual adjustments are signed, non-zero VND amounts with a required reason.
They belong to the period statement and survive regeneration. Agreement,
period, adjustment, generation, and finalization mutations write tenant audit
records on the same transaction connection.

## Permissions and tenancy

`compensation.read` is separate from `teacher.read` and controls rates,
agreement, earnings, adjustments, and payable visibility. `compensation.manage`
controls agreement commands, period generation, adjustments, and finalization.
Owner, Center Admin, and Accountant receive both permissions; Academic Manager,
Staff, Teacher, and Sale do not.

All operations resolve the authenticated tenant context before using the
per-tenant database. Tenant-qualified foreign keys, source guards, unique
indexes, period locks, and finalized mutation triggers protect isolation and
concurrency. No client-supplied tenant ID selects a database.
