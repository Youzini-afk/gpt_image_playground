# ---- Build stage ----
FROM --platform=$BUILDPLATFORM node:20-alpine AS build

WORKDIR /app

ENV VITE_DEFAULT_API_URL=__VITE_DEFAULT_API_URL_PLACEHOLDER__
ENV VITE_API_PROXY_AVAILABLE=__VITE_API_PROXY_AVAILABLE_PLACEHOLDER__

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
ENV API_URL=https://api.openai.com
ENV ENABLE_API_PROXY=false

WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/package.json ./

RUN npm install --omit=dev hono @hono/node-server

EXPOSE 80
VOLUME ["/app/data"]

CMD ["node", "dist-server/index.js"]