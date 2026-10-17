# Build context: repo root. Targets: `dev` (source bind-mounted by compose.dev.yaml)
# and `prod` (also runs the one-shot `migrate` and `seed` services).
FROM node:24-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter api...

FROM deps AS dev
# node_modules come from named volumes populated by this image; skip pnpm's
# pre-run reinstall, which would fail against the bind-mounted workspace.
ENV pnpm_config_verify_deps_before_run=false
CMD ["pnpm", "--filter", "api", "dev"]

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
# `build` runs `prisma generate`; the client is compiled into dist/generated.
RUN pnpm --filter api... build \
 && pnpm deploy --filter api --prod /out

FROM node:24-alpine AS prod
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
CMD ["node", "--enable-source-maps", "dist/main.js"]
