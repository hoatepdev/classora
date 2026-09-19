# API documentation

Set `ENABLE_SWAGGER=true` before starting the API to expose Swagger. Any other value disables both the UI and OpenAPI JSON, including in production.

| Access path | Swagger UI | OpenAPI JSON |
| --- | --- | --- |
| Direct NestJS | `/docs` | `/docs/openapi.json` |
| Same-origin web gateway | `/api/docs` | `/api/docs/openapi.json` |

The UI defaults to the `/api` server so requests pass through the same-origin Nginx gateway. Select `/` when using Swagger directly against NestJS. Protected operations use `Authorization: Bearer <access-token>`.

`GET /health` is process liveness only. `GET /health/ready` is public readiness and returns `200` only when the control database answers `SELECT 1`; it returns `503` when the control database is unavailable. Tenant identity is resolved from the request hostname and authorized against the authenticated user's membership before the tenant database is opened. Clients must not send a tenant ID, database name, or tenant-selection header.

Errors use Nest's existing `statusCode` and `message` response fields. Business conflicts use HTTP `409`; validation, authentication, authorization, and missing resources use `400`, `401`, `403`, and `404` respectively.
