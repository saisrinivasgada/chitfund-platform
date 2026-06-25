#!/bin/bash
# ChitFund Platform — start all services + frontend

BASE=/Users/saisrinivas/Projects/learning
MVN=$HOME/.m2/wrapper/dists/apache-maven-3.9.14-bin/1cb7fhup6b5n3bed6kckbrnspv/apache-maven-3.9.14/bin/mvn
KAFKA_HOME=/Users/saisrinivas/Downloads/kafka_2.12-3.9.1
LOG_DIR=$BASE/logs
FRONTEND_PORT=3000

mkdir -p "$LOG_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[chitfund]${NC} $1"; }
warn() { echo -e "${YELLOW}[chitfund]${NC} $1"; }
err()  { echo -e "${RED}[chitfund]${NC} $1"; }

# ── Check prerequisites ───────────────────────────────────────────────────
check_port_free() {
  if lsof -i :$1 -sTCP:LISTEN &>/dev/null; then
    warn "Port $1 already in use — skipping $2"
    return 1
  fi
  return 0
}

wait_for_port() {
  local port=$1 name=$2 timeout=60 elapsed=0
  while ! lsof -i :$port -sTCP:LISTEN &>/dev/null; do
    sleep 2; elapsed=$((elapsed+2))
    if [ $elapsed -ge $timeout ]; then
      err "$name failed to start on port $port after ${timeout}s — check $LOG_DIR/$name.log"
      return 1
    fi
  done
  log "$name started on port $port"
}

# ── Backend services (order matters: gateway last) ────────────────────────
declare -A SERVICES=(
  ["chitfund-user-service"]=8081
  ["chitfund-chit-service"]=8082
  ["chitfund-member-service"]=8083
  ["chitfund-payment-service"]=8084
  ["chitfund-payout-service"]=8085
  ["chitfund-notification-service"]=8086
  ["chitfund-reporting-service"]=8087
  ["chitfund-audit-service"]=8088
  ["chitfund-api-gateway"]=8080
)

declare -a SERVICE_ORDER=(
  "chitfund-user-service"
  "chitfund-chit-service"
  "chitfund-member-service"
  "chitfund-payment-service"
  "chitfund-payout-service"
  "chitfund-notification-service"
  "chitfund-reporting-service"
  "chitfund-audit-service"
  "chitfund-api-gateway"
)

log "Starting ChitFund Platform..."
echo ""

# ── Zookeeper ─────────────────────────────────────────────────────────────
if nc -z localhost 2181 2>/dev/null; then
  warn "Zookeeper already running on 2181 — skipping"
else
  log "Starting Zookeeper..."
  $KAFKA_HOME/bin/zookeeper-server-start.sh $KAFKA_HOME/config/zookeeper.properties > "$LOG_DIR/zookeeper.log" 2>&1 &
  until nc -z localhost 2181 2>/dev/null; do sleep 1; done
  log "Zookeeper started on port 2181"
fi

# ── Kafka ─────────────────────────────────────────────────────────────────
if nc -z localhost 9092 2>/dev/null; then
  warn "Kafka already running on 9092 — skipping"
else
  log "Starting Kafka..."
  $KAFKA_HOME/bin/kafka-server-start.sh $KAFKA_HOME/config/server.properties > "$LOG_DIR/kafka.log" 2>&1 &
  until nc -z localhost 9092 2>/dev/null; do sleep 1; done
  log "Kafka started on port 9092"
fi

echo ""

for svc in "${SERVICE_ORDER[@]}"; do
  port=${SERVICES[$svc]}
  if check_port_free $port "$svc"; then
    log "Building $svc..."
    if ! bash -c "cd $BASE/$svc && $MVN package -DskipTests -q >> $LOG_DIR/$svc.log 2>&1"; then
      err "$svc build failed — check $LOG_DIR/$svc.log"
      continue
    fi
    JAR=$(ls "$BASE/$svc"/target/*.jar 2>/dev/null | grep -v original | head -1)
    log "Starting $svc on port $port..."
    nohup java -jar "$JAR" >> "$LOG_DIR/$svc.log" 2>&1 &
    wait_for_port $port "$svc"
  fi
done

echo ""

# ── Frontend ──────────────────────────────────────────────────────────────
if check_port_free $FRONTEND_PORT "frontend"; then
  log "Starting frontend on port $FRONTEND_PORT..."
  cd "$BASE/chitfund-frontend"
  npm run dev > "$LOG_DIR/chitfund-frontend.log" 2>&1 &
  wait_for_port $FRONTEND_PORT "frontend"
fi

echo ""
log "All services running!"
echo ""
echo "  Frontend  → http://localhost:3000"
echo "  Gateway   → http://localhost:8080"
echo "  Logs      → $LOG_DIR/"
echo ""
echo "  Login: admin / admin123"
echo ""
echo "To stop everything: $BASE/stop-chitfund.sh"
