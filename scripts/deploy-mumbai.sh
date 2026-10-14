#!/usr/bin/env bash
# Deploy a prepared ChitWise release bundle on the Mumbai production host.
# This script is invoked by AWS Systems Manager as root; no SSH access is used.
set -euo pipefail

APP_DIR=/app
COMPOSE_FILE="$APP_DIR/docker-compose.prod.yml"
RELEASE_DIR="${RELEASE_DIR:?RELEASE_DIR is required}"
DEPLOY_BACKEND="${DEPLOY_BACKEND:-false}"
DEPLOY_FRONTEND="${DEPLOY_FRONTEND:-false}"

case "$RELEASE_DIR" in
  /tmp/chitwise-release-*) ;;
  *) echo "Refusing unexpected release directory: $RELEASE_DIR" >&2; exit 1 ;;
esac

cleanup_release() {
  find "$RELEASE_DIR" -mindepth 1 -delete 2>/dev/null || true
  rmdir "$RELEASE_DIR" 2>/dev/null || true
}
trap cleanup_release EXIT

get_env_value() {
  local key="$1"
  sed -n "s/^${key}=//p" "$APP_DIR/.env" | head -1 | sed -e "s/^['\"]//" -e "s/['\"]$//"
}

if [[ "$DEPLOY_BACKEND" == true ]]; then
  install -o root -g root -m 0755 "$RELEASE_DIR/fetch-secrets.sh" "$APP_DIR/fetch-secrets.sh"
  install -o ec2-user -g ec2-user -m 0640 "$RELEASE_DIR/docker-compose.prod.yml" "$COMPOSE_FILE"
  "$APP_DIR/fetch-secrets.sh"

  DB_HOST="$(get_env_value DB_HOST)"
  export MYSQL_PWD="$(get_env_value DB_PASSWORD)"
  readonly DATABASES=(
    chitfund_user chitfund_member chitfund_chit chitfund_payment
    chitfund_payout chitfund_notification chitfund_audit
    chitfund_reporting chitwise_management
  )

  for database in "${DATABASES[@]}"; do
    mariadb --connect-timeout=15 --ssl -h "$DB_HOST" -u chitfund \
      -e "CREATE DATABASE IF NOT EXISTS ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  done

  failed=0
  for database in "${DATABASES[@]}"; do
    rows="$(mariadb --connect-timeout=15 --ssl -N -B -h "$DB_HOST" -u chitfund "$database" \
      -e "SELECT CONCAT(version, ' ', description, ' (attempted ', installed_on, ')') FROM flyway_schema_history WHERE success = 0" \
      2>/dev/null || true)"
    if [[ -n "$rows" ]]; then
      failed=1
      echo "Failed Flyway migration detected in ${database}:"
      echo "$rows"
    fi
  done
  if (( failed != 0 )); then
    echo "Deploy aborted: inspect the partially migrated schema; never delete its Flyway history row." >&2
    exit 1
  fi

  audit_prerequisite="$(mariadb --connect-timeout=15 --ssl -N -B -h "$DB_HOST" -u chitfund \
    -e "SELECT CONCAT(@@GLOBAL.log_bin, ':', @@GLOBAL.log_bin_trust_function_creators)" 2>/dev/null || true)"
  case "$audit_prerequisite" in
    0:*|OFF:*|1:1|ON:ON|1:ON|ON:1) ;;
    *)
      echo "Deploy aborted: log_bin_trust_function_creators must be enabled for append-only audit triggers." >&2
      exit 1
      ;;
  esac

  cd "$APP_DIR"
  docker compose --env-file .env -f "$COMPOSE_FILE" config -q
  docker compose --env-file .env -f "$COMPOSE_FILE" pull --quiet
  if ! docker compose --env-file .env -f "$COMPOSE_FILE" up -d --wait --wait-timeout 900; then
    echo "Backend deployment failed; current state follows." >&2
    docker compose --env-file .env -f "$COMPOSE_FILE" ps >&2 || true
    while IFS='|' read -r container state; do
      if [[ "$state" != *healthy* && "$container" != chitwise-redis ]]; then
        echo "--- logs: $container ---" >&2
        docker logs --tail 80 "$container" 2>&1 | tail -60 >&2 || true
      fi
    done < <(docker ps -a --format '{{.Names}}|{{.Status}}')
    exit 1
  fi
  docker image prune -f >/dev/null
fi

if [[ "$DEPLOY_FRONTEND" == true ]]; then
  [[ -f "$RELEASE_DIR/frontend/index.html" ]] || {
    echo "Frontend bundle is missing index.html" >&2
    exit 1
  }
  install -d -o nginx -g nginx -m 0755 /var/www/chitfund
  cp -a "$RELEASE_DIR/frontend/." /var/www/chitfund/
  chown -R nginx:nginx /var/www/chitfund
  install -o root -g root -m 0644 "$RELEASE_DIR/nginx.conf" /etc/nginx/conf.d/chitfund.conf
  nginx -t
  systemctl reload nginx
fi

curl --fail --silent --show-error http://127.0.0.1:8080/actuator/health >/dev/null
curl --fail --silent --show-error --resolve thechitwise.com:443:127.0.0.1 \
  https://thechitwise.com/api/plans/public >/dev/null

echo "ChitWise Mumbai deployment completed successfully."
docker compose --env-file "$APP_DIR/.env" -f "$COMPOSE_FILE" ps
