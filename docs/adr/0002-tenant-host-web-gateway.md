# Tenant-host web gateway

## Status

Accepted

## Context

Classora resolves tenant identity from `<tenant>.classora.io.vn`. A frontend hosted at `app.classora.io.vn` calling `api.classora.io.vn` replaces that hostname, so the API cannot resolve the tenant without adding a client-controlled tenant selector.

## Decision

- Serve the React/Vite build from an Nginx container in the existing Docker Compose stack.
- Publish wildcard tenant hostnames through Cloudflare Tunnel to the Nginx web gateway.
- Have browsers call same-origin `/api` URLs.
- Strip `/api` at the gateway and preserve the original `Host` when proxying to NestJS.
- Keep NestJS routes unprefixed internally.
- Do not send tenant IDs, database names, or custom tenant headers from the browser.

The production request path is:

```text
<tenant>.classora.io.vn
→ Cloudflare Tunnel
→ Nginx web gateway
→ authenticate
→ resolve hostname
→ authorize membership
→ tenant database
```

## Consequences

Frontend and API deploy together behind one ingress. NestJS and PostgreSQL remain private on the Docker network. Cloudflare must route `*.classora.io.vn` to `http://web:80` without overriding the HTTP Host header. Local browser testing requires a tenant hostname mapped to loopback.
