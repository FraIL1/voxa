#!/usr/bin/env bash
# Базовая защита VPS под Voxa (раздел 9.2 PRD): SSH только по ключу,
# закрытый файрвол, fail2ban, автоматические обновления безопасности.
#
# Запускать на СВЕЖЕЙ Ubuntu 24.04 от root ОДИН раз, после того как
# ключ уже добавлен пользователю и вход по ключу проверен из второго окна:
#
#   bash infra/server/harden.sh voxa
#
# Скрипт ничего не удаляет: он меняет настройки и ставит пакеты.
set -euo pipefail

ADMIN_USER="${1:-}"
if [[ -z "$ADMIN_USER" ]]; then
  echo "Укажи пользователя, под которым будешь заходить: bash harden.sh voxa" >&2
  exit 1
fi
if ! id "$ADMIN_USER" >/dev/null 2>&1; then
  echo "Пользователя $ADMIN_USER нет. Создай его и положи ключ в ~/.ssh/authorized_keys" >&2
  exit 1
fi
if [[ ! -s "/home/$ADMIN_USER/.ssh/authorized_keys" ]]; then
  echo "У $ADMIN_USER нет authorized_keys — вход по ключу не настроен." >&2
  echo "Сначала настрой ключ, иначе после этого скрипта на сервер не попасть." >&2
  exit 1
fi

echo "==> Обновление пакетов"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

echo "==> Пакеты: файрвол, fail2ban, автообновления, шифрование копий"
apt-get install -y -qq ufw fail2ban unattended-upgrades apt-listchanges age rclone curl

echo "==> SSH: только ключи, без root, без паролей"
install -d -m 0755 /etc/ssh/sshd_config.d
cat >/etc/ssh/sshd_config.d/10-voxa.conf <<'CONF'
# Пароли отключены полностью: перебирать нечего
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
# Меньше времени на попытку и меньше попыток за соединение
LoginGraceTime 20
MaxAuthTries 3
MaxSessions 5
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding no
CONF
sshd -t
systemctl reload ssh || systemctl reload sshd

echo "==> Файрвол: закрыто всё, кроме SSH, HTTPS и портов LiveKit"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP (редирект и выпуск сертификата)'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 443/udp comment 'HTTP/3'
ufw allow 7881/tcp comment 'LiveKit WebRTC TCP (фолбэк)'
ufw allow 7882/udp comment 'LiveKit медиапотоки'
ufw --force enable

echo "==> fail2ban: SSH и перебор пароля на входе в Voxa"
install -m 0644 "$(dirname "$0")/fail2ban-voxa.conf" /etc/fail2ban/filter.d/voxa-login.conf
install -m 0644 "$(dirname "$0")/fail2ban-jail.local" /etc/fail2ban/jail.local
systemctl enable --now fail2ban
systemctl restart fail2ban

echo "==> Автоматические обновления безопасности"
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
CONF
systemctl enable --now unattended-upgrades

echo
echo "Готово. Проверь ДО закрытия текущей сессии, что вход работает:"
echo "  ssh $ADMIN_USER@<адрес>"
echo
ufw status verbose
fail2ban-client status
