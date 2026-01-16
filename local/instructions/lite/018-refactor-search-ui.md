> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns.mdx` before starting.

# Task: Refactor Search UI (`cmdk`)

## Objective
Replace the custom `SearchOverlay` with Shadcn's `Command` component (based on `cmdk`).
This provides best-in-class keyboard navigation (Arrow keys, Enter), accessibility, and a modern "Vibe".

## 1. Install `cmdk`
- **Action**: `pnpm --filter @readio/lite add cmdk`.
- **Setup**: If using Shadcn CLI: `npx shadcn@latest add command`. Or manually copy primitives to `apps/lite/src/components/ui/command.tsx`.

## 2. Refactor `SearchOverlay.tsx` -> `CommandPalette.tsx`
- **Path**: `apps/lite/src/components/GlobalSearch/CommandPalette.tsx`.
- **Structure**:
  ```tsx
  <Command.Dialog shouldFilter={false}> {/* We do async filtering manually */}
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
  </Command.Dialog>
  ```
- **I18n**: All strings ("Scanning...", "No results found.") MUST be added to `apps/lite/src/lib/translations.ts` and accessed via `t()`.
- **Styling**: Ensure it retains the "Premium Glass" look (see Instruction 016).

## 3. Keyboard & Debounce
- **Debounce**: Implement the debounce logic inside the `onValueChange` handler (or keep `useDebouncedValue`).
- **Keyboard**: Verify Arrow Down/Up navigates the list. Enter triggers `onSelect`.

## 4. Integration
- **Target**: `Sidebar.tsx` (Search Button).
- **Action**: Clicking "Search" should open the Command Palette via a global store (e.g. `useUIStore`) or internal state.
- **Shortcut**: Bind `Cmd+K` / `Ctrl+K` to open it (using `react-hotkeys-hook`).

## 5. Verification
- **Test**: Press `Cmd+K`. The palette opens.
- **Test**: Type "Tech". Local results appear instantly; remote results appear async.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- If you changed any architectural pattern, update the corresponding doc in `apps/docs/content/docs/`.
- Update `apps/docs/content/docs/apps/lite/handoff.mdx` with the new status.