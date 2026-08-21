#!/usr/bin/env bash
# Ежедневная резервная копия Voxa (раздел 9.2 PRD): дамп PostgreSQL и файлы
# MinIO, зашифрованные, с выгрузкой во внешнее хранилище и сроком хранения.
#
# Шифруем age на ОТКРЫТЫЙ ключ: закрытый ключ на сервере не лежит, поэтому
# взломавший сервер не прочитает ни одной прошлой копии.
#
# Разовая подготовка:
#   sudo apt-get install -y age rclone
#   age-keygen -o ~/voxa-backup.key      # ЗАКРЫТЫЙ ключ — хранить у себя, не на сервере!
#   rclone config                         # удалённое хранилище с именем b2
#
# Ежедневный запуск (crontab -e):
#   15 4 * * * BACKUP_AGE_RECIPIENT=age1... /opt/voxa/infra/backup/backup.sh >> /var/log/voxa-backup.log 2>&1
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/voxa}"
WORK_DIR="${BACKUP_DIR:-/var/backups/voxa}"
REMOTE="${BACKUP_REMOTE:-b2:voxa-backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
RECIPIENT="${BACKUP_AGE_RECIPIENT:-}"

if [[ -z "$RECIPIENT" ]]; then
  echo "Не задан BACKUP_AGE_RECIPIENT — открытый ключ age (age1...)." >&2
  exit 1
fi
for tool in age rclone docker; do
  command -v "$tool" >/dev/null || {
    echo "Нет команды $tool" >&2
    exit 1
  }
done

STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
mkdir -p "$WORK_DIR"
cd "$PROJECT_DIR"

cleanup() {
  # Незашифрованные куски не должны пережить скрипт даже при ошибке
  rm -f "$WORK_DIR/db-$STAMP.sql.gz" "$WORK_DIR/files-$STAMP.tar.gz"
}
trap cleanup EXIT

echo "[$STAMP] дамп PostgreSQL"
docker compose exec -T postgres pg_dump -U voxa -d voxa --clean --if-exists |
  gzip -9 >"$WORK_DIR/db-$STAMP.sql.gz"

echo "[$STAMP] файлы MinIO"
# Читаем том напрямую: так не нужны ни ключи S3, ни работающий MinIO
docker run --rm \
  -v voxa_minio_data:/data:ro \
  -v "$WORK_DIR:/out" \
  alpine:3 tar -czf "/out/files-$STAMP.tar.gz" -C /data .

echo "[$STAMP] шифрование"
age -r "$RECIPIENT" -o "$WORK_DIR/db-$STAMP.sql.gz.age" "$WORK_DIR/db-$STAMP.sql.gz"
age -r "$RECIPIENT" -o "$WORK_DIR/files-$STAMP.tar.gz.age" "$WORK_DIR/files-$STAMP.tar.gz"
cleanup

echo "[$STAMP] выгрузка в $REMOTE"
rclone copy "$WORK_DIR/db-$STAMP.sql.gz.age" "$REMOTE/db/" --checksum
rclone copy "$WORK_DIR/files-$STAMP.tar.gz.age" "$REMOTE/files/" --checksum

echo "[$STAMP] чистка старше $KEEP_DAYS дней"
rclone delete "$REMOTE" --min-age "${KEEP_DAYS}d"
find "$WORK_DIR" -name '*.age' -mtime "+$KEEP_DAYS" -delete

# Проверяем, что копия действительно долетела и не пустая
DB_SIZE="$(rclone size "$REMOTE/db/" --json | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')"
if [[ -z "$DB_SIZE" || "$DB_SIZE" -lt 1024 ]]; then
  echo "[$STAMP] ОШИБКА: в хранилище нет внятной копии базы" >&2
  exit 1
fi

echo "[$STAMP] готово"
