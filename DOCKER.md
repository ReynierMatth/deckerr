# Deckerr Docker Deployment

Self-host Deckerr with two deployment options:

## Deployment Options

| Option | Use Case | Complexity |
|--------|----------|------------|
| **External Supabase** | Use hosted Supabase (cloud or paid) | Simple |
| **Self-hosted Supabase** | Run everything locally | Advanced |

---

## Option 1: External Supabase (Recommended)

Use your own Supabase instance (cloud, paid hosted, or separately self-hosted).

### Quick Start

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Edit .env with your Supabase credentials
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
PORT=3000

# 3. Run database migrations on your Supabase
# Go to Supabase Dashboard > SQL Editor and run:
# Contents of supabase/migrations/20250131132458_black_frost.sql

# 4. Start Deckerr
docker-compose up -d

# 5. Access at http://localhost:3000
```

### Using Hosted Supabase (Paid Service)

Contact the Deckerr team for access credentials to use the hosted backend.

---

## Option 2: Self-Hosted Supabase (Full Stack)

Run Deckerr with a complete self-hosted Supabase stack.

### Prerequisites

- Docker & Docker Compose
- 2GB+ RAM
- Ports: 3000, 5432, 8000

### Quick Start

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Generate secure keys
# JWT Secret (required)
openssl rand -base64 32

# Generate Supabase API keys
# Option A: Use online generator at https://supabase.com/docs/guides/self-hosting#api-keys
# Option B: Use Supabase CLI
npx @supabase/cli@latest gen key --type anon --jwt-secret "YOUR_JWT_SECRET"
npx @supabase/cli@latest gen key --type service_role --jwt-secret "YOUR_JWT_SECRET"

# 3. Update .env with your generated values
POSTGRES_PASSWORD=<generated-password>
JWT_SECRET=<generated-jwt-secret>
ANON_KEY=<generated-anon-key>
SERVICE_ROLE_KEY=<generated-service-key>

# 4. Start all services
docker-compose -f docker-compose.selfhosted.yml up -d

# 5. Access Deckerr at http://localhost:3000
# API available at http://localhost:8000
```

### Generate Keys Script

```bash
#!/bin/bash
JWT_SECRET=$(openssl rand -base64 32)
echo "JWT_SECRET=$JWT_SECRET"
echo ""
echo "Now generate API keys at:"
echo "https://supabase.com/docs/guides/self-hosting#api-keys"
echo "Use this JWT secret: $JWT_SECRET"
```

### Self-Hosted Services

| Service | Port | Description |
|---------|------|-------------|
| Deckerr | 3000 | Frontend app |
| Kong | 8000 | API Gateway |
| PostgreSQL | 5432 | Database |
| Auth | 9999 | Authentication (internal) |
| REST | 3000 | PostgREST API (internal) |
| Realtime | 4000 | WebSocket (internal) |

---

## Environment Variables

### External Supabase Mode

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `PORT` | No | App port (default: 3000) |

### Self-Hosted Mode

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password |
| `JWT_SECRET` | Yes | JWT signing secret (32+ chars) |
| `ANON_KEY` | Yes | Supabase anonymous key |
| `SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `SITE_URL` | No | Your domain (default: localhost) |
| `SMTP_*` | No | Email configuration |

---

## Commands

```bash
# Start (external Supabase)
docker-compose up -d

# Start (self-hosted)
docker-compose -f docker-compose.selfhosted.yml up -d

# Stop
docker-compose down

# View logs
docker-compose logs -f

# Rebuild after code changes
docker-compose build --no-cache
docker-compose up -d

# Reset database (self-hosted only)
docker-compose -f docker-compose.selfhosted.yml down -v
docker-compose -f docker-compose.selfhosted.yml up -d
```

---

## Production Checklist

- [ ] Use strong passwords (generate with `openssl rand -base64 32`)
- [ ] Configure HTTPS with reverse proxy (nginx, Traefik, Caddy)
- [ ] Set up email (SMTP) for password reset
- [ ] Configure firewall rules
- [ ] Set up backups for PostgreSQL volume
- [ ] Consider rate limiting at reverse proxy level

---

## Troubleshooting

### Container won't start
```bash
docker-compose logs <service-name>
```

### Database connection issues
```bash
# Check if database is healthy
docker-compose exec db pg_isready -U postgres
```

### Reset everything
```bash
docker-compose down -v
docker-compose up -d --build
```

### Check service health
```bash
docker-compose ps
```
