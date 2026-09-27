# Progress and Assessment

LOCAL-13 adds the academic chain:

```text
Enrollment
   ↓
Class
   ↓
Assessment
   ↓
AssessmentResult
   ↓
Progress Summary
   ↓
ProgressReport
   ↓
Parent / Student Portal
```

## Assessment model

An `Assessment` belongs to one tenant-scoped `Class`. Its Course and optional
CourseLevel are derived through that Class; assessments never attach directly
to a Course, CourseLevel, or Student.

Assessment types are the fixed vocabulary `QUIZ`, `TEST`, `EXAM`, `HOMEWORK`,
`PROJECT`, `ORAL`, and `OTHER`. Scoring mode is `SIMPLE` or `RUBRIC`.
Assessment status is `DRAFT`, `PUBLISHED`, or `ARCHIVED`.

- `DRAFT`: structure and results are editable; nothing is portal-visible.
- `PUBLISHED`: official and portal-visible; structure and ordinary result edits
  are frozen.
- `ARCHIVED`: retained published history, hidden from ordinary current staff
  workflow. There is no unpublish operation.

`AssessmentCriterion` belongs to a RUBRIC assessment and has a positive exact
maximum score and deterministic order. A rubric has at least one criterion;
the assessment maximum equals the criterion maximum-score sum and is derived
server-side when criteria change.

`AssessmentResult` links an Assessment, Student, and the historical Enrollment
that placed the Student in the Assessment's Class. One result exists per
Assessment and Student. Trial enrollments are excluded from formal grading.
Later withdrawal, completion, or transfer does not invalidate existing
historical results.

`AssessmentCriterionResult` links one result to one criterion of that result's
Assessment. RUBRIC totals are derived transactionally from the complete
criterion-score set; the client cannot submit an independent total.

## Exact scores

Persisted scores use PostgreSQL fixed-scale `NUMERIC(..., 2)`. APIs exchange
scores as decimal strings such as `"8.50"` and `"10.00"`. Parsing,
validation, formatting, and percentage calculation are centralized. Binary
floating point never determines a persisted score.

Every maximum score is positive. Every score is between zero and its applicable
assessment or criterion maximum. `EXEMPT` results do not carry a score.

The assessment average is an unweighted arithmetic mean of each qualifying
result's normalized percentage:

```text
mean(score / assessment.maxScore × 100)
```

Only `PUBLISHED` + `GRADED` results qualify. DRAFT and EXEMPT results are
excluded. LOCAL-13 introduces no GPA, letter grade, weight, coefficient, or
hidden grading scale.

## Publication and correction

Publishing is an explicit `progress.publish` command. The server locks the
assessment, verifies that it remains DRAFT, validates its scoring structure and
all stored results, writes publication metadata, and records an AuditEvent in
one transaction. Concurrent draft writes lock the same assessment, so a score
cannot silently change after publication.

Normal `progress.write` operations cannot modify a published assessment or its
results. A published result correction requires `progress.publish` and a
non-empty reason. The correction transaction locks the result and assessment,
validates the complete replacement SIMPLE or RUBRIC score state, updates the
current authoritative result, appends an `AssessmentResultRevision` containing
server-generated before/after snapshots, and writes an AuditEvent. RUBRIC
snapshots include criterion state. Concurrent corrections serialize and retain
a consistent revision order.

Correction reasons, revision snapshots, actors, and audit metadata are
staff-only.

## Internal progress notes

`ProgressNote` is append-only staff history for a Student, optionally linked to
an Enrollment and Class. Associations are validated within the trusted tenant
database. Notes store author identity snapshots where available.

Progress notes are labeled internal in Student 360 and are never returned by
Parent or Student Portal projections. Audit metadata references the note and
context but does not duplicate private note content.

## Central progress summary

All staff, report, and portal surfaces use the same backend summary. It returns
explicit dimensions rather than an opaque progress percentage:

- `attendanceRate`
- `completedSessions`
- `totalOperationalSessions`
- `assessmentAverage`
- `gradedAssessmentCount`

Attendance reuses LOCAL-07 truth: only records in LOCKED attendance sheets count,
and the existing attended/absent formula is unchanged. Report-period summaries
may additionally scope attendance and published assessments to the selected
Class and date range.

## Progress reports

`ProgressReport` is the official parent/student-facing report. A report belongs
to one Student and the Enrollment/Class pair being reported, with a bounded
period and plain-text teacher comment, strengths, areas for improvement, and
next steps.

A DRAFT is staff-only and editable with `progress.write`. Preview is generated
server-side from authoritative Student, Enrollment, Class/Course/Level, locked
attendance, published assessment results, the central summary, and the saved
narrative.

Publishing requires `progress.publish`. The server locks the draft, regenerates
its authoritative preview, stores that data as an immutable versioned JSON
snapshot, writes publication metadata, and records an AuditEvent atomically.
The browser cannot submit snapshot JSON.

A PUBLISHED report is never edited. Correction uses a replacement DRAFT linked
through `supersedesReportId`. Publishing the replacement locks both versions,
marks the previous report `SUPERSEDED`, publishes the replacement, and retains
both immutable snapshots. A database invariant prevents simultaneous official
published reports for the same Enrollment and exact report period, and another
prevents parallel replacement branches.

This distinction is fundamental:

```text
AssessmentResult
= current authoritative academic result

ProgressReport
= immutable official snapshot at publication time
```

A later score or attendance correction changes current progress but never
rewrites a report previously shown to a family.

## Authorization

Permissions are centralized:

| Role | progress.read | progress.write | progress.publish |
|---|---:|---:|---:|
| OWNER | yes | yes | yes |
| CENTER_ADMIN | yes | yes | yes |
| ACADEMIC_MANAGER | yes | yes | yes |
| TEACHER | yes | yes | no |
| STAFF / ACCOUNTANT / SALE | no | no | no |

`progress.read` covers staff assessment, result, note, summary, and report
reads. `progress.write` covers DRAFT assessment/result/report writes and note
creation. `progress.publish` covers assessment/report publication and published
result correction. Controllers and staff UI enforce the same boundaries.

Teacher remains separate from User/TenantMembership. LOCAL-13 therefore uses
existing tenant-wide TEACHER permission semantics and does not infer ownership
from a name, email, or teacher code. Own-class row scoping requires a future
explicit Teacher↔User mapping.

## Portal privacy

Portal uses the existing independent boundary:

```text
User → PortalAccess → Guardian / Student
```

It never calls staff progress APIs. The portal guard re-derives the authorized
Student set, and each progress projection first authorizes the requested
Student without revealing whether another Student exists.

Guardian access follows current `Guardian → StudentGuardian → Student`
relationships. A Student subject sees only themself. Portal projections include
only published assessment results, the central summary, and published or
superseded report snapshots. They never include drafts, ProgressNotes,
correction reasons or revisions, AuditEvents, or other internal notes.
Current assessment results reflect explicit corrections; historical report
snapshots remain unchanged.

## Tenant isolation and concurrency

Every table carries `tenant_id`. Relations use tenant-qualified foreign keys
where PostgreSQL can express the invariant; commands also validate the complete
Assessment/Class/Enrollment/Student/Criterion graph within the trusted tenant
connection before writing. No client tenant ID or database name selects scope.

Publication, grading, correction, report publication, and replacement use
PostgreSQL transactions and row locks. The lock order is stable around the
owning assessment/report, preventing double publication, publication/write
races, lost corrections, duplicate official reports, and divergent replacement
branches without adding process-local state or distributed infrastructure.
