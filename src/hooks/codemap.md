# src/hooks/

## Responsibility
Reusable React hooks for small cross-cutting UI/runtime behavior.

## Hooks
- `useCloseOnEscape.ts`: Registers an Escape key listener when enabled and invokes the provided close handler. Used by modal surfaces.
- `useVersionCheck.ts`: Fetches GitHub release/version information and exposes update state for the header badge.
- `useDockerApiUrlMigrationNotice.ts`: Detects Docker legacy API URL runtime state and displays a one-time migration notice through the global dialog/toast path.

## Design
Hooks are intentionally narrow and side-effect focused. They do not own durable state beyond local React state/effects; persistent decisions are delegated to `src/store.ts`.

## Integration Points
- Consumed by `src/App.tsx`, `src/components/Header.tsx`, and modal components.
- Reads runtime build constants such as `__APP_VERSION__` or Vite-injected environment placeholders indirectly through lib helpers.
