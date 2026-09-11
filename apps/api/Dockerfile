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
RUN pnpm --filter api build

FROM node:22.23.2-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /workspace

COPY --from=production-dependencies /workspace/node_modules ./node_modules
COPY --from=production-dependencies /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=build /workspace/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY --from=build /workspace/apps/api/prisma ./apps/api/prisma
COPY --from=build /workspace/apps/api/dist ./apps/api/dist

WORKDIR /workspace/apps/api
EXPOSE 4101
CMD ["npm", "run", "start:prod"]
