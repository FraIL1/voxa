# syntax=docker/dockerfile:1

# ---------- Сборка ----------
FROM node:22-alpine AS build
ENV CI=true
RUN corepack enable
WORKDIR /app

# Сначала только манифесты — слой установки зависимостей кэшируется
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter @voxa/server exec prisma generate \
    && pnpm --filter @voxa/shared build \
    && pnpm --filter @voxa/server build

# Убираем dev-зависимости и генерируем Prisma-клиент заново уже в прод-дереве
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile \
    && pnpm --filter @voxa/server exec prisma generate

# ---------- Рантайм ----------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
USER node
EXPOSE 3000
WORKDIR /app/apps/server
# Миграции применяются автоматически при каждом старте (раздел 10 PRD)
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/main.js"]
