#!/bin/bash
# ChitFund Platform — stop all services

GREEN='\033[0;32m'
NC='\033[0m'

log() { echo -e "${GREEN}[chitfund]${NC} $1"; }

PORTS=(8080 8081 8082 8083 8084 8085 8086 8087 8088 3000)

for port in "${PORTS[@]}"; do
  pids=$(lsof -ti :$port -sTCP:LISTEN 2>/dev/null)
  if [ -n "$pids" ]; then
    kill $pids 2>/dev/null && log "Stopped port $port (PID $pids)"
  fi
done

# Stop Kafka then Zookeeper (order matters)
KAFKA_HOME=/Users/saisrinivas/Downloads/kafka_2.12-3.9.1
$KAFKA_HOME/bin/kafka-server-stop.sh 2>/dev/null && log "Kafka stopped"
sleep 2
$KAFKA_HOME/bin/zookeeper-server-stop.sh 2>/dev/null && log "Zookeeper stopped"

log "All services stopped."
