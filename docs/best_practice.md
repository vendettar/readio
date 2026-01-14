# Readio Best Practices & Coding Standards

This document is a concise index of coding standards, architectural patterns, and design principles for the Readio project. If any rule here conflicts with `docs/design_system.md`, `docs/front-vibe-coding-charter.md`, or `docs/handoff_doc.md`, those documents take priority.

## 1. Role & Philosophy

**Role**: Senior Frontend Engineer.
**Goal**: Fast iteration with strong visual consistency and minimal refactor cost.
**Motto**: "Predictability > Cleverness."

- **Vibe Coding**: Build the system first (Atoms → Molecules → Sections → Pages), then let the flow run.
- **Strict Compliance**: Follow the `docs/design_system.md` and `docs/front-vibe-coding-charter.md` religiously.
- **Handoff**: Always update `docs/handoff_doc.md` to reflect the *actual* state of the code after every task.

## 2. Tech Stack (Non-Negotiable)

- **Framework**: React + TypeScript + Vite
- **Styling**: Tailwind CSS + shadcn/ui (Radix UI primitives)
- **Routing**: TanStack Router (File-based)
- **State Management**: Zustand
- **Data Persistence**: Dexie.js (IndexedDB)
- **Data Fetching/Caching**: TanStack Query
- **Icons**: `lucide-react` (SVG exceptions only for logo/interactions)

## 3. Core Constraints ("The Hard Don'ts")

1.  **No Raw HTML Controls**: Never use `<button>`, `<input>`, `<select>`, `<textarea>` directly in the UI. Always use shadcn primitives (`Button`, `Input`, `Select`, `Textarea`).
    *   *Exception*: Hidden file inputs (`<input type="file" className="hidden" />`), triggered by a `Button`.
2.  **No `window.confirm`**: Use shadcn `AlertDialog` for destructive actions.
3.  **No `Math.random`**: Use `crypto.randomUUID()` or centralized helpers in `src/libs/id.ts`.
4.  **No Global CSS**: Do not add rules to `src/index.css` unless they are theme tokens or specific interaction utilities (whitelisted in `design_system.md`). Use Tailwind utility classes and component variants (`cva`).
5.  **No Inline Styles**: Inline styles are prohibited except the whitelist in `docs/design_system.md` (virtual list positioning, cursor popups, CSS variable injection).
6.  **No Direct DOM Queries**: Avoid `document.getElementById` or `querySelector`. Use Refs or Context-based hooks (e.g., `useFilePicker`).
7.  **No Nested Interactive Elements**: Never nest links/buttons or `onClick` elements. Use `InteractiveArtwork` or absolute sibling layering instead.
8.  **No Hardcoded UI Strings**: All user-facing text must use `t(key)`. User-facing errors must be natural language only.
9.  **No Edits to Generated Files**: Do not edit `src/routeTree.gen.ts`.

## 4. UI/UX Patterns

### Navigation & Interactivity
-   **Declarative Navigation**: Prefer `<Link>` over `useNavigate` + `onClick` handlers for better accessibility and clearer intent.
-   **Interactive Wrappers**:
    -   Use **`InteractiveArtwork`** for images that need both navigation (click) and playback (hover button).
    -   Use **`InteractiveTitle`** for titles that link to content.
    -   **Priority**: If `InteractiveTitle` receives both `onClick` and `to/params`, `onClick` takes priority.
    -   **Non-interactive**: If `InteractiveTitle` has no `onClick` and no `to/params`, render as a non-interactive inline element (no Button).
-   **Episode ID Canonicalization**: Use GUID if available (`episodeGuid` / RSS `id`); fallback to `trackId`. Always `encodeURIComponent` when placing `episodeId` in routes, and decode on the episode detail page.
-   **Safe Link Guard**: Do not render a `Link` if required route params are missing; render non-interactive text instead.
-   **Playable Card Rule**: Render Play buttons only when a valid `onPlay` handler exists. Never show a non-functional Play button.
-   **Artwork Referrer Policy**: All podcast/episode artwork should use `referrerPolicy="no-referrer"` (defaulted in `InteractiveArtwork`).
-   **Event Propagation**: Explicitly handle `e.stopPropagation()` in dropdown triggers and interactive children to prevent parent card clicks.
    -   **Layering**: Hover overlays should be `pointer-events: none`; action buttons must be `pointer-events: auto` and above the visual layer (`z-20+`).

### Overlays & Menus
-   **Dropdowns**: Use the "Premium Overlay" style (glassmorphism, `sideOffset={8}`, `rounded-xl`).
-   **Inline Actions**: Use `modal={false}` on `DropdownMenu` when the action triggers inline editing (e.g., Rename) to prevent focus locking issues.
-   **Multi-Step Menus**: Implement confirmation steps *inside* the menu content (Panel-Grid pattern) rather than opening a new Dialog on top.

### Feedback & Loading
-   **Skeletons**: Use the "Shimmer" effect (`.animate-shimmer`), never solid gray blocks.
-   **Empty States**: Use the standardized centered layout with a muted icon and clear text.

## 5. Coding Standards

