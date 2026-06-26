#!/bin/bash
# ChitFund Platform — safe redeploy after code changes
#
# Usage:
#   ./redeploy-chitfund.sh                     → redeploy ALL backend services
#   ./redeploy-chitfund.sh payment chit        → redeploy only those two
#   ./redeploy-chitfund.sh gateway             → just the gateway
#
# What it does for each service:
#   1. Build fresh JAR (mvn package -DskipTests)
#   2. Kill the process currently on that port (if any)
#   3. Start the new JAR
#   4. Wait for /actuator/health to return UP (timeout 90s)
#   5. Only then move on to the next service
#
# Order matters: gateway is always last (it depends on the other services).

BASE=/Users/saisrinivas/Projects/learning
MVN=$HOME/.m2/wrapper/dists/apache-maven-3.9.14-bin/1cb7fhup6b5n3bed6kckbrnspv/apache-maven-3.9.14/bin/mvn
LOG_DIR=$BASE/logs
MYSQL=/usr/local/mysql-8.0.32-macos13-arm64/bin/mysql

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy]${NC} $1"; }
info() { echo -e "${CYAN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $1"; }
err()  { echo -e "${RED}[deploy]${NC} $1"; }

mkdir -p "$LOG_DIR"

# ── Service registry ───────────────────────────────────────────────────────
# Returns "dir:port" for a given short name (bash 3.2-compatible, no declare -A)
get_meta() {
  case "$1" in
    user)         echo "chitfund-user-service:8081" ;;
    chit)         echo "chitfund-chit-service:8082" ;;
    member)       echo "chitfund-member-service:8083" ;;
    payment)      echo "chitfund-payment-service:8084" ;;
    payout)       echo "chitfund-payout-service:8085" ;;
    notification) echo "chitfund-notification-service:8086" ;;
    reporting)    echo "chitfund-reporting-service:8087" ;;
    audit)        echo "chitfund-audit-service:8088" ;;
    gateway)      echo "chitfund-api-gateway:8080" ;;
    *)            echo "" ;;
  esac
}

# Deploy order — gateway always last
ALL_ORDER=(user chit member payment payout notification reporting audit gateway)

# ── Helpers ────────────────────────────────────────────────────────────────

kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti:"$port" -sTCP:LISTEN 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill -9 2>/dev/null
    local waited=0
    while lsof -ti:"$port" -sTCP:LISTEN &>/dev/null; do
      sleep 1; waited=$((waited+1))
      if [ $waited -ge 10 ]; then
        err "Port $port still held after 10s — something is wrong"
        return 1
      fi
    done
    return 0
  fi
  return 0  # port was already free
}

