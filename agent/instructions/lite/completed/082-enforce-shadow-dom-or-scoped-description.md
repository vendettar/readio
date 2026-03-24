> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/security.mdx` and `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx` before starting.

# Task: Enforce CSS Isolation for Third-Party Content [COMPLETED]

## Objective
Prevent external RSS HTML (show-notes) from polluting the application's UI by enforcing strict CSS isolation.

## 1. Isolated Container
- **Target**: `apps/lite/src/components/Transcript/DescriptionView.tsx` (or where show-notes are rendered).
- **Strategy**: Apply a scoped CSS reset class (e.g., `.prose-isolate`) that resets inherited styles (`all: revert`) and re-applies app typography tokens locally.
- **Default**: Implement the scoped reset strategy only.
- **Fallback**: Use Shadow DOM only if scoped reset demonstrably fails and requires a follow-up instruction.
- **CSS Location**: Define the isolation class in a shared stylesheet (single source) and import it once.

## 2. Refine DOMPurify
- **Action**: Ensure `DOMPurify` explicitly strips `<style>` and `<link>` tags from the input HTML before it reaches the isolated container (`src/lib/htmlUtils.ts`).
- **Sanitization Rules**: Also strip `<script>` tags and inline `style` attributes.
- **CSP Alignment**: Sanitized content must not load external assets beyond CSP allowlist.

## 3. Verification
- **Test**: Feed a mock RSS description containing `<style>body { background: red !important; }</style>`.
- **Check**: The application's background MUST NOT turn red.
- **Unit Test**: Add a unit test for `htmlUtils` verifying `<style>` and inline styles are removed.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Completion Notes
- **Sanitization**: Updated `sanitizeHtml` in `src/lib/htmlUtils.ts` to strictly forbid `style`, `link`, and `script` tags, as well as `style` attributes.
- **CSS Isolation**:
  - Added `.prose-isolate` class to `src/index.css`. This class uses `all: revert` to neutralize inherited styles and re-applies fundamental app typography tokens (color, font-family, line-height, etc.).
  - Applied `.prose-isolate` to the episode description rendering in `PodcastEpisodeDetailPage.tsx`.
- **Verification**: 
  - Created and ran unit tests in `src/lib/__tests__/htmlUtils.test.ts` verifying that `<style>` tags and `style` attributes are removed.
  - Verified that safe tags like `<p>`, `<a>`, and `<strong>` are preserved and links are correctly hardened with `target="_blank"`.
- **Date**: 2024-05-20
- **Author**: Antigravity
- **Reviewed by**: CODEX
