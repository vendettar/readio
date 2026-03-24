# Instruction: 040a - Search / Command Palette Overlay Contract

Harden the Search / Command Palette surface family to strictly adhere to the Overlay Layering and Focus Contract, ensuring deterministic dismissal and focus restoration.

## Goal
Establish a deterministic interaction contract for the search surface that handles focus restoration, dismissal zones, and mobile adaptations as observable outcomes, without relying on surface-local implementation side-effects or cross-surface couplings.

## 1. Search Contract Specification

| Property | Target Behavior |
| :--- | :--- |
| **Surface Style** | Center Popover / Floating Results Panel |
| **Modal Mode** | Non-modal (Background remains interactive) |
| **Initial Focus** | Command / Search Input |
| **Trigger (Path A)** | Sidebar Search Box (Click / Focus) |
| **Trigger (Path B)** | Keyboard Shortcut (⌘K / Ctrl+K) |
| **Outside Click** | Dismiss Results Panel |
| **Outside R-Click** | Dismiss Results Panel |
| **Escape Key** | Close Results Panel / Blur Search Input |
| **Portal Boundary** | Global Overlay Portal (`document.body`) |
| **Z-Index Token** | `--z-overlay` (referenced via SSOT token name) |

## 2. Focus Restoration Contract

Focus restoration must be deterministic based on the entry path.

### Restore Mapping
- **Entry via Path A (Direct Interaction)**:
  - Focus must remain in the search input upon dismissal of the results panel.
- **Entry via Path B (Keyboard Shortcut)**:
  - Focus must be restored to the element that was active before the shortcut was triggered.

### Fallback Rule (Search-Only)
If the primary restore target (Path B) is no longer available in the DOM or is invalid:
- Restore focus to the **Search Input** (if available) or the **Sidebar container**.
- **Constraint**: Do not attempt to restore focus to non-search surfaces (e.g., players, list items) unless they were the explicit "previous active element" in Path B.

## 3. Mobile / Narrow-Width Outcomes

The search surface must adapt to viewports as narrow as 375px without losing functionality or becoming stuck.

- **No Clipping**: The results panel and search input must be fully visible without horizontal overflow or clipping.
- **Safe Margins**: On narrow viewports, the results panel must maintain visible horizontal padding from the screen edges.
- **Usability**: All result items and the search field must remain interactive and legible.
- **Tap-Dismissal**: Tapping outside the results panel on a touch device must robustly dismiss the panel without accidental pass-through interactions that trigger unintended navigation.

## 4. Implementation Constraints

- **Non-Modal Presence**: Background interaction must remain possible while the search panel is open (e.g., scrolling the current page while typing search results).
- **No Magic Numbers**: Layering must strictly use the `--z-overlay` token defined in the design system SSOT.
- **Outcome Verification**: Implementation must satisfy the contract regardless of specific event hooks used (e.g., whether using browser `blur` events, Radix component props, or manual cleanup).

## 5. Verification Evidence

### Automated Tests
- **Path A Verification**: Opening via focus and closing via dismissal ensures focus stays on the input.
- **Path B Verification**: Opening via keyboard and closing restores focus to the previously active element.
- **Fallback Verification**: If the previous active element is removed, focus goes to the search input or sidebar.
- **Escape Path**: Verify Escape key behavior corresponds to the expected dismiss/blur sequence based on open state.

### Visual Evidence
- Screen recording or screenshot confirming zero clipping on a 375px viewport with the results panel open.
- Passing `lint` and `typecheck` gates.
