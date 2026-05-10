# src/components/

## Responsibility
Presentation and interaction layer for the image playground. Components bind Zustand state/actions to user-facing controls, galleries, cards, modals, and global overlays.

## Design
- Store-Connected Components: Most components read state through `useStore` selectors and call store actions directly.
- Global Overlay Pattern: Modals are mounted once by `App.tsx`, return `null` when inactive, and close through store setters or `useCloseOnEscape`.
- Gesture-Aware UI: TaskGrid, InputBar, Lightbox, and MaskEditorModal implement desktop and mobile gesture handling directly.
- Reference Image Workflow: Images can move between task outputs, canvas/workbench images, and input references via shared store actions.

## Key Components
- `Header.tsx`: Title bar, GitHub link, update badge via `useVersionCheck`, help/settings buttons.
- `SearchBar.tsx`: Prompt/param search, status filtering, favorite filtering.
- `TaskGrid.tsx`: Responsive task and canvas image grid. Implements desktop drag-select and Ctrl/Command selection.
- `TaskCard.tsx`: Task summary card with lazy thumbnail loading, status display, retry, favorite, reuse, edit-output, and delete actions.
- `CanvasImageCard.tsx`: Workbench image card with add-to-reference, copy, download, delete, and context menu support.
- `InputBar.tsx`: Bottom input dock for prompt, uploaded/reference images, mask target editing, size/quality/format/compression/moderation/n params, drag/drop, paste, mobile collapse, and batch actions.
- `DetailModal.tsx`: Task detail view showing outputs, input references, actual-vs-request params, revised prompts, elapsed time, and task actions.
- `Lightbox.tsx`: Full image viewer with zoom, pan, wheel scaling, pinch gestures, double-tap zoom, keyboard navigation, and mask overlay preview.
- `MaskEditorModal.tsx`: Canvas-based mask editor with brush/eraser, undo/redo history, pan/zoom transform, touch support, PNG mask export, and mask target replacement.
- `SettingsModal.tsx`: API profile CRUD, provider switching, OpenAI/fal settings, proxy toggle, storage mode, data import/export, and clear-all flow.
- `ImageContextMenu.tsx`: Global right-click menu for images; routes selected image actions to input/canvas/edit/download/copy flows.
- `ConfirmDialog.tsx`: Reusable confirmation dialog with tone variants and optional delayed confirmation.
- `Toast.tsx`: Global transient notification surface.
- `HelpModal.tsx`: Product usage guidance for desktop and mobile selection gestures.
- `Select.tsx`: Styled select replacement used across controls.
- `SizePickerModal.tsx`: Size preset/custom dimension chooser.
- `ViewportTooltip.tsx`: Viewport-aware tooltip for compact controls.

## Control Flow
1. `App.tsx` mounts the persistent UI shell and overlays.
2. Primary interaction begins in `InputBar`, `TaskGrid`, `TaskCard`, `CanvasImageCard`, or `SettingsModal`.
3. Components call store actions such as `submitTask`, `reuseConfig`, `editOutputs`, `removeTask`, `addImageToCanvas`, `switchStorageMode`, `exportData`, and `importData`.
4. Root overlays observe store state and render details, confirmations, toasts, image previews, or mask editing when selected IDs/flags are set.

## Integration Points
- Depends on `src/store.ts` for state and actions.
- Depends on `src/lib/*` for profile handling, parameter compatibility, image/mask/canvas utilities, clipboard helpers, and storage tests.
- Receives domain shapes from `src/types.ts`.
- Styled with Tailwind classes and global rules from `src/index.css`.
