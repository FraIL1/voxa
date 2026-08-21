#!/usr/bin/env bash
# Оповещение о заполнении диска (раздел 9.2 PRD: алерт при > 80 %).
#
# Uptime Kuma следит за тем, что сервис отвечает, но не видит, сколько
# осталось места. А кончится место — встанут и база, и загрузка файлов.
#
# Ежечасно (crontab -e):
#   0 * * * * TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... /opt/voxa/infra/server/disk-alert.sh
set -euo pipefail

THRESHOLD="${DISK_THRESHOLD:-80}"
MOUNT="${DISK_MOUNT:-/}"
TOKEN="${TELEGRAM_BOT_TOKEN:-}"
CHAT="${TELEGRAM_CHAT_ID:-}"
STATE_FILE="/var/tmp/voxa-disk-alert.state"

USED="$(df --output=pcent "$MOUNT" | tail -n 1 | tr -dc '0-9')"

if [[ "$USED" -lt "$THRESHOLD" ]]; then
  # Отпустило — снимаем отметку, чтобы следующий раз снова предупредил
  rm -f "$STATE_FILE"
  exit 0
fi

# Не пишем одно и то же каждый час: только первый раз и раз в сутки после
if [[ -f "$STATE_FILE" ]] && [[ $(($(date +%s) - $(stat -c %Y "$STATE_FILE"))) -lt 86400 ]]; then
  exit 0
fi
date +%s >"$STATE_FILE"

TOP="$(du -xh -d 2 /var/lib/docker /opt 2>/dev/null | sort -rh | head -n 5 || true)"
TEXT="Voxa: диск $MOUNT занят на ${USED}% (порог ${THRESHOLD}%).

Крупнее всего:
$TOP"

if [[ -n "$TOKEN" && -n "$CHAT" ]]; then
  curl -fsS -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${CHAT}" \
    --data-urlencode "text=${TEXT}" >/dev/null
else
  echo "$TEXT" >&2
fi
