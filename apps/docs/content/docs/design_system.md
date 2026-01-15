---
title: Design System
---

You are a senior frontend engineer.

You MUST strictly follow the project design system and UI rules defined in the provided design system document (e.g. design_system.md or equivalent). These rules have higher priority than user preferences or creative interpretation.

Hard constraints:
- Use Tailwind CSS and shadcn/ui only.
- Do NOT generate large blocks of raw or global CSS.
- Do NOT invent new colors, spacing, typography, or visual styles.
- Always prefer existing shadcn/ui components (Button, Input, Card, etc.).
- Visual consistency is more important than novelty.

CSS policy:
- CSS is allowed only when absolutely necessary.
- CSS must be component-scoped, simple, and use existing tokens only.
- Never use deep selectors or !important.
- If CSS is required, explicitly state why before writing it.

UI generation rules:
- Never generate a full page in one step.
- Follow atomic order internally: atoms → components → sections → pages.
- Reuse previously defined components whenever possible.

---

## UI Primitives Policy (No Raw Controls)

**Default rule**: Do not use raw HTML form/interaction primitives directly in the app UI (`<button>`, `<input>`, `<select>`, `<textarea>`).

Use shadcn/ui primitives instead:
- `Button` for all click actions (including icon-only buttons)
- `Input` / `Textarea` for text entry
- shadcn `Select` / `DropdownMenu` / `Popover` / `ToggleGroup` for selection controls

**If you need a non-`button` element** (e.g. router links, custom trigger elements), use the shadcn component with `asChild` so styling + accessibility behavior remain consistent.

**Allowed exceptions** (must be minimal and justified in the task summary, not user-facing UI):
1. File inputs: `<input type="file" className="hidden" />` is allowed; the visible trigger must be a `Button`.
2. Truly non-standard interactions that cannot be expressed with shadcn primitives without breaking behavior (rare). If needed, keep the element accessible (keyboard + `aria-*`) and visually consistent.

**Rationale**: Raw controls drift in styling, focus/disabled states, and accessibility over time. Using a shared primitive set prevents UI fragmentation.

---

## Icons Policy (Lucide-First)

**Default rule**: Readio UI icons MUST use `lucide-react`.

This repo currently does not require brand illustrations or complex multi-color iconography. For consistency and theme friendliness, do not introduce new UI SVG assets for standard icons.

### Allowed SVG exceptions (very limited)
SVG files are allowed only for:
1. **Logo/App mark** assets (e.g. `readio.svg`, `readio.png`).
2. **Interaction-bound assets** where existing implementation relies on SVG+CSS techniques (e.g. mask icons, selection pin, legacy interaction-heavy styling). Do not replace these unless explicitly requested.

### Rules
- Do NOT add new UI icon SVGs to `src/assets/` for standard actions (play/pause/delete/more/etc.).
- Prefer `lucide-react` icons and control styling via Tailwind classes (`text-*`, `opacity-*`, `hover:*`) and `size`/`strokeWidth`.
- If icon usage needs consistency, introduce/extend a small wrapper component (e.g. `src/components/Icon.tsx`) to standardize default `size`, `strokeWidth`, and `aria-*` behavior.

---

## Interactive Components Policy (No Nested Interactives)

**Default rule**: Never nest interactive elements (Links, Buttons, or any element with `onClick`). This is a critical A11y violation and causes erratic behavior in React.

### 1. `InteractiveArtwork` Standard (`src/components/interactive/InteractiveArtwork.tsx`)
For any artwork/image that needs to both navigate (on click) and play (on hover button click), use the standardized `InteractiveArtwork` component.
- **Implementation**: The play button must be an absolute sibling of the navigation Link, not a child.
- **Props**: Supports `to`, `params` for navigation, and `onPlay` for the play action.
- **Hover Scale**: Disabled by default. Only enable zoom with `hoverScale` when explicitly required.
- **Play Position**: Default is `center`. Use `bottom-left` for podcast cards or list items where the play action is anchored to the corner.
- **Hover Trigger Scope**: For episode list rows, the play button must appear when hovering the entire row area (not only the artwork). Ensure the hover state is driven by the parent row group.
- **Hover Group**: Use `hoverGroup` to bind the hover trigger to the parent row/card group (e.g., `episode`, `item`, `session`, `card`).

