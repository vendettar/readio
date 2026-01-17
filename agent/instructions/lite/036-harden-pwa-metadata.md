> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Harden PWA Metadata & Sharing

## Objective
Ensure the app is correctly recognized as a high-quality PWA across all platforms (iOS, Android, Windows) and supports native sharing.

## 1. Create/Update Manifest (`apps/lite/public/manifest.json`)
- **Action**: Ensure the manifest exists at the correct path and contains:
  - `name`: "Readio"
  - `short_name`: "Readio"
  - `theme_color`: "#2563EB" (Matches --primary token: hsl(221 83% 53%))
  - `background_color`: "#FFFFFF" (Matches --background token: hsl(0 0% 100%))
  - `display`: "standalone"
  - `start_url`: "/"
- **Icons**: Ensure references to standard icon sizes (192x192, 512x512) are present in the `icons` array.

## 2. iOS Meta Tags (`apps/lite/index.html`)
- **Action**: Add Apple-specific meta tags to the `<head>`:
  - `<meta name="apple-mobile-web-app-capable" content="yes">`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
  - `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`
- **Asset**: Ensure `public/apple-touch-icon.png` is used (copy from `readio.png` if necessary).

## 3. Web Share API Integration
- **Target**: `apps/lite/src/components/Player/ShareButton.tsx`.
- **Action**: Use `navigator.share` if available.
- **Logic**: Share current episode URL and title.
- **I18n**: All UI strings MUST use `t()` with keys in `apps/lite/src/lib/translations.ts`.
  - Keys: `player.share` (button label), `player.shareSuccess` (success toast), `player.shareError` (error toast).

## 4. Verification
- **Test**: Open in mobile browser. "Add to Home Screen". The icon and status bar (translucent) should be correct.
- **Test**: Click Share. The native share sheet should open.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/environment.mdx`.
- Update `apps/docs/content/docs/apps/lite/apple-api.mdx` (if iOS-specific behavior changes).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
