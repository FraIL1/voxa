# Voxa

Self-hosted платформа голосового и текстового общения для закрытого круга друзей (20–30 человек). Полные требования и план — в [PRD.md](PRD.md).

**Статус:** этап 1 — фундамент бэкенда (аутентификация по инвайтам, роли, каналы, сообщения, WebSocket). Веб-клиент и голос появятся на этапах 2–3.

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
cp apps/server/.env.example apps/server/.env
pnpm db:generate            # Prisma-клиент
pnpm db:migrate             # миграции БД
pnpm dev:server             # NestJS с hot-reload на http://localhost:3000
pnpm dev:web                # веб-клиент на http://127.0.0.1:5173 (в другом терминале)
# проверка API: http://localhost:3000/api/healthz
```

Веб-клиент в dev проксирует `/api` и `/socket.io` на бэкенд (см.
`apps/web/vite.config.ts`), поэтому cookie и WebSocket работают без CORS.
Открой http://127.0.0.1:5173, перейди по инвайт-ссылке из лога сервера
(`/invite/КОД`) и зарегистрируйся.

### Десктоп-клиент (Tauri)

Требуется Rust (`rustup` с MSVC-тулчейном). При запущенных `dev:server`
и `dev:web`:

```bash
pnpm --filter @voxa/desktop dev   # окно Voxa; первый запуск собирает Rust (~минуты)
```

Закрытие окна сворачивает приложение в трей (выход — из меню иконки).
Глобальные хоткеи: Ctrl+Shift+M — микрофон, Ctrl+Shift+D — звук.
Автозапуск включается в Настройках → Приложение. Прод-сборка
(`build:desktop`) и автообновление будут настроены после появления VPS.

При первом запуске с пустой БД сервер создаёт стартовую структуру (роли
«Владелец»/«Модератор»/«Участник», категории «Текст» и «Голос» с каналами)
и печатает в лог **одноразовый инвайт Владельца** — первый зарегистрировавшийся
по нему получает все права. Регистрация: `POST /api/auth/register` с телом
`{ "inviteCode": "...", "username": "...", "password": "..." }` (пароль от 10 символов).

Dev-порты: PostgreSQL — `5433` (не 5432, чтобы не конфликтовать с нативным
PostgreSQL в Windows), Redis — `6379`, MinIO — `9000`/`9001`
(консоль: http://localhost:9001, логин `voxa`, пароль `voxa-dev-minio`).

Полезные команды: `pnpm lint`, `pnpm typecheck`, `pnpm -r build`, `pnpm format`,
`pnpm licenses:check`, `pnpm test:e2e` (нужны запущенные PostgreSQL и Redis —
тесты используют отдельную схему `e2e` и не трогают dev-данные).

## Продакшн (VPS)

```bash
cp .env.example .env        # заполнить секреты (инструкция внутри файла)
docker compose up -d --build
```

Наружу открыт только Caddy (80/443, автосертификат Let's Encrypt для `DOMAIN`); PostgreSQL, Redis и MinIO живут во внутренней Docker-сети. Для локальной проверки прод-стека можно оставить `DOMAIN=localhost` — Caddy выпустит self-signed сертификат.

Файлы раздаются с поддомена `files.DOMAIN` (изолированный origin с CSP sandbox) — при настройке DNS добавь **вторую A-запись** `files.твой-домен` на тот же VPS; сертификат Caddy получит сам.

Обновление: `git pull && docker compose up -d --build`.

## Этапы (раздел 12 PRD)

- [x] **0. Подготовка** — монорепо, линтеры, CI, docker-compose, hello-world API
- [x] **1. Фундамент бэкенда** — Prisma-схема, аутентификация по инвайтам (JWT + ротация refresh), роли с битмаской, каналы/категории, сообщения, WebSocket (message.new), rate limiting, e2e-тесты
- [x] **2. Текстовый чат и веб-клиент** — чат с markdown и live-доставкой, правка/удаление/ответы/реакции, «печатает», упоминания, непрочитанные и счётчики упоминаний, участники со статусами, файлы до 50 МБ (MinIO, проверка магических байтов, миниатюры), предпросмотр ссылок. Осталось организационное: промежуточный релиз для 3–5 друзей
- [ ] **3. Голос (LiveKit)**
- [ ] **4. Десктоп-клиент (Tauri) и полировка**
- [ ] **5. Безопасность и запуск**
