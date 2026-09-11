#!/usr/bin/env bash
#
# Drops and recreates every schema in the disposable test stack.
#
# This is destructive by design, so it refuses to run against anything that is
# not the local test MySQL. The checks below are deliberately paranoid: a reset
# script that can be pointed at production by a stray environment variable is a
# loaded gun, and this repo already has one incident of prod being reached by
# accident.
#
#   ./scripts/test-reset.sh
#
set -euo pipefail

TEST_HOST="127.0.0.1"
TEST_PORT="4306"
TEST_CONTAINER="chitwise-test-mysql"
TEST_PASSWORD="testpassword"

DOCKER="/Applications/Docker.app/Contents/Resources/bin/docker"
[[ -x "$DOCKER" ]] || DOCKER="$(command -v docker || true)"
[[ -n "$DOCKER" ]] || { echo "docker not found"; exit 1; }

# ── Refuse to run anywhere but the test stack ────────────────────────────────

if [[ -n "${DB_HOST:-}" && "$DB_HOST" != "$TEST_HOST" && "$DB_HOST" != "localhost" && "$DB_HOST" != "mysql-test" ]]; then
  echo "REFUSING: DB_HOST is set to '$DB_HOST'."
  echo "This script only ever resets the local test stack on $TEST_HOST:$TEST_PORT."
  exit 1
fi

if ! "$DOCKER" ps --format '{{.Names}}' | grep -qx "$TEST_CONTAINER"; then
  echo "REFUSING: container '$TEST_CONTAINER' is not running."
  echo "Start the test stack first:"
  echo "  docker compose -f docker-compose.test.yml up -d --wait"
  exit 1
fi

# The container name alone is not proof — confirm the port maps to loopback, so
# this cannot be an SSH tunnel or a container pointed at a remote database.
PORT_BINDING="$("$DOCKER" port "$TEST_CONTAINER" 3306/tcp 2>/dev/null || true)"
if [[ "$PORT_BINDING" != "$TEST_HOST:$TEST_PORT" ]]; then
  echo "REFUSING: '$TEST_CONTAINER' maps 3306 to '$PORT_BINDING', expected '$TEST_HOST:$TEST_PORT'."
  exit 1
fi

# ── Reset ────────────────────────────────────────────────────────────────────

SCHEMAS=(
  chitfund_user
  chitfund_member
  chitfund_chit
  chitfund_payment
  chitfund_payout
  chitfund_notification
  chitfund_reporting
)

echo "Resetting ${#SCHEMAS[@]} schemas in $TEST_CONTAINER ..."

for db in "${SCHEMAS[@]}"; do
  "$DOCKER" exec -i "$TEST_CONTAINER" mysql -uroot -p"$TEST_PASSWORD" -e \
    "DROP DATABASE IF EXISTS \`$db\`;
     CREATE DATABASE \`$db\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null
  echo "  reset $db"
done

echo
echo "Schemas recreated empty. Restart the services so Flyway rebuilds them:"
echo "  docker compose -f docker-compose.test.yml restart user-service member-service chit-service payment-service payout-service"
echo "For the event overlay, include docker-compose.events-test.yml and restart its consumers too."
echo
echo "Then wait for health:"
echo "  docker compose -f docker-compose.test.yml up -d --wait"