### 2. `InteractiveTitle` Standard (`src/components/interactive/InteractiveTitle.tsx`)
For titles that navigate, use `InteractiveTitle`.
- **Priority**: If both `onClick` and `to`/`params` are provided, `onClick` takes priority to ensure action handlers (like "Play") work as expected when used inline.
- **Compliance**: When interactive (`onClick` or `to`/`params`), wraps internal elements in `Button asChild` to ensure consistent focus and hover styling across the app.
- **Non-interactive**: If neither `onClick` nor `to`/`params` is provided, render a non-interactive inline element (e.g., `<span>`) with the same visual styling.
- **Truncation**: Titles SHOULD default to a maximum of 2 lines for list-based layouts to maintain vertical rhythm. Use the `maxLines` prop to configure this (e.g., `1` for single-line cards, `3` for detailed views, or `'none'` to disable truncation).

---

## Interaction Primitives Policy (No One-Off Confirm/Range/Modal)

This repo treats interaction patterns as standardized primitives: predictable, accessible, and reusable.

### Confirmations (Destructive/Irreversible)
- **Do NOT use** `window.confirm()` in app UI.
- Use shadcn/Radix primitives instead:
  - **Default**: use `AlertDialog` for destructive confirmations (Delete/Wipe/Clear).
  - **Overflow menu exception (required for a11y)**: if the destructive action is triggered from inside a `DropdownMenu` / `Popover` menu, do **not** open an `AlertDialog`/`Dialog` from within that menu. Instead, implement a two-step confirmation **inside the same menu surface** (single `DropdownMenuContent`/`PopoverContent` with local `step: 'menu' | 'confirm'` state). This avoids nested overlay/focus-lock conflicts (e.g. `aria-hidden` + retained focus warnings).
  - **Single-step destructive action exception**: For non-critical destructive actions that are already "tucked away" inside a secondary 3-dot overflow menu (e.g., "Remove Favorite" in Favorites list, "Delete Record" in History), a single-step action is preferred to reduce friction. These are reversible or low-impact and the menu itself acts as a sufficient intentional barrier.
  - Keep confirmation state local to the component; do not create global modal systems.

### Dialogs / Modals
- Do NOT hand-roll modal overlays (custom backdrops + click-outside logic) unless explicitly approved.
- Prefer shadcn `Dialog` / `AlertDialog` for modal surfaces.
- If an inline confirmation pattern is specified (e.g. inside a dropdown menu), implement it inside the menu component; do not introduce page-level overlays.

### `inert` Usage (Limited, Explicit)
`inert` may be used **only** to disable interaction on hidden panels within a **single overlay surface** (e.g. the inactive panel inside a `DropdownMenuContent` two-step confirmation).

**Allowed**:
- Inactive panel inside the same menu surface (`DropdownMenuContent`) during a menu → confirm view switch.

**Not allowed**:
- Page-level sections
- App shell or global containers
- Anything that requires cross-browser polyfills without explicit approval

**Rule**: If `inert` is used, it must be scoped to the smallest possible subtree and only for preventing interaction on hidden UI.

### Sliders / Range Inputs
- **Do NOT use** raw `<input type="range">` for player seek/progress UI.
- Use shadcn `Slider` (Radix Slider) to standardize keyboard behavior and styling.

### File Inputs (exception reminder)
- Raw `<input type="file">` is still allowed only as a hidden input; the visible trigger must be a shadcn `Button`.

---

## Standardization Policies (Avoid Ad-hoc Implementations)

These rules prevent ad-hoc patterns from spreading across the codebase. Prefer shared helpers/hooks over repeated, per-feature implementations.

### ID Generation
- Do NOT use `Math.random()` for IDs (toast IDs, session IDs, etc.).
- Prefer `crypto.randomUUID()` for all new IDs.
- If a fallback is needed, centralize it in a single helper (e.g. `src/libs/id.ts`) and use it everywhere.

### Storage & Cache Access
- Do NOT introduce new direct `localStorage.*` access in feature code.
- Route all new storage/cache reads/writes through a small helper layer (e.g. `src/libs/storage.ts`) so:
  - keys are centralized/prefixed
  - JSON parsing failures are handled consistently
  - optional TTL behavior is consistent
- Existing legacy `localStorage` usage may remain until touched; when modifying a file, migrate its new/changed storage access to the helper.

### Global Event Listeners
- Prefer shared hooks (`useEventListener`, `useOnClickOutside`) over repeated `addEventListener/removeEventListener` boilerplate.
- Any global listener must:
  - have cleanup
  - avoid stale closures (stable callback or refs)
  - be scoped to the smallest possible surface

