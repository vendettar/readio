> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Refactor Search UI (`cmdk`)[COMPLETED]

## Objective
Replace the custom `SearchOverlay` with Shadcn's `Command` component (based on `cmdk`).
This provides best-in-class keyboard navigation (Arrow keys, Enter), accessibility, and a modern "Vibe".

> **Update (Decision D053)**: The badge UI standard has been updated. Do not use "chips". Use right-aligned, vertically centered icons/text in `text-primary`.
> **Requirement**: Multi-state items (e.g., both Favorited & History) MUST display ALL relevant icons side-by-side. Do not override; merge badges.


## 1. Install `cmdk`
- **Action**: `pnpm --filter @readio/lite add cmdk`.
- **Setup**: If using Shadcn CLI: `npx shadcn@latest add command`. Or manually copy primitives to `apps/lite/src/components/ui/command.tsx`.

## 2. Refactor `SearchOverlay.tsx` -> `CommandPalette.tsx` (Sidebar Inline)
- **Path**: `apps/lite/src/components/GlobalSearch/CommandPalette.tsx`.
- **Structure**:
  ```tsx
  <Command shouldFilter={false}> {/* We do async filtering manually */}
    <CommandInput value={query} onValueChange={setQuery} />
    <CommandList>
      {isLoading && <CommandLoading>{t('search.scanning')}</CommandLoading>}
      <CommandEmpty>{t('search.noResults')}</CommandEmpty>
      <CommandGroup heading={t('search.local')}>
         {/* Map local results */}
      </CommandGroup>
      <CommandGroup heading={t('search.remote')}>
         {/* Map API results */}
      </CommandGroup>
    </CommandList>
  </Command>
  ```
- **I18n**: All strings ("Scanning...", "No results found.") MUST be added to `apps/lite/src/lib/translations.ts` and accessed via `t()`.
- **Styling**: Must match Apple Podcasts-style sidebar inline search (no center modal). Keep Premium Glass styling for the results panel.
- **Cleanup**: Remove the old `SearchOverlay` component after migration and update all imports.

## 3. Keyboard & Debounce
- **Debounce**: Implement the debounce logic inside the `onValueChange` handler (or keep `useDebouncedValue`).
- **Keyboard**: Verify Arrow Down/Up navigates the list. Enter triggers `onSelect`.
 - **Performance Rule**: Local results must be capped (Top N) and remote search must cancel/ignore stale requests (use `AbortController` or requestId).

## 4. Integration
- **Target**: `Sidebar.tsx` (Search Area).
- **Action**: Search should remain inline in the sidebar (Apple Podcasts style). No center modal.
- **Shortcut**: Bind `Cmd+K` / `Ctrl+K` to focus/open the inline search (using `react-hotkeys-hook`).
 - **I18n**: Add new search palette strings to `apps/lite/src/lib/translations.ts`.

## 5. Verification
- **Test**: Press `Cmd+K`. The palette opens.
- **Test**: Type "Tech". Local results appear instantly; remote results appear async.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/features/search.mdx`.
- Update `apps/docs/content/docs/apps/lite/ui-patterns/features.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Completion
- **Status**: Completed
- **Date**: 2026-01-23
- **Reviewed by**: Readio Leadership (Architecture Review)
