#!/bin/bash
# Deploy Chit Fund to EC2
# Usage: ./deploy.sh
# Run from: /Users/saisrinivas/Projects/learning/

set -e

EC2_IP="3.21.196.51"
EC2_USER="ec2-user"
KEY="./chitfund-key.pem"
REMOTE_DIR="/app"

echo "▶ Syncing code to EC2..."
rsync -az --progress \
  --exclude='.git' \
  --exclude='*/target/' \
  --exclude='node_modules' \
  --exclude='chitfund-frontend/node_modules' \
  --exclude='chitfund-audit-service' \
  --exclude='chitfund-reporting-service' \
  --exclude='restful-web-services' \
  --exclude='MyVibeCodingApp' \
  -e "ssh -i $KEY -o StrictHostKeyChecking=no" \
  . $EC2_USER@$EC2_IP:$REMOTE_DIR/

echo "▶ Copying env file..."
scp -i $KEY -o StrictHostKeyChecking=no \
  .env.prod $EC2_USER@$EC2_IP:$REMOTE_DIR/.env

echo "▶ Building and starting services on EC2..."
ssh -i $KEY -o StrictHostKeyChecking=no $EC2_USER@$EC2_IP << 'REMOTE'
  cd /app
  # Create databases if they don't exist (runs once)
  if [ -f "init-databases.sql" ]; then
    echo "DB init script found - run manually if first deploy"
  fi
  docker compose -f docker-compose.prod.yml up -d --build
  echo "Waiting for services to be healthy..."
  sleep 10
  docker compose -f docker-compose.prod.yml ps
REMOTE

echo ""
echo "✓ Deployment complete!"
echo "  App: http://$EC2_IP:8080"
echo ""
echo "  Useful commands:"
echo "  ssh -i chitfund-key.pem ec2-user@$EC2_IP"
echo "  docker compose -f docker-compose.prod.yml logs -f"
