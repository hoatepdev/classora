# Authorization and team management

## Status

Accepted

## Decision

Classora authorization is evaluated per request from the authenticated user’s membership in the hostname-resolved tenant:

```text
User → active Membership → built-in Role → Permission
```

The API owns the permission matrix. The web client receives permissions through `/auth/me` and uses them only to improve UX; API guards remain authoritative.

Permission names use `resource.action` (for example, `student.read`, `student.write`, and `team.manage`). Built-in roles are `OWNER`, `CENTER_ADMIN`, `ACADEMIC_MANAGER`, `ACCOUNTANT`, `SALE`, `STAFF`, and `TEACHER`.

Membership status is tenant-specific and is independent of global user status. Only active memberships authorize requests. Team mutations are scoped by the trusted resolved tenant and run in the control database. Invitation tokens are random, hashed before persistence, expiring, and single-use. Without an email transport, invitation creation returns a local copyable token/link and does not claim that email was sent.

The tenant request order remains:

```text
authenticate
→ resolve hostname tenant
→ find active membership
→ check permission
→ acquire tenant database only for tenant-data routes
```

Every tenant must retain at least one active `OWNER`; demotion, disabling, or removal of the final owner is rejected.

## Consequences

Existing `ADMIN` memberships migrate to `CENTER_ADMIN`. Team control-plane routes resolve tenant membership but do not open a tenant database pool. LOCAL-02 remains responsible for audit logging of these security-sensitive mutations.
