# Server Infrastructure Documentation

This document describes the production and staging server setup for Megyk Books.

## Server Overview

- **Host**: 64.225.71.187 (DigitalOcean)
- **SSH Access**: `ssh megyk@64.225.71.187`
- **Base Directory**: `/opt/megyk/`

## Directory Structure

```
/opt/megyk/
├── book-summaries-megyk/          # Production app (master branch)
├── book-summaries-megyk-staging/  # Staging app (staging branch)
├── megyk/                         # Marketing dashboard
├── n8n-docker-caddy/              # Main docker-compose & Caddy config
└── supabase/                      # Self-hosted Supabase
```

## Docker Architecture

All services run via Docker Compose from `/opt/megyk/n8n-docker-caddy/docker-compose.yml`.

### Networks

| Network | Purpose |
|---------|---------|
| `n8n-docker-caddy_default` | Main network for all services |
| `supabase_default` | Supabase internal network (external) |

Services that need Supabase access are connected to both networks.

### Running Containers

| Container | Image | Purpose | Ports |
|-----------|-------|---------|-------|
| `megyk-books` | n8n-docker-caddy-megyk-books | Production app | 3200 (internal) |
| `megyk-books-staging` | n8n-docker-caddy-megyk-books-staging | Staging app | 3201:3200 |
| `megyk-dashboard` | n8n-docker-caddy-megyk-dashboard | Marketing dashboard | 3100 (internal) |
| `n8n-docker-caddy-n8n-1` | n8n-docker-caddy-n8n | Workflow automation | 5678 |
| `n8n-docker-caddy-caddy-1` | caddy:latest | Reverse proxy | 80, 443 |
| `html2pdf` | html2pdf:latest | PDF generation | 8000 (internal) |
| `redis` | redis:7-alpine | Cache | 6379 (internal) |
| `ollama` | ollama/ollama:latest | LLM | 11434 (internal) |
| `wordpress` | bitnami/wordpress:latest | megyk.com website | 8080 (internal) |
| `wordpress-db` | bitnami/mariadb:latest | WordPress database | 3306 (internal) |

### Supabase Containers

| Container | Purpose |
|-----------|---------|
| `supabase-db` | PostgreSQL 15 database (port 5433 external, 5432 internal) |
| `supabase-auth` | GoTrue authentication |
| `supabase-storage` | File storage API |
| `supabase-kong` | API gateway (port 8000, 8443) |
| `supabase-rest` | PostgREST API |
| `supabase-studio` | Dashboard UI |
| `supabase-pooler` | Connection pooler (ports 5432, 6543) |
| `supabase-realtime` | Realtime subscriptions |
| `supabase-edge-functions` | Edge functions runtime |
| `supabase-analytics` | Logflare analytics |
| `supabase-vector` | Log aggregation |
| `supabase-imgproxy` | Image processing |
| `supabase-meta` | Postgres metadata |

## Caddy Reverse Proxy

Caddyfile location: `/opt/megyk/n8n-docker-caddy/caddy_config/Caddyfile`

### Domain Routing