### React & Hooks
-   **Focus Management**: Use `autoFocus` prop and library callbacks (`onCloseAutoFocus`) instead of `setTimeout` hacks.
-   **Effect Dependencies**: Be exhaustive with `useEffect` dependencies. Handle "late binding" for refs (e.g., Audio element) correctly.
-   **Zustand & Persistence**: 
    -   Keep store logic pure and typed. 
    -   Use explicit selectors to prevent unnecessary re-renders.
    -   **Persistence**: Prefer explicit `loadFromDB()` / `saveToDB()` actions (using `src/libs/dexieDb.ts`) over `zustand/persist` middleware for complex data (Files, Favorites, Subscriptions).
    -   **Dexie Versioning**: Use a single schema version only; do not add migration blocks or increment version numbers. If schema changes, reset local data.

### Data Fetching Strategy
-   **Proxy Fallback**: Use `fetchWithFallback` from `src/libs/fetchUtils.ts`. This implements the standard "Direct → Primary Proxy → Secondary Proxy" chain required for web-based CORS handling.
-   **Deduplication**: Use `deduplicatedFetch` from `src/libs/requestManager.ts` for read-only GET requests to prevent race conditions and double-fetching.
-   **Cancellation**: Always pass `AbortSignal`. Use `abortRequestsWithPrefix` for cleaning up requests when switching views (e.g., closing a modal).
    -   **External Navigation**: Do not call `window.open` directly; use `src/libs/openExternal.ts`.

### Testing Standards
-   **Framework**: Vitest.
-   **Store Testing**: Reset store state in `beforeEach` to ensure test isolation.
-   **Structure**: Use `describe` blocks for grouping and `it` for test cases.

### Files & Structure
-   **`src/libs`**: Centralize business logic and helpers here (`storage.ts`, `dateUtils.ts`).
-   **`src/components/ui`**: Reserved for shadcn primitives.
-   **`src/components/interactive`**: Custom interaction primitives (`InteractiveTitle`, `InteractiveArtwork`).
-   **`src/routes`**: Orchestration only. Move heavy logic to custom hooks (`useSettingsData`, `useFileHandler`).

### CSS & Styling
-   **Tailwind First**: Use utility classes for 99% of styling.
-   **Component-Scoped**: If custom CSS is needed, use Tailwind `@layer components` or CSS modules.
-   **Z-Index**: Manage z-indices explicitly to ensure interactive elements (`z-20`) sit above hover layers.

## 6. Architecture & Consistency Standards

### A. External Input Validation (边界校验一致性)
-   **Rule**: All external inputs (RSS/Search/Drag&Drop) must pass through Zod schema (`safeParse` / `parseOrNull`) before entering UI/Store. Never allow raw external data directly into the application.
-   **Implementation**: Use `src/libs/schemas/*` for Discovery module validation.

### B. Request Lifecycle Policy (请求生命周期策略)
-   **Rule**: All async requests must attach an `AbortSignal`. View transitions (modal close, page leave) must trigger abort. Use `requestManager` for deduplication and race condition handling.
-   **Pattern**: Always clean up in-flight requests when views unmount.

### C. Shared Cache Policy (缓存一致性)
-   **Rule**: Cache read/write must use unified `storage` utilities (`getJsonWithTtl`). TTL constants should be centralized (e.g., `runtimeConfig` or `constants.ts`). No hardcoded magic numbers.
-   **Rationale**: Prevents cache inconsistencies and makes TTL tuning easier.

### D. Error Handling Tiers (错误处理分级)
| Tier | Trigger | Action |
|------|---------|--------|
| **User Error** | Operation failure, network disconnect | Toast / Empty State (i18n) |
| **System Error** | Parse failure, bad params | `console.warn/error` (silent) |
| **Forbidden** | Never expose stack traces to users or silently swallow user operation failures |

### E. Domain vs API Models (类型领域分离)
-   **Rule**: Strictly separate API response types (DTO) from internal business types (Domain Model).
-   **Naming Convention**:
    -   API types: Match Zod schema (e.g., `ApiPodcastResponse`)
    -   Domain types: Clean business models (e.g., `Podcast`)
-   **Rationale**: Prevents coupling UI components to external API structures.

## 7. Project-Specific Guidelines

-   **Global Search**: Implemented as a mode, not a filter. Two stages: Preview Overlay → Results Page.
-   **Transcript**: **Every word must be visible**. No truncation (`text-overflow: ellipsis`) is allowed for subtitle text.
-   **File Density**: View density settings (`comfortable` / `compact`) apply to the entire Files page, not just the list.
-   **Audio Player**: The audio element is persistent in `__root.tsx`. Event listeners must be managed carefully to avoid memory leaks or "stuck" states.
-   **Episode Session Integrity**: If an episode lacks `podcastFeedUrl`, do not create a playback session. Route to the show page or display a friendly error instead.

## 8. Refactoring & Maintenance

-   **Standardize**: When touching legacy code, refactor `localStorage` calls to use `src/libs/storage.ts` and ID generation to `src/libs/id.ts`.
-   **Helpers**: Prefer creating/using shared hooks (`useOnClickOutside`, `useEventListener`) over repeating boilerplate.
-   **Behavioral Parity**: Refactors must preserve existing visual/interaction behavior (hover effects, button positions, image quality) unless explicitly requested and documented.
-   **Documentation**: Update the `docs/handoff_doc.md` file after every meaningful change. This is non-negotiable.

---
*Generated based on project documentation and codebase analysis on January 11, 2026.*
