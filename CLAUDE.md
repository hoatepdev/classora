# Classora

Classora is a multi-tenant SaaS platform for training centers.

## Stack

### Frontend

- React
- Vite
- TypeScript
- shadcn/ui
- TanStack Query for server state
- Zustand for client/application state

### Backend

- NestJS
- TypeScript
- PostgreSQL
- Modular monolith
- Database-per-tenant isolation

### Infrastructure

- Cloudflare DNS
- Cloudflare Pages for the frontend
- Cloudflare Tunnel for API ingress
- VPS + Docker Compose for backend workloads
- Cloudflare R2 for files/backups
- GitHub Actions for CI/CD

## Repository

Expected high-level structure:

```text
apps/
  web/
  api/
packages/
infrastructure/
scripts/
docs/
.claude/
```

Read `CONTEXT.md` for domain context and `docs/adr/` for architecture decisions.

## Engineering Philosophy

Classora rejects AI-generated code bloat.

Write code that is intentional, boring, local, readable, and consistent with the existing codebase.

Optimize for:

1. correctness
2. security
3. tenant isolation
4. data integrity
5. simplicity
6. readability
7. smallest coherent diff

Do not optimize for:

- number of abstractions
- number of files
- architectural sophistication
- hypothetical extensibility
- demonstrating design patterns

Prefer:

- existing code over new code
- deletion over addition
- local solutions over generic abstractions
- explicit code over clever code
- installed dependencies over new dependencies
- the smallest complete solution

Do not:

- refactor unrelated code
- split functions/components only to reduce line count
- create helpers used once unless they materially improve readability
- create wrappers that only forward arguments
- create generic repositories/services without a demonstrated need
- add interfaces for single implementations without a real boundary reason
- add fallbacks that hide programming/configuration errors
- add comments that merely restate the code
- add dependencies for trivial functionality
- introduce infrastructure for hypothetical future scale

Security, accessibility, tenant isolation, and data integrity always take precedence over minimalism.

## Frontend Rules

Use TanStack Query for server state.

Use Zustand only for genuine client/application state.

Do not copy query data into Zustand.

Prefer local React state before introducing global state.

Do not split components based on line count.

Extract a component/function only when it is:

- reused,
- independently meaningful,
- or the parent has become genuinely difficult to understand.

Prefer existing shadcn/ui primitives before creating custom primitives.

Do not create wrappers such as `AppButton`, `BaseButton`, or `CustomButton` if they only proxy an existing component.

## Backend Rules

Use NestJS as a modular monolith.

Default flow:

```text
Controller
  -> Service
  -> Repository / data access
  -> PostgreSQL
```

Keep controllers thin.

Business logic belongs to the owning domain/module.

Do not introduce microservices, queues, event buses, Redis, Kafka, RabbitMQ, Kubernetes, or similar infrastructure without a concrete requirement and an ADR.

Generic NestJS guidance never overrides Classora architecture.

## Multi-Tenancy

Classora uses database-per-tenant isolation.

A tenant request must follow:

```text
request
  -> authenticate
  -> resolve tenant
  -> authorize membership/permission
  -> resolve tenant database
  -> execute domain operation
```

Never trust a client-supplied tenant identifier as sufficient authorization.

Never:

- query tenant data before tenant resolution
- silently fall back to another tenant database
- reuse tenant context across unrelated requests
- derive database credentials directly from untrusted input
- leak tenant-specific cache/state across tenants

Any change touching tenant resolution, authentication, authorization, or database connection management requires explicit tenant-isolation review.

## Skills

Use installed skills selectively. Do not invoke multiple skills mechanically.

- Ponytail: default anti-overengineering / anti-AI-slop discipline
- Matt Pocock skills:
  - `grill-with-docs` for ambiguous or important requirements
  - `implement` for meaningful implementation work
  - `tdd` for behavior that deserves a stable automated boundary
  - `diagnosing-bugs` for non-obvious bugs
  - `code-review` for structured review
  - `domain-modeling` when domain terminology or invariants are unclear
  - `codebase-design` for meaningful module/API boundary decisions
- `nestjs-best-practices`: NestJS-specific guidance only
- Impeccable: meaningful UI design, redesign, audit, critique, or polish

Project rules, `CONTEXT.md`, and ADRs take precedence over generic third-party skill advice.

The smallest useful workflow wins.

## Task Workflow

For small/local changes:

```text
inspect
-> implement
-> validate
```

For non-trivial changes:

```text
inspect existing code
-> identify owning domain/module
-> understand constraints
-> plan only if needed
-> implement smallest coherent change
-> lint/typecheck/relevant tests
-> review diff
```

Do not make a plan merely because a task changes multiple files.

Plan when the task has meaningful uncertainty, architectural impact, tenant implications, or data-model impact.

## Git

Use short-lived feature/fix branches off `main`.

Prefer Conventional Commits.

Examples:

- `feat(students): add student creation`
- `fix(tenant): prevent cross-tenant lookup`

Do not commit, push, deploy, run production migrations, or execute destructive commands unless the user explicitly asks.

Read-only inspection is allowed.

## Documentation

Update `CONTEXT.md` when important domain behavior or terminology changes.

Create an ADR in `docs/adr/` only for meaningful architectural decisions such as:

- changing the tenancy model
- changing ORM/database strategy
- introducing a queue/cache
- changing authentication architecture
- changing deployment/storage architecture

Do not create documentation for trivial implementation details.
