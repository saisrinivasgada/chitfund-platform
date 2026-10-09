#!/bin/bash
# Run all Maestro flows (admin suite + session persistence)
# Usage:
#   ADMIN_USERNAME=offlineadmin ADMIN_PASSWORD='test password' \
#   bash maestro/run_suite.sh
# NOTE: Requires a release build (npx expo run:ios --configuration Release)
#       so the app works without Metro running.

set -euo pipefail

MAESTRO_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ID="${APP_ID:-com.chitwise.mobile}"
ADMIN_USERNAME="${ADMIN_USERNAME:?ADMIN_USERNAME required}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?ADMIN_PASSWORD required}"

# Kill any stale XCTest runner from a previous session so Maestro always
# starts with a fresh XCTest connection (reusing a stale session causes crashes).
pkill -f "maestro-driver-iosUITests-Runner" 2>/dev/null || true
sleep 3

FLOWS=(
  01_login_admin.yaml
  02_admin_dashboard.yaml
  03_admin_members.yaml
  04_admin_chits.yaml
  05_admin_messages.yaml
  09_admin_finance.yaml
  11_session_persistence.yaml
  10_logout.yaml
)

# These flows deliberately share authentication and navigation state. Passing
# all files to one `maestro test` invocation lets Maestro schedule them in
# parallel, which makes them race on the same simulator. Run each flow in order.
for flow in "${FLOWS[@]}"; do
  echo "=== Running $flow ==="
  pkill -f "maestro-driver-iosUITests-Runner" 2>/dev/null || true
  sleep 2
  maestro test \
    -e ADMIN_USERNAME="$ADMIN_USERNAME" \
    -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    -e APP_ID="$APP_ID" \
    "$MAESTRO_DIR/$flow"
done
