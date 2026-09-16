# Cloudflare Setup for Classora

> Production domain: `classora.io.vn`

## 1. Architecture

Each tenant uses its own hostname and calls the API on the same origin:

```text
https://<tenant>.classora.io.vn
                 │
                 ▼
          Cloudflare Tunnel
                 │
                 ▼
            web:80 (Nginx)
              │       │
       static SPA     /api/*
                      │ strip /api, preserve Host
                      ▼
                  api:4101
                      │
                      ▼
                PostgreSQL
```

The browser always calls relative `/api` URLs. It must never send a tenant ID, database name, or custom tenant header. Nginx preserves the original `<tenant>.classora.io.vn` `Host`; NestJS resolves that hostname against trusted control-database metadata before opening a tenant database.

Public and internal paths are intentionally different:

```text
Public                     Internal NestJS
/api/health             -> /health
/api/auth/login         -> /auth/login
/api/students           -> /students
/api/students/:id       -> /students/:id
```

Do not add a global `/api` prefix in NestJS while the gateway strips this prefix.

## 2. Containers

Docker Compose runs:

```text
web          Nginx serving the Vite build and proxying /api
api          NestJS
postgres     control and tenant databases
cloudflared  outbound Cloudflare Tunnel connector
```

Only the web gateway receives Tunnel traffic. API port `4101` and PostgreSQL port `5432` stay inside the Docker network.

For local verification, Compose binds the gateway only to loopback:

```text
127.0.0.1:${WEB_PORT:-8080}
```

This is not a public production port.

## 3. Environment

Copy `infrastructure/.env.example` to an untracked `infrastructure/.env` and set real values there.

```env
PORT=4101
WEB_PORT=8080
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=classora
POSTGRES_PASSWORD=<strong-password>
POSTGRES_DB=classora
CONTROL_DB_NAME=control_db
JWT_SECRET=<at-least-32-characters>
INITIAL_USER_EMAIL=<owner-email>
INITIAL_USER_PASSWORD=<at-least-12-characters>
INITIAL_USER_NAME=<owner-name>
INITIAL_TENANT_SLUG=demo
CLOUDFLARE_TUNNEL_TOKEN=<tunnel-token>
```

Do not commit `.env`, passwords, JWT secrets, or Tunnel tokens.

The browser uses same-origin `/api`, so production does not require CORS configuration.

## 4. Create the Tunnel

In Cloudflare Dashboard:

```text
Networking
→ Tunnels
→ Create Tunnel
```

Name it `classora-production`, choose the `cloudflared` connector, and put only its Tunnel token in `infrastructure/.env`.

The Compose service runs the remotely managed Tunnel:

```text
cloudflared tunnel --no-autoupdate run
```

Do not confuse a Tunnel token with a Cloudflare API token.

## 5. Publish tenant hostnames

In the `classora-production` Tunnel, add a wildcard public hostname:

```text
Hostname: *.classora.io.vn
Service:  http://web:80
```

Leave the origin HTTP Host Header override unset. The web gateway must receive the original public tenant hostname.

Configure the corresponding proxied wildcard DNS record in Cloudflare. Exact records such as the apex or a marketing site may remain separate because exact DNS records take precedence over the wildcard.

Do not publish a separate browser API at `api.classora.io.vn`: that would replace the request hostname and prevent the current hostname-based tenant resolver from identifying the tenant.

These are Cloudflare Dashboard operations; repository deployment does not perform them automatically.

## 6. Start and inspect

From `infrastructure/`:

```bash
docker compose up -d --build
docker compose ps
```

Expected services:

```text
postgres      healthy
api           healthy
web           healthy
cloudflared   running
```

On the first deployment, create the initial owner and tenant membership once:

```bash
docker compose exec api npm run auth:create-owner
```

This command uses the `INITIAL_USER_*` and `INITIAL_TENANT_SLUG` values from `infrastructure/.env`. Do not add it to container startup: rerunning it updates the owner's password and membership.

Inspect logs:

```bash
docker compose logs -f api
docker compose logs -f web
docker compose logs -f cloudflared
```

## 7. Verify routing

Local gateway health check while preserving a tenant Host:

```bash
curl -H 'Host: demo.classora.io.vn' http://127.0.0.1:8080/api/health
```

Public health check after Cloudflare configuration:

```bash
curl https://demo.classora.io.vn/api/health
```

Then verify the authenticated journey in a browser opened at the tenant hostname:

```text
/login
→ /students
→ /students/new
→ /students/:id
→ /students/:id/edit
```

Security checks:

- an unauthenticated tenant request returns `401` before a tenant pool is opened;
- a user without membership returns `403` before a tenant pool is opened;
- a student ID from another tenant returns `404`;
- browser requests contain no tenant ID/header/database name;
- neither port `4101` nor `5432` is publicly exposed.

## 8. Local tenant hostname

The Vite development server already proxies `/api` to NestJS, strips `/api`, and preserves the incoming Host. For browser testing, map a development tenant hostname to loopback outside the repository, for example:

```text
127.0.0.1 demo.classora.io.vn
```

Open:

```text
http://demo.classora.io.vn:4100
```

Direct `localhost` does not carry tenant identity and fails tenant resolution by default. To intentionally use it with `pnpm --filter api dev`, set `DEV_TENANT_SLUG=demo` in the untracked `apps/api/.env`.

## 9. Operational rules

- Use one shared web image; do not deploy one frontend per tenant.
- Tenant identity comes from the validated hostname and trusted control database.
- Do not work around hostname resolution with a client tenant header.
- Do not expose PostgreSQL or NestJS directly to the Internet.
- Back up and verify databases before production migrations.
- Production deployment and Cloudflare mutations require explicit approval.
