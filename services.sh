#!/usr/bin/env bash
# ChitWise local service manager
# Usage:
#   ./services.sh start    — start all services in background
#   ./services.sh stop     — stop all services
#   ./services.sh restart  — stop then start
#   ./services.sh status   — show which services are up

set -e

ROOT="/Users/saisrinivas/Projects/learning"
LOGS="$ROOT/logs"

# ── Local dev environment variables ──────────────────────────────────────────
# Load from .env.local if present, otherwise use defaults
if [ -f "$ROOT/.env.local" ]; then
  # shellcheck disable=SC1090
  set -a; source "$ROOT/.env.local"; set +a
fi
export DB_PASSWORD="${DB_PASSWORD:-ChitWise@Local1}"
export JWT_SECRET="${JWT_SECRET:-dev-local-jwt-secret-not-for-production-32+}"
# ─────────────────────────────────────────────────────────────────────────────

# Service definitions: "name:jar:port"
SERVICES=(
  "user-service:chitfund-user-service/target/user-service-1.0.0-SNAPSHOT.jar:8081"
  "chit-service:chitfund-chit-service/target/chit-service-1.0.0-SNAPSHOT.jar:8082"
  "member-service:chitfund-member-service/target/member-service-1.0.0-SNAPSHOT.jar:8083"
  "payment-service:chitfund-payment-service/target/payment-service-1.0.0-SNAPSHOT.jar:8084"
  "payout-service:chitfund-payout-service/target/payout-service-1.0.0-SNAPSHOT.jar:8085"
  "notification-service:chitfund-notification-service/target/notification-service-1.0.0-SNAPSHOT.jar:8086"
  "reporting-service:chitfund-reporting-service/target/reporting-service-1.0.0-SNAPSHOT.jar:8087"
  "audit-service:chitfund-audit-service/target/audit-service-1.0.0-SNAPSHOT.jar:8088"
  "api-gateway:chitfund-api-gateway/target/api-gateway-1.0.0-SNAPSHOT.jar:8080"
)

start_frontend() {
  local port=3000
  if lsof -i ":$port" -sTCP:LISTEN -t &>/dev/null; then
    echo "  SKIP  frontend — already running on :$port"
    return
  fi
  (cd "$ROOT/chitfund-frontend" && nohup npm run dev > "$LOGS/frontend.log" 2>&1 &)
  echo "  START frontend  →  :$port  (log: logs/frontend.log)"
}

stop_frontend() {
  pids=$(pgrep -f "chitfund-frontend" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    kill -9 $pids 2>/dev/null || true
    echo "  STOP  frontend (pid $pids)"
  fi
}

start_services() {
  mkdir -p "$LOGS"
  echo "Starting all services..."
  start_frontend
  for entry in "${SERVICES[@]}"; do
    IFS=':' read -r name jar port <<< "$entry"
    jar_path="$ROOT/$jar"
    if [ ! -f "$jar_path" ]; then
      echo "  SKIP  $name — jar not found (run mvn package first)"
      continue
    fi
    if lsof -i ":$port" -sTCP:LISTEN -t &>/dev/null; then
      echo "  SKIP  $name — already running on :$port"
      continue
    fi
    nohup java -jar "$jar_path" > "$LOGS/$name.log" 2>&1 &
    echo "  START $name  →  :$port  (log: logs/$name.log)"
  done
  echo ""
  echo "All services launched. Give them ~15s to fully start."
  echo "Tail logs with:  tail -f $LOGS/<service-name>.log"
}

stop_services() {
  echo "Stopping all services..."
  stop_frontend
  local killed=0
  for entry in "${SERVICES[@]}"; do
    IFS=':' read -r name jar port <<< "$entry"
    pids=$(pgrep -f "$jar" 2>/dev/null || true)
    if [ -n "$pids" ]; then
      kill -9 $pids 2>/dev/null || true
      echo "  STOP  $name (pid $pids)"
      killed=$((killed + 1))
    fi
  done
  if [ "$killed" -eq 0 ]; then
    echo "  Nothing was running."
  else
    echo "  Done. Stopped $killed service(s)."
  fi
}

status_services() {
  echo "Service status:"
  echo "  %-22s %-6s %s\n" "NAME" "PORT" "STATUS"
  if lsof -i ":3000" -sTCP:LISTEN -t &>/dev/null; then
    pid=$(lsof -i ":3000" -sTCP:LISTEN -t)
    printf "  %-22s :%-5s  UP   (pid %s)\n" "frontend" "3000" "$pid"
  else
    printf "  %-22s :%-5s  DOWN\n" "frontend" "3000"
  fi
  for entry in "${SERVICES[@]}"; do
    IFS=':' read -r name jar port <<< "$entry"
    if lsof -i ":$port" -sTCP:LISTEN -t &>/dev/null; then
      pid=$(lsof -i ":$port" -sTCP:LISTEN -t)
      printf "  %-22s :%-5s  UP   (pid %s)\n" "$name" "$port" "$pid"
    else
      printf "  %-22s :%-5s  DOWN\n" "$name" "$port"
    fi
  done
}

case "${1:-}" in
  start)   start_services ;;
  stop)    stop_services ;;
  restart) stop_services; sleep 2; start_services ;;
  status)  status_services ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
