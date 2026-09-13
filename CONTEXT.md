# Classora Context

## Product

Classora is a SaaS platform for training centers.

The product should help a training center manage its core daily operations without forcing enterprise complexity onto small teams.

The current product direction favors a focused operational core first, then expansion based on real usage.

## Product Principles

- Keep workflows simple for small and medium training centers.
- Prefer clear operational concepts over technical abstractions.
- Avoid features that exist only because competitors have them.
- Introduce complexity only when a real product requirement demands it.
- Preserve tenant isolation as a product and security boundary.
- Keep the system maintainable by a small engineering team.

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
