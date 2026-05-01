# ---- Build stage ----
# 构建运行在目标平台，确保原生模块（better-sqlite3）的二进制与运行时匹配。
FROM node:20-alpine AS build

WORKDIR /app

ENV VITE_DEFAULT_API_URL=__VITE_DEFAULT_API_URL_PLACEHOLDER__
ENV VITE_API_PROXY_AVAILABLE=__VITE_API_PROXY_AVAILABLE_PLACEHOLDER__
ENV VITE_DOCKER_DEPLOYMENT=__VITE_DOCKER_DEPLOYMENT_PLACEHOLDER__
ENV VITE_DOCKER_LEGACY_API_URL_USED=__VITE_DOCKER_LEGACY_API_URL_USED_PLACEHOLDER__

COPY package.json package-lock.json ./

RUN apk add --no-cache --virtual .build-deps python3 make g++ libc6-compat && \
    npm ci && \
    apk del .build-deps

COPY . .
RUN npm run build:all && npm prune --omit=dev

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

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

RUN mkdir -p /docker-entrypoint.d
COPY --from=build /app/deploy/migrate-api-env.envsh /docker-entrypoint.d/05-migrate-api-env.envsh
COPY --from=build /app/deploy/inject-api-url.sh /docker-entrypoint.d/40-inject-api-url.sh
RUN chmod +x /docker-entrypoint.d/05-migrate-api-env.envsh /docker-entrypoint.d/40-inject-api-url.sh

EXPOSE 80
VOLUME ["/app/data"]

CMD ["sh", "-c", ". /docker-entrypoint.d/05-migrate-api-env.envsh && exec /docker-entrypoint.d/40-inject-api-url.sh node dist-server/index.js"]
