# Classora Tech Stack

## 1. Purpose

This document defines the baseline technology stack and architecture decisions for Classora.

The goal is to keep the project:

- simple to reason about
- fast to develop
- easy to maintain
- suitable for AI-assisted development
- production-ready without premature complexity

This stack is the default for the project.

Do not introduce a new framework, infrastructure component, database, messaging system, abstraction layer, or architectural pattern unless there is a concrete requirement that justifies it.

---

## 2. Architecture Overview

Classora uses:

- Monorepo
- Modular Monolith
- REST API
- Feature-based frontend architecture
- Module-based backend architecture
- Database-per-tenant multi-tenancy

High-level architecture:

```text
User
  |
  v
Cloudflare
  |
  +-------------------------+
  |                         |
  v                         v
Cloudflare Pages      Cloudflare Tunnel
  |                         |
  v                         v
React / Vite             NestJS API
                            |
                            v
                          Prisma
                            |
                            v
                        PostgreSQL
                            |
                            v
                      Cloudflare R2
```

---

# 3. Frontend

## Core

- React
- Vite
- TypeScript

React is used as the main UI framework.

Vite is used for development and production builds.

TypeScript is required for application code.

---

## UI

- Tailwind CSS
- shadcn/ui
- Lucide React

### Tailwind CSS

Used for styling and layout.

Prefer utility classes over creating unnecessary custom CSS abstractions.

### shadcn/ui

Used as the primary component foundation.

Prefer extending shadcn components over introducing another UI framework.

Do not add Ant Design, Material UI, Chakra UI, Mantine, or similar libraries unless there is a concrete requirement.

### Lucide React

Default icon library.

Avoid adding multiple icon libraries unless necessary.

---

## Routing

- React Router

Used for application routing.

Example:

```text
/login
/dashboard
/students
/students/:id
/classes
/classes/:id
/attendance
/payments
/settings
```

---

## Server State

- TanStack Query

Use TanStack Query for:

- API requests
- caching
- loading states
- mutations
- invalidation
- server state synchronization

Server data should not normally be copied into Zustand.

Example:

```text
API data
   |
   v
TanStack Query
   |
   v
React components
```

---

## Client State

- Zustand

Use Zustand only for client-side state that needs to be shared across components.

Examples:

- sidebar state
- UI preferences
- temporary workflow state
- global modal state when genuinely needed

Do not use Zustand as an API cache.

Prefer local React state when the state only belongs to one component or one small component tree.

---

## Forms

- React Hook Form
- Zod

React Hook Form manages form state.

Zod handles frontend schema validation.

Example:

```text
User input
   |
   v
React Hook Form
   |
   v
Zod validation
   |
   v
TanStack Query mutation
   |
   v
REST API
```

---

## Tables

- TanStack Table

Use TanStack Table for complex data tables such as:

- students
- teachers
- classes
- enrollments
- payments
- attendance records

Do not introduce a full table framework unless TanStack Table cannot satisfy a concrete requirement.

---

## HTTP Client

- Axios

Axios is the default HTTP client.

Use it for:

- base API configuration
- authorization headers
- error normalization
- token refresh when required

Keep the API client simple.

Avoid creating unnecessary generic repository layers around Axios.

Example:

```text
feature API function
      |
      v
Axios instance
      |
      v
NestJS REST API
```

---

## Date Utilities

- date-fns

Use date-fns for:

- formatting
- parsing
- date calculations
- comparisons

Do not mix multiple date libraries unless required.

---

# 4. Frontend Structure

Recommended structure:

```text
apps/web/
└── src/
    ├── app/
    │   ├── providers/
    │   └── router/
    │
    ├── components/
    │   └── ui/
    │
    ├── features/
    │   ├── auth/
    │   ├── students/
    │   ├── teachers/
    │   ├── classes/
    │   ├── enrollments/
    │   ├── attendance/
    │   └── payments/
    │
    ├── lib/
    │   ├── api.ts
    │   ├── query-client.ts
    │   └── utils.ts
    │
    └── stores/
```

Feature example:

```text
features/students/
├── api/
├── components/
├── pages/
├── schemas/
└── types.ts
```

Do not split files only to make them smaller.

Extract components or functions when:

- they are reused
- complexity clearly improves after extraction
- they represent a meaningful domain concept

Avoid excessive fragmentation.

---

# 5. Backend

## Core

- NestJS
- TypeScript

NestJS is the primary backend framework.

Classora uses a modular monolith rather than microservices.

---

## API

- REST
- Swagger / OpenAPI

REST is the default API style.

Example:

```text
GET    /students
GET    /students/:id
POST   /students
PATCH  /students/:id
DELETE /students/:id
```

Swagger is used for API documentation and development reference.

GraphQL and tRPC are not part of the baseline stack.

---

# 6. Database

## Database

- PostgreSQL

PostgreSQL is the primary relational database.

It stores core transactional data such as:

- tenants
- users
- students
- teachers
- classes
- enrollments
- attendance
- payments
- subscriptions

