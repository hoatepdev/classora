# Training Center SaaS — AI Project Context

## 1. Project Overview

This project is a SaaS platform for operating training centers.

The product is positioned as:

> **Training Center Operating System**

It is not intended to be only a CRUD-based student management system.  
The long-term goal is to help a training center operate its daily activities from one system.

Target customers are mainly small training centers without dedicated IT teams.

The system may support training centers for:

- Primary school students
- Secondary school students
- High school students
- University students
- Foreign languages
- Skills training
- Other education/training models

The project owner currently handles development, deployment, infrastructure, database, monitoring, backup, and support.

Therefore, **operational simplicity is a first-class architectural requirement**.

The platform is expected to serve a small number of tenants (centers) and a small number of students overall. It is not designed for large-scale multi-tenancy. This expected scale is an explicit input to several architecture decisions below (tenant model, migrations, connection management) — do not over-build for hypothetical growth.

---

## 2. Product Goals

The MVP focuses on these core areas:

1. Student management
2. Class management
3. Scheduling
4. Attendance
5. Tuition / billing
6. Daily operations dashboard

Long-term capabilities may include:

- Smart Scheduling
- Makeup class management
- Rule Engine
- Parent portal
- CRM / admissions
- LMS
- Payroll
- White-label
- AI assistant
- Advanced analytics

These are future capabilities and should not increase MVP infrastructure complexity unless required.

---

## 3. User Roles

MVP users:

- Student
- Teacher
- Center Manager
- System Administrator

The authorization model must support flexible RBAC/permissions.

Avoid hard-coded checks such as:

```ts
if (role === "ADMIN") {
  // ...
}
```

Prefer permission-based authorization such as:

```text
student.read
student.create
student.update

class.read
class.create

attendance.read
attendance.write

billing.read
billing.collect

report.revenue.read
```

Permissions may also have scopes such as:

```text
ALL_BRANCHES
SELECTED_BRANCHES
OWN_CLASSES
SELF
```

### Branch

A tenant (training center) may have one or more branches (physical locations).

Class, Session, and Teacher availability are scoped to a branch.

If the MVP only needs to support a single branch per tenant, this should be stated explicitly so an AI coding agent does not build unnecessary multi-branch complexity ahead of need. Otherwise, `Branch` should exist as an explicit entity/module (see Section 8) before implementing Scheduling.

---

## 4. SaaS Tenant Model

Each training center is an independent tenant.

The chosen tenant architecture is:

> **Database-per-Tenant**

However, small tenants do not receive a dedicated PostgreSQL server.

Instead:

```text
PostgreSQL Server
├── control_db
├── center_a_db
├── center_b_db
├── center_c_db
└── center_d_db
```

Each center has its own database.

Multiple small centers share the same PostgreSQL server.

A large tenant may later be moved to a dedicated PostgreSQL server:

```text
PostgreSQL Server #1
├── center_a_db
├── center_b_db
└── center_c_db

PostgreSQL Server #2
└── center_big_db
```

This must be possible without changing business logic.

### Important

Do not introduce a shared-table `tenant_id` architecture unless there is a very strong reason.

Business tables inside each tenant database generally do not need `tenant_id`, because the database itself is the isolation boundary.

### Why database-per-tenant despite the operational-simplicity principle

Database-per-tenant has a real operational cost compared to a shared-schema `tenant_id` model: each new tenant requires creating a database, running migrations, and seeding defaults; schema migrations must loop over every tenant database instead of running once.

This cost is accepted because:

- The expected number of tenants is small, so per-tenant operations (create, migrate, backup) stay cheap and can even be handled manually or with a simple sequential script.
- Strong data isolation and independent backup/restore per tenant are high-value for this domain (student records, financial records) and are prioritized over the marginal operational overhead.

If the tenant count grows significantly beyond the current expectation, this trade-off should be revisited.

---

## 5. Control Database

A separate database named conceptually as:

```text
control_db
```

is used for SaaS-level information.

It may contain:

```text
tenants
tenant_domains
tenant_databases
plans
subscriptions
schema_versions
migration_history
feature_flags
```

Example tenant database mapping:

```text
CENTER_A
→ postgres-main
→ center_a_db

CENTER_BIG
→ postgres-big-01
→ center_big_db
```

The control database must not contain normal center business data such as:

- students
- classes
- attendance
- invoices
- payments

---

## 6. Tenant Resolution

The browser must never directly decide which database to connect to.

Example request flow:

```text
abc.example.com
       ↓
Frontend identifies tenant context
       ↓
NestJS
       ↓
Tenant Resolver
       ↓
Control DB
       ↓
TenantConnectionManager
       ↓
center_abc_db
```

