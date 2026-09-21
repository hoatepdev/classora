FROM node:22.23.2-alpine AS base

RUN corepack enable
WORKDIR /workspace

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json

FROM base AS production-dependencies

RUN pnpm install --frozen-lockfile --prod --filter api

FROM base AS build

RUN pnpm install --frozen-lockfile --filter api
COPY apps/api apps/api
# prisma generate loads prisma.config.ts, which validates PostgreSQL settings at
# import time. Placeholder values are scoped to this command only: never used to
# connect, absent from image metadata, and the runtime image still fails closed
# without real configuration.
RUN POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_USER=classora \
    POSTGRES_PASSWORD=build-only-placeholder CONTROL_DB_NAME=control_db \
    pnpm --filter api build

FROM node:22.23.2-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /workspace

COPY --from=production-dependencies /workspace/node_modules ./node_modules
COPY --from=production-dependencies /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=build /workspace/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY --from=build /workspace/apps/api/prisma ./apps/api/prisma
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
COPY --from=build /workspace/apps/api/scripts ./apps/api/scripts
# Prisma loads prisma.config.ts before the compiled application starts.
COPY --from=build /workspace/apps/api/dist/config.js ./apps/api/src/config.js

WORKDIR /workspace/apps/api
EXPOSE 4101
CMD ["npm", "run", "start:prod"]