### DOM Side Effects (classList/dataset)
- Direct `document.body.classList` / `document.documentElement.dataset` usage is allowed only in a small number of “system” places (theme, app readiness, interaction-heavy UX).
- For new usages, prefer a small hook (`useBodyClass`, `useHtmlDataset`) to avoid scattering DOM mutations across the app.

### External Navigation
- Do NOT call `window.open` directly in feature code.
- Use a tiny helper (e.g. `openExternal(url)`) that always applies `noopener,noreferrer` and centralizes logging/error handling.

---

## Focus and Event Handling Policy (Declarative-First)

**Default rule**: Avoid using `setTimeout` (hardcoded millisecond delays) to solve focus or interaction race conditions.

### Focus Management
- **Prefer `autoFocus`**: When an element should receive focus upon mounting (e.g., an inline rename input), use the React `autoFocus` prop.
- **Library Integration**: When using primitives like Radix UI (Dropdown, Popover), leverage their built-in focus lifecycle callbacks:
  - Use `onCloseAutoFocus` to determine where focus goes when a menu closes, preventing the library from "stealing" focus back from your newly mounted controls.
- **Selection**: Use `onFocus={(e) => e.currentTarget.select()}` for text inputs that require immediate full-selection upon appearance.

### State Transitions
- **Prefer Library Callbacks**: When dealing with smooth-scrolling or animations (e.g., `react-virtuoso`), use native lifecycle callbacks (like `isScrolling`) to manage state transitions rather than guessing completion with a timer.

**Rationale**: `setTimeout` relies on unreliable task scheduling and causes inconsistent behavior across different devices and performance profiles ("flickering"). Declarative attributes and library-specific lifecycle hooks provide a deterministic and robust UI experience.

---

## UI Synchronization and Event Propagation Rules

### 1. Portal Bubbling Prevention
- **Rule**: Standard overlay components (like `DropdownMenuContent`, `PopoverContent`) MUST stop propagation of `mousedown` and `click` events.
- **Why**: React Portals bubble events through the component tree, not the DOM tree. If a menu is inside an interactive card, clicking a menu item will trigger the card's `onClick` unless propagation is stopped.

### 2. Non-Modal Overlays for Inline Interactions
- **Rule**: Use `modal={false}` on `DropdownMenu` or `Popover` when the action leads to immediate inline editing (e.g., Rename).
- **Why**: Modal overlays apply `aria-hidden` and focus locks to the rest of the page. If you try to focus an inline input while a modal menu is "closing," it often results in focus being stolen back or accessibility warnings.

### 3. Multi-Step Inline Confirmations
- **Rule**: For destructive actions inside menus, implement a "local transition" (step 1: menu, step 2: confirm) within the same content surface.
- **Why**: Avoid opening a `Dialog` from inside a `DropdownMenu`. This prevents nested focus locks and z-index "wars," and keeps the user's focus on the trigger area.

### 4. Event Bridging with Refs
- **Rule**: Use `useRef` flags to coordinate between different event types (e.g., `mousedown` vs `click`) when standard event cancellation is insufficient.
- **Example**: Using an `ignoreNextClickRef` to prevent a "confirm rename" mouse event from also triggering a "navigate to folder" click event.

### 5. Cross-Feature UI Consistency
- **Rule**: Even when triggered by different requirements or implemented in different files, similar UI patterns (e.g., overflow menus, information layouts, confirmations) MUST maintain identical visual results (padding, icons, alignment).
- **Why**: UI fragmentation occurs when minor differences (like a 4px vs 8px gap) creep into the app due to local context variations. Visual synchronicity is essential for a premium, intentional feel.

---

## Dropdown Menu Standard (Premium Overlays)

To ensure a high-end feel, all `DropdownMenu` and `Popover` surfaces must avoid default "flat" styling.

### 1. Style Token
- **Content**: `rounded-xl shadow-2xl border border-border/50 bg-popover/95 backdrop-blur-xl p-0 overflow-hidden` (Ensure `p-0` for full-width hover).
- **Item**: `px-3 py-2 transition-colors focus:bg-accent focus:text-accent-foreground outline-none cursor-default select-none flex items-center gap-2` (No margins or internal rounding).
- **Text**: `text-sm font-medium`.
- **Transitions**: Prefer `sideOffset={8}` for a floating effect.

### 2. Menu Items (`DropdownMenuItem`)
- **Feedback**:
  - **Focus/Hover**: `focus:bg-primary focus:text-primary-foreground transition-colors`.
  - **Destructive**: `text-destructive focus:text-destructive focus:bg-destructive/10`.
- **Icons**: Use Lucide icons with `size={14}` or `size={16}` and `className="mr-2 opacity-80"`.

