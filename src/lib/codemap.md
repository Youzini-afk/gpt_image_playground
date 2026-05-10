# src/lib/

## Responsibility
Frontend business and infrastructure library. This directory contains API provider clients, settings/profile normalization, storage adapters, IndexedDB access, image/canvas/mask utilities, parameter compatibility, runtime proxy helpers, clipboard helpers, and viewport utilities.

## Design
- Provider Strategy: `api.ts` selects OpenAI-compatible or fal.ai implementations based on `getActiveApiProfile(settings)`.
- Storage Adapter: `storage.ts` abstracts local IndexedDB and server REST storage behind a shared `StorageAdapter` interface.
- Compatibility Normalizers: `apiProfiles.ts`, `paramCompatibility.ts`, `size.ts`, and `devProxy.ts` normalize old settings, provider-specific limits, image dimensions, and proxy URLs before requests are made.
- Canvas Utility Layer: Canvas/image/mask modules isolate browser image manipulation from React components.

## API Modules
- `api.ts`: Thin dispatch layer exporting `callImageApi()` and `normalizeBaseUrl`.
- `openaiCompatibleImageApi.ts`: OpenAI-compatible client for Images API (`images/generations`, `images/edits`) and Responses API (`responses` with `image_generation`). Handles Codex CLI prompt guarding, concurrent single-image requests for unsupported multi-image cases, form-data edits, mask uploads, proxy routing, timeout aborts, base64/URL result parsing, revised prompts, and actual parameter extraction.
- `falAiImageApi.ts`: fal.ai client using `@fal-ai/client`. Maps model IDs to generate/edit endpoints, caps image count to fal limits, subscribes to queue jobs, records request IDs/endpoints for recovery, parses URL/base64 result variants, and maps actual params.
- `imageApiShared.ts`: Shared call types and utilities for MIME mapping, data URL handling, fetch diagnostics, API error extraction, payload-size assertions, base64 normalization, and actual-param merging.

## Settings And Parameter Modules
- `apiProfiles.ts`: Creates default OpenAI/fal profiles, normalizes legacy flat settings into profile-based settings, switches provider defaults, validates profiles, deduplicates imported profiles, and merges imported settings.
- `paramCompatibility.ts`: Normalizes params for active provider/mode, removes unsupported settings such as OpenAI Codex CLI quality or fal auto values, and exposes output-count limits.
- `paramDisplay.tsx`: Renders requested and actual params with mismatch highlighting for task cards/details.
- `size.ts`: Normalizes custom dimensions to safe image sizes, rounds to multiples of 16, clamps aspect ratio and pixel bounds, and formats ratios/tiers.

## Storage Modules
- `storage.ts`: Runtime switch between `LocalStorageAdapter` and `ServerStorageAdapter`; tests server storage through `/api/storage/ping`.
- `db.ts`: IndexedDB wrapper for `tasks`, `images`, and `canvasImages` stores. Hashes image data URLs with SHA-256, with a deterministic fallback when WebCrypto is unavailable.

## Image, Mask, And Canvas Modules
- `canvasImage.ts`: Loads images, reads dimensions, converts data URLs/blobs, exports canvas blobs, validates mask dimensions, and creates mask preview images.
- `mask.ts`: Orders mask-target images, classifies mask coverage, and asserts mask validity.
- `maskPreprocess.ts`: Resizes large mask targets to a maximum edge of 1920 and dimensions divisible by 16, converts to PNG, and replaces the target input image with the working copy.
- `viewportTransform.ts`: Pure pan/zoom/clamp math used by the mask editor.
- `clipboard.ts`: Clipboard write helpers with fallback messages.
- `viewport.ts`: Mobile viewport guard installation.

## Runtime And Proxy Modules
- `devProxy.ts`: Normalizes API base URLs, loads optional `dev-proxy.config.json`, builds direct or `/api-proxy` URLs, and determines whether proxy use is available or forced in Docker deployments.
- `runtimeEnv.ts`: Filters Vite placeholder values and reads runtime-injected environment values.

## Generation Control Flow
1. `store.ts` calls `callImageApi(opts)`.
2. `api.ts` resolves the active profile.
3. OpenAI-compatible profiles route to `openaiCompatibleImageApi.ts`; fal profiles route to `falAiImageApi.ts`.
4. Provider clients normalize payloads, route through proxy when required, parse returned images to data URLs, and return `CallApiResult`.
5. `store.ts` persists resulting images and updates task metadata.

## Storage Control Flow
1. `initStorageMode()` in `store.ts` calls `testServerStorage()` when settings request server storage.
2. `setStorageMode()` selects an adapter.
3. Store CRUD helpers call `getStorage()` and remain unaware of IndexedDB vs server REST details.
