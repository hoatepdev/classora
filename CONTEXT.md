# Classora Context

## Product

Classora is a SaaS platform for training centers.

The product should help training centers manage their core daily operations
without exposing unnecessary operational complexity to customers.

Classora is intended to be production-grade from its first real release.
Product scope should remain focused, while the implementation quality,
security, reliability, and operational discipline should meet production
standards.

Feature breadth should expand based on real product requirements rather than
speculation.

## Product Principles

- Keep customer workflows simple for small and medium training centers.
- Deliver production-grade quality even when product scope is intentionally focused.
- Prefer clear operational concepts over unnecessary product complexity.
- Avoid features that exist only because competitors have them.
- Introduce product and infrastructure complexity only when a concrete requirement or risk justifies it.
- Preserve tenant isolation as a fundamental product and security boundary.
- Keep the system operable and maintainable by a small engineering team.
- Preserve clear evolution paths for growth without prematurely distributing the architecture.

## Users

Initial user roles are expected to include:

- Owner
- Admin
- Staff
- Teacher

Authorization should be permission-aware rather than relying only on hard-coded role names.

Role customization may be added later if the product needs it.

## Core Domains

### Platform Domains

These belong to the Classora platform itself:

- authentication
- users
- tenants
- memberships
- permissions
- tenant domains
- tenant database registry
- subscriptions/billing when introduced

### Tenant Domains

These belong to each training center:

- students
- teachers
- courses
- classes
- enrollments
- schedules
- attendance
- payments / tuition

Potential later domains:

- CRM / leads
- accounting / expenses
- reporting
- notifications
- marketing automation

Do not implement later domains until there is a concrete requirement.

A Course represents a reusable training offering and groups its concrete running Classes. CourseLevels are optional, ordered, tenant-scoped levels within a Course. New Classes require an active Course; LOCAL-04 Classes may also reference a Branch, CourseLevel, managed default Room, primary Teacher, capacity, and dates. Disabling a Course keeps it and its existing Classes readable but prevents assigning new or moved Classes to it; `classes.course_id` remains nullable only for Classes created before Courses were introduced.

A Tenant is not a Branch. Branches are operational tenant records with managed Rooms and TeacherBranch assignments; branch-scoped authorization is deferred. A Class default Room is a planning/default association, not a scheduled occurrence assignment; the existing Schedule `room` text remains unchanged for scheduling work. New relationships are validated against the trusted tenant database and disabled historical references remain readable.

An enrollment records one Student's membership in one Class. Each Student-Class pair has one canonical enrollment: withdrawal marks it `WITHDRAWN`, and enrolling again reactivates it with a new enrollment date.

Scheduling follows one authoritative chain: `Class -> SchedulePattern -> Session`. The existing `schedules` rows are the persisted weekly SchedulePatterns, preserving their IDs; the existing `attendance_sessions` rows are the persisted dated Sessions, preserving their IDs. A SchedulePattern contains the weekday, local time interval, effective dates, branch, teacher, and structured Room reference. A Session is one dated occurrence and stores historical branch/resource snapshots, lifecycle status, manual override and replacement/cancellation history. Session conflict checks use half-open intervals `[start, end)`, so adjacent sessions are valid. Generation is explicit, bounded to at most 366 days, intersects Class and pattern effective dates, skips tenant-wide or branch-specific exclusions, and is idempotent.

Rescheduling creates a replacement Session linked to the original and marks the original `RESCHEDULED`; cancellation marks the original `CANCELLED` without deleting it. AttendanceRecord points to Session and snapshots the active enrollment roster when a Session is created or generated. Attendance remains compatible with the legacy API surface, while Session—not Attendance—is the authoritative dated occurrence. Scheduling reads and writes require `schedule.read` or `schedule.write`, are audited, and always resolve the trusted tenant context before querying the tenant database.

### Student 360

A Student is the tenant-scoped operational learner profile. `status` is the
current profile status (`ACTIVE` or `DISABLED`) and is independent of future
enrollment lifecycle states. Optional profile fields include gender, address,
school, and source; blank optional text is stored as null.

Guardians are first-class tenant records and may be reused across multiple
Students. `StudentGuardian` stores the relationship, primary-contact flag, and
billing-contact flag. A Student may have zero or one primary contact, enforced
by a database constraint; billing contacts are not limited to one. Unlinking a
relationship never deletes the shared Guardian.

Student tags are tenant-scoped reusable labels assigned through
`StudentTagAssignment`. Internal notes are append-only `StudentNote` records
with author and timestamp snapshots. Student activity is a Student-scoped view
of tenant audit events, including linked Guardian events; the global audit log
continues to require `audit.read`.

Student and Guardian reads use `student.read`. Student profile writes,
Guardian writes, relationship changes, tag changes, and note creation use
`student.write`. Every query resolves the tenant from trusted request context;
client-supplied tenant or database selectors are not accepted.

Future domains should attach through their own tenant-scoped relations rather
than adding enrollment, scheduling, billing, communication, or portal state to
Student or Guardian prematurely.

## Multi-Tenancy

Classora uses database-per-tenant isolation.

The intended model is:

