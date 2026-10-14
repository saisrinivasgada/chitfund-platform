#!/usr/bin/env bash
# Installs the isolated Certbot/GoDaddy plugin runtime and systemd override.
# Run as root after copying the adjacent files to the host.
set -euo pipefail

SOURCE_DIR="${1:-/app/infra/aws/mumbai-prod}"

dnf install -y python3-pip
python3 -m venv /opt/chitwise-certbot
/opt/chitwise-certbot/bin/pip install --disable-pip-version-check \
  'certbot==4.2.0' \
  'certbot-nginx==4.2.0' \
  'certbot-dns-godaddy==2.8.0'

install -o root -g root -m 0750 \
  "$SOURCE_DIR/chitwise-certbot" \
  /usr/local/sbin/chitwise-certbot
install -d -o root -g root -m 0755 /etc/systemd/system/certbot-renew.service.d
install -o root -g root -m 0644 \
  "$SOURCE_DIR/certbot-renew.service.override.conf" \
  /etc/systemd/system/certbot-renew.service.d/chitwise.conf

# Imported renewal files referenced the old host's persistent credential path.
# The wrapper provides the same credential temporarily under /run instead.
if compgen -G '/etc/letsencrypt/renewal/*.conf' >/dev/null; then
  sed -i \
    's#^dns_godaddy_credentials = .*#dns_godaddy_credentials = /run/chitwise-certbot/godaddy.ini#' \
    /etc/letsencrypt/renewal/*.conf
fi

systemctl daemon-reload
systemctl enable --now certbot-renew.timer