| Domain | Backend |
|--------|---------|
| `app.megyk.com` | megyk-books:3200 |
| `staging.megyk.com` | megyk-books-staging:3200 |
| `supabase.megyk.com` | supabase-kong:8000 (API) / supabase-studio:3000 (/studio/*) |
| `n8n.megyk.com` | n8n:5678 |
| `dashboard.megyk.com` | megyk-dashboard:3100 |
| `api.megyk.com` | supabase-kong:8000 |
| `pdf.megyk.com` | html2pdf:8000 |
| `megyk.com` | wordpress:8080 |
| `ollama.megyk.com` | ollama:11434 |

## Megyk Books Service Configuration

### Production (`megyk-books`)

```yaml
megyk-books:
  build:
    context: /opt/megyk/book-summaries-megyk
    dockerfile: Dockerfile
    args:
      - NEXT_PUBLIC_SITE_URL=https://app.megyk.com
      - NEXT_PUBLIC_SUPABASE_URL=https://supabase.megyk.com
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
  environment:
    - NODE_ENV=production
    - PORT=3200
    - SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
    - N8N_WEBHOOK_URL=https://n8n.megyk.com/webhook/get_summary_v3
    - N8N_SIGNUP_WEBHOOK_URL=https://n8n.megyk.com/webhook/app_signups
  networks:
    - default
    - supabase_default
```

### Staging (`megyk-books-staging`)

```yaml
megyk-books-staging:
  build:
    context: /opt/megyk/book-summaries-megyk-staging
    dockerfile: Dockerfile
    args:
      - NEXT_PUBLIC_SITE_URL=https://staging.megyk.com
      - NEXT_PUBLIC_SUPABASE_URL=https://supabase.megyk.com
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
  environment:
    - NODE_ENV=production
    - PORT=3200
    - SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
    - N8N_WEBHOOK_URL=https://n8n.megyk.com/webhook/get_summary_v3
    - N8N_SIGNUP_WEBHOOK_URL=https://n8n.megyk.com/webhook/app_signups
  ports:
    - "3201:3200"
  env_file:
    - /opt/megyk/book-summaries-megyk-staging/.env.staging
```

**Note**: Both staging and production share the same Supabase instance.

## Deployment

### GitHub Actions Workflows

| Workflow | Trigger | Action |
|----------|---------|--------|
| `deploy.yml` | Push to `master` | SSH to server, run `.scripts/deploy.sh` |
| `deploy-staging.yml` | Push to `staging` | SSH to server, run `.scripts/deploy-staging.sh` |

### Deploy Script Behavior

The deploy scripts (`deploy.sh` and `deploy-staging.sh`):

1. Run pre-deployment health check
2. Pull latest changes from git
3. Detect what changed:
   - Code changes (`.ts`, `.tsx`, `.js`, `.jsx`) → Full rebuild
   - Dockerfile/dependencies changed → Full rebuild
   - Other changes → Quick restart
4. Build/restart container via docker compose
5. Wait 10 seconds for container startup
6. Run post-deployment health check (6 retries, 10s apart)

### Manual Deployment

```bash
# SSH to server
ssh megyk@64.225.71.187

# Production
cd /opt/megyk/book-summaries-megyk
git pull origin master
.scripts/deploy.sh

# Staging
cd /opt/megyk/book-summaries-megyk-staging
git pull origin staging
.scripts/deploy-staging.sh
```

### Force Rebuild (no cache)

```bash
cd /opt/megyk/n8n-docker-caddy
docker compose up -d --build --no-cache megyk-books
# or for staging:
docker compose up -d --build --no-cache megyk-books-staging
```

## Health Check

Endpoint: `GET /api/health`

Returns 200 if healthy, 503 if unhealthy.

Checks:
- `N8N_WEBHOOK_URL` environment variable configured
- Supabase connection (counts books table)
- Storage bucket accessibility

## Troubleshooting

### Check Container Logs

```bash
docker logs megyk-books --tail=100
docker logs megyk-books-staging --tail=100
```

### Check Container Status

```bash
docker ps -a | grep megyk-books
```

### Restart Container

```bash
cd /opt/megyk/n8n-docker-caddy
docker compose restart megyk-books
```

### Check Health Manually

```bash
curl https://app.megyk.com/api/health | jq
curl https://staging.megyk.com/api/health | jq
```

### View Container Networks

```bash
docker inspect megyk-books --format='{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}'
```

### Access Container Shell

```bash
docker exec -it megyk-books sh
```

## Important Notes

1. **NEXT_PUBLIC_* variables** are baked into the JS bundle at build time (via Docker build args), not available as runtime environment variables.

2. **Shared Supabase**: Staging and production both use `supabase.megyk.com`. This means:
   - Same database
   - Same auth service (GoTrue)
   - Email templates use production URL (GOTRUE_SITE_URL)

3. **Container networking**: The production container connects to both `n8n-docker-caddy_default` and `supabase_default` networks. The `HOSTNAME=0.0.0.0` env var ensures Next.js binds to all interfaces.

4. **Docker BuildKit**: Enabled for faster builds with layer caching.
