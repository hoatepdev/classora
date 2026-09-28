# LOCAL-15 Reporting

Reporting is a read-only projection over authoritative operational domains:

```text
Domain tables → fixed SQL reports → validated filters → JSON / CSV
```

It does not persist report state, replace domain calculations, or provide arbitrary queries. LOCAL-14 answers what needs attention now; LOCAL-15 analyzes a selected period; LOCAL-16 owns generic import/export workflows.

## Catalog and definitions

| Report | Permission | Date field | Primary source | Formula / definition | Exclusions |
|---|---|---|---|---|---|
| Students & Enrollments | `student.read` + `enrollment.read` | Student `created_at`, event `occurred_at` | students, enrollments, enrollment_events | New students; lifecycle events; status from latest event before report end | Notes; today's status as historical truth |
| Attendance | `attendance.read` | Session `session_date` | attendance_sessions, attendance_sheets, attendance_records | Attended = PRESENT/LATE/ONLINE/MAKEUP; absent = both ABSENT statuses; rate = attended/(attended+absent) | OPEN sheets; UNMARKED |
| Class Utilization | `class.read` + `enrollment.read` + `schedule.read` | Session `session_date` | classes, enrollments, attendance_sessions | Current operational enrollment / capacity; delivery counts from real Sessions | Null capacity percentages; SchedulePattern rows |
| Teacher Workload | `teacher.read` + `schedule.read` | Session `session_date` | attendance_sessions, teachers | Completed sessions, end_time-start_time minutes, distinct classes | Primary class teacher; compensation |
| Progress | `progress.read` | Assessment/session date | assessments, assessment_results, attendance, progress_reports | PUBLISHED + GRADED normalized average; locked attendance formula | Draft assessments; EXEMPT from average |
| Re-enrollment | `student.read` + `enrollment.read` | Event `occurred_at` | enrollment_events, enrollments | COMPLETED cohort with explicit later REENROLLED destination by report end | TRANSFERRED; arbitrary retention windows |
| Financial Summary | `billing.read` + `report.finance` | Ledger event timestamps | invoice_status_history, credit notes, payments, refunds | Gross billed, credits, net billed, collected, refunded, net cash, as-of outstanding | Statutory/GL revenue claims |
| Receivables Aging | `billing.read` + `report.finance` | As-of report `to` | historical invoice ledger | Outstanding buckets Current, 1–30, 31–60, 61+ | VOID or settled invoices |
| Payments | `billing.read` + `report.finance` | Payment `received_at` | payments, allocations, reversals, refunds | Amount, effective allocation, unallocated, refund, as-of reversal status | Audit metadata; mutable cash-ledger fiction |
| CRM Pipeline | `crm.read` | Lead `created_at` | leads, lead_events, trial_bookings | Created-in-period cohort, status by report end, WON/cohort | Older unrelated leads won in period; staff ranking |
| Branch Summary | `branch.read`; columns require their domain permission | Domain-specific fields | branches plus authorized domains | Permission-shaped branch metrics; deterministic invoice→enrollment→class attribution | Guessed money ownership; payment splitting |

## Time and filters

Business timezone is `Asia/Ho_Chi_Minh`. TIMESTAMPTZ filters use the half-open interval `[from 00:00 local, day-after-to 00:00 local)`. SQL DATE fields use inclusive `from <= date <= to`. Event-heavy ranges are limited to 24 months. Detail rows use server pagination (`page`, `pageSize`; 50 default, 200 maximum).

Entity filters are tenant-scoped and relationship-validated. A missing, foreign-tenant, or incompatible branch/course/level/class/teacher/student filter is rejected rather than returning a misleading empty report. Branch filters are analytical dimensions, not branch-scoped staff authorization.

## Financial history

Historical finance reuses the Billing as-of ledger projection. Allocations, refunds, payment reversals, credit-note voids, and invoice statuses are considered only when their event timestamp is before the exclusive report-end boundary. A reversal after the cutoff does not rewrite the earlier report. VND remains PostgreSQL BIGINT and decimal integer strings in JSON/CSV; report calculations never use floating-point money.

## CSV

CSV export executes the same report runner with the same permission, tenant, date, and entity filters. It includes summary, breakdown, and detail sections. Output is UTF-8 with BOM and CRLF rows, applies RFC-compatible quoting, and prefixes values beginning with `=`, `+`, `-`, `@`, tab, or carriage return to prevent spreadsheet-formula injection. Exports are bounded at 50,000 rows and return a validation error when exceeded.

## Performance and isolation

Queries aggregate in PostgreSQL (`COUNT`, `SUM`, `FILTER`, `GROUP BY`) and bind trusted `TenantContext.tenantId` as `$1`. Unauthorized runners do not execute. Detail queries use `LIMIT/OFFSET`; grouped exports are bounded or preflight-counted. Existing indexes cover current report paths, so LOCAL-15 adds **no migration**, cache, snapshot table, warehouse, ETL, queue, or report source of truth.
