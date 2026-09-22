#!/bin/bash
# Orchestrates the three-phase offline payment test.
#
# Prerequisites:
#   1. iOS simulator running with the native ChitWise build
#      (npx expo run:ios --configuration Release -- see run_suite.sh)
#   2. Test Docker stack up:  docker compose -f docker-compose.test.yml up -d --wait
#   3. OTP server running:    python3 maestro/helpers/otp_server.py &
#   4. Control server:        python3 maestro/helpers/maestro_control_server.py &
#
# Required env vars (or pass directly):
#   ADMIN_USERNAME, ADMIN_PASSWORD, TEST_MEMBER_NAME, TEST_CHIT_NAME
#
# Usage:
#   ADMIN_USERNAME=offlineadmin ADMIN_PASSWORD='Password@1' \
#   TEST_MEMBER_NAME='Lakshmi Narayana' TEST_CHIT_NAME='Sri Lakshmi Monthly Chit' \
#   bash maestro/run_offline_test.sh

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ID="${APP_ID:-com.chitwise.mobile}"
SCREENSHOT_DIR="${SCREENSHOT_DIR:-/tmp/chitwise-offline-test}"
OFFLINE_IDEMPOTENCY_KEY="$(date +%s)"

mkdir -p "$SCREENSHOT_DIR"

COMMON_OPTS=(
  -e APP_ID="$APP_ID"
  -e ADMIN_USERNAME="${ADMIN_USERNAME:?ADMIN_USERNAME required}"
  -e ADMIN_PASSWORD="${ADMIN_PASSWORD:?ADMIN_PASSWORD required}"
  -e TEST_MEMBER_NAME="${TEST_MEMBER_NAME:?TEST_MEMBER_NAME required}"
  -e TEST_CHIT_NAME="${TEST_CHIT_NAME:?TEST_CHIT_NAME required}"
  -e SCREENSHOT_DIR="$SCREENSHOT_DIR"
  -e OFFLINE_IDEMPOTENCY_KEY="$OFFLINE_IDEMPOTENCY_KEY"
  -e USER_SERVICE_LOG="${USER_SERVICE_LOG:-}"
)

_kill_xctest() { pkill -f "maestro-driver-iosUITests-Runner" 2>/dev/null; sleep 3; }

echo "=== Phase 1: Record payment while payment service is down ==="
_kill_xctest
maestro test "${COMMON_OPTS[@]}" "$DIR/12_offline_payment_phase1.yaml"

echo ""
echo "=== Phase 2: Verify session and queue persist across app restart ==="
_kill_xctest
maestro test "${COMMON_OPTS[@]}" "$DIR/13_offline_payment_phase2.yaml"

# Restore the payment service
echo ""
echo "=== Restoring payment service... ==="
curl -s http://localhost:9001/start-payment | python3 -c "import sys,json; d=json.load(sys.stdin); print('  Started:', d)"
# Wait for service health
echo "  Waiting for payment service to become healthy..."
for i in $(seq 1 30); do
  STATUS=$(curl -sf http://localhost:9084/actuator/health 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null || echo "")
  if [ "$STATUS" = "UP" ]; then
    echo "  Payment service is healthy."
    break
  fi
  sleep 2
done

echo ""
echo "=== Phase 3: Sync after service restored ==="
_kill_xctest
maestro test "${COMMON_OPTS[@]}" "$DIR/14_offline_payment_phase3.yaml"

echo ""
echo "=== Offline payment test complete ==="
echo "Screenshots saved to: $SCREENSHOT_DIR"
echo ""
echo "Manual verification still required:"
echo "  - Check payment DB: exactly one batch with amount=3500, recorded_at set to offline time, synced_at set to server time"
echo "  - Check notification: member notification shows offline recorded time"
echo "  - Check receipt: transaction detail shows offline recorded time"
