# Build stage — config-free: no Supabase values are baked in, so the resulting
# image is generic and any instance can run it with its own env vars.
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

# Custom nginx config (SPA fallback, cache rules, security headers)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Runtime config injector: the nginx image runs /docker-entrypoint.d/*.sh at
# startup, so this writes /config.js from SUPABASE_URL / SUPABASE_ANON_KEY.
COPY docker/40-deckerr-config.sh /docker-entrypoint.d/40-deckerr-config.sh
RUN chmod +x /docker-entrypoint.d/40-deckerr-config.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
