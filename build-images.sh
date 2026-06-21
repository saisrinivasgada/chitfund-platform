#!/bin/bash
# Build all Docker images for the Chit Fund Platform.
# Run from: /Users/saisrinivas/Projects/learning/
# Usage:
#   ./build-images.sh                    # build only, tag as :latest
#   ./build-images.sh push 123456789.dkr.ecr.ap-south-1.amazonaws.com

set -e

REGISTRY=${1:-""}
TAG=${2:-"latest"}
BUILD_CONTEXT="."

SERVICES=(
  "chitfund-user-service:user-service"
  "chitfund-chit-service:chit-service"
  "chitfund-payment-service:payment-service"
  "chitfund-payout-service:payout-service"
  "chitfund-api-gateway:api-gateway"
)

echo "Building Chit Fund Platform images..."
echo ""

for entry in "${SERVICES[@]}"; do
  DIR="${entry%%:*}"
  NAME="${entry##*:}"

  if [ -n "$REGISTRY" ]; then
    IMAGE="$REGISTRY/$NAME:$TAG"
  else
    IMAGE="chitfund/$NAME:$TAG"
  fi

  echo "▶ Building $IMAGE from $DIR/Dockerfile..."
  docker build \
    -f "$DIR/Dockerfile" \
    -t "$IMAGE" \
    "$BUILD_CONTEXT"

  if [ -n "$REGISTRY" ]; then
    echo "  Pushing $IMAGE..."
    docker push "$IMAGE"
  fi

  echo "  ✓ Done: $IMAGE"
  echo ""
done

echo "All images built successfully."
if [ -n "$REGISTRY" ]; then
  echo "All images pushed to $REGISTRY."
fi
