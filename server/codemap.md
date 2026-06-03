# server/

## Responsibility
Node/Hono runtime for production self-hosting. It serves the built SPA, exposes optional authenticated storage APIs, proxies allowed OpenAI-compatible API endpoints, and persists server-mode data in SQLite.

## Design
- Middleware Pipeline: `index.ts` composes auth, CORS/cache headers, storage routes, API proxy, static asset serving, and SPA fallback in Hono order.
- Repository/DAO Pattern: `storage.ts` encapsulates all SQLite access behind a `FileStorage` class.
- Router Factory: `routes.ts` creates a Hono sub-router from a storage instance.
- Proxy Sanitizer: `proxy.ts` strips hop-by-hop/browser-specific headers and constructs safe upstream URLs.

## Modules
- `index.ts`: Application bootstrap. Reads env vars, creates `FileStorage`, optionally enables an access-password gate, mounts `/api/storage`, conditionally mounts `/api-proxy/*`, serves `./dist`, and starts `@hono/node-server` on `HOST`/`PORT`.
- `routes.ts`: REST routes for `tasks`, `images`, image thumbnails, `canvas-images`, and `agent-conversations`. Includes `GET /ping`, CRUD-like endpoints, idempotent image upsert, lightweight `GET /images/ids`, thumbnail endpoints, and `?full=true` image listing for export.
- `storage.ts`: SQLite persistence using `better-sqlite3`. Creates `tasks`, `images`, `image_thumbnails`, `canvas_images`, and `agent_conversations` tables with JSON blobs and created/updated-at indexes. Migrates legacy JSON files when SQLite tables are empty.
- `proxy.ts`: Builds proxy targets from server default URL or client `x-gip-api-base-url`, deduplicates `/v1`, removes unsafe request/response headers, and injects permissive CORS response headers.

## Runtime Environment
- `HOST`: bind host, default `0.0.0.0`.
- `PORT`: bind port, default `80`.
- `DATA_DIR`: storage directory, default `./data`.
- `STORAGE_TOKEN`: optional Bearer token for API clients when access password is enabled.
- `ACCESS_PASSWORD`: optional cookie-auth password for browser access.
- `API_PROXY_URL` / `API_URL`: upstream API base URL fallback, default `https://api.openai.com/v1`.
- `API_PROXY` / `ENABLE_API_PROXY`: enables `/api-proxy/*` when set to `true`.

## Request Flow
1. Optional access-password middleware allows `/api/auth/*`, valid `auth_token` cookies, or valid `Bearer STORAGE_TOKEN`.
2. Storage API requests receive CORS and no-cache headers, then route through `createApiRoutes(storage)`.
3. If proxying is enabled, `/api-proxy/*` accepts only `POST` and `OPTIONS` for `images/generations`, `images/edits`, and `responses` paths.
4. Static assets are served from `./dist`.
5. Unmatched GET routes fall back to `dist/index.html` for SPA routing.

## Storage Flow
1. `FileStorage` opens `${DATA_DIR}/storage.db`, enables WAL and normal synchronous mode.
2. Tables are created if missing.
3. If all tables are empty, legacy `tasks.json`, `images/*.json`, and `canvas/*.json` are imported.
4. CRUD methods serialize domain objects as JSON in table rows keyed by `id`; image deletion and clearing also remove associated thumbnail rows, and Agent conversations are replace-all persisted for conversation-state sync.

## Integration Points
- Built by `esbuild-server.mjs` into `dist-server/index.js` with `better-sqlite3` external.
- Consumed by Docker runtime commands in the root `Dockerfile` and `deploy/Dockerfile`.
- Matches frontend `ServerStorageAdapter` endpoints in `src/lib/storage.ts`.
- Matches frontend proxy URL/header construction in `src/lib/devProxy.ts` and `src/lib/openaiCompatibleImageApi.ts`.
