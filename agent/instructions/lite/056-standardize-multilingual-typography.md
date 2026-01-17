> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/tokens.mdx` before starting.

# Task: Standardize Multilingual Typography

## Objective
Ensure visual harmony when rendering mixed scripts (e.g., English, Chinese, Japanese) within the same view.

## 1. Font Stack Configuration
- **Target**: `apps/lite/src/index.css`.
- **Action**: Define language-specific font stacks using `:root[lang=\"...\"]` selectors.
- **Requirement**: Prefer system-native fonts per language (no single global stack).
  - `lang=\"en\"`: `system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif`
  - `lang=\"zh\"`: `-apple-system, \"PingFang SC\", \"Microsoft YaHei\", \"Source Han Sans SC\", system-ui, sans-serif`
  - `lang=\"ja\"`: `-apple-system, \"Hiragino Kaku Gothic ProN\", \"Yu Gothic\", \"Noto Sans JP\", system-ui, sans-serif`
  - `lang=\"ko\"`: `-apple-system, \"Apple SD Gothic Neo\", \"Noto Sans KR\", \"Malgun Gothic\", system-ui, sans-serif`

## 2. Text-Rendering Rules
- **Action**: Apply `text-rendering: optimizeLegibility` and `antialiased` to the `body`.
- **Rule**: For the reading area, ensure CJK characters have appropriate line-spacing (they are taller than Latin chars).

## 3. Verification
- **Test**: Switch language to Chinese. View an English podcast.
- **Check**: Verify that the text alignment and baseline don't jump between languages.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/general/design-system/tokens.mdx` (Typography section).
- Update `apps/docs/content/docs/apps/lite/typography.mdx`.
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D019 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
