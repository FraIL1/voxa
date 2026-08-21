#!/usr/bin/env bash
# Ежемесячная проверка восстановления (раздел 9.2 PRD).
#
# Копия, которую ни разу не разворачивали, — это не копия, а надежда.
# Скрипт берёт свежий дамп из хранилища, поднимает ВРЕМЕННЫЙ PostgreSQL
# в отдельном контейнере, разворачивает туда базу и считает записи.
# Рабочую базу не трогает вообще.
#
#   BACKUP_AGE_KEY=~/voxa-backup.key /opt/voxa/infra/backup/restore-check.sh
set -euo pipefail

REMOTE="${BACKUP_REMOTE:-b2:voxa-backups}"
KEY="${BACKUP_AGE_KEY:-}"
WORK_DIR="$(mktemp -d)"
CONTAINER="voxa-restore-check"

if [[ -z "$KEY" || ! -f "$KEY" ]]; then
  echo "Укажи BACKUP_AGE_KEY — файл закрытого ключа age." >&2
  exit 1
fi

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

echo "==> Берём самую свежую копию базы"
LATEST="$(rclone lsf "$REMOTE/db/" --files-only | sort | tail -n 1)"
[[ -n "$LATEST" ]] || {
  echo "В хранилище нет копий" >&2
  exit 1
}
echo "    $LATEST"
rclone copyto "$REMOTE/db/$LATEST" "$WORK_DIR/dump.sql.gz.age"

echo "==> Расшифровка"
age -d -i "$KEY" -o "$WORK_DIR/dump.sql.gz" "$WORK_DIR/dump.sql.gz.age"
gunzip "$WORK_DIR/dump.sql.gz"

echo "==> Временный PostgreSQL"
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=restore-check \
  -e POSTGRES_USER=voxa \
  -e POSTGRES_DB=voxa \
  postgres:17-alpine >/dev/null
for _ in $(seq 1 60); do
  docker exec "$CONTAINER" pg_isready -U voxa -d voxa >/dev/null 2>&1 && break
  sleep 1
done

echo "==> Разворачиваем дамп"
docker exec -i "$CONTAINER" psql -U voxa -d voxa -q <"$WORK_DIR/dump.sql" >/dev/null

echo "==> Что получилось"
docker exec "$CONTAINER" psql -U voxa -d voxa -At -c \
  "select 'пользователей: ' || (select count(*) from users)
        || ', сообщений: '  || (select count(*) from messages)
        || ', серверов: '   || (select count(*) from guilds)"

USERS="$(docker exec "$CONTAINER" psql -U voxa -d voxa -At -c 'select count(*) from users')"
if [[ "$USERS" -lt 1 ]]; then
  echo "ОШИБКА: в восстановленной базе нет пользователей" >&2
  exit 1
fi

echo "Проверка пройдена: копия разворачивается."
