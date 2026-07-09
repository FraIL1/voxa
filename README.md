# Voxa

Self-hosted платформа голосового и текстового общения для закрытого круга друзей (20–30 человек). Полные требования и план — в [PRD.md](PRD.md).

**Статус:** этап 0 — каркас монорепозитория и инфраструктуры. Веб-клиент и голос появятся на этапах 2–3.

## Стек

React 19 + Vite (веб) · Tauri 2 (десктоп) · NestJS + Prisma (бэкенд) · PostgreSQL 17 · Redis 7 · LiveKit (голос, WebRTC SFU) · MinIO (файлы, S3) · Caddy 2 (HTTPS) · Docker Compose.

## Структура

```
apps/server      NestJS: REST API + WebSocket
apps/web         React-клиент (этап 2)
apps/desktop     Tauri-обёртка (этап 4)
packages/shared  Общие типы, константы, zod-схемы
infra/caddy      Caddyfile (обратный прокси, TLS)
scripts/         Служебные скрипты (проверка лицензий и т.п.)
```

## Требования для разработки

- Node.js ≥ 22, pnpm 10 (`corepack enable`, если pnpm не установлен)
- Docker Desktop (PostgreSQL/Redis/MinIO поднимаются в контейнерах)

## Локальная разработка

```bash
pnpm install                # зависимости
pnpm dev:infra              # PostgreSQL + Redis + MinIO в Docker
pnpm dev:server             # NestJS с hot-reload на http://localhost:3000
# проверка: http://localhost:3000/api/healthz
```

Веб-консоль MinIO: http://localhost:9001 (логин `voxa`, пароль `voxa-dev-minio`).

Полезные команды: `pnpm lint`, `pnpm typecheck`, `pnpm -r build`, `pnpm format`, `pnpm licenses:check`.

## Продакшн (VPS)

```bash
cp .env.example .env        # заполнить секреты (инструкция внутри файла)
docker compose up -d --build
```

Наружу открыт только Caddy (80/443, автосертификат Let's Encrypt для `DOMAIN`); PostgreSQL, Redis и MinIO живут во внутренней Docker-сети. Для локальной проверки прод-стека можно оставить `DOMAIN=localhost` — Caddy выпустит self-signed сертификат.

Обновление: `git pull && docker compose up -d --build`.

## Этапы (раздел 12 PRD)

- [x] **0. Подготовка** — монорепо, линтеры, CI, docker-compose, hello-world API
- [ ] **1. Фундамент бэкенда** — Prisma-схема, аутентификация по инвайтам, роли, WebSocket
- [ ] **2. Текстовый чат и веб-клиент**
- [ ] **3. Голос (LiveKit)**
- [ ] **4. Десктоп-клиент (Tauri) и полировка**
- [ ] **5. Безопасность и запуск**
