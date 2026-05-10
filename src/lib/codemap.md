# src/lib/

## Responsibility
Frontend business and infrastructure library. This directory contains API provider clients, custom provider manifest handling, settings/profile normalization, storage adapters, IndexedDB/thumbnail access, image/canvas/mask utilities, parameter compatibility, URL setting normalization, runtime proxy helpers, clipboard helpers, dropdown/tooltip utilities, and viewport utilities.

## Design
- Provider Strategy: `api.ts` selects OpenAI-compatible, fal.ai, or custom HTTP provider implementations based on `getActiveApiProfile(settings)` and `getCustomProviderDefinition()`.
- Storage Adapter: `storage.ts` abstracts local IndexedDB and server REST storage behind a shared `StorageAdapter` interface for tasks, full images, image IDs, thumbnails, and canvas images.
- Thumbnail Store: local mode keeps thumbnails in the `db.ts` object store; server mode stores them through `/api/storage/images/:id/thumbnail`, with freshness/version checks exposed by the storage adapter.
- Compatibility Normalizers: `apiProfiles.ts`, `urlSettings.ts`, `paramCompatibility.ts`, `size.ts`, and `devProxy.ts` normalize old settings, URL imports, provider-specific limits, image dimensions, and proxy URLs before requests are made.
- Canvas Utility Layer: Canvas/image/mask modules isolate browser image manipulation from React components.

## API Modules
- `api.ts`: Dispatch layer exporting `callImageApi()` and `normalizeBaseUrl`.
- `openaiCompatibleImageApi.ts`: OpenAI-compatible and custom HTTP image client. Handles Images API, Responses API, custom submit/poll mappings, Codex CLI prompt guarding, multipart edits, mask uploads, proxy routing, timeout aborts, URL/base64 result parsing, revised prompts, actual params, raw payload capture, and queued custom recovery.
- `falAiImageApi.ts`: fal.ai client using `@fal-ai/client`. Maps model IDs to generate/edit endpoints, caps image count to fal limits, subscribes to queue jobs, records request IDs/endpoints for recovery, parses URL/base64 result variants, and maps actual params.
- `imageApiShared.ts`: Shared call types/utilities for MIME mapping, data URL handling, fetch diagnostics, API error extraction, payload-size assertions, base64 normalization, remote image fetching, and actual-param merging.

## Settings And Parameter Modules
- `apiProfiles.ts`: Creates default OpenAI/fal profiles, normalizes legacy flat settings, validates and merges custom provider manifests, switches provider defaults, validates profiles, deduplicates imported profiles, and merges imported settings.
- `urlSettings.ts`: Parses URL-driven settings/profile/custom provider payloads and converts them into normalized settings updates.
- `paramCompatibility.ts`: Normalizes params for active provider/mode, removes unsupported settings such as OpenAI Codex CLI quality or fal auto values, and exposes output-count limits.
- `paramDisplay.tsx`: Renders requested and actual params with mismatch highlighting for task cards/details.
- `size.ts`: Normalizes custom dimensions to safe image sizes, rounds to multiples of 16, clamps aspect ratio and pixel bounds, and formats ratios/tiers.

## Storage Modules
- `storage.ts`: Runtime switch between `LocalStorageAdapter` and `ServerStorageAdapter`; owns image ID enumeration and thumbnail read/write methods; tests server storage through `/api/storage/ping`.
- `db.ts`: IndexedDB wrapper for tasks, images, thumbnails, and canvasImages stores. Hashes image data URLs with SHA-256, stores thumbnail metadata separately, and deletes image/thumbnail records together.

## Image, Mask, Canvas, And UI Utility Modules
- `canvasImage.ts`: Loads images, reads dimensions, converts data URLs/blobs, exports canvas blobs, validates mask dimensions, and creates mask preview images.
- `mask.ts`: Orders mask-target images, classifies mask coverage, and asserts mask validity.
- `maskPreprocess.ts`: Resizes large mask targets to a maximum edge of 1920 and dimensions divisible by 16, converts to PNG, and replaces the target input image with the working copy.
- `viewportTransform.ts`: Pure pan/zoom/clamp math used by the mask editor.
- `clipboard.ts`: Clipboard write helpers with fallback messages.
- `viewport.ts`: Mobile viewport guard installation.
- `dropdown.ts`: Shared dropdown positioning/open-state utilities.
- `tooltipDismiss.ts`: Global tooltip dismissal coordination.

## Runtime And Proxy Modules
- `devProxy.ts`: Normalizes API base URLs, loads optional `dev-proxy.config.json`, builds direct or `/api-proxy` URLs, and determines whether proxy use is available or forced in Docker deployments.
- `runtimeEnv.ts`: Filters Vite placeholder values and reads runtime-injected environment values.

## Generation Control Flow
1. `store.ts` calls `callImageApi(opts)`.
2. `api.ts` resolves the active profile and optional custom provider definition.
3. OpenAI-compatible/custom profiles route to `openaiCompatibleImageApi.ts`; fal profiles route to `falAiImageApi.ts`.
4. Provider clients normalize payloads, route through proxy when required, parse returned images to data URLs, and return `CallApiResult`.
5. `store.ts` persists resulting images, schedules thumbnail work, and updates task metadata.

## Storage Control Flow
1. `initStorageMode()` in `store.ts` calls `testServerStorage()` when settings request server storage.
2. `setStorageMode()` selects an adapter.
3. Store CRUD helpers call `getStorage()` and remain unaware of IndexedDB vs server REST details, including thumbnail reads/writes and lightweight image ID enumeration.
