# Archive 121a: Deferred Follow-ups (Integrity Report Persistence + Mobile Focus Policy)

Status: Archived for future planning, not required in current execution batch.

## Context
These are valid improvements but product-policy dependent and lower priority than current correctness/performance targets.

## A) Persist Integrity Maintenance Report

### Current behavior
`useIntegrityMaintenance` keeps `lastReport` in component state only, so results are lost after refresh/navigation.

### Candidate improvement
Persist latest integrity report metadata (timestamp + total repairs + breakdown) to durable client storage.

### Recommended storage
Use existing app storage patterns (`settings` table / existing persistence helper), not ad-hoc global state.

### Suggested UX
- Show "Last checked" + "Repairs" summary in Settings maintenance section.
- Keep "Run now" action unchanged.

### Data shape suggestion
- `checkedAt`
- `totalRepairs`
- `missingAudioBlob`
- `danglingFolderRef`
- `danglingTrackRef`

---

## B) Mobile Focus/Keyboard Policy for NewFolderCard

### Current behavior
Entering naming mode triggers immediate input focus, which may open virtual keyboard on mobile and cause layout shift.

### Candidate policy options
1. Desktop-first auto-focus; mobile delayed/manual focus.
2. Keep auto-focus everywhere but add layout stabilization rules.

### Recommended direction
Decide explicit product policy first, then implement consistently across all inline rename/create flows.

### Constraints
- Preserve keyboard-first UX on desktop.
- Avoid unexpected layout jump on mobile.
- Reuse existing interaction patterns; no one-off behavior.

---

## Exit Criteria for future implementation

- Clear product decision documented for mobile focus behavior.
- Persistence location and retention policy documented for integrity reports.
- Tests added for chosen behavior.
