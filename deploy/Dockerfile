# ---- Build stage ----
# Build on the target platform so native runtime modules such as better-sqlite3
# match the final Node server image architecture.
FROM node:20-alpine AS build

WORKDIR /app

ENV VITE_DEFAULT_API_URL=__VITE_DEFAULT_API_URL_PLACEHOLDER__
ENV VITE_API_PROXY_AVAILABLE=__VITE_API_PROXY_AVAILABLE_PLACEHOLDER__
ENV VITE_API_PROXY_LOCKED=__VITE_API_PROXY_LOCKED_PLACEHOLDER__
ENV VITE_DOCKER_DEPLOYMENT=__VITE_DOCKER_DEPLOYMENT_PLACEHOLDER__
ENV VITE_DOCKER_LEGACY_API_URL_USED=__VITE_DOCKER_LEGACY_API_URL_USED_PLACEHOLDER__

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN apk add --no-cache --virtual .build-deps python3 make g++ libc6-compat && \
    npm run build:all && \
    npm prune --omit=dev && \
    apk del .build-deps

# ---- Production stage ----
FROM node:20-alpine

ENV HOST=0.0.0.0
ENV PORT=80
ENV DATA_DIR=/app/data
ENV STORAGE_TOKEN=
ENV ACCESS_PASSWORD=
ENV API_URL=
ENV DEFAULT_API_URL=
ENV API_PROXY_URL=
ENV ENABLE_API_PROXY=false
ENV LOCK_API_PROXY=false

WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

COPY --chmod=755 deploy/migrate-api-env.envsh /docker-entrypoint.d/05-migrate-api-env.envsh
COPY --chmod=755 deploy/inject-api-url.sh /docker-entrypoint.d/40-inject-api-url.sh

EXPOSE 80
VOLUME ["/app/data"]

CMD ["sh", "-c", ". /docker-entrypoint.d/05-migrate-api-env.envsh && exec /docker-entrypoint.d/40-inject-api-url.sh node dist-server/index.js"]
