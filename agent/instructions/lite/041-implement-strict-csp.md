> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Implement Strict CSP

## Objective
Add a strict Content Security Policy to reduce XSS and malicious resource loading risk when rendering external RSS content.

## 1. Define CSP
- **Action**: Add a CSP policy via `index.html` meta tag or deployment headers.
- **Default**: Implement the CSP as a meta tag in `apps/lite/index.html` for this task.
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
