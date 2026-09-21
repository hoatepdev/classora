# Classora

SaaS operating system for small training centers.

## Local baseline

Prerequisites:

- Docker Desktop with Compose
- Node.js version from `.nvmrc`
- Corepack-enabled pnpm `10.15.1`

The disposable Compose workflow is the canonical local acceptance path. It
starts PostgreSQL, applies control and tenant migrations before the API, serves
the web gateway, preserves tenant `Host` headers, and exercises login and the
Students slice.

```bash
pnpm install --frozen-lockfile
cp infrastructure/.env.example infrastructure/.env
```

Set safe local-only values in `infrastructure/.env` before starting:

```text
POSTGRES_PASSWORD=local-postgres-password
JWT_SECRET=replace-with-at-least-32-random-bytes
INITIAL_USER_EMAIL=owner@example.test
INITIAL_USER_PASSWORD=local-owner-password-123
INITIAL_USER_NAME=Local Owner
INITIAL_TENANT_SLUG=demo
CLOUDFLARE_TUNNEL_TOKEN=local-disabled
```

Start the stack:

```bash
docker compose --env-file infrastructure/.env \
  -f infrastructure/docker-compose.yml up -d
```

The one-shot `api-migrate` service must complete before the API starts. The
bootstrap owner command is separate and should be run once for a fresh control
volume:

```bash
docker compose --env-file infrastructure/.env \
  -f infrastructure/docker-compose.yml run --rm --no-deps \
  -e INITIAL_USER_EMAIL -e INITIAL_USER_PASSWORD \
  -e INITIAL_USER_NAME -e INITIAL_TENANT_SLUG \
  api npm run auth:create-owner
```

Open the tenant hostname through the web gateway:

```text
http://demo.classora.io.vn:4100
```

For local browser testing, map the hostname to loopback outside this
repository, for example in `/etc/hosts`:

```text
127.0.0.1 demo.classora.io.vn
```

The browser uses same-origin `/api` requests. Do not add tenant headers,
tenant IDs, or database names. The API resolves the tenant from the hostname,
checks control-database membership, and only then opens the trusted tenant
database. `DEV_TENANT_SLUG` is a development-only fallback for host-running
the API and is rejected in production.

For the host-running development servers, use a PostgreSQL instance reachable
from `localhost`, configure an untracked `apps/api/.env`, apply the control and
tenant migrations, then run:

```bash
pnpm dev
```

The host-running path requires the demo tenant database to exist before
`db:migrate:all`; Compose creates it through `infrastructure/postgres-init`.

## Verification commands

```bash
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test` currently runs the API Vitest suite. The web package has no test
suite yet. Linting is not available because ESLint/Prettier are not installed
or configured; this remains a tracked follow-up rather than a fake green
command.

For the full disposable acceptance flow, use:

```bash
SMOKE_ENV_FILE=/path/to/disposable.env \
SMOKE_PROJECT_NAME=classora-smoke-local \
./scripts/smoke-prod.sh
```

The smoke environment must target the disposable Compose PostgreSQL service.
Never point it at a development or production database.

## Common failures

- Missing required environment values: check `infrastructure/.env`; Compose
  uses required-value validation and the API fails closed.
- API starts before migrations finish: inspect `api-migrate` logs and rerun the
  migration service after correcting the database problem.
- Tenant not found: use the registered tenant hostname or set
  `DEV_TENANT_SLUG` only for intentional host-running development.
- Existing database with unknown schema: tenant migration rejects it instead
  of guessing or marking migrations applied. Inspect and reconcile it before
  retrying.

See [CONTEXT.md](./CONTEXT.md), [local roadmap](./docs/product/local-roadmap.md),
[Cloudflare and gateway setup](./docs/cloudflare-setup.md), and the
[production environment contract](./docs/operations/environment.md).