---

## ORM

- Prisma

Use Prisma for:

- schema definition
- database access
- migrations
- type-safe queries

Standard commands:

```bash
pnpm prisma migrate dev
pnpm prisma migrate deploy
pnpm prisma generate
```

Do not add another ORM alongside Prisma.

---

# 7. Backend Structure

Recommended structure:

```text
apps/api/
└── src/
    ├── main.ts
    ├── app.module.ts
    │
    ├── common/
    │   ├── decorators/
    │   ├── filters/
    │   ├── guards/
    │   └── interceptors/
    │
    ├── infrastructure/
    │   ├── database/
    │   ├── storage/
    │   └── mail/
    │
    └── modules/
        ├── auth/
        ├── tenants/
        ├── users/
        ├── students/
        ├── teachers/
        ├── classes/
        ├── enrollments/
        ├── attendance/
        └── payments/
```

A normal module should stay simple:

```text
students/
├── dto/
│   ├── create-student.dto.ts
│   └── update-student.dto.ts
├── students.controller.ts
├── students.service.ts
└── students.module.ts
```

Default flow:

```text
HTTP request
     |
     v
Controller
     |
     v
Service
     |
     v
Prisma
     |
     v
PostgreSQL
```

Do not introduce repository interfaces, adapters, use-case classes, factories, or facade layers automatically.

Add them only when actual complexity requires them.

---

# 8. Backend Validation

Use:

- class-validator
- class-transformer
- NestJS ValidationPipe

Example:

```text
HTTP request
   |
   v
DTO
   |
   v
ValidationPipe
   |
   v
Controller
```

Frontend and backend validation do not need to share the same library.

Frontend uses Zod.

Backend uses NestJS DTO validation.

---

# 9. Authentication

Baseline authentication:

- email + password
- JWT access token
- refresh token
- Argon2 password hashing

Example:

```text
email + password
       |
       v
NestJS Auth
       |
       v
Argon2 verify
       |
       v
Access Token
+
Refresh Token
```

Recommended starting values:

```text
Access token:
~15 minutes

Refresh token:
~30 days
```

Refresh tokens should be stored securely and preferably hashed before persistence.

---

# 10. Authorization

Start with RBAC.

Initial roles may include:

```text
OWNER
ADMIN
MANAGER
TEACHER
STAFF
```

Avoid building a complex permissions engine before the product requires it.

Fine-grained permissions can be introduced later.

---

# 11. Multi-Tenancy

Classora uses database-per-tenant.

Example:

```text
PostgreSQL Server

classora_control
classora_center_001
classora_center_002
classora_center_003
```

The control database can contain platform-level information such as:

```text
tenants
users
subscriptions
database connections
platform configuration
```

Tenant databases contain center-specific business data.

Request flow:

```text
Request
  |
  v
Resolve tenant
  |
  v
Resolve database
  |
  v
Prisma client
  |
  v
Tenant database
```

Multiple small tenants may share the same PostgreSQL server.

Larger tenants can later move to another PostgreSQL server without changing the overall architecture.

---

# 12. Error Handling

API errors should have a consistent structure.

Example:

```json
{
  "statusCode": 400,
  "code": "STUDENT_ALREADY_EXISTS",
  "message": "Student already exists"
}
```

Frontend business logic should prefer stable error codes over parsing human-readable messages.

---

# 13. Logging

Use:

- Pino
- NestJS Logger where appropriate

Production backend logs should be structured.

Example:

```text
NestJS
  |
  v
Pino
  |
  v
stdout
  |
  v
Docker logs
```

Do not introduce a full centralized logging stack during the initial stage unless operational requirements justify it.

---

# 14. Health Checks

Use:

- @nestjs/terminus

Minimum endpoint:

```text
GET /health
```

It should eventually verify:

- API process
- PostgreSQL availability
- required external services

Example response:

```json
{
  "status": "ok"
}
```

---

# 15. File Storage

Use:

- Cloudflare R2

R2 stores files such as:

- student avatars
- attachments
- documents
- generated exports
- backups

Initial upload flow may be:

```text
Browser
  |
  v
NestJS
  |
  v
Cloudflare R2
```

Presigned direct uploads can be introduced later when needed.

---

# 16. Email

Default provider:

- Resend

Potential use cases:

- account invitation
- email verification
- password reset
- notifications
- subscription communication

Do not run a custom SMTP server unless there is a concrete requirement.

---

# 17. Error Monitoring

Use:

- Sentry

Recommended coverage:

```text
React
  |
  v
Sentry

NestJS
  |
  v
Sentry
```

Use Sentry for production exceptions and debugging context.

---

# 18. Testing

## Frontend

- Vitest

Use for:

- utility functions
- hooks when meaningful
- important frontend business logic

Do not test implementation details unnecessarily.

---

## Backend

- Jest
- Supertest

Jest is used for backend tests.

Supertest is used for API integration tests.

Prioritize tests around important business rules.

---

## End-to-End

- Playwright

Use Playwright for critical user journeys.

Example:

```text
Login
  |
  v
Create student
  |
  v
Create class
  |
  v
Enroll student
  |
  v
Record attendance
  |
  v
Create payment
```

Avoid trying to automate every minor UI interaction.

---

# 19. Code Quality

Use:

- ESLint
- Prettier
- TypeScript type checking

CI should at minimum verify:

```text
lint
typecheck
test
build
```

Avoid disabling rules just to make generated code pass.

Fix the underlying issue where reasonable.

---

# 20. Monorepo

Use:

- pnpm
- pnpm workspaces

Recommended root layout:

```text
classora/
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│
├── infrastructure/
├── scripts/
├── docs/
│
├── pnpm-workspace.yaml
├── package.json
├── CLAUDE.md
└── CONTEXT.md
```

Do not introduce Nx or Turborepo unless the monorepo grows to a point where their benefits clearly justify the additional tooling.

---

# 21. Infrastructure

## Cloudflare

Use Cloudflare for:

- DNS
- TLS
- frontend delivery
- API ingress
- object storage

Services:

```text
Cloudflare DNS
Cloudflare Pages
Cloudflare Tunnel
Cloudflare R2
```

---

## Frontend Deployment

React/Vite frontend is deployed to:

```text
Cloudflare Pages
```

Example:

```text
classora.io.vn
```

---

## Backend Deployment

NestJS runs on a VPS using Docker.

Example:

```text
VPS
 |
 v
Docker Compose
 |
 +-- NestJS
 +-- PostgreSQL
 +-- cloudflared
```

API ingress:

```text
api.classora.io.vn
        |
        v
Cloudflare Tunnel
        |
        v
NestJS container
```

The API should not require exposing the application port directly to the public Internet.

---

# 22. Docker

Use:

- Docker
- Docker Compose

Docker Compose manages local and production infrastructure where appropriate.

Example:

```text
services:
  api
  postgres
  cloudflared
```

Keep the container architecture minimal.

---

# 23. CI/CD

Use:

- GitHub
- GitHub Actions

Baseline workflow:

```text
git push
   |
   v
GitHub Actions
   |
   +-- install
   +-- lint
   +-- typecheck
   +-- test
   +-- build
```

Deployment:

```text
Frontend
GitHub
  |
  v
Cloudflare Pages
```

```text
Backend
GitHub Actions
  |
  v
Docker image / deployment
  |
  v
VPS
```

---

# 24. Backup

PostgreSQL backups should be stored in Cloudflare R2.

Baseline approach:

```text
PostgreSQL
   |
   v
pg_dump
   |
   v
Cloudflare R2
```

Backups should eventually include:

- scheduled execution
- retention policy
- restore verification
- tenant-aware backup strategy

---

# 25. Technology Baseline

The current Classora baseline is:

```text
Frontend
- React
- Vite
- TypeScript
- Tailwind CSS
- shadcn/ui
- React Router
- TanStack Query
- TanStack Table
- Zustand
- React Hook Form
- Zod
- Axios
- date-fns
- Lucide React

Backend
- NestJS
- TypeScript
- Prisma
- PostgreSQL
- class-validator
- class-transformer
- Swagger / OpenAPI
- JWT
- Argon2
- Pino
- @nestjs/terminus

Infrastructure
- Cloudflare DNS
- Cloudflare Pages
- Cloudflare Tunnel
- Cloudflare R2
- VPS
- Docker
- Docker Compose

Quality
- ESLint
- Prettier
- Vitest
- Jest
- Supertest
- Playwright
- Sentry

Development
- pnpm
- pnpm workspaces
- Git
- GitHub
- GitHub Actions

Architecture
- Monorepo
- Modular Monolith
- REST API
- Database-per-tenant
- Feature-based frontend
- Module-based backend
```

---

# 26. Explicit Non-Goals

The following technologies are intentionally not part of the current baseline:

```text
Next.js
Redux
MobX
GraphQL
tRPC
Redis
Kafka
RabbitMQ
Elasticsearch
Kubernetes
Microservices
Event Sourcing
CQRS
WebSocket infrastructure
Nx
Turborepo
Keycloak
Auth0
```

This is not a permanent ban.

They should only be introduced when an actual product or technical requirement demonstrates that the existing stack is insufficient.

---

# 27. Development Principles

When implementing Classora:

1. Prefer the simplest solution that satisfies the current requirement.
2. Do not design for hypothetical future scale without evidence.
3. Avoid unnecessary abstractions.
4. Avoid generic wrappers created only for consistency.
5. Avoid excessive component and function extraction.
6. Keep business logic explicit and easy to follow.
7. Prefer vertical slices over building large unused foundations.
8. Reuse existing project conventions before introducing new patterns.
9. Do not add dependencies when the platform or existing stack already solves the problem adequately.
10. New technology decisions should have a concrete reason.

For AI-assisted development specifically:

> Do not generate architecture merely because it is commonly seen in enterprise projects.

Code should look intentional, idiomatic, and appropriate for the actual complexity of Classora.
