# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + Vite + TypeScript SPA. UI layer: shadcn/ui (confirmed 2026-09-10, replacing the earlier Ant Design plan in docs/architecture-context.md). Server state: TanStack Query. Client state: Zustand, only for genuine client/application state. Router: not yet confirmed (architecture doc says React Router; current frontend rules omit it). Hosting: Cloudflare Pages. No SSR.

## Users

Primary: the center manager, running the day from Classora — today's sessions, attendance, enrollments, tuition collection — from one system. Small training centers without dedicated IT teams (K-12 tutoring, foreign languages, skills training) are the target customers.

MVP roles: Student, Teacher, Center Manager, System Administrator. Authorization is permission-based (`student.read`, `billing.collect`, …) with scopes (`ALL_BRANCHES`, `SELECTED_BRANCHES`, `OWN_CLASSES`, `SELF`), never hard-coded role checks.

## Product Purpose

Classora is a SaaS platform positioned as a **Training Center Operating System**: it exists so a center can operate its daily activities from one system, not just manage student records. MVP scope: student management, class management, scheduling, attendance, tuition/billing, and a daily operations dashboard. Success means a center manager can run the day end-to-end without spreadsheets or a second system.

## Positioning

A neighboring product could not truthfully claim: the center's whole daily operation in one system, built on first-class Enrollment and Session entities. Enrollment carries status, pricing plan, and session accounting (used/remaining), enabling pause, transfer, repeat study, and multiple simultaneous classes. Sessions are generated from schedule patterns and individually overridable, which is what makes realistic attendance, rescheduling, and makeup classes possible. Database-per-tenant isolation of student and financial records is part of the trust promise to centers.

## Operating Context

- One developer handles development, deployment, infrastructure, database, monitoring, backup, and support — operational simplicity is a first-class requirement.
- Small number of tenants (centers), each currently single-branch; small number of students overall. Not designed for large-scale multi-tenancy.
- Vietnamese training centers; the product is operated remotely via VPS + Docker Compose behind Cloudflare Tunnel.
- No realtime: dashboard refresh every 30–60 s via TanStack Query polling is acceptable; no WebSockets in the MVP.
- Terminology: a tenant is a training center; classes generate Sessions from SchedulePatterns; attendance and financial records are history.

## Capabilities and Constraints

MVP capabilities: student management, class management, scheduling (manual, with conflict detection), attendance (teacher/manual + QR; statuses PRESENT, LATE, ABSENT_EXCUSED, ABSENT_UNEXCUSED, ONLINE, MAKEUP), tuition/billing (Enrollment → Pricing Plan → Invoice → Invoice Item → Payment), daily operations dashboard.

Constraints:

- Architecture: NestJS modular monolith backend; database-per-tenant with a control_db for SaaS-level data; no microservices, Kubernetes, Redis, Kafka, RabbitMQ, queues, or WebSockets without a documented ADR and demonstrated need.
- Financial history is immutable: incorrect payments are voided/reversed, never hard-deleted. Audit records (who/when/entity/operation/before/after/reason) are required for attendance, tuition, payments, and permission changes.
- Business tables inside a tenant database do not carry `tenant_id`; the database is the isolation boundary.
- Undecided product facts: router choice (React Router per architecture doc, absent from current frontend rules); multi-branch support (explicitly out of MVP, revisit when a real tenant needs it); future capabilities (smart scheduling, makeup matching, parent portal, CRM, LMS, payroll, white-label, AI assistant) must not drive MVP complexity.

## Brand Commitments

Name: **Classora** (classora.io.vn). UI language: Vietnamese-first for the MVP, English later if needed. No other identity assets, voice, or visual commitments are confirmed.

## Evidence on Hand

- `docs/architecture-context.md` — the authoritative planning document this record is drawn from.
- No marketing site, screenshots, testimonials, customer list, or case studies exist. Future work must not fabricate customers, proof, benchmarks, or claims.

## Product Principles

1. **Operational simplicity wins.** One developer operates everything; the simplest correct thing beats the impressive thing, and added complexity must name the concrete problem it solves.
2. **The center's day is the unit of work.** Design around daily operations — today's sessions, who showed up, who owes what — not around database tables.
3. **Data is trusted history.** Attendance and financial records are kept and reversed, never silently overwritten or deleted.
4. **Small-scale honesty.** Build for a handful of tenants and one branch each; infrastructure and abstractions arrive only after a measured need.
5. **Trust is isolation.** A center's student and financial data must never cross a tenant boundary; tenant boundaries are security boundaries.

## Accessibility & Inclusion

Vietnamese-first UI: chosen typefaces and interfaces must render Vietnamese diacritics correctly. No other product-specific accessibility standard has been established.
