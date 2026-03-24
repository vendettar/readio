# Task: Overlay Layering and Focus Contract

## Goal
Produce the inventory and contract matrix needed to harden one cross-surface overlay, focus, dismiss, portal, and layering contract for Lite’s high-risk interactive surfaces so the sidebar search, command palette, player surfaces, transcript selection/lookup UI, and interaction-adjacent discovery surfaces can later converge under explicit, testable rules without reopening already stabilized product decisions.

## Status
- [ ] Active
- [ ] Completed

## Recommended Order
1. Execute after `010`, `020`, and `030` are stable.
2. Use this instruction as Phase 0 only: inventory + current/target/delta matrix.
3. After this instruction is complete, split implementation into follow-up child instructions by surface family before changing code.

## Depends On
- `agent/instructions/lite/ui-improvement/001-ui-improvement-roadmap.md`
- `agent/instructions/lite/ui-improvement/010-page-shell-and-header-contract.md`
- `agent/instructions/lite/ui-improvement/020-library-list-surface-unification.md`
- `agent/instructions/lite/ui-improvement/030-loading-empty-error-state-standardization.md`

## Can Run In Parallel
- No with any transcript/player/search overlay work touching the same surface contracts.
- No with broad discovery detail interaction changes on the same files.
- Yes with unrelated low-risk visual cleanup outside overlays and focus management.

## Implementation Mode (Strict)
This instruction is Phase 0 discovery and contract hardening only.

It must:
- produce a reviewable overlay inventory
- produce a current / target / delta contract matrix
- identify exact remaining divergences
- identify the follow-up implementation split required to execute safely

It must not:
- authorize broad cross-surface implementation in one pass
- trigger code changes across multiple overlay families in a single task
- bypass the repository rule that interaction-heavy work must be broken into smaller tasks when it would otherwise exceed a safe file scope

