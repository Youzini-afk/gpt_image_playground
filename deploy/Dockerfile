# ---- Build stage ----
FROM --platform=$BUILDPLATFORM node:20-alpine AS build

WORKDIR /app

ENV VITE_DEFAULT_API_URL=__VITE_DEFAULT_API_URL_PLACEHOLDER__
ENV VITE_API_PROXY_AVAILABLE=__VITE_API_PROXY_AVAILABLE_PLACEHOLDER__
ENV VITE_DOCKER_DEPLOYMENT=__VITE_DOCKER_DEPLOYMENT_PLACEHOLDER__
ENV VITE_DOCKER_LEGACY_API_URL_USED=__VITE_DOCKER_LEGACY_API_URL_USED_PLACEHOLDER__

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:all

# ---- Production stage ----
FROM node:20-alpine

ENV HOST=0.0.0.0
ENV PORT=80
ENV DATA_DIR=/app/data
ENV STORAGE_TOKEN=
ENV ACCESS_PASSWORD=
ENV API_URL=https://api.openai.com
ENV DEFAULT_API_URL=
ENV API_PROXY_URL=
ENV ENABLE_API_PROXY=false

WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/package.json ./

RUN npm install --omit=dev hono @hono/node-server

COPY --chmod=755 deploy/migrate-api-env.envsh /docker-entrypoint.d/05-migrate-api-env.envsh
COPY --chmod=755 deploy/inject-api-url.sh /docker-entrypoint.d/40-inject-api-url.sh

EXPOSE 80
VOLUME ["/app/data"]

CMD ["sh", "-c", ". /docker-entrypoint.d/05-migrate-api-env.envsh && exec /docker-entrypoint.d/40-inject-api-url.sh node dist-server/index.js"]