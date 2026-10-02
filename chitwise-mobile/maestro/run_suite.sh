#!/bin/bash
# Run all Maestro flows (admin suite + session persistence)
# Usage: bash maestro/run_suite.sh
# NOTE: Requires a release build (npx expo run:ios --configuration Release)
#       so the app works without Metro running.

MAESTRO_DIR="$(dirname "$0")"

# Kill any stale XCTest runner from a previous session so Maestro always
# starts with a fresh XCTest connection (reusing a stale session causes crashes).
pkill -f "maestro-driver-iosUITests-Runner" 2>/dev/null
sleep 3

maestro test \
  -e ADMIN_USERNAME=offlineadmin \
  -e ADMIN_PASSWORD=Password@1 \
  -e APP_ID=com.chitwise.mobile \
  "$MAESTRO_DIR/01_login_admin.yaml" \
  "$MAESTRO_DIR/02_admin_dashboard.yaml" \
  "$MAESTRO_DIR/03_admin_members.yaml" \
  "$MAESTRO_DIR/04_admin_chits.yaml" \
  "$MAESTRO_DIR/05_admin_messages.yaml" \
  "$MAESTRO_DIR/09_admin_finance.yaml" \
  "$MAESTRO_DIR/11_session_persistence.yaml" \
  "$MAESTRO_DIR/10_logout.yaml"