After authentication, the access token/session may contain a tenant identifier.

Example concept:

```json
{
  "sub": "USER_001",
  "tenantId": "CENTER_001"
}
```

The backend must resolve the database from trusted server-side configuration.

### Handling database mapping changes

When a tenant's database mapping changes in `control_db` (see Section 22, moving a tenant to a dedicated PostgreSQL server), a decision is needed on active sessions/tokens:

- Either the tenant resolver always re-reads the current mapping per request (no invalidation needed), or
- Existing sessions/tokens are explicitly invalidated when a mapping change occurs.

This does not need to be fully designed yet, but should be decided before tenant migration between servers is implemented.

Never trust something like:

```http
X-Database: center_abc_db
```

from the frontend.

---

## 7. Tenant Connection Management

Do not create a new PostgreSQL connection for every request.

Do not create large permanent connection pools for every tenant.

Use a `TenantConnectionManager` that:

- Creates tenant database pools lazily
- Reuses existing pools
- Uses small pool sizes
- Evicts idle pools
- Limits the number of active tenant pools
- Can reconnect after database/server changes

Concept:

```text
Request
   ↓
TenantConnectionManager
   ↓
Pool exists?
  /       \
YES       NO
 |         |
reuse     create
           |
         cache
```

Inactive pools should be closed after a reasonable idle period.

The design must avoid connection explosion as tenant count grows.

---

## 8. Backend Architecture

Backend technology:

> **NestJS + TypeScript**

Architecture:

> **Modular Monolith**

Do not introduce microservices during the MVP without a demonstrated requirement.

Suggested modules:

```text
Identity
Tenant
Branch

Student
Teacher

Program
Course
Class
Enrollment
Session

Scheduling
Attendance
Leave
Makeup

Pricing
Invoice
Payment

Rule Engine
Dashboard
Audit
```

Keep module boundaries clear so selected modules can be extracted later if needed.

Business logic belongs in NestJS.

Do not move core business rules into Cloudflare Workers.

---

## 9. Core Domain Decisions

### Enrollment is a first-class entity

Do not model enrollment as only:

```text
Student <-> Class
```

Use:

```text
Student
   ↓
Enrollment
   ↓
Class
```

Enrollment may contain:

```text
status
enrolledAt
startDate
endDate
pricingPlanId
totalSessions
usedSessions
remainingSessions
source
note
```

Possible states:

```text
PENDING
ACTIVE
PAUSED
COMPLETED
CANCELLED
TRANSFERRED
```

This supports:

- Pause / reservation
- Transfer class
- Repeat study
- Cancellation
- Multiple simultaneous classes

### Session is a first-class entity

Do not store a class schedule only as:

```text
monday
wednesday
friday
18:00
```

Prefer:

```text
Class
   ↓
SchedulePattern
   ↓
generated Sessions
```

Example:

```text
Class: Math 9A

Pattern:
Mon-Wed-Fri
18:00 - 20:00

↓

Session 001
Session 002
Session 003
```

Each session can override:

- Teacher
- Room
- Time
- Status

This is required for realistic scheduling, attendance, rescheduling, and makeup classes.

---

## 10. Attendance

Attendance should support detailed status, not only present/absent.

Possible statuses:

```text
PRESENT
LATE
ABSENT_EXCUSED
ABSENT_UNEXCUSED
ONLINE
MAKEUP
```

MVP attendance methods:

- Teacher/manual attendance
- QR attendance

Future methods may include Face ID or other mechanisms, but should not complicate the MVP.

Attendance configuration may be tenant-specific, for example:

```text
lateThresholdMinutes
allowQrCheckIn
qrWindowBeforeMinutes
qrWindowAfterMinutes
```

---

## 11. Makeup Classes

Makeup classes are an important future differentiator.

Target flow:

```text
Student misses Session A
        ↓
Leave / Makeup Request
        ↓
System finds equivalent sessions
        ↓
Student selects suitable session
        ↓
Makeup registration
        ↓
Attendance at Session B
```

Do not overwrite attendance history.

Keep both:

```text
Original attendance: Absent
Makeup status: Completed
```

Future matching may use:

- Same subject
- Same course
- Same lesson/topic
- Tenant-defined rules

---

## 12. Scheduling

MVP scheduling should support:

- Manual scheduling
- Conflict detection
- Suggested schedules

Do not build a full optimization solver in the first version.

Potential constraints:

```text
Teacher availability
Room availability
Student availability
Room capacity
Teacher capability
Branch
Travel time
Maximum teaching hours
Existing sessions
Preferred schedules
Business calendar
```

Future Smart Scheduling may score candidate schedules.

---

## 13. Billing

Avoid modeling tuition as only a number on the Student table.

