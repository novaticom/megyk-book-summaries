#!/bin/bash
set -e

# Enable Docker BuildKit for faster builds with caching
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

echo "=========================================="
echo "Deploying megyk-books..."
echo "=========================================="

# Store the current commit before pulling
BEFORE_COMMIT=$(git rev-parse HEAD)

# Pre-deployment health check (optional, non-blocking)
echo "🏥 Running pre-deployment health check..."
PRE_DEPLOY_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" https://app.megyk.com/api/health 2>/dev/null || echo "000")

if [ "$PRE_DEPLOY_HEALTH" = "200" ]; then
  echo "✅ Production is healthy before deployment"
elif [ "$PRE_DEPLOY_HEALTH" = "503" ]; then
  echo "⚠️  WARNING: Production health check shows unhealthy status"
  echo "   This may indicate a pre-existing issue."
  echo "   Continuing with deployment..."
else
  echo "⚠️  WARNING: Could not reach health endpoint (status: $PRE_DEPLOY_HEALTH)"
  echo "   This may be normal if the service is restarting."
  echo "   Continuing with deployment..."
fi
echo ""

# Pull latest changes
echo "📥 Pulling latest changes from master..."
git pull origin master

# Get the new commit
AFTER_COMMIT=$(git rev-parse HEAD)

# Check if anything actually changed
if [ "$BEFORE_COMMIT" = "$AFTER_COMMIT" ]; then
  echo "ℹ️  No new changes to deploy"
  exit 0
fi

# Check if dependencies or Dockerfile changed
CHANGED_FILES=$(git diff --name-only $BEFORE_COMMIT $AFTER_COMMIT)
echo "📝 Changed files:"
echo "$CHANGED_FILES"
echo ""

if echo "$CHANGED_FILES" | grep -qE "\.(ts|tsx|js|jsx)$"; then
  echo "🔨 Code changes detected - FULL REBUILD (~5 min)"
  docker compose -f ../n8n-docker-caddy/docker-compose.yml build --pull megyk-books
  docker compose -f ../n8n-docker-caddy/docker-compose.yml up -d megyk-books
elif echo "$CHANGED_FILES" | grep -qE "Dockerfile|package.json|yarn.lock"; then
  echo "🔨 Dependencies or Dockerfile changed - FULL REBUILD (~5 min)"
  docker compose -f ../n8n-docker-caddy/docker-compose.yml build --pull megyk-books
  docker compose -f ../n8n-docker-caddy/docker-compose.yml up -d megyk-books
else
  echo "⚡ Non-code changes only (docs/scripts) - QUICK RESTART (~30 sec)"
  docker compose -f ../n8n-docker-caddy/docker-compose.yml up -d megyk-books
fi

echo ""
echo "=========================================="
echo "✅ Deploy complete!"
echo "=========================================="

# Wait for container to be fully ready
echo ""
echo "⏳ Waiting for container to be ready..."
sleep 10

# Run post-deployment health check
echo ""
echo "🏥 Running post-deployment health check..."
echo "=========================================="

MAX_RETRIES=6
RETRY_COUNT=0
HEALTH_CHECK_PASSED=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "Attempt $RETRY_COUNT of $MAX_RETRIES..."

  # Check health endpoint
  HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" https://app.megyk.com/api/health || echo "000")

  if [ "$HEALTH_RESPONSE" = "200" ]; then
    echo "✅ Health check passed!"
    HEALTH_CHECK_PASSED=true

    # Show detailed health status
    echo ""
    echo "📊 Health Status:"
    curl -s https://app.megyk.com/api/health | jq '.' || echo "Could not parse health response"
    break
  else
    echo "⚠️  Health check returned status: $HEALTH_RESPONSE"

    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
      echo "   Retrying in 10 seconds..."
      sleep 10
    fi
  fi
done

echo ""
echo "=========================================="

if [ "$HEALTH_CHECK_PASSED" = true ]; then
  echo "✅ Deployment verified successfully!"
  echo "=========================================="
  exit 0
else
  echo "❌ Health check failed after $MAX_RETRIES attempts"
  echo "=========================================="
  echo ""
  echo "🔍 Troubleshooting steps:"
  echo "1. Check container logs: docker logs megyk-books --tail=50"
  echo "2. Check container status: docker ps -a | grep megyk-books"
  echo "3. Manually check health: curl https://app.megyk.com/api/health"
  echo "4. Check environment variables in docker-compose.yml"
  echo ""
  exit 1
fi