## Read First (Required)
- `apps/docs/content/docs/index.mdx`
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/general/accessibility.mdx`
- `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx`
- `apps/docs/content/docs/apps/lite/ui-patterns/shell.mdx`
- `apps/docs/content/docs/apps/lite/ui-patterns/features.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/standards.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/search.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/discovery.mdx`
- relevant files under:
  - `apps/lite/src/components/AudioPlayer/`
  - `apps/lite/src/components/DockedPlayer/`
  - `apps/lite/src/components/FullPlayer/`
  - other player shell/overlay files that own docked/full/expand/dismiss behavior
- relevant files under:
  - `apps/lite/src/components/AppShell/`
  - `apps/lite/src/components/GlobalSearch/`
  - `apps/lite/src/components/Selection/`
  - transcript selection hooks/components
  - discovery detail route components that host interaction-adjacent overlays

## Phase Boundary (Strict)
This is a Phase 3 interaction-hardening task.

It may:
- define outside-click / dismiss-and-absorb / pass-through rules
- define initial focus and restore-focus rules
- define portal boundary and z-index token policy
- define modal vs non-modal surface mapping
- define mobile/narrow-width behavior for these overlays
- document remaining exact divergences before fixing them

It may not:
- redesign transcript/player/search/discovery feature scope
- re-open already stabilized product behavior without evidence of remaining divergence
- absorb shell/header/list/state cleanup from earlier tasks

## Problem
Lite already has substantial overlay behavior, but the contract is scattered across surface-local decisions:
- search uses popover/palette behavior
- transcript uses multiple selection surface types with absorb/pass-through rules
- player surfaces have docked/full transitions and separate dismissal paths
- discovery/detail pages may host interaction-adjacent overlays without one unified contract

The risk is not missing features. The risk is undocumented divergence in dismiss, focus restore, portal boundary, and z-index behavior.

## Current Contract
- `ui-patterns/shell.mdx` defines broad overlay/menu rules.
- transcript handoff docs define sophisticated selection-surface behavior and viewport freeze rules.
- search handoff docs define command-palette behavior.
- player shell behavior exists in code/tests but not yet as one cross-surface interaction contract.

## Target Contract
Treat these surfaces as one interaction system:
- sidebar search trigger and command palette
- player docked/full surfaces and dismiss paths
- transcript range/word/lookup overlays
- interaction-adjacent discovery detail overlays/callouts where applicable

Every surface in scope must explicitly define:
- open trigger
- surface type
- modal/non-modal mode
- initial focus target
- outside left click behavior
- outside right click behavior
- escape behavior
- focus restore target
- portal boundary
- z-index token
- mobile/narrow-width adaptations

## Delta
- Replace scattered implicit behavior with a single contract matrix.
- Fix only the remaining divergences proven by that matrix.
- Preserve stable product behavior wherever current implementation already matches the target contract.

## Scope

### In Scope
- `apps/lite/src/components/AppShell/Sidebar.tsx`
- `apps/lite/src/components/GlobalSearch/CommandPalette.tsx`
- player shell / overlay families responsible for:
  - docked surface
  - full player surface
  - expand / collapse transitions
  - dismiss paths
  - focus restore paths
- relevant transcript selection/lookup components and hooks
- interaction-adjacent discovery detail components if they host overlays or callouts that overlap the shell contract

### Out of Scope
- route shell/header work
- loading/empty/error state work
- populated list/card work
- discovery visual redesign
- changing transcript/player/search product scope

## Product Decisions (Locked)
1. Existing stable transcript and playback behavior is authoritative unless a concrete remaining divergence is documented.
2. This task is about explicit contract and convergence, not introducing novel overlay behavior.
3. Surface-local exceptions are allowed only when documented and justified.

## Scope Scan (8 Scopes)
- Config & env parsing:
  - No config/env change.
- Persistence & data integrity:
  - No storage/schema change.
- Routing & param validation:
  - No route contract change.
- Logging & error handling:
  - No new logging contract.
- Network & caching:
  - No network/cache policy change.
- Storage & serialization:
  - No storage/serialization change.
- UI state & hooks:
  - High likelihood of hook-level changes to align dismiss/focus behavior.
  - Must avoid broad global overlay state if existing local state suffices.
- Tests & mocks:
  - Focus, dismiss, and layering regression tests are mandatory.

## Hidden Risk Sweep
- Async control flow:
  - Dismiss/resume/playback interactions can cause race conditions; preserve documented sequence authority.
- Re-entrancy:
  - Surface switching must not produce resume-then-pause blips or focus tug-of-war.
- Hot-path performance:
  - Do not add expensive listeners or broad store subscriptions on every overlay frame.
- Cache drift:
  - None expected.

## Dynamic Context Consistency
The contract must cover:
- keyboard-only flow
- mouse and right-click interactions
- touch/long-press behavior
- mobile/narrow-width viewport constraints
- docked/full player transitions
- translated labels and focus-visible states

## Required Changes

### 1. Produce a contract matrix before changing implementation
For each in-scope surface, document:
- current behavior
- target behavior
- exact delta

Do not start with a generic cleanup pass.

This instruction stops at the matrix/inventory phase. It does not authorize one-pass implementation across search, player, transcript, and discovery.

After the matrix exists, split implementation into follow-up instructions by surface family, for example:
- `040a-search-and-command-palette`
- `040b-transcript-selection-and-lookup`
- `040c-player-surface-contract`
- `040d-discovery-overlays` only if inventory confirms applicable overlays

The contract matrix must be written to a reviewable artifact before or alongside implementation. Acceptable locations:
- a dedicated section added to this instruction while the task is active, or
- the relevant Lite handoff sub-doc if that doc is the new durable SSOT

Reviewer must be able to inspect a current / target / delta table without relying on implementation diff inference alone.

For discovery-related scope specifically, perform an overlay inventory before implementation:
- list each discovery surface that actually hosts an overlay/callout relevant to this task
- mark each as `in scope` or `not applicable`
- if no discovery overlays qualify, record that outcome explicitly and do not expand discovery scope opportunistically

Do not treat vague “interaction-adjacent” discovery UI as in-scope unless the inventory names the concrete overlay surface.

### 2. Standardize outside-interaction semantics
The contract must distinguish:
- dismiss only
- dismiss and absorb
- dismiss and allow pass-through follow-up interaction

This is especially critical for:
- transcript lookup/callout
- context menus
- command palette/popover transitions
- player surface dismissal zones

### 3. Standardize focus entry and restore rules
Every surface must declare:
- initial focus target
- whether focus stays in the surface or may roam
- restore target on true dismissal
- exceptions for surface-to-surface switching
- **if the surface is a true Modal, it must implement correct DOM semantics (`role="dialog"`, `aria-modal="true"`, and `aria-labelledby` linked to its title).**
- Modal vs non-modal behavior must be explicit:
  - Modal: background is inert, focus is trapped, escape dismisses.
  - Non-modal: background remains interactive per the outside-interaction rules.

### 4. Standardize portal and z-index policy
- Document which surfaces render in `document.body` and why.
- Map every surface to approved z-index tokens.
- Remove undocumented local layering conventions where they conflict with the contract.
- If approved z-index tokens are not already listed in a SSOT doc, add them to the durable design-system token documentation first.
- Only if that durable doc update cannot happen in the same pass may a temporary token list live in this instruction, and it must be marked as temporary with an explicit follow-up to migrate it into the design-system token doc.

### 5. Standardize mobile and narrow-width behavior
- Define how each overlay adapts under narrow widths.
- Ensure no surface becomes undiscoverable, clipped, or impossible to dismiss on mobile.

### 6. Preserve business semantics
- Do not change transcript action availability, search result behavior, player feature scope, or discovery feature scope unless the documented delta requires it.

### 7. Update durable docs if contract changes
If this becomes the new SSOT, update:
- `apps/docs/content/docs/apps/lite/ui-patterns/shell.mdx`
- `apps/docs/content/docs/apps/lite/ui-patterns/features.mdx`
- `apps/docs/content/docs/general/accessibility.mdx`
- relevant handoff docs for search, transcript-reading, discovery

## Exit Criteria
1. A contract matrix exists for every in-scope surface with current/target/delta.
2. Every surface declares outside-click behavior, focus entry/restore, portal boundary, and z-index token.
3. Modal vs non-modal semantics are explicit and testable.
4. Overlay switching does not introduce focus or playback glitches.

## Evidence
- Updated overlay inventory and contract matrix tables.
- Minimum evidence by surface family:
  - search: at least one verified focus/dismiss example
  - transcript: at least one verified focus/dismiss example
  - player: at least one verified focus/dismiss example
  - discovery: only if the inventory marks one or more discovery overlays as in scope
- A documented z-index token list in the durable design-system token doc, or an explicitly temporary list here with a migration note.

## Forbidden Patterns
- No generic “overlay cleanup” without a current-vs-target delta table.
- No z-index magic numbers.
- No focus changes without tests.
- No overlay store centralization unless existing local state is proven insufficient.
- No player/transcript behavior reopening without explicit evidence.

## Acceptance Criteria
1. Every in-scope surface family has an explicit interaction contract matrix with current / target / delta.
2. The instruction includes a completed overlay inventory and marks discovery scope as `in scope` or `not applicable`.
3. Outside interaction, focus restore, portal boundary, and z-index semantics are reviewable and testable.
4. Player scope is explicit enough to cover docked/full/expand/dismiss behavior without reopening unrelated playback semantics.
5. Mobile/narrow-width dismissal and focus behavior is documented and verified at the contract level.
6. The required implementation split for follow-up child instructions is documented before broad code changes begin.
7. The task does not re-open unrelated shell/list/state contracts.

## Reviewer Evidence Surface

### Changed-Zone Files (Must Review)
- sidebar search / command palette files
- player surface shell / overlay files
- transcript selection/lookup files and hooks
- any discovery detail components with interaction-adjacent overlays touched
- updated `ui-patterns` / accessibility / handoff docs

### Adjacent Critical Files (Spot Check)
- `apps/lite/src/components/ui/overflow-menu.tsx`
- Radix/Floating UI wrapper utilities
- player shell files responsible for docked/full transitions and dismiss paths
- player surface tests
- transcript selection tests

### Mandatory Regression Anchors
- command palette keyboard open/close flow
- transcript lookup outside click absorb/pass-through behavior
- right-click surface switching
- player docked/full dismiss and focus restoration

## Required Tests
- Add/update tests that verify:
  - focus entry and restore for each high-risk surface
  - outside click / right click behavior
  - escape close behavior
  - portal/layering assumptions where practical
  - mobile/narrow-width dismissal paths if covered by component tests

## Manual Verification
1. Keyboard-only command palette flow.
2. Transcript click, drag, long-press, lookup, close, and switch flows.
3. Player docked/full transitions and dismissal.
4. Any discovery detail overlay/callout touched by the contract.

## Verification Commands
- `pnpm --filter @readio/lite lint`
- `pnpm --filter @readio/lite typecheck`
- `pnpm -C apps/lite test:run`

## Decision Log
- Required if this task changes a durable interaction contract or layering/focus policy.

## Bilingual Sync
- Not applicable for the instruction file itself.
- Required for any touched handoff docs with `.zh.mdx` counterparts.

## Completion
- Completed by:
- Reviewed by:
## Phase 0: Inventory & Contract Matrix

### 1. Overlay Inventory

| Surface Family | Surface Name | Component | Portal? | Modal? | Risk Level | Status |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| **Search** | Command Palette | `CommandPalette.tsx` | Yes | No | High | In Scope |
| **Player** | Docked Player | `PlayerSurfaceFrame.tsx` | No | No | Medium | In Scope |
| **Player** | Full Player | `PlayerSurfaceFrame.tsx` | No | Yes* | High | In Scope |
| **Player** | Sleep Timer Menu | `SleepTimerButton.tsx` | Yes | No | Low | In Scope |
| **Reading** | Reading BG Control | `ReadingBgControl.tsx` | Yes | No | Low | In Scope |
| **Transcript** | Word Context Menu | `SelectionUI.tsx` | Yes | No | High | In Scope |
| **Transcript** | Range Action Menu | `SelectionUI.tsx` | Yes | No | High | In Scope |
| **Transcript** | Lookup Callout | `SelectionUI.tsx` | Yes | No** | High | In Scope |
| **Discovery** | Download Confirm | `EpisodeDetailDownloadButton` | Yes | No | Low | In Scope |

*\* Full Player target: Implement Modal semantics (trap focus, aria-modal) in follow-up 040c.*
*\*\* Lookup Callout is non-modal to allow playback/scrolling while reading definitions.*

### 2. Contract Matrix (High Risk)

| Property | Search Palette | Docked Player | Full Player | Transcript Selection | Lookup Callout |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Trigger** | Sidebar Search / ⌘K | Mini-player Maximize | Docked Maximize | Right-click / Text Drag | Context Menu "Look Up" |
| **Surface Style** | Center Popover / Blur | Floating Glassy Panel | Fixed Inset / Opaque | Floating Bubble / Arrow | Floating Dialog / Arrow |
| **Modal Mode** | Non-modal | Non-modal | Target: Modal (Inert bg) | Non-modal | Non-modal |
| **Initial Focus** | Command Input | N/A (Keep background) | Play/Pause Button | First Menu Item | Scroll Container / Close |
| **Outside Click** | Dismiss | N/A (In-page) | N/A (Full screen) | Dismiss & Absorb | Dismiss & Absorb |
| **Outside R-Click** | Dismiss | N/A (In-page) | N/A (Full screen) | Switch Surface | Switch Surface |
| **Escape Key** | Close | Minimize to Mini | Minimize to Docked | Close | Close |
| **Focus Restore** | Trigger Element | N/A | Trigger / Prev Card | Owning Word/Line | Owning Word/Line |
| **Portal Boundary** | `document.body` | App Shell Root | App Shell Root | `document.body` | `document.body` |
| **Z-Index Token*** | `--z-overlay` | `--z-docked-player` | `--z-full-player` | `--z-overlay` | `--z-menu` |

*\* Z-Index/Layering tokens MUST follow the durable SSOT in `apps/docs/content/docs/general/design-system/tokens.mdx`. Runtime CSS (e.g., `apps/lite/src/index.css`) is an implementation site only and must not be treated as a co-equal source of truth. Avoid raw numbers.*

### 3. Transition Contracts (Expand/Minimize)

| Phase | Path | Contract |
| :--- | :--- | :--- |
| **Docked -> Full** | `toFull()` | Shared Layout Id morph; z-index elevate to `--z-full-player`; preserve transcript scroll pos. |
| **Full -> Docked** | `toDocked()` | Shared Layout Id morph; z-index drop to `--z-docked-player` (below sidebar); restore focus to previous playback card. |
| **Dismissal** | `toMini()` | Exit spring animation to bottom gutter; restore focus to Sidebar or last active list item. |

### 4. Divergences Identified
- **D1: Search Focus Restoration**: Command Palette does not explicitly restore focus to trigger on dismissal.
- **D2: Full Player Accessibility**: `PlayerSurfaceFrame` (Full mode) lacks `role="dialog"`, `aria-modal`, and focus trapping.
- **D3: Transcript Dismissal on Mobile**: Selecting text makes dismissal zones small; requires close-action or bottom-sheet adaptation.
- **D4: Z-Index Alignment**: `LookupCallout` uses `--z-menu` vs selection surfaces on `--z-overlay`; audit for potential unification.

### 5. Recommended Implementation Split
- [x] **040a**: Search & Command Palette (Focus restore + Mobile width).
- [x] **040b**: Transcript Selection (Absorption backdrop + Focus restoration).
- [x] **040c**: Player Surface Contract (Accessible Modal upgrade, nested overlay Escape deferral, focus restoration).
- **040d**: Layering & Z-Index (Token alignment). Not required at present.

### 6. Closure Assessment
- `040a`, `040b`, and `040c` have closed the currently identified search, transcript, and player overlay-contract divergences tracked by this parent instruction.
- A separate `040d` child task should not be opened by default.
- Open `040d` only if a future review identifies a concrete cross-surface layering or token divergence that cannot be resolved within an existing surface-family task.
- Until such a divergence exists, this parent `040` instruction should be considered complete once the child-task references above remain accurate.
