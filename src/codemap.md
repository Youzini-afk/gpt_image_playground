# src/

## Responsibility
React frontend application layer for GPT Image Playground. This directory owns browser bootstrapping, the Zustand application store, domain types, global styles, UI composition, local/server storage orchestration, and image-generation workflows.

## Entry Points
- `main.tsx`: React 19 StrictMode entry point. Installs mobile viewport guards from `lib/viewport` before rendering `App`.
- `App.tsx`: Root shell composer. Mounts Header, SearchBar, TaskGrid, InputBar, DetailModal, Lightbox, SettingsModal, ConfirmDialog, Toast, MaskEditorModal, and ImageContextMenu.
- `store.ts`: Single application state and async workflow coordinator.
- `types.ts`: Domain contracts for settings, API profiles, task params, tasks, stored images, canvas images, API payloads, and export manifests.
- `index.css`: Tailwind imports and global styles.

## Design
- State Container Pattern: `store.ts` uses Zustand with persist middleware. Persisted state keeps settings, generation params, prompt, input image IDs, stripped input image metadata, and dismissed prompts.
- Adapter Pattern: `lib/storage.ts` switches between IndexedDB-backed `LocalStorageAdapter` and REST-backed `ServerStorageAdapter` without changing store callers.
- Provider Strategy: `lib/api.ts` dispatches to OpenAI-compatible or fal.ai clients based on the active API profile.
- Portal/Overlay UI Shell: App-level modals and global menus are mounted once at the root and driven by store state.
- Content-Addressed Image Storage: Images are keyed by SHA-256 hashes in browser storage and cached in memory by `store.ts`.

## Bootstrap Flow
1. `main.tsx` installs viewport guards and renders `App`.
2. `App.tsx` clears legacy service worker/cache state.
3. The app waits for Zustand hydration with `waitForStoreHydration()`.
4. URL query overrides (`apiUrl`, `apiKey`, `provider`, `apiMode`, `codexCli`, `editImageField`) are normalized and merged into settings.
5. Consumed query params are removed from the address bar.
6. `initStorageMode()` selects local or server storage, then `initStore()` loads persisted tasks, images, and canvas entries.

## Task Generation Flow
1. `InputBar` collects prompt, input images, mask draft, and params.
2. `submitTask()` validates the active profile, stores input images, normalizes params, creates a running `TaskRecord`, persists it, and calls `executeTask()`.
3. `executeTask()` ensures referenced images are cached, orders masked inputs, and calls `callImageApi()`.
4. `callImageApi()` dispatches to `callOpenAICompatibleImageApi()` or `callFalAiImageApi()`.
5. Generated data URLs are stored via `storeImage()`, task output IDs and actual params are persisted, and UI state updates to `done`.
6. Failures update the task to `error`; fal.ai queue interruptions can be marked recoverable and polled later.

## Data Flow
- UI reads/writes reactive state through `useStore` selectors.
- `store.ts` persists durable data through `getStorage()`.
- Browser local mode writes to IndexedDB through `lib/db.ts`.
- Server mode sends JSON requests to `/api/storage/*` through `ServerStorageAdapter`.
- API calls never store image bytes directly in task records; tasks reference image IDs stored separately.

## Integration Points
- Consumes deployment/runtime placeholders through `lib/runtimeEnv.ts` and `lib/devProxy.ts`.
- Calls external image APIs through `lib/openaiCompatibleImageApi.ts` and `lib/falAiImageApi.ts`.
- Uses `fflate` in `store.ts` for ZIP export/import.
- Shares storage contracts with `server/routes.ts` and `server/storage.ts`.

## Directory Map
| Directory | Responsibility | Detailed Map |
| --- | --- | --- |
| `components/` | Visual UI components and interaction surfaces. | [components/codemap.md](components/codemap.md) |
| `hooks/` | Small reusable React hooks for modal and runtime notices. | [hooks/codemap.md](hooks/codemap.md) |
| `lib/` | Business logic, API clients, storage adapters, image/mask utilities, runtime helpers. | [lib/codemap.md](lib/codemap.md) |
