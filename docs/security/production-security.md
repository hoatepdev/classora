# Production security contract

This document records controls implemented in the repository and the checks that must be performed on the real VPS and Cloudflare account. It does not claim external configuration that has not been observed.

## Authentication and tenant trust boundary

- API authentication uses email/password login, Argon2id password hashes, and signed JWT access tokens.
- Authentication is not authorization. Tenant routes require an active user, hostname-resolved tenant, and control-database membership.
- Classora uses database-per-tenant isolation. The client cannot select a tenant database and no `X-Tenant-ID` header is accepted.
- Nginx preserves the original tenant `Host` and `X-Forwarded-Host`; NestJS resolves the hostname against trusted control-database metadata before acquiring a tenant pool.
- `/health/tenant/query` is an authenticated tenant database check. `/health/ready` checks only the control database and never scans all tenant databases.

## Secrets

- Production secrets live outside Git in root-owned mode-`0600` files or an equivalent secret mechanism.
- `POSTGRES_PASSWORD`, `JWT_SECRET`, `CLOUDFLARE_TUNNEL_TOKEN`, R2 keys, bootstrap passwords, and tenant-owner passwords are secrets.
- Bootstrap credentials are one-shot inputs and must be removed from steady-state API configuration after owner creation/provisioning.
- Secrets are never written to release records, backup manifests, object keys, logs, or documentation.
- Rotate credentials through an explicit maintenance procedure and verify dependent services after rotation. Rotating `JWT_SECRET` invalidates existing access tokens.

## Proxy and client-IP boundary

Cloudflare terminates public TLS and sends traffic through Cloudflare Tunnel to the loopback-bound Nginx gateway. Nginx overwrites forwarding headers and preserves the tenant Host. It trusts `CF-Connecting-IP` only because the current topology allows Nginx traffic from the Tunnel path and host loopback; a new ingress path must introduce a fixed trusted source range before this remains safe. Express trusts exactly the Nginx hop.

The application login limiter is 10 requests/minute and the default API limiter is 120 requests/minute. With the Nginx real-IP mapping, these limits use the client IP rather than one shared Tunnel connector address. Cloudflare edge/WAF rate limits remain operator-owned and should be configured before relying on the application limiter as the only abuse control.

The repository must never trust arbitrary Internet-supplied forwarding headers, client tenant headers, or client database selectors for authorization.

## HTTP security ownership

Nginx owns response headers and the request body limit so the SPA and API share one gateway policy:

- HTTPS/TLS termination, WAF, edge rate limiting, and Tunnel ingress: Cloudflare/operator configuration.
- `Strict-Transport-Security`: Nginx currently emits a conservative six-month policy; verify Cloudflare HSTS is not also enabled to avoid conflicting ownership. Do not add `includeSubDomains` or preload until all subdomains are confirmed HTTPS-only.
- `Content-Security-Policy`: Nginx emits a same-origin policy compatible with the current Vite build; inline styles are allowed narrowly because the current UI uses them. Browser verification is still required after deployment.
- `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`: Nginx.
- Request body size: Nginx limits requests to 1 MiB; Nest/Express retains its smaller JSON parser limit.
- CORS: intentionally absent. The browser uses same-origin `/api`; adding broad CORS would weaken the boundary.

## Swagger

`ENABLE_SWAGGER` must be `false` in production. The API fails startup if Swagger is intentionally enabled under `NODE_ENV=production`, because the current `/docs` and `/docs/openapi.json` endpoints are unauthenticated. A future operator-only documentation requirement must add an explicit access boundary rather than expose these routes publicly.

## Logging and request IDs

Every API response includes `X-Request-Id`; a bounded incoming value is reused, otherwise the API generates one. Access/error logs contain only diagnostic metadata: timestamp, level, category, request ID, method, route, status, duration, and resolved tenant/user IDs when available. They do not contain passwords, Authorization headers, JWTs, database URLs/passwords, R2 credentials, Tunnel tokens, request bodies, or full environment values.

Docker JSON-file logs have bounded rotation. This is local protection, not centralized retention or alerting.

## Backups

Backups include the control database and registered tenant databases, use restrictive local permissions and checksums, and require a complete marker. Production R2 storage must be private, least-privilege, and verified by size/checksum after upload. Separate database dumps are not one globally atomic snapshot; schedule quiet periods when a stricter recovery point is required. Restore into generated disposable names before any production replacement.

## Accepted current limitations

- Access tokens remain in browser `localStorage`; same-origin XSS could exfiltrate an active token. The restrictive CSP, validation, and no-third-party-script policy reduce exposure but do not eliminate this risk. Move to an appropriate secure-session design only when the product authentication contract requires it.
- Application rate limiting is process-local and therefore single-instance only. A multi-instance deployment requires a shared limiter or stronger edge enforcement before scaling horizontally.
- Logs are stdout/Docker-local; no central aggregation, metrics, tracing, or uptime alerting is implemented.
- Cloudflare TLS mode, WAF/rate limits, Tunnel ingress/Host preservation, DNS, VPS firewall, secret injection/removal, R2 credentials, timer execution, retention, alerting, and live restore/release drills require operator evidence.

## External verification checklist

- [ ] Cloudflare TLS mode is Full (strict) and public HTTP behavior is HTTPS-only.
- [ ] Cloudflare HSTS setting does not conflict with Nginx ownership.
- [ ] Tunnel ingress points to `http://web:80` without replacing the tenant Host.
- [ ] VPS firewall blocks direct API/PostgreSQL exposure; only loopback Nginx is published.
- [ ] Cloudflare edge/WAF rate limits are configured for public authentication abuse.
- [ ] Bootstrap secrets are absent from the steady-state API container.
- [ ] Private R2 bucket and least-privilege token work, including restore verification.
- [ ] A browser check confirms the SPA loads and no CSP violations break required behavior.
- [ ] Logs and backups have operator-owned retention, alerting, and capacity checks.
