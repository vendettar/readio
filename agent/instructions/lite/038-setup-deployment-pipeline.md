> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Setup Deployment Pipeline [COMPLETED]

## Objective
Establish a production deployment path. Default target is **Vercel** for the web app. Provide a **Dockerfile** for optional self-hosting. Document required environment variables and build steps.

## 1. Vercel Configuration
- **Action**: Add `vercel.json` at repo root.
- **Config**:
  - Build command: `pnpm --filter @readio/lite build`
  - Output: `apps/lite/dist`
  - Install command: `pnpm install`
  - **SPA Rewrite**: Add a mandatory rewrite rule to map all paths to `/index.html`:
    ```json
    { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
    ```

## 2. Dockerfile (Optional Self-Host)
- **Action**: Add root `Dockerfile` for static hosting.
- **Default**: Implement the optional self-host path now (do not skip Dockerfile/nginx.conf).
- **Runtime**: Use `nginx:alpine`.
- **Config**: Add root `nginx.conf` and copy it into the image. It must handle SPA routing:
  ```nginx
  location / {
      try_files $uri $uri/ /index.html;
  }
  ```

## 3. Deployment README Notes
- **Action**: Update deployment notes in docs to include:
  - Vercel deploy steps
  - Required environment variables
  - Build/output paths
  - Docker build/run commands

## 4. Verification
- **Check**: `pnpm --filter @readio/lite build` produces `apps/lite/dist`.
- **Check**: `vercel.json` points to the correct output.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/environment.mdx`.
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D005 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Completion
Completed by: Readio Worker
Commands: pnpm --filter @readio/lite build && pnpm --filter @readio/lite lint && pnpm --filter @readio/lite typecheck
Date: 2026-01-28

### Verification Logs
- **Build**: `pnpm --filter @readio/lite build` → `dist/index.html (1.37 kB)`, `dist/assets/index-DiBIayd5.js (973.09 kB)`. [PASS]
- **Type Check**: `pnpm --filter @readio/lite typecheck` → `tsc --noEmit` [PASS]
- **Lint**: `pnpm --filter @readio/lite lint` → `biome check .` [PASS]
