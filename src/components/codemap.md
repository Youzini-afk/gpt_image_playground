# src/components/

## Responsibility
Presentation and interaction layer for the image playground. Components bind Zustand state/actions to user-facing controls, galleries, cards, modals, custom selects/dropdowns, and global overlays.

## Design
- Store-Connected Components: Most components read state through `useStore` selectors and call store actions directly.
- Global Overlay Pattern: Modals are mounted once by `App.tsx`, return `null` when inactive, and close through store setters or `useCloseOnEscape`.
- Gesture-Aware UI: TaskGrid, AgentWorkspace, InputBar, Lightbox, and MaskEditorModal implement desktop/mobile gesture handling and prevent background scroll where needed.
- Thumbnail-First Preview: TaskCard, TaskGrid, DetailModal, and Lightbox prefer cached/generated thumbnails for previews, use async image decoding where safe, and load full images only when necessary.
- Custom Control Layer: Select, Checkbox, ViewportTooltip, icons, dropdown helpers, and tooltip hooks provide consistent high-density settings UI.

## Key Components
- `Header.tsx`: Title bar, GitHub link, update badge via `useVersionCheck`, help/settings buttons, and responsive chrome.
- `SearchBar.tsx`: Prompt/param search, status filtering, favorite filtering.
- `AgentWorkspace.tsx`: Agent conversation surface with branching rounds, streamed assistant output, generated image refs, web-search/tool status, and history/sidebar interactions.
- `TaskGrid.tsx`: Responsive task and canvas image grid. Uses shared task filtering, bounded visible task chunks with load-more and IntersectionObserver auto-load sentinel, desktop drag-select with cached card geometry, Ctrl/Command selection, and thumbnail background backfill.
- `TaskCard.tsx`: Memoized task summary card with lazy thumbnail loading, streaming preview support, status display, retry, favorite, reuse, edit-output, delete, and parameter display.
- `CanvasImageCard.tsx`: Memoized workbench image card with add-to-reference, copy, download, delete, context menu support, and narrowed input-membership subscription.
- `InputBar.tsx`: Bottom input dock for prompt, uploaded/reference images, Agent `@` mentions, mask target editing, size/quality/format/compression/moderation/n params, drag/drop, paste, mobile collapse, and batch actions over the current filtered task set.
- `SettingsModal.tsx`: API profile/custom provider CRUD, OpenAI/fal/custom configuration, Responses streaming controls, Agent settings, proxy toggle, storage mode, data import/export, clear-all flow, and connection testing.
- `DetailModal.tsx`: Task detail view showing outputs, input references, actual-vs-request params, revised prompts, raw URLs/payloads, elapsed time, and task actions. Current output display uses runtime object URLs while input/mask data stays as data URLs.
- `Lightbox.tsx`: Full image viewer with zoom, pan, wheel scaling, pinch gestures, double-tap zoom, keyboard navigation, mask overlay preview, and scroll locking. Main image display uses runtime object URLs while mask previews stay data URL backed.
- `MaskEditorModal.tsx`: Canvas-based mask editor with brush/eraser, undo/redo history, pan/zoom transform, touch support, PNG mask export, and mask target replacement.
- `ImageContextMenu.tsx`: Global right-click menu for images; routes selected image actions to input/canvas/edit/download/copy flows.
- `MarkdownRenderer.tsx`: Agent markdown renderer using Streamdown/react-markdown with safe component overrides for streamed assistant content.
- `HistoryModal.tsx`: Agent/history navigation modal for conversation/task history surfaces.
- `ConfirmDialog.tsx`: Reusable confirmation dialog with tone variants and optional delayed confirmation.
- `Toast.tsx`: Global transient notification surface.
- `HelpModal.tsx`: Product usage guidance for desktop and mobile selection gestures.
- `Select.tsx`: Styled select/dropdown replacement used across controls.
- `Checkbox.tsx`: Shared checkbox control for settings/options.
- `SizePickerModal.tsx`: Size preset/custom dimension chooser.
- `ViewportTooltip.tsx`: Viewport-aware tooltip for compact controls.
- `icons.tsx`: Shared inline icon components.

## Control Flow
1. `App.tsx` mounts the persistent UI shell and overlays.
2. Primary interaction begins in `InputBar`, `TaskGrid`, `TaskCard`, `CanvasImageCard`, or `SettingsModal`.
3. Components call store actions such as `submitTask`, `reuseConfig`, `editOutputs`, `removeTask`, `addImageToCanvas`, `switchStorageMode`, `exportData`, and `importData`.
4. Root overlays observe store state and render details, confirmations, toasts, image previews, or mask editing when selected IDs/flags are set.

## Integration Points
- Depends on `src/store.ts` for state, actions, image/thumbnail cache helpers, storage mode switching, and import/export.
- Depends on `src/lib/*` for profile handling, parameter compatibility, image/mask/canvas utilities, clipboard helpers, dropdown/tooltip helpers, and storage tests.
- Receives domain shapes from `src/types.ts`.
- Styled with Tailwind classes and global rules from `src/index.css`.
