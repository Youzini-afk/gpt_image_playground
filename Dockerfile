# ---- Build stage ----
# 构建运行在目标平台，确保原生模块（better-sqlite3）的二进制与运行时匹配。
FROM node:20-alpine AS build

WORKDIR /app

ENV VITE_DEFAULT_API_URL=__VITE_DEFAULT_API_URL_PLACEHOLDER__
ENV VITE_API_PROXY_AVAILABLE=__VITE_API_PROXY_AVAILABLE_PLACEHOLDER__

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
ENV API_URL=https://api.openai.com
ENV ENABLE_API_PROXY=false

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

EXPOSE 80
VOLUME ["/app/data"]

CMD ["node", "dist-server/index.js"]
