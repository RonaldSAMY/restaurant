# Build context: repo root. Targets: `dev` (source bind-mounted by compose.dev.yaml)
# and `prod` (Next standalone output). `next build` gets no env and no secrets.
FROM node:24-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter web...

FROM deps AS dev
# node_modules come from named volumes populated by this image; skip pnpm's
# pre-run reinstall, which would fail against the bind-mounted workspace.
ENV pnpm_config_verify_deps_before_run=false
CMD ["pnpm", "--filter", "web", "dev"]

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter web... build

FROM node:24-alpine AS prod
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
