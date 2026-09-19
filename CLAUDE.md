# Classora

Classora is a multi-tenant SaaS platform for training centers.

## Architecture

Baseline stack: `docs/tech-stack.md`

- Monorepo
- React + Vite + TypeScript
- shadcn/ui
- TanStack Query
- Zustand
- NestJS
- Prisma + PostgreSQL
- REST API
- Modular monolith
- Database-per-tenant

Repository:

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

Read:

- `CONTEXT.md` for domain context
- `docs/adr/` for architecture decisions
- relevant `.claude/rules/` before changing code

Project rules and ADRs override generic skill/framework advice.

## Engineering Principles

Prefer the simplest solution that fully solves the current requirement.

Prioritize:

1. correctness
2. security
3. tenant isolation
4. data integrity
5. simplicity
6. readability
7. smallest coherent diff

Prefer:

- existing patterns over new patterns
- local solutions over generic abstractions
- explicit code over clever code
- installed dependencies over new dependencies
- fewer moving parts
- deletion over unnecessary addition

Avoid AI-generated code bloat.

Do not:

- refactor unrelated code
- design for hypothetical future requirements
- introduce unnecessary layers or abstractions
- create helpers/wrappers that add little value
- add interfaces for a single implementation without a real boundary
- split components/functions based only on line count
- add dependencies for trivial functionality
- add fallbacks that hide bugs or configuration errors
- add comments that merely restate code
- introduce infrastructure without a concrete requirement

Before adding an abstraction, prove that the current codebase needs it.

When straightforward code is clearer than a reusable framework, prefer straightforward code.

Security, accessibility, tenant isolation, and data integrity always take precedence over minimalism.

## Frontend

Use:

- TanStack Query for server state
- local React state for local UI state
- Zustand only for genuine shared client/application state

Do not mirror TanStack Query data into Zustand.

Extract components/functions only when they are:

- reused
- independently meaningful
- or the current code has become genuinely hard to understand

Prefer existing shadcn/ui primitives.

Do not create wrapper components that merely proxy existing components.

For meaningful frontend UI work, read:

- `apps/web/PRODUCT.md`
- `apps/web/DESIGN.md`
- `.claude/rules/frontend.md`

`apps/web/DESIGN.md` is the source of truth for Classora's visual language,
layout patterns, spacing, density, and interaction design.

Do not introduce a competing visual system.

## Backend

Use NestJS as a modular monolith.

Default flow:

```text
Controller
-> Service
-> Repository / data access
-> Prisma
-> PostgreSQL
```

Keep controllers thin.

Business logic belongs to its owning domain/module.

Do not introduce microservices, queues, event buses, Redis, Kafka, RabbitMQ, Kubernetes, or similar infrastructure without a concrete requirement and ADR.

Do not apply generic NestJS patterns when they conflict with Classora architecture.

## Multi-Tenancy

Classora uses database-per-tenant isolation.

Tenant request flow:

```text
request
-> authenticate
-> resolve tenant
-> authorize membership/permission
-> resolve tenant database
-> execute operation
```

Never trust a client-supplied tenant ID as authorization.

Never:

- access tenant data before tenant resolution
- silently fall back to another tenant database
- reuse tenant context across unrelated requests
- derive database credentials from untrusted input
- leak tenant-specific state or cache across tenants

Changes involving tenant resolution, authentication, authorization, or database connections require explicit tenant-isolation review.

## Skills

Use skills selectively. Do not invoke multiple skills mechanically.

- Ponytail: anti-overengineering / anti-AI-slop
- `grill-with-docs`: ambiguous or important requirements
- `implement`: meaningful implementation work
- `tdd`: behavior requiring a stable automated boundary
- `diagnosing-bugs`: non-obvious bugs
- `code-review`: structured review
- `domain-modeling`: unclear domain terminology or invariants
- `codebase-design`: meaningful module/API boundaries
- `nestjs-best-practices`: NestJS-specific guidance
- Impeccable: meaningful UI design, audit, critique, or polish

The smallest useful workflow wins.

## Workflow

Small changes:

```text
inspect
-> implement
-> validate
```

Non-trivial changes:

```text
inspect existing code
-> identify owning domain/module
-> understand constraints
-> plan if needed
-> implement smallest coherent change
-> lint/typecheck/relevant tests
-> review diff
```

Plan only when there is meaningful uncertainty, architectural impact, tenant impact, or data-model impact.

## Git & Production Safety

Use short-lived feature/fix branches from `main`.

Prefer Conventional Commits:

```text
feat(students): add student creation
fix(tenant): prevent cross-tenant lookup
```

Do not commit, push, deploy, run production migrations, or execute destructive commands unless explicitly requested.

Read-only inspection is allowed.

## Documentation

Update `CONTEXT.md` when important domain behavior or terminology changes.

Create an ADR only for meaningful architectural decisions, such as:

- tenancy model changes
- ORM/database strategy changes
- authentication architecture changes
- introducing cache/queue infrastructure
- major deployment or storage changes

Do not create documentation for trivial implementation details.