Preferred conceptual model:

```text
Enrollment
   ↓
Pricing Plan
   ↓
Invoice
   ↓
Invoice Item
   ↓
Payment
```

Future financial features may include:

- Installment payments
- Discounts
- Refunds
- Student credits/wallet
- Debt tracking

Financial history should generally be immutable.

Incorrect payments should usually be voided/reversed rather than hard-deleted.

---

## 14. Audit

Auditability is important, especially for:

- Attendance
- Tuition
- Payment
- Refund
- Class changes
- Session changes
- Permission changes

Audit records should capture:

```text
who
when
entity
operation
before
after
reason
```

Sensitive business records should not be hard-deleted unless there is a specific requirement.

---

## 15. Frontend Architecture

Frontend technology:

```text
React
Vite
TypeScript
Ant Design
TanStack Query
React Router
```

Frontend hosting:

> **Cloudflare Pages**

Initial applications may be organized as:

```text
apps/
├── web/
└── api/
```

or later:

```text
apps/
├── admin/
├── student/
└── api/
```

Do not introduce SSR unless the product later has a clear SEO or server-rendering requirement.

For the internal management app, SPA/PWA is preferred.

---

## 16. Cloudflare Architecture

Cloudflare is used primarily for:

```text
DNS
SSL
CDN
Pages
Tunnel
R2
```

Possible future Cloudflare services:

```text
Workers
Queues
Containers
```

These are not required for the MVP.

### Cloudflare DNS

Cloudflare manages application DNS and SSL.

Target domain pattern:

```text
app.example.com
api.example.com

abc.example.com
xyz.example.com
```

Future white-label support may allow:

```text
app.customer-domain.com
```

### Cloudflare Tunnel

Cloudflare Tunnel exposes the NestJS API without opening the application port directly to the Internet.

Concept:

```text
api.example.com
       ↓
Cloudflare
       ↓
Cloudflare Tunnel
       ↓
NestJS container
```

The VPS should not expose NestJS port `4101` publicly.

### Cloudflare R2

R2 stores:

- Student/avatar images
- Documents
- PDFs
- Course files
- Generated exports
- Database backup files

Do not store large binary files directly in PostgreSQL.

Prefer direct browser upload using presigned URLs where appropriate:

```text
Browser
   ↓ request upload permission
NestJS
   ↓
Presigned URL
   ↓
Browser ──────────→ R2
```

PostgreSQL stores only metadata and object keys.

---

## 17. Infrastructure

The MVP infrastructure should remain intentionally simple.

Current target:

```text
Cloudflare
├── DNS
├── Pages
├── Tunnel
└── R2

VPS
└── Docker Compose
    ├── NestJS
    ├── PostgreSQL
    └── cloudflared
```

Avoid adding unnecessary services.

Not required for MVP:

```text
Kubernetes
Microservices
Redis
Kafka
RabbitMQ
WebSocket infrastructure
Cloudflare Queues
Cloudflare Containers
Worker API Gateway
Database sharding
```

Add infrastructure only after a real bottleneck or operational need is demonstrated.

---

## 18. Deployment

Source control:

> **GitHub**

Frontend:

```text
GitHub
   ↓
Cloudflare Pages
   ↓
automatic deployment
```

Backend target:

```text
GitHub
   ↓
CI/CD
   ↓
VPS
   ↓
Docker Compose
   ↓
NestJS
```

A suitable repository structure is:

```text
training-center/
├── apps/
│   ├── web/
│   └── api/
│
├── infrastructure/
│   ├── docker-compose.yml
│   ├── cloudflared/
│   └── backup/
│
├── scripts/
│   ├── create-tenant.sh
│   ├── migrate-tenants.sh
│   └── backup-tenants.sh
│
└── .github/
    └── workflows/
        ├── frontend.yml
        └── backend.yml
```

This structure may evolve, but keep infrastructure and tenant automation explicit.

---

## 19. Tenant Provisioning

Tenant creation must eventually be automated.

Target flow:

```text
Create Tenant
     ↓
Register in control_db
     ↓
Create PostgreSQL database
     ↓
Run migrations
     ↓
Seed default roles/permissions/settings
     ↓
Create owner account
     ↓
Activate tenant
```

A CLI/script is sufficient for the MVP.

A Super Admin UI is not required initially.

---

## 20. Tenant Database Migrations

Database-per-tenant means schema migrations must be managed centrally.

Do not SSH into the server and manually migrate each tenant database.

Provide an automated migration command such as:

```bash
npm run tenants:migrate
```

Conceptual flow:

```text
Tenant A
backup → migrate → verify

Tenant B
backup → migrate → verify

Tenant C
backup → migrate → verify
```