wait_healthy() {
  local port=$1 name=$2 timeout=90 elapsed=0
  # First wait for port to open
  while ! lsof -i:"$port" -sTCP:LISTEN &>/dev/null; do
    sleep 2; elapsed=$((elapsed+2))
    if [ $elapsed -ge $timeout ]; then
      err "$name did not open port $port after ${timeout}s — check $LOG_DIR/$name.log"
      return 1
    fi
  done
  # Then wait for health endpoint to return UP
  while true; do
    local health
    health=$(curl -s "http://localhost:$port/actuator/health" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
    if [ "$health" = "UP" ]; then
      log "$name is UP on :$port (${elapsed}s)"
      return 0
    fi
    sleep 2; elapsed=$((elapsed+2))
    if [ $elapsed -ge $timeout ]; then
      err "$name health check failed after ${timeout}s — status: ${health:-no response}"
      return 1
    fi
  done
}

deploy_service() {
  local short=$1
  local meta
  meta=$(get_meta "$short")
  if [ -z "$meta" ]; then
    err "Unknown service: '$short'. Valid names: user chit member payment payout notification reporting audit gateway"
    return 1
  fi

  local dir port
  dir=$(echo "$meta" | cut -d: -f1)
  port=$(echo "$meta" | cut -d: -f2)
  local jar_name
  jar_name=$(ls "$BASE/$dir"/target/*.jar 2>/dev/null | grep -v original | head -1 | xargs basename 2>/dev/null)
  # Infer jar name from pom if not yet built
  if [ -z "$jar_name" ]; then
    jar_name="${dir}-1.0.0-SNAPSHOT.jar"
    # strip chitfund- prefix for the artifact id pattern
    jar_name=$(echo "$dir" | sed 's/chitfund-//')-1.0.0-SNAPSHOT.jar
  fi

  echo ""
  info "━━━ $short ($dir : $port) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # 1. Build
  log "Building $short..."
  if ! bash -c "cd $BASE/$dir && $MVN package -DskipTests -q 2>&1" >> "$LOG_DIR/deploy-build.log" 2>&1; then
    err "Build FAILED for $short — check $LOG_DIR/deploy-build.log"
    return 1
  fi

  # Find the built JAR (may differ from inferred name)
  local jar
  jar=$(ls "$BASE/$dir"/target/*.jar 2>/dev/null | grep -v original | head -1)
  if [ -z "$jar" ]; then
    err "No JAR found in $BASE/$dir/target/ after build"
    return 1
  fi
  log "Built: $(basename $jar)"

  # 2. Kill old process
  if lsof -ti:"$port" -sTCP:LISTEN &>/dev/null; then
    warn "Stopping old $short process on :$port..."
    kill_port "$port"
    log "Old process stopped"
  fi

  # 3. Start new JAR
  log "Starting $short from $(basename $jar)..."
  nohup java -jar "$jar" > "$LOG_DIR/$dir.log" 2>&1 &

  # 4. Wait for health
  wait_healthy "$port" "$short" || return 1
}

# ── Main ───────────────────────────────────────────────────────────────────

echo ""
log "ChitFund Redeploy — $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Determine which services to deploy
if [ $# -eq 0 ]; then
  # No args → deploy all in order
  TARGETS=("${ALL_ORDER[@]}")
  log "Redeploying ALL services..."
else
  # Args provided — validate, then respect the required order
  TARGETS=()
  for arg in "$@"; do
    if [ -z "$(get_meta "$arg")" ]; then
      err "Unknown service: '$arg'"
      err "Valid names: user chit member payment payout notification reporting audit gateway"
      exit 1
    fi
  done
  # Keep them in the correct boot order
  for svc in "${ALL_ORDER[@]}"; do
    for arg in "$@"; do
      if [ "$svc" = "$arg" ]; then
        TARGETS+=("$svc")
        break
      fi
    done
  done
  log "Redeploying: ${TARGETS[*]}"
fi

log "Build log → $LOG_DIR/deploy-build.log"
> "$LOG_DIR/deploy-build.log"  # clear previous build log

FAILED=()
for svc in "${TARGETS[@]}"; do
  if ! deploy_service "$svc"; then
    FAILED+=("$svc")
    err "Deploy of '$svc' FAILED — continuing with remaining services"
  fi
done

echo ""
if [ ${#FAILED[@]} -eq 0 ]; then
  log "All services deployed successfully!"
else
  err "The following services FAILED to deploy: ${FAILED[*]}"
  err "Check $LOG_DIR/deploy-build.log for build errors"
  err "Check individual service logs in $LOG_DIR/ for runtime errors"
  exit 1
fi

echo ""
echo "  Gateway  → http://localhost:8080"
echo "  Logs     → $LOG_DIR/"
echo ""

# ── Post-deploy smoke test ─────────────────────────────────────────────────
if [ -f "$BASE/verify-chitfund.sh" ] && [ -n "${CHITFUND_ADMIN_USER:-}" ] && [ -n "${CHITFUND_ADMIN_PASS:-}" ]; then
  echo ""
  log "Running post-deploy smoke test..."
  if ! bash "$BASE/verify-chitfund.sh" "$CHITFUND_ADMIN_USER" "$CHITFUND_ADMIN_PASS"; then
    err "SMOKE TEST FAILED — deployment may be broken. Check above for details."
    exit 1
  fi
else
  warn "Skipping smoke test — set CHITFUND_ADMIN_USER and CHITFUND_ADMIN_PASS env vars to enable."
  warn "  Example: CHITFUND_ADMIN_USER=saisrinivas CHITFUND_ADMIN_PASS=YourPass ./redeploy-chitfund.sh"
fi
