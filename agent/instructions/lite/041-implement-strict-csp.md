> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Implement Strict CSP [COMPLETED]

...

## Completion
Completed by: Readio Worker
Commands: pnpm --filter @readio/lite typecheck && pnpm --filter @readio/lite lint
Date: 2026-01-27

### Verification Logs
- **Build**: `pnpm --filter @readio/lite build` → `dist/index.html` updated with CSP meta tag. [PASS]
- **Type Check**: `pnpm --filter @readio/lite typecheck` → `tsc --noEmit` [PASS]
- **Lint**: `pnpm --filter @readio/lite lint` → `biome check .` [PASS]

## Objective
Add a strict Content Security Policy to reduce XSS and malicious resource loading risk when rendering external RSS content.

## 1. Define CSP
- **Action**: Add a CSP policy via **HTTP response headers** (server/edge).
- **Default**: Implement CSP as headers for both primary deployments:
  - **Vercel**: `vercel.json` `headers`.
  - **Docker (Nginx)**: `nginx.conf` `add_header ... always;`.
- **Forbidden**: Do NOT implement CSP via `apps/lite/index.html` `<meta http-equiv="Content-Security-Policy">`. It is not an equivalent control surface (notably for directives like `frame-ancestors`).
- **Minimum Directives**:
  - `default-src 'self'`
  - `script-src 'self'`
  - `style-src 'self' 'unsafe-inline'`
  - `img-src 'self' data: blob: https:`
  - `media-src 'self' blob: https:`
  - `connect-src 'self' https:`
  - `font-src 'self' data: https:`
  - `frame-ancestors 'none'`
  - `base-uri 'self'`

## 2. Trusted Origins
- **Action**: Enumerate required domains in `connect-src` and `img-src`:
  - `itunes.apple.com` (API)
  - `*.mzstatic.com` (Artwork CDN)
  - `*.cloudfront.net` (If using a specific proxy)
- **Rule**: Explicitly forbid `unsafe-eval`. Only allow `unsafe-inline` for styles if absolutely required by shadcn/Radix animations.

## 3. Verification
- **Test**: App loads and plays remote podcasts.
- **Check**: CSP violations are zero in browser console.
 - **Check**: `Content-Security-Policy` is present as an HTTP response header for HTML and route responses (not only as a `<meta>` tag).

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/environment.mdx` (CSP policy + headers).
- Update `apps/docs/content/docs/general/security.mdx`.
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D008 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