Track schema/migration versions in the control database.

Migration failures must be visible and should not silently leave unknown tenant states.

Given the small expected number of tenants, a simple sequential script with manual intervention on failure is sufficient for now. Automated per-tenant resume/retry orchestration is not required until tenant count grows significantly — do not build this ahead of need.

---

## 21. Backup and Restore

Independent tenant restore is a core requirement.

Backup flow:

```text
center_abc_db
      ↓
pg_dump
      ↓
compress
      ↓
Cloudflare R2
```

Suggested logical structure:

```text
database-backups/
├── center_abc/
│   ├── YYYY-MM-DD/
│   └── ...
└── center_xyz/
```

Prefer restoring into a new database first.

Example:

```text
center_abc_db
      ↓
incident
      ↓
center_abc_restore_YYYYMMDD
      ↓
pg_restore
      ↓
verify
      ↓
switch tenant DB mapping
```

Avoid destructive in-place restore unless necessary.

---

## 22. Scaling Strategy

Do not design for extreme scale prematurely.

Expected centers and user counts are relatively small initially.

Scale in this order:

```text
1. Single VPS
2. Increase VPS CPU/RAM
3. Move to a larger VPS
4. Separate PostgreSQL from application server
5. Run multiple NestJS instances
6. Move large tenant DBs to dedicated PostgreSQL servers
```

Large tenants can be moved without changing business logic by updating their database mapping in `control_db`.

The backend should be stateless enough to allow multiple NestJS instances later.

---

## 23. Realtime and Background Jobs

Realtime is not required for the MVP.

Dashboard refresh every 30–60 seconds is acceptable.

Prefer polling using TanStack Query rather than introducing WebSockets.

Example:

```ts
useQuery({
  queryKey: ["today-operations"],
  queryFn: getTodayOperations,
  refetchInterval: 30000,
});
```

Background job requirements are currently low.

Use simple scheduling/cron mechanisms first.

Only introduce Cloudflare Queues or another queue system when there are real workloads such as:

- Large imports
- Batch invoice generation
- High-volume notifications
- Heavy report generation
- Rule processing
- Long-running background jobs

---

## 24. Architectural Principles

When making technical decisions, optimize in this order:

1. Operational simplicity
2. Correctness
3. Data isolation
4. Backup and recovery
5. Maintainability
6. Cost
7. Performance
8. Scalability

Do not optimize for hypothetical millions of users.

Do not add infrastructure because it is fashionable.

Every new infrastructure component must solve a demonstrated problem.

---

## 25. AI Working Rules

When an AI coding agent works on this repository, it should follow these rules.

### Preserve architecture

Do not introduce:

- Microservices
- Kubernetes
- Shared tenant tables
- Redis
- Queues
- WebSockets
- Cloudflare Workers for core business logic

unless the task explicitly requires them and the architectural impact is explained.

### Prefer incremental changes

Do not rewrite large areas unnecessarily.

Prefer:

```text
small change
→ test
→ verify
→ continue
```

### Respect module boundaries

Business logic should remain inside the correct NestJS module.

Do not create cross-module shortcuts that make future maintenance harder.

### Avoid over-engineering

This SaaS is initially operated by one developer.

Prefer the simplest solution that:

- is correct
- is testable
- is maintainable
- preserves tenant isolation

### Data safety first

Be especially conservative when modifying:

- Tenant routing
- Database connection management
- Migrations
- Backup/restore
- Authentication
- Authorization
- Attendance history
- Financial records

### Keep history

Do not silently delete or overwrite important business history.

Prefer explicit states, audit logs, transfer records, and reversals.

---

## 26. Current Implementation Priority

The project already has:

- Domain
- VPS
- GitHub

The first infrastructure milestone should be a vertical slice:

```text
React/Vite
   ↓
Cloudflare Pages
   ↓
api.example.com
   ↓
Cloudflare Tunnel
   ↓
NestJS
   ↓
PostgreSQL
```

Start with:

```http
GET /health
```

Verify the entire deployment path before implementing tenant routing.

After `/health` works:

```text
Tenant Resolver
      ↓
control_db
      ↓
center_demo_db
```

Then begin implementing business modules.

---

## 27. Definition of a Good Solution

A good solution for this project should:

- Be understandable by one developer
- Be easy to deploy
- Be easy to debug
- Be easy to back up
- Allow a single tenant to be restored independently
- Keep customer data isolated
- Avoid unnecessary infrastructure
- Allow larger tenants to move to dedicated database servers later
- Preserve a path for future scale without paying the complexity cost today

If a proposed design is significantly more complicated than the architecture described above, the AI should explicitly explain what concrete problem the additional complexity solves before implementing it.
