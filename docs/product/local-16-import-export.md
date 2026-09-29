# LOCAL-16 Import / Export

LOCAL-16 imports domain entities through existing business invariants. It is not a database loader.

```text
External CSV
  -> memory-only parse
  -> explicit column mapping
  -> dry-run validation
  -> paginated preview
  -> atomic confirmation
  -> existing domain writes
  -> authoritative tenant data
```

## Scope and migration order

Supported import and export types are Students, Teachers, Courses, Course Levels, Classes, and Enrollments. The recommended order is Courses, Course Levels, Teachers, Students, Classes, then Enrollments. Branches and Rooms must already exist when referenced.

One ImportBatch owns exactly one type. Imports create records only; there is no automatic update, upsert, delete, tenant-to-tenant copy, guardian import, schedule/session/attendance import, academic-result import, CRM import, communication import, or financial import.

## CSV boundary

Uploads are UTF-8 CSV processed in memory. `csv-parse` handles BOM, LF/CRLF, quoted commas, escaped quotes, empty fields, and multiline quoted values. The original bytes are SHA-256 fingerprinted for traceability and duplicate-file warnings, then discarded; they are never stored on disk, in R2, or in the database.

Limits are centralized at 5 MiB, 5,000 data rows, and 100 columns. Templates contain headers only. Teacher specialties and Branch codes use `|` as the only list delimiter.

Exports reuse the shared safe CSV writer: UTF-8+BOM, CRLF, RFC-compatible quoting, spreadsheet-formula injection protection, stable headers, and a 50,000-row cap.

## ImportBatch and ImportRow

Tenant databases persist ImportBatch metadata, mapping, counts, actor snapshots, lifecycle timestamps, failure details, and staged ImportRows. ImportRows retain source values, portable normalized values, structured errors/warnings, source key, status/action, and the target ID after completion. The original file is not retained.

```text
UPLOADED -> VALIDATED -> COMPLETED
                   \-> FAILED
UPLOADED/VALIDATED -> CANCELLED
```

Changing mapping clears previous row validation and returns the batch to UPLOADED. Completed and failed history is immutable through the API; completed batches are never hard-deleted.

## Mapping and validation

Each type has an explicit manifest used by type catalogs, templates, mapping, validation, export definitions, OpenAPI, and the UI. Mapping rejects unknown target fields, duplicate target assignment, and missing required targets. Unmapped source columns are deliberately ignored; they never create database fields.

Validation performs no domain writes. It reuses existing DTO transforms and validators, detects normalized duplicates inside the file, bulk-loads existing codes and relationships into tenant-scoped maps, and checks domain relationships and mutable invariants. Student phone/email matches are warnings only; Student code remains the deterministic identity.

Class validation resolves Course, CourseLevel, Branch, Branch-qualified Room, and Teacher by code, including CourseLevel-to-Course, Room-to-Branch, TeacherBranch, active-status, date-order, and uniqueness rules. Enrollment validation resolves Student/Class codes and checks only initial PENDING/TRIAL/ACTIVE statuses, Student/Class status, operational uniqueness, and grouped capacity demand.

Errors use structured `{ code, field, message }` values such as REQUIRED, INVALID_FORMAT, DUPLICATE_IN_FILE, ALREADY_EXISTS, NOT_FOUND, INVALID_RELATION, and CAPACITY_CONFLICT. Preview rows are paginated and filterable. Error CSV includes only row number, source key, field, error code, and message.

## Atomic confirmation and concurrency

Confirmation runs on one tenant connection:

```text
BEGIN
  -> lock ImportBatch FOR UPDATE
  -> verify VALIDATED and zero invalid rows
  -> re-resolve codes and revalidate mutable invariants
  -> lock referenced Classes in deterministic order
  -> SAVEPOINT
  -> call existing domain createInTransaction methods
  -> domain events and audits
  -> mark rows IMPORTED and batch COMPLETED
COMMIT
```

Students and Enrollments use their existing transaction-aware create methods. Teachers, Courses/CourseLevels, and Classes expose narrow transaction-aware methods extracted from their manual create flows. Enrollment capacity, lifecycle events, operational uniqueness, Student/Class state, TeacherBranch assignments, relationship checks, normalization, and entity audit therefore stay authoritative.

If revalidation or any domain write fails, the transaction rolls back to the savepoint, removing every partial domain row, domain event, audit event, and staged result. The still-locked transaction records the batch as FAILED with concise structured evidence, then commits that evidence. PostgreSQL uniqueness constraints remain the final defense against concurrent manual creates or another batch.

A concurrent second confirmation blocks on the same batch row. After the first commits, the second returns the existing COMPLETED result without domain writes.

## Permissions, tenant isolation, and audit

Import requires `data.import` plus the target domain write permission. Export requires `data.export` plus the target domain read permission. OWNER, CENTER_ADMIN, and ACADEMIC_MANAGER receive the two bulk-data permissions; ACCOUNTANT, SALE, STAFF, and TEACHER do not. Type catalogs expose only authorized types. Reporting CSV retains its LOCAL-15 report permissions and does not require `data.export`.

All APIs are staff TenantRoutes. Portal identities cannot enter them. Tenant scope comes only from hostname resolution and TenantContext; requests and CSV rows accept no tenant ID, code, database name, or database selector. Every lookup and export binds the trusted tenant ID, so foreign-tenant codes are reported as not found without metadata leakage.

Domain records keep their normal create audit actions. Batch-level actions are `data_import.created`, `data_import.validated`, `data_import.completed`, `data_import.failed`, and `data_import.cancelled`. Batch audit contains IDs, type, fingerprint, counts, and concise failure metadata only. CSV contents, row payloads, contacts, addresses, and notes are not written to AuditEvent or application logs.

## Entity export

Exports are fixed allowlisted raw entity extracts. Portable relationship codes are used instead of internal IDs where possible: Course, CourseLevel, Branch, Room, Teacher, Student, and Class codes. Supported filters are limited to useful status, branch, course, and class filters and tenant-validated before querying.

Export = data extraction. Import = safe creation workflow. They are not guaranteed historical round-trip backups: for example, completed Enrollment history may be exported but cannot be imported as a fabricated initial lifecycle state.

Reporting CSV is not Data Export CSV. Database backup/restore is not Import/Export. Database backup/restore remains the authoritative recoverability mechanism.

## Opening balance decision

Opening balance import: DEFERRED — no safe first-class Billing opening-balance domain exists.

LOCAL-16 does not insert into Invoice, Payment, PaymentAllocation, Refund, or CreditNote; create mutable Student balances; or fabricate financial history.