```text
Platform database
  - users
  - tenants
  - memberships
  - permissions
  - tenant registry
  - platform-level configuration

Tenant database A
  - students
  - teachers
  - courses
  - classes
  - enrollments
  - schedules
  - attendance
  - payments

Tenant database B
  - same tenant schema
```

Multiple small tenant databases may share one PostgreSQL server.

Larger tenants may later move to a dedicated PostgreSQL server without changing the domain model.

Tenant database location and credentials must be resolved from trusted server-side tenant metadata.

## Tenant Resolution

A request must establish both identity and tenant context.

Conceptual flow:

```text
request
-> authenticate user
-> resolve tenant from trusted request context
-> verify membership/permission
-> resolve tenant database
-> execute tenant-scoped operation
```

A tenant ID sent by the frontend is not sufficient authorization.

Tenant identity may eventually be derived from subdomain, custom domain, token context, or a validated combination of these.

The exact resolution mechanism should be documented in an ADR when finalized.

### Tenant Provisioning

New tenants are provisioned through the internal `tenant:create` CLI. Wildcard hosting covers tenant subdomains without per-tenant Cloudflare changes. The control tenant record and owner membership are committed only after the tenant database is created and migrated successfully.

## Backend Architecture

The backend is a NestJS modular monolith.

Prefer modules that map to business capabilities.

Examples:

```text
auth/
tenants/
students/
teachers/
courses/
classes/
schedules/
attendance/
payments/
```

Avoid vague ownership such as:

```text
common-business/
misc/
helpers/
services/
```

unless the code is genuinely cross-domain.

Default internal structure:

```text
feature/
  feature.module.ts
  feature.controller.ts
  feature.service.ts
  feature.repository.ts
  dto/
  types/
```

Add more architectural layers only when the domain complexity justifies them.

Do not adopt microservices by default.

## Database

Primary database: PostgreSQL.

Current ORM choice: Prisma.

Schema changes must be migration-driven.

Tenant schema changes must consider:

- existing tenant databases
- newly provisioned tenant databases
- partial migration failures
- observability of migration status
- safe retry behavior

Do not manually mutate production schemas as an operational shortcut.

Avoid N+1 queries and select only required data when practical.

Indexes should follow real query patterns rather than speculative optimization.

## Frontend Architecture

Frontend stack:

- React
- Vite
- TypeScript
- shadcn/ui
- TanStack Query
- Zustand

State ownership:

```text
remote/server data
-> TanStack Query

local UI state
-> React state

shared client/application state
-> Zustand
```

Do not mirror TanStack Query data into Zustand without a specific reason.

Prefer feature-local code until there is proven reuse.

A larger component is acceptable when it remains cohesive and easy to understand.

Do not introduce a design-system wrapper layer around shadcn/ui without a real product need.

## Infrastructure

Current infrastructure direction:

```text
Browser at <tenant>.classora.io.vn
  -> Cloudflare Tunnel
  -> VPS
  -> Docker Compose
  -> Nginx web gateway
     -> React frontend
     -> same-origin /api -> NestJS API
  -> PostgreSQL
```

Cloudflare R2 is used for files/backups where appropriate.

GitHub Actions handles CI/CD.

Avoid:

- Kubernetes
- microservices
- Redis
- Kafka
- RabbitMQ
- sharding
- WebSockets

until a measured or explicit product requirement justifies them.

## Deployment Boundaries

Frontend and backend are built separately but deployed behind one web gateway.

Frontend:

- built from the web app
- served by the Nginx web container

Backend:

- built as an application/container
- runs on the VPS through Docker Compose
- receives same-origin `/api` traffic through the web gateway and Cloudflare Tunnel

Production changes require explicit user intent.

## Security Invariants

The following are non-negotiable:

- never expose secrets in source control
- never trust tenant identity from client input alone
- authentication does not imply authorization
- every tenant-scoped operation must be authorized
- tenant data must never cross tenant boundaries
- production data must not be modified merely to debug an issue
- logs must not contain passwords, tokens, or sensitive secrets

## Engineering Style

Classora deliberately avoids AI-generated code bloat.

Preferred code is:

- simple
- explicit
- local
- typed
- unsurprising
- consistent with nearby code

Avoid:

- premature abstractions
- one-use wrapper helpers
- unnecessary interfaces
- generic repositories without a real need
- component fragmentation
- speculative fallback logic
- unnecessary dependencies
- broad refactors during focused feature work
- comments that restate obvious code

Before creating a new pattern, search the repository for an existing one.

Before adding a dependency, confirm the problem cannot be solved cleanly with the platform or an installed dependency.

## AI / Claude Workflow

Classora uses:

- Ponytail for anti-overengineering discipline
- selected Matt Pocock engineering skills
- Impeccable for meaningful UI/UX work
- `nestjs-best-practices` for NestJS-specific guidance
- Classora project rules for architecture, tenancy, and production safety

Third-party skills are advisors.

Classora-specific rules, this context document, and ADRs are authoritative for project decisions.

Do not invoke every available skill for every task.

## Decision Log

Architecture decisions that should live in `docs/adr/` include:

- database-per-tenant
- ORM choice
- tenant resolution strategy
- authentication/session strategy
- introduction of caches/queues
- major deployment changes
- storage-provider changes

Keep this file focused on current domain truth.

Use ADRs to explain why major technical decisions were made.
