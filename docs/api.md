# API documentation

Set `ENABLE_SWAGGER=true` before starting the API to expose Swagger. Any other value disables both the UI and OpenAPI JSON, including in production.

| Access path | Swagger UI | OpenAPI JSON |
| --- | --- | --- |
| Direct NestJS | `/docs` | `/docs/openapi.json` |
| Same-origin web gateway | `/api/docs` | `/api/docs/openapi.json` |

The UI defaults to the `/api` server so requests pass through the same-origin Nginx gateway. Select `/` when using Swagger directly against NestJS. Protected operations use `Authorization: Bearer <access-token>`.

`GET /health` is process liveness only. `GET /health/ready` is public readiness and returns `200` only when the control database answers `SELECT 1`; it returns `503` when the control database is unavailable. Tenant identity is resolved from the request hostname and authorized against the authenticated user's membership before the tenant database is opened. Clients must not send a tenant ID, database name, or tenant-selection header.

Errors use Nest's existing `statusCode` and `message` response fields. Business conflicts use HTTP `409`; validation, authentication, authorization, and missing resources use `400`, `401`, `403`, and `404` respectively.

## Authorization and team

Tenant authorization is derived from the authenticated user's active membership in the hostname-resolved tenant. Clients must not send tenant IDs, roles, or permissions as authorization input. Permission names use `resource.action`; `/auth/me` returns membership role, status, and permissions for frontend UX checks, but the backend remains authoritative.

Team endpoints include `GET /team/members`, `POST /team/invitations`, invitation resend/accept, role/status changes, removal, and `GET /team/roles`. Invitation tokens are hashed, expire after 48 hours, and are single-use. Because no mail transport is configured, the local flow returns a copyable invitation token and does not claim an email was sent.

Students require `student.read` for reads and `student.write` for creation/updates. Missing authentication returns 401; missing active membership or permission returns 403. Team operations never use a client-supplied tenant selector.
