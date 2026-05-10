# deploy/

## Responsibility
Deployment support files for container/runtime configuration. This directory focuses on Docker runtime environment migration, frontend build-time placeholder injection, and an alternate Nginx static/proxy deployment shape.

## Files
- `Dockerfile`: Cross-platform multi-stage Docker build variant using `--platform=$BUILDPLATFORM` for the build stage. Produces `dist/` and `dist-server/`, installs runtime server dependencies, copies entrypoint scripts, exposes port 80, and stores server data under `/app/data`.
- `migrate-api-env.envsh`: Normalizes legacy Docker `API_URL` into `DEFAULT_API_URL` and `API_PROXY_URL`, and exports `DOCKER_LEGACY_API_URL_USED` for frontend notices.
- `inject-api-url.sh`: Replaces Vite placeholder strings in built JS assets with runtime `DEFAULT_API_URL`, proxy availability, Docker deployment marker, and legacy migration marker before execing the server command.
- `nginx.conf`: Alternate static-site deployment config. Serves Vite assets with long cache headers, falls back to `index.html`, and provides a restricted `/api-proxy/` forwarding path for allowed image endpoints.

## Runtime Flow
1. Build stage compiles frontend and server with placeholder values embedded in Vite env variables.
2. Container startup sources `migrate-api-env.envsh` to derive canonical env values.
3. `inject-api-url.sh` edits built JS assets in-place with runtime values.
4. The Node server runs `dist-server/index.js`, or Nginx can serve the static build using `nginx.conf` in deployments that choose that path.

## Integration Points
- Root `Dockerfile` uses the same env migration and injection scripts but keeps native `better-sqlite3` runtime dependencies from the target-platform build.
- Frontend reads injected values through `src/lib/runtimeEnv.ts` and `src/lib/devProxy.ts`.
- Server reads API proxy and storage env values in `server/index.ts`.
