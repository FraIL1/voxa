# syntax=docker/dockerfile:1
# Caddy с уже собранным веб-клиентом внутри: прокси к API и раздача SPA.

# ---------- Сборка веб-клиента ----------
FROM node:22-alpine AS build
ENV CI=true
RUN corepack enable
WORKDIR /app

# Сначала манифесты — слой зависимостей кэшируется между сборками
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @voxa/web... --filter @voxa/shared...

COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @voxa/web build

# ---------- Рантайм ----------
FROM caddy:2-alpine AS runtime
COPY --from=build /app/apps/web/dist /srv