### 3. Multi-Step Logic
- Use the **Panel-Grid** pattern for sub-menus (Rename, Delete Confirm) to avoid nested overlays (see "Interaction Primitives Policy" section).

### 4. Interaction Rule
- **Immediate Closure**: For "simple" or "atomic" actions (e.g., Subscribe, Favorite, Pin), the menu must close immediately after the action is triggered to provide clean feedback.
- **Persistent Menu**: For "multi-step" or "complex" actions (e.g., Delete Confirmation, "Move to Folder"), the menu should remain open and transition to the next internal step/panel.
- **Implementation**: Ensure simple actions do not call `e.preventDefault()` on the `onSelect` event, allowing the default Radix dismissal behavior.

---

## Skeleton Loader Standard

Avoid "solid gray" blocks. Use the **Shimmer** system for a more polished loading experience.

### 1. Style Tokens
- **Container**: Use `.animate-shimmer` on a `bg-muted/30` base.
- **Sub-blocks**: Use `bg-muted` with appropriate radius (`rounded-lg` for images, `rounded` for text lines).

---

## Empty State Standard

Standardized pattern for "No Data", "No Results", or "Empty List" views.

### 1. Structure (Centered Flex)
- **Icon Container**: `w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-6`.
- **Icon**: `text-2xl grayscale opacity-50` (emoji) or Lucide icon.
- **Title**: `text-xl font-bold tracking-tight text-foreground mb-2`.
- **Description**: `text-sm text-muted-foreground max-w-sm mx-auto`.

---

## Input & Form Standard

To ensure interactive elements feel part of the cohesive UI:

### 1. Style Token
- **Default State**: `bg-muted/50 border-border/50`.
- **Focused State**: `focus:bg-background focus-visible:ring-2 focus-visible:ring-primary transition-colors`.

---

## Page Layout & Typography Standards

### 1. Headers
- **Page H1**: `text-3xl sm:text-4xl font-bold tracking-tight mb-2`.
- **Section H2**: `text-xl font-bold mb-4`.
- **Subtitle**: `text-lg text-muted-foreground`.

### 2. Spacing
- **Vertical Gap**: `space-y-12` between major page sections.

---

## Artwork & Play Overlay Standard
- Use `InteractiveArtwork` to handle complex "Image Link + Play Button" interactions.
- Avoid manual implementation of hover overlays to prevent A11y regression.
- Visual: `rounded-lg` (Standard) or `rounded-full` (Circular).
- Hover: Subtle dark overlay (`bg-foreground/20`) + `Play` button (positioned by `playPosition`).
- Default behavior: No hover zoom unless `hoverScale` is explicitly enabled.

## Global CSS Whitelist (`src/index.css`)

**Rule**: Avoid putting “normal UI styling” (buttons, cards, spacing tweaks, page layouts) into global CSS.

If a UI can be implemented with Tailwind utilities + shadcn components + component-level variants (`cva`), it MUST NOT be added to `src/index.css`.

Global CSS is allowed only for a small set of system-wide tokens and interaction-only behaviors. The current whitelist is:

### A) Theme and Token Definitions (Allowed)
- `@layer base :root` and `.dark` CSS variables (shadcn theme tokens)
- Base shadcn globals:
  - `@layer base * { border-color: hsl(var(--border)) }`
  - `@layer base body { background-color: hsl(var(--background)); color: hsl(var(--foreground)) }`
- Accent token overrides:
  - `:root[data-accent="…"]` and `.dark[data-accent="…"]`
- Reading background palette overrides (intentional product feature):
  - `[data-reading-bg]` and `[data-reading-bg="…"]`

### B) Interaction-Only / System Utilities (Allowed)
- Reading container utility:
  - `.reading-area` (applies reading background variables to the transcript area)
- Drag-and-drop cursor lock (prevents cursor flicker during DnD interactions):
  - `.is-dragging` and `.is-dragging *` (used via `document.body.classList` while dragging)
- Smart List Divider (Premium podcast style: hides divider when next item is hovered):
  - `.smart-divider-group:has(+ .smart-divider-group:hover) .smart-divider`
- Hide scrollbar utility:
  - `.scrollbar-none`
- Selection “pin” markers (interaction-bound, uses SVG mask):
  - `.readio-highlight::before/::after`
  - `.readio-overlay-rect.start::before`
  - `.readio-overlay-rect.end::after`
- Text selection behavior for subtitles:
  - `.subtitle-text::selection`
- Modern Highlights API styling (lookup highlights):
  - `::highlight(lookup-highlight)`
