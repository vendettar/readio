> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Implement Sleep Timer

## Objective
Allow users to stop playback automatically after a duration or at the end of an episode.

## 1. Create `useSleepTimer` Hook
- **Path**: `apps/lite/src/hooks/useSleepTimer.ts`.
- **State**: `isActive`, `remainingTime`.
- **Logic**:
  - `startTimer(minutes)`: Set `endTime`. Tick every second.
  - `startEndOfEpisode()`: Set flag. `GlobalAudioController` listens for `ended` event.
  - When time/event reached: `store.pause()`, reset timer.

## 2. Integration (`GlobalAudioController.tsx`)
- **Action**: Check `useSleepTimer` state. If `endOfEpisode` is active and `ended` fires, pause.

## 3. UI Component (`src/components/Player/SleepTimerButton.tsx`)
- **Action**: Add a "Moon" icon button to `FullPlayer`.
- **Interaction**: Clicking ALWAYS opens a `DropdownMenu` (not a toggle).
- **Menu Items**:
  - `15m` (`t('timer.15m')`)
  - `30m` (`t('timer.30m')`)
  - `End of Episode` (`t('timer.endOfEpisode')`)
  - `Cancel` (if active)
- **Feedback**: If active, the icon should be filled/colored (`text-primary`), and tooltip should show remaining time (`t('timer.remaining', { time })`).
 - **I18n**: Add all `timer.*` keys to `apps/lite/src/lib/translations.ts`.

## 4. Verification
- **Test**: Set 15m timer. Wait (or mock time). Audio pauses.
- **Test**: Set End of Episode. Seek to end. Audio pauses.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/ui-patterns/shell.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
