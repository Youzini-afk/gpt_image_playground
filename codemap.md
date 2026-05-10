# Repository Atlas: gpt-image-playground

## Project Responsibility
GPT Image Playground is a React/TypeScript web app for image generation and editing against OpenAI-compatible image APIs and fal.ai. It provides a local-first UI for prompts, reference images, masks, task history, parameter tracking, and import/export, with optional Docker/Node server storage and API proxy support.

## Technology Stack
- Frontend: React 19, TypeScript, Vite, Tailwind CSS, Zustand.
- Browser storage: IndexedDB with SHA-256 image deduplication.
- Server runtime: Hono on Node via `@hono/node-server`.
- Server persistence: SQLite through `better-sqlite3`.
- API integrations: OpenAI-compatible Images/Responses APIs and `@fal-ai/client`.
- Packaging/deploy: Vite build, esbuild server bundle, Docker, Vercel static deployment config.

## System Entry Points
- `package.json`: Scripts for dev, server dev, frontend build, server build, full build, start, preview, and tests.
- `index.html`: Vite HTML entry.
- `src/main.tsx`: Browser React entry.
- `src/App.tsx`: Frontend application shell and bootstrap flow.
- `src/store.ts`: Central app state, task lifecycle, persistence, import/export, and image cache orchestration.
- `server/index.ts`: Hono production server entry.
- `vite.config.ts`: React plugin, relative base, app version define, optional dev proxy config.
- `esbuild-server.mjs`: Bundles `server/index.ts` to `dist-server/index.js`.
- `Dockerfile`: Main container image with runtime env injection and Node server startup.
- `vercel.json`: Vercel deployment config with git deployments disabled.

## Directory Map
| Directory | Responsibility Summary | Detailed Map |
| --- | --- | --- |
| `src/` | React frontend runtime, Zustand store, domain types, UI shell, local-first task/image workflows. | [src/codemap.md](src/codemap.md) |
| `src/components/` | UI components, task grid/cards, input dock, settings/detail/lightbox/mask modals, global overlays. | [src/components/codemap.md](src/components/codemap.md) |
| `src/hooks/` | Small reusable hooks for Escape close behavior, version checks, and Docker migration notices. | [src/hooks/codemap.md](src/hooks/codemap.md) |
| `src/lib/` | API clients, settings/profile normalization, storage adapters, IndexedDB, image/mask utilities, proxy/runtime helpers. | [src/lib/codemap.md](src/lib/codemap.md) |
| `server/` | Hono server for static SPA serving, storage REST APIs, restricted API proxy, and SQLite persistence. | [server/codemap.md](server/codemap.md) |
| `deploy/` | Docker/runtime helper scripts and alternate Nginx proxy/static deployment config. | [deploy/codemap.md](deploy/codemap.md) |

## Core Runtime Modes
- Local static/browser mode: Vite-built SPA stores tasks/images/canvas data in IndexedDB. API calls go directly to the configured provider unless a dev or Docker proxy is available and enabled.
- Docker/Node mode: Node server serves `dist/`, exposes `/api/storage/*`, optionally exposes restricted `/api-proxy/*`, stores server-mode data in SQLite under `DATA_DIR`, and injects runtime frontend env values at container start.
- Vite dev mode: `npm run dev` serves the SPA. Optional `dev-proxy.config.json` enables same-origin proxying through Vite for `/api-proxy`.

## Main Data Flows
### Image Generation
1. User configures prompt, images, mask, and params in `InputBar`.
2. `submitTask()` in `src/store.ts` validates the active profile and creates a running `TaskRecord`.
3. `executeTask()` loads image data URLs and calls `callImageApi()`.
4. `src/lib/api.ts` dispatches to OpenAI-compatible or fal.ai provider code.
5. Generated images are normalized to data URLs, stored by content hash, and referenced by task output IDs.
6. Task metadata records status, elapsed time, actual params, revised prompts, provider name/model, and recovery metadata where applicable.

### Storage
1. Frontend code calls `getStorage()` from `src/lib/storage.ts`.
2. Local mode delegates to IndexedDB in `src/lib/db.ts`.
3. Server mode calls `/api/storage/*` on the Hono server.
4. `server/routes.ts` maps REST endpoints to `FileStorage`.
5. `server/storage.ts` persists JSON blobs in SQLite and migrates legacy JSON files if needed.

### API Proxy
1. Frontend `devProxy.ts` decides whether `/api-proxy` is available or forced.
2. OpenAI-compatible requests include `X-GIP-API-Base-URL` when using the proxy.
3. `server/index.ts` accepts only allowed image endpoints and `POST`/`OPTIONS` methods.
4. `server/proxy.ts` builds the upstream URL and sanitizes headers.

## Testing And Build Commands
- `npm test`: Runs Vitest unit tests.
- `npm run build`: Type-checks and builds frontend.
- `npm run build:server`: Bundles the Hono server.
- `npm run build:all`: Builds frontend and server.

## Conventions For Future Work
- Read this atlas first, then read the relevant nested `codemap.md` before editing a subsystem.
- Keep task records referencing image IDs rather than embedding image data.
- Preserve the local/server storage adapter boundary.
- Route OpenAI-compatible behavior through `src/lib/openaiCompatibleImageApi.ts` and fal.ai behavior through `src/lib/falAiImageApi.ts`.
- Treat proxy paths as security-sensitive; keep the allowlist narrow.
