# Instruction 105b [COMPLETED]: Fix i18n Init Race + EpisodeRow Render Pressure + ExpandableDescription A11y

Read and strictly follow before coding:

- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/general/design-system/components.mdx`
- `apps/docs/content/docs/apps/lite/coding-standards/index.mdx`
- Relevant handoff docs under `apps/docs/content/docs/apps/lite/handoff/`

## Scope (required)

Implement only these 3 items:

1. i18n init race hardening
2. Episode row render-pressure optimization
3. ExpandableDescription accessibility improvements

Do not change product behavior beyond these targets.

---

## 1) i18n init race hardening (`apps/lite/src/lib/i18n.ts`)

### Problem
Startup detected-language loader currently calls `i18n.changeLanguage()` outside the request-version guard used by `changeLanguageSafely`, which can race with manual language switching.

### Required changes

- Route startup detected-language application through `changeLanguageSafely()` (or equivalent version-guarded path).
- Ensure startup apply cannot override a newer manual selection.
- Keep existing lazy locale loading behavior.
- Preserve current fallback behavior/logging on load failure.

### Tests (required)

Update/add tests in `apps/lite/src/lib/__tests__/i18nChangeLanguageSafely.test.ts` covering:

- Startup detected-language load + rapid manual switch (detected `zh` then user switches to `ja`) -> final language must remain manual choice.
- No regression for A->B->A monotonic behavior.

---

## 2) Episode row render-pressure optimization

### Targets

- `apps/lite/src/components/EpisodeRow/EpisodeListItem.tsx`
- Call sites building row models (at minimum `FavoritesPage.tsx`, `HistoryPage.tsx`; include other long-list pages if applicable).

### Required changes

- Wrap `EpisodeListItem` with `React.memo`.
- Ensure memo effectiveness at call sites:
  - Avoid rebuilding model objects unnecessarily on unrelated parent state changes.
  - Use `useMemo` for mapped row view models where list size is non-trivial.
- Keep all current interactions unchanged:
  - `InteractiveTitle` / `InteractiveArtwork`
  - favorite/menu actions
  - bottom meta / divider behavior

### Tests (required)

- Add at least one focused render-count test proving unrelated parent state updates do not re-render unchanged episode rows.

---

## 3) ExpandableDescription A11y improvements (`apps/lite/src/components/ui/expandable-description.tsx`)

### Required changes

- Add accessibility semantics for expandable content:
  - toggle button must expose `aria-expanded`
  - toggle button must reference content region via `aria-controls`
  - content container should have stable `id`
- Preserve current visual behavior and current sanitization model.
- Keep existing Tailwind/shadcn patterns; no new global CSS.

### Optional but preferred

- Ensure screen-reader output remains clear in both collapsed and expanded states.

### Tests (required)

- Add/extend tests in `apps/lite/src/components/ui/__tests__/expandable-description.test.tsx` for:
  - `aria-expanded` state transitions
  - `aria-controls` wiring to content region id

---

## Verification (must run)

- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite test:run`
- `pnpm -C apps/lite build`
- `pnpm -C apps/lite i18n:check`

If any command fails, fix only issues introduced by this change set.

---

## Documentation (mandatory)

Update handoff docs to reflect final code state (results only, no process notes), at least:

- `apps/docs/content/docs/apps/lite/handoff/i18n.mdx`
- `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`
- `apps/docs/content/docs/apps/lite/handoff/standards.mdx`

Also update `.zh.mdx` counterparts.

## Completion

- Completed by: Codex
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite test:run`
  - `pnpm -C apps/lite build`
  - `pnpm -C apps/lite i18n:check`
- Date: 2026-02-14
