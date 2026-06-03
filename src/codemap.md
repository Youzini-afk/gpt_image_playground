# src/

## Responsibility
React frontend application layer for GPT Image Playground. This directory owns browser bootstrapping, the Zustand application store, domain types, global styles, UI composition, local/server storage orchestration, image-generation workflows, Agent/Responses workflows, thumbnail cache/backfill, URL settings bootstrap, and custom provider configuration.

## Entry Points
- `main.tsx`: React 19 StrictMode entry point. Installs mobile viewport guards from `lib/viewport` before rendering `App`.
- `App.tsx`: Root shell composer. Mounts Header, SearchBar, TaskGrid, AgentWorkspace, InputBar, DetailModal, Lightbox, SettingsModal, ConfirmDialog, Toast, MaskEditorModal, and ImageContextMenu; also applies URL settings and storage initialization.
- `store.ts`: Single application state and async workflow coordinator for tasks, Agent conversations, images, thumbnails, storage, recovery, import/export, and UI global state.
- `types.ts`: Domain contracts for API/custom providers, Agent conversations, Responses API payloads, settings, task params, tasks, stored images/thumbnails, canvas images, API payloads, and export manifests.
- `index.css`: Tailwind imports and global styles.

## Design
- State Container Pattern: `store.ts` uses Zustand with persist middleware. Persisted state keeps settings, generation params, prompt, input image IDs, stripped input image metadata, dismissed prompts, and UI preferences.
- Adapter Pattern: `lib/storage.ts` switches between IndexedDB-backed `LocalStorageAdapter` and REST-backed `ServerStorageAdapter` without changing store callers.
- Provider Strategy: `lib/api.ts` dispatches to OpenAI-compatible, fal.ai, or custom HTTP provider clients based on the active API profile/custom provider definition; Agent mode routes through OpenAI Responses helpers in `lib/agentApi.ts`.
- Thumbnail Split: full image data stays in image storage/cache; thumbnails live behind the storage adapter, using IndexedDB locally and server SQLite in server mode, then are cached/backfilled lazily for visible/background images.
- Portal/Overlay UI Shell: App-level modals and global menus are mounted once at the root and driven by store state.

## Bootstrap Flow
1. `main.tsx` installs viewport guards and renders `App`.
2. `App.tsx` clears legacy service worker/cache state.
3. The app waits for Zustand hydration with `waitForStoreHydration()`.
4. URL query overrides are parsed through `lib/urlSettings.ts` and normalized into settings/profile state.
5. Consumed query params are removed from the address bar.
6. `initStorageMode()` selects local or server storage, then `initStore()` loads persisted tasks, images, canvas entries, and schedules thumbnail/recovery work.

## Task Generation Flow
1. `InputBar` collects prompt, input images, mask draft, and params.
2. `submitTask()` validates the active profile/custom provider, stores input images, normalizes params, creates a running `TaskRecord`, persists it, and calls `executeTask()`.
3. `executeTask()` ensures referenced images are cached, orders masked inputs, and calls `callImageApi()`.
4. Provider calls return generated image data URLs or raw image URLs plus actual params/revised prompts.
5. Output images are stored by hash, thumbnails are generated/backfilled, task status is updated, and card/detail views receive lightweight preview data.
6. fal.ai and custom async provider tasks can be marked recoverable and polled after interruptions/restarts.

## Agent Generation Flow
1. `AgentWorkspace` and `InputBar` collect Agent prompts, uploaded references, and `@` image mentions.
2. `submitAgentMessage()` creates a conversation round, stores input/mask images, and builds Responses API input with current and generated image refs.
3. `executeAgentRound()` calls `callAgentResponsesApi()`, streams text/image partials when enabled, and handles `generate_image_batch` tool calls.
4. Batch image tool calls pre-create task cards, resolve both current-input and generated refs, mark per-item failures as task errors, and continue the Responses loop with function outputs.
5. Agent conversations, drafts, response output, generated tasks, thumbnails, canvas images, and server/local storage boundaries are preserved in import/export and cleanup paths.

## Data Flow
- UI reads/writes reactive state through `useStore` selectors.
- `store.ts` persists durable task/image/canvas/Agent-conversation data through `getStorage()`.
- Browser local mode writes tasks/images/canvas/thumbnails/Agent conversations to IndexedDB through `lib/db.ts`.
- Server mode sends JSON requests to `/api/storage/*` through `ServerStorageAdapter`, including lightweight image ID listing and thumbnail persistence endpoints.
- API calls never store image bytes directly in task records; tasks reference image IDs and optional raw URL/payload metadata.

## Integration Points
- `components/`: all visible UI surfaces and complex interaction handlers.
- `hooks/`: small reusable lifecycle hooks used by modals, tooltips, scroll locking, and runtime notices.
- `lib/`: API clients, storage adapters, IndexedDB, thumbnails, URL settings, image conversion, masks, proxy/env helpers, and parameter compatibility.
- `server/`: used directly when storage mode is `server` or API proxy mode routes calls through `/api-proxy`.
