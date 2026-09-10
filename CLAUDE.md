# Classora — Training Center Operating System

SaaS platform for operating training centers (not just CRUD student
management). Target customers: small training centers without dedicated
IT teams. Expected scale: a small number of tenants and students — do not
over-build for large scale.

Full architecture rationale, domain model detail, and deployment specifics
live in @docs/architecture-context.md — read it when working on tenant
routing, migrations, backup/restore, or any business domain module. This
file only covers what applies to every session.

## Tech Stack

- Backend: NestJS + TypeScript, modular monolith
- Frontend: React + Vite + TypeScript + Ant Design + TanStack Query + React Router
- Database: PostgreSQL, database-per-tenant (shared PG server for small tenants)
- Infra: Cloudflare (DNS/Pages/Tunnel/R2) + single VPS with Docker Compose

## Core Architecture Rules

- **Tenant isolation = separate database per tenant.** Do not introduce a
  shared-table `tenant_id` model.
- **Modular monolith.** No microservices unless a task explicitly requires
  it and the architectural impact is explained first.
- **Authorization is permission-based**, not role-based. Never hard-code
  `if (role === "ADMIN")`. Use permissions like `student.read`,
  `attendance.write` with scopes (`ALL_BRANCHES`, `SELECTED_BRANCHES`,
  `OWN_CLASSES`, `SELF`).
- **Enrollment and Session are first-class entities** — not just
  `Student <-> Class` or a fixed weekday/time on the Class record.
- **Financial and attendance history is immutable.** Void/reverse, never
  hard-delete.
- Business logic stays in NestJS — not in Cloudflare Workers.

## Do NOT introduce (without explicit justification)

Microservices · Kubernetes · shared tenant tables · Redis · queues ·
WebSockets · Cloudflare Workers for core business logic

## AI Working Rules

- Prefer incremental changes: small change → test → verify → continue.
  Do not rewrite large areas unnecessarily.
- Respect NestJS module boundaries — no cross-module shortcuts.
- Prefer the simplest solution that is correct, testable, maintainable,
  and preserves tenant isolation. This project is operated by one developer.
- Be especially conservative when touching: tenant routing, database
  connection management, migrations, backup/restore, auth, attendance
  history, financial records.
- If a proposed design is meaningfully more complex than what's described
  here or in @docs/architecture-context.md, explain what concrete problem
  the added complexity solves before implementing it.

## Current Milestone

Building the first vertical slice: React/Vite → Cloudflare Pages →
api.example.com → Cloudflare Tunnel → NestJS → PostgreSQL, starting with
`GET /health`. Do not implement tenant routing or business modules until
this path is verified end-to-end.
