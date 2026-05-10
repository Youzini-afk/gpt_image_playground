# Repository Atlas: gpt-image-playground

## Project Responsibility
GPT Image Playground is a React/TypeScript web app for image generation and editing against OpenAI-compatible, fal.ai, and user-defined HTTP image APIs. It provides a local-first UI for prompts, reference images, masks, task history, thumbnails, parameter tracking, custom provider configuration, import/export, optional Docker/Node server storage, API proxy support, and Cloudflare static deployment.

## Technology Stack
- Frontend: React 19, TypeScript, Vite, Tailwind CSS, Zustand.
- Browser storage: IndexedDB with SHA-256 image deduplication and a separate thumbnail object store.
- Server runtime: Hono on Node via `@hono/node-server`.
- Server persistence: SQLite through `better-sqlite3`.
- API integrations: OpenAI-compatible Images/Responses APIs, `@fal-ai/client`, and manifest-driven custom HTTP image providers.
- Packaging/deploy: Vite build, esbuild server bundle, Docker runtime env injection, Vercel config, and Wrangler/Cloudflare static assets.

## System Entry Points
- `package.json`: Scripts for Vite dev, Hono server dev, mock image API, frontend build, server build, full build, Cloudflare deploy, start, preview, and Vitest.
- `index.html`: Vite HTML entry.
- `src/main.tsx`: Browser React entry plus mobile viewport setup.
- `src/App.tsx`: Frontend application shell, URL settings bootstrap, storage init, and global overlays.
- `src/store.ts`: Central app state, task lifecycle, persistence, image/thumbnail cache, recovery, import/export, and image API orchestration.
- `src/lib/api.ts`: Provider dispatcher for OpenAI-compatible, fal.ai, and custom provider calls.
- `server/index.ts`: Hono production server entry.
- `scripts/mock-image-api.mjs`: Local mock OpenAI-compatible/custom-provider API for testing provider configuration.
- `wrangler.jsonc`: Cloudflare static assets deployment config.

## Directory Map
| Directory | Responsibility Summary | Detailed Map |
| --- | --- | --- |
| `src/` | React frontend runtime, Zustand store, domain types, UI shell, local-first task/image/thumbnail workflows. | [src/codemap.md](src/codemap.md) |
| `src/components/` | UI components, task grid/cards, input dock, settings/detail/lightbox/mask modals, custom controls, and global overlays. | [src/components/codemap.md](src/components/codemap.md) |
| `src/hooks/` | Small reusable hooks for Escape close behavior, version checks, Docker migration notices, scroll locking, and tooltip lifecycle. | [src/hooks/codemap.md](src/hooks/codemap.md) |
| `src/lib/` | API clients, provider/profile normalization, storage adapters, IndexedDB, thumbnails, image/mask utilities, proxy/runtime helpers, URL settings, dropdown/tooltip utilities. | [src/lib/codemap.md](src/lib/codemap.md) |
| `server/` | Hono server for static SPA serving, auth-gated storage REST APIs, restricted API proxy, and SQLite persistence. | [server/codemap.md](server/codemap.md) |
| `deploy/` | Docker/runtime helper scripts and alternate Nginx proxy/static deployment config. | [deploy/codemap.md](deploy/codemap.md) |
| `scripts/` | Development helper scripts, currently the mock image API server. | _Inline in this atlas_ |
| `docs/` | User-facing docs for custom provider manifests and mock API usage. | _Not mapped in detail_ |

## Core Runtime Modes
- Local browser mode: Vite-built SPA stores tasks/images/canvas data in IndexedDB. API calls go directly to the configured provider unless a dev or Docker proxy is available and enabled.
- Docker/Node mode: Node server serves `dist/`, exposes `/api/storage/*`, optionally exposes restricted `/api-proxy/*`, stores server-mode data in SQLite under `DATA_DIR`, and injects runtime frontend env values at container start.
- Vite dev mode: `npm run dev` serves the SPA. Optional `dev-proxy.config.json` enables same-origin proxying through Vite for `/api-proxy`.
- Mock API mode: `npm run mock:api` starts `scripts/mock-image-api.mjs` for OpenAI-compatible/custom provider testing.
- Cloudflare static mode: `npm run deploy:cf` builds and deploys `dist/` according to `wrangler.jsonc`.

## Main Data Flows
### Image Generation
1. User configures prompt, images, mask, active profile, and params in `InputBar` and `SettingsModal`.
2. `submitTask()` in `src/store.ts` validates the active profile and creates a running `TaskRecord`.
3. `executeTask()` loads image data URLs, orders mask inputs, and calls `callImageApi()`.
4. `src/lib/api.ts` dispatches to OpenAI-compatible, fal.ai, or custom-provider code.
5. Generated images are normalized to data URLs, stored by content hash, and referenced by task output IDs.
6. Thumbnails are generated/stored separately to avoid decoding full-resolution images in list/detail previews.
7. Task metadata records status, elapsed time, actual params, revised prompts, provider name/model, raw URLs/payloads, and recovery metadata where applicable.

### Storage
1. Frontend code calls `getStorage()` from `src/lib/storage.ts`.
2. Local mode delegates tasks/images/canvas records to IndexedDB in `src/lib/db.ts`; thumbnails are also managed by `db.ts`.
3. Server mode calls `/api/storage/*` on the Hono server for tasks/images/canvas data.
4. `server/routes.ts` maps REST endpoints to `FileStorage`.
5. `server/storage.ts` persists JSON blobs in SQLite and migrates legacy JSON files if needed.

### API Proxy And Custom Providers
1. `src/lib/urlSettings.ts` and `src/lib/apiProfiles.ts` normalize URL/imported settings into profile/custom-provider definitions.
2. `src/lib/devProxy.ts` decides whether `/api-proxy` is available or forced.
3. OpenAI-compatible and custom HTTP requests include `X-GIP-API-Base-URL` when using the proxy.
4. `server/index.ts` accepts only allowed image endpoints and `POST`/`OPTIONS` methods.
5. `server/proxy.ts` builds the upstream URL and sanitizes headers.

## Testing And Build Commands
- `npm test`: Runs Vitest unit tests.
- `npm run build`: Type-checks and builds frontend.
- `npm run build:server`: Bundles the Hono server.
- `npm run build:all`: Builds frontend and server.
- `npm run mock:api`: Starts local mock API for provider experiments.
- `npm run deploy:cf`: Builds and deploys static assets through Wrangler.

## Conventions For Future Work
- Read this atlas first, then read the relevant nested `codemap.md` before editing a subsystem.
- Keep task records referencing image IDs rather than embedding image data.
- Preserve the local/server storage adapter boundary.
- Preserve the full-image vs thumbnail split; list/card/detail previews should prefer thumbnails.
- Route OpenAI-compatible behavior through `src/lib/openaiCompatibleImageApi.ts`, fal.ai behavior through `src/lib/falAiImageApi.ts`, and custom provider behavior through the manifest/template path.
- Treat proxy paths as security-sensitive; keep the allowlist narrow.
