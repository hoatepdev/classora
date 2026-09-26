# Portal identity and authorization

## Status

Accepted

## Context

Parents and Students need tenant-scoped self-service access, but Classora staff authorization is built on `TenantMembership -> TenantRole -> Permission`. Treating portal users as staff would blend privileges and expose staff DTOs. Portal subjects live in tenant databases while global credentials and access grants live in the control database, so normal cross-database foreign keys are unavailable.

## Decision

Classora reuses the global `User`, existing password hash, login endpoint, JWT, hostname tenant resolution, and tenant connection manager. Authorization remains two independent branches:

```text
                    ┌─ TenantMembership ──> Staff App
Global User ────────┤
                    └─ PortalAccess ───────> Parent / Student Portal
```

`PortalAccess` records the tenant and a `GUARDIAN` or `STUDENT` subject ID. It is not a membership, carries no staff role or permissions, and may be disabled or removed without changing the global User, staff membership, or access in another tenant.

Portal routes use an explicit `@PortalTenantRoute()` marker and `PortalAccessGuard`. Existing `@TenantRoute()` routes remain staff-only. The portal guard authenticates the User, resolves the tenant from the hostname, loads active access grants for that tenant and User, validates subjects in the trusted tenant database, and derives accessible Students from current relationships:

```text
Guardian PortalAccess
-> Guardian
-> current StudentGuardian rows
-> Students

Student PortalAccess
-> exactly that Student
```

Client-supplied Student, Guardian, Session, Invoice, or Message IDs never establish authorization. Every Student route checks the requested Student against the guard-derived set before querying. Billing additionally rechecks the current `StudentGuardian.isBillingContact` relationship on every request. Staff membership and permissions are never consulted by portal projections, including when the same User has both access types.

Portal invitations reuse the global User identity and the Team invitation security pattern: random activation tokens, SHA-256 hashes at rest, expiry, revocation, resend replacement, and conditional single-use consumption in a control transaction. Invitation creation and activation validate the subject and its current normalized email in the resolved tenant database. Raw tokens are returned once to authorized staff for local delivery and are never logged, audited, or persisted.

Portal APIs expose dedicated allowlisted DTOs for profile, enrollment, schedule, finalized attendance, makeup, authorized billing, and LOCAL-11 IN_APP messages. They do not serialize staff Student 360, billing, attendance, or communication responses.

## Consequences

A global User can be staff and/or own multiple explicitly invited portal subjects without identity duplication. Removing a Guardian relationship or billing-contact flag takes effect on the next request without modifying `PortalAccess`. Portal-only users cannot call staff APIs, and staff privileges cannot expand portal scope. Cross-database subject references are protected by validation at invitation creation, activation, and each portal request rather than an unavailable foreign key.
