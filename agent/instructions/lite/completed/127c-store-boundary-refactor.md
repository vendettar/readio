# Instruction 127c: Store Boundary Refactor

## Status
- [x] Active
- [ ] Completed

## Goal
Separate transcript/ASR orchestration state from transport playback state to reduce render fan-out and decouple domain concerns, keeping the external behavior unchanged.

## Scope
- `apps/lite/src/store/playerStore.ts`
- `apps/lite/src/store/transcriptStore.ts` (New)
- `apps/lite/src/lib/remoteTranscript.ts` (Refactor: decouple from playerStore, or update integration)
- `apps/lite/src/components/AppShell/PlayerSurfaceFrame.tsx` (Refactor: selectors)
- `apps/lite/src/hooks/useEpisodePlayback.ts` (Refactor: selectors)
- `apps/lite/src/store/__tests__/transcriptStore.test.ts` (New)

## Requirements
1. Extract transcript definitions (`subtitles`, `transcriptIngestionStatus`, `transcriptIngestionError`, `abortAsrController`, `asrProgress`, `asrActiveTrackKey`, `partialAsrCues`, `currentIndex`) into a new `transcriptStore`.
2. Migrate ASR control actions (`setTranscriptIngestionStatus`, `setSubtitles`, etc.) to `transcriptStore`.
3. Provide explicit selectors in both stores to prevent unnecessary component renders.
4. Ensure `useEpisodePlayback` and `remoteTranscript.ts` use the new boundary correctly. Wait, `currentIndex` syncs with `currentTime` based on `playerStore.progress`? `currentIndex` might be computed or updated explicitly. We should review how `currentIndex` is managed.
5. Add regression tests for the separated transcript store and ensure playback + transcript sync remains robust.

## Verification
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite exec tsc -p tsconfig.app.json --noEmit`
- `pnpm -C apps/lite test:run`
- `pnpm -C apps/lite build`

## Completion
- Completed by: 
- Commands: 
- Date: 
- Reviewed by: 
