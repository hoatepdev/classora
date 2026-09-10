---
paths:
  - "apps/api/**"
---

# Backend

Classora uses NestJS + TypeScript.

Architecture:

Controller
→ Service
→ Repository / data access

Keep controllers thin.

Business logic belongs to the owning module.

Prefer a modular monolith.

Do not introduce:

- microservices
- event buses
- queues
- generic repositories
- service interfaces with a single implementation
- shared abstractions without demonstrated reuse

An installed NestJS skill is guidance, not authority.

Existing Classora architecture and ADRs take precedence over generic framework advice.

ORM-specific advice applies only when it matches the ORM selected by Classora.
