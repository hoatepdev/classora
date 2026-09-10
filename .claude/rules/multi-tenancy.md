---
paths:
  - "apps/api/**"
  - "infrastructure/**"
---

# Multi-tenancy

Classora uses database-per-tenant isolation.

A request must follow:

request
→ authenticated identity
→ resolve tenant
→ authorize membership/permission
→ resolve tenant database
→ execute domain operation

Never trust a tenant ID supplied by the client as sufficient authorization.

Never:

- query tenant data before tenant resolution
- silently fall back to another tenant database
- reuse tenant context across unrelated requests
- derive database credentials directly from user-controlled input
- leak tenant-specific cache/state across tenants

Any change touching tenant resolution, database connection management, authentication or authorization requires explicit tenant-isolation review.

Tenant isolation takes precedence over Ponytail minimalism.
