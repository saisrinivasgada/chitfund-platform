#!/bin/bash
# Run all Maestro flows (admin suite + session persistence)
# Usage: bash maestro/run_suite.sh
# NOTE: Requires a release build (npx expo run:ios --configuration Release --port 8089)
#       so the app works without Metro running.

MAESTRO_DIR="$(dirname "$0")"

maestro test \
  -e ADMIN_USERNAME=Vasu \
  -e ADMIN_PASSWORD=Password@1 \
  -e APP_ID=com.chitwise.mobile \
  -e USER_SERVICE_LOG=/Users/saisrinivas/Projects/learning/logs/user-service.log \
  "$MAESTRO_DIR/01_login_admin.yaml" \
  "$MAESTRO_DIR/02_admin_dashboard.yaml" \
  "$MAESTRO_DIR/03_admin_members.yaml" \
  "$MAESTRO_DIR/04_admin_chits.yaml" \
  "$MAESTRO_DIR/05_admin_messages.yaml" \
  "$MAESTRO_DIR/09_admin_finance.yaml" \
  "$MAESTRO_DIR/11_session_persistence.yaml" \
  "$MAESTRO_DIR/10_logout.yaml"