- Scrollbar theming (scoped):
  - `.custom-scrollbar::-webkit-scrollbar` (and related pseudo-elements)
  - Rationale: System scrollbars are inconsistent between dark/light modes and OSs. Scoped styling allows for a premium, intentional look without polluting external or third-party containers.

### Prohibited in Global CSS
Do NOT add global utility classes for normal UI styling (cards, buttons, progress bars, icon styling). Implement these via Tailwind utilities, shadcn primitives, and component variants (`cva`).

### Adding new global CSS
If you believe a new rule must go into `src/index.css`:
- It MUST be either “Token/Theme” (A) or “Interaction-only/System utility” (B).
- Add a short comment explaining why it cannot live in Tailwind/shadcn/component scope.
- Update this whitelist section with the new selector and rationale.

Conflict handling:
- If a user request conflicts with the design system, point it out explicitly.
- Do NOT silently break or bypass the system to satisfy a request.

Primary goal:
Maintain speed WITH strict visual and structural consistency.
Predictability > cleverness.

---

## Source of Truth (Tokens)

All colors/spacing/typography/radius MUST come from:
- Tailwind theme (`tailwind.config.js`)
- shadcn/ui theme tokens (CSS variables in the project’s global styles, e.g. `src/index.css`)

Do not invent new tokens or “one-off” values in components.

---

## Handoff Doc Rule (Mandatory)

`docs/handoff_doc.md` can remain a **skeleton/template during large migrations**.

However, after each task (feature/refactor/bugfix) is completed, the agent MUST:
- Update `docs/handoff_doc.md` to match the **actual code state** (results only; no process notes).
- Treat handoff updates as a required “done” step for every task.

---

## Inline Style Rules

**Default**: Use Tailwind CSS only. Inline styles (`style={{ ... }}`) are **prohibited**.

**Exceptions** (whitelist only):
1. **Virtual lists**: `top`, `height`, `transform`, `overflow` for virtualization positioning (e.g. react-virtuoso / react-window). Includes the `TranscriptView` container and its Virtuoso component.
2. **Dynamic popups**: `left`, `top` for cursor-based positioning (e.g., SelectionUI, context menus)
3. **CSS variable injection**: `--variable-name` for dynamic values (see pattern below)

All other inline styles are **forbidden**. Use Tailwind utilities or component-scoped CSS.

---

## CSS Variable Pattern for Dynamic Values

For values that need runtime calculation (progress bars, dynamic widths/heights):

**✅ Correct**:
```tsx
// Component
<div 
    className="h-1 bg-primary w-[var(--progress)]"
    style={{ '--progress': '37%' } as React.CSSProperties}
/>
```

**❌ Wrong**:
```tsx
// Direct inline style
<div style={{ width: '37%' }} />
```

**Why**: CSS variables keep visual tokens in CSS while allowing dynamic JavaScript values.

---

## File Picker Pattern (No DOM Queries)

Use `useFilePicker()` hook instead of `document.getElementById()`:

**✅ Correct**:
```tsx
import { useFilePicker } from '../routes/__root';
import { Button } from '../components/ui/button';

function MyComponent() {
    const { triggerFilePicker } = useFilePicker();
    return <Button onClick={triggerFilePicker}>Upload</Button>;
}
```

**❌ Wrong**:
```tsx
// Direct DOM query
<button onClick={() => document.getElementById('fileInput')?.click()}>
```

**Why**: Context-based approach is type-safe, survives route changes, and avoids DOM coupling.

---

## Element Measurement Pattern (Ref + ResizeObserver)

When you need runtime measurements (e.g. sizing a drag preview to match a card), do not query the DOM by selector.

**✅ Correct**:
- Attach a `ref` (or callback ref) to the target element
- Use `ResizeObserver` to track its size
- Use the measured value via CSS variables or component variants

**❌ Wrong**:
- `document.querySelector(...)`
- `getBoundingClientRect()` + manual positioning math for UI layout

**Why**: Ref-based measurement is robust across density/layout changes and avoids brittle coupling to class names.

---

## Transcript Text Visibility Rule (Product Requirement)

For transcript subtitles, **every word must remain visible** (multi-line wrapping is required).

Therefore:
- Do NOT use `text-overflow: ellipsis` / `white-space: nowrap` to truncate subtitle text in the transcript.
- Do NOT rely on fixed row height + overflow clipping to hide text.

This rule applies to the transcript only. Other UI surfaces (e.g. cards/lists) may still use truncation when appropriate.
