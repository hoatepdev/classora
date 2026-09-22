# Audit log foundation

## Status

Accepted

## Decision

Classora stores audit events in two append-only `audit_events` tables:

- control database for invitations and membership changes;
- each tenant database for tenant business changes.

Both tables use the same event shape: tenant, actor user/membership, stable `resource.action` action, canonical entity type, optional entity ID, safe before/after snapshots, reason, request ID, metadata, and occurrence time. Tenant rows repeat `tenant_id` deliberately as a query and migration invariant.

Control mutations write through the existing Prisma transaction client. Tenant mutations write through the same raw `pg` transaction client as the domain change. Audit failures therefore roll back the owning local mutation. There is no cross-database transaction, duplicate dual-write, queue, outbox, retention job, export, or cryptographic chain.

`GET /audit` is one tenant-scoped read API. Trusted hostname resolution and membership authorization establish tenant scope; `audit.read` is initially granted to `OWNER` and `CENTER_ADMIN`. The API queries both local stores with identical filters, merges newest-first with keyset pagination, and never accepts a client tenant selector.

## Conventions

Actions use `resource.action`, for example `membership.role_changed`, `membership.disabled`, `student.created`, `student.updated`, `guardian.created`, `guardian.updated`, `student.guardian_linked`, `student.guardian_updated`, `student.guardian_unlinked`, `student.tag_added`, `student.tag_removed`, and `student.note_added`. Entity types are uppercase (`MEMBERSHIP`, `STUDENT`, `GUARDIAN`). LOCAL-02 covers control-plane membership/invitation actions and LOCAL-03 extends tenant audit coverage to Student 360 profile, Guardian, relationship, tag, and note mutations. LOCAL-04 extends tenant audit coverage to Branch, Room, TeacherBranch, CourseLevel, and Class mutations, using the same transaction and allowlisted snapshot rules. Branch-scoped authorization is intentionally separate and remains deferred. Enrollment, Schedule, Attendance, Billing, CRM, and other domain mutations remain deferred; each future module must call the audit writer explicitly inside its owning transaction and provide trusted actor context, allowlisted business fields, and endpoint/isolation tests before adoption.

Invitation tokens, password material, JWTs, database URLs, and secrets must never be stored. Retention and archival are future operational work; application users have no update or delete path.
