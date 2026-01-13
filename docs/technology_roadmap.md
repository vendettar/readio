# Readio Technical Roadmap

> Updated: 2025-12-23

---

## 1. Overall Direction

```
Phase 1: Pure Static Deployment (Current → Near-term)
├── React + TypeScript + Vite
├── TanStack Router + File-Based Routing (Vite Plugin)
├── Tailwind + shadcn/ui (Standard UI tokens)
├── Radix UI (Common accessible components: Modal/Toast/Tooltip)
├── i18n (Lightweight: `t(key)` + `translations`; no i18next for now)
├── Zustand + IndexedDB (Dexie for persistence + localStorage for light caching)
└── TanStack Query (Network caching/Deduplication/Invalidation strategy)

Phase 2: Spring Boot Backend (Future)
├── User Authentication (Login/Register)
├── Data Synchronization (Favorites/Subscriptions/Progress)
├── Self-hosted CORS Proxy
└── Comment System
```

---

## 2. Technical Decisions

### 2.1 UI Framework Layers

| Area | Solution | Rationale |
|------|-----------|-----------|
| Modals/Toast/Tooltip | Radix UI | Built-in focus management, keyboard interaction, and A11y; reduces risk in custom popups/input locking. |
| Settings/Forms/Gallery | Tailwind + shadcn/ui | Rapid iteration, unified visual style. |
| **Transcript View** | Tailwind + minimal "Interaction CSS" | Requirement: **Every word must remain visible (multi-line; no truncation)**; requires dynamic height virtual list (e.g. `react-virtuoso`). Small CSS additions for `::highlight` and scrolling details. |
| **Player Controls** | Tailwind + minimal "Interaction CSS" | Precise range/slider styling and browser compatibility (e.g. `appearance`) are difficult with pure Tailwind. |
| **Lookup Popups** | Tailwind + minimal "Interaction CSS" | Floating positioning, overlay layers, and text selection details may require small CSS snippets (tokens still from Design System). |

#### 2.1.1 Boundaries for "Interaction-Only CSS"

Goal: **Standard UI (layout/spacing/vont/color/shadow/radius) must use Tailwind + shadcn/ui.** Only minimal "Interaction Details" not easily expressed in Tailwind are allowed as CSS.

Allowed CSS Scenarios:
- `::highlight` / Selection-related highlights (e.g., caption lookup highlights).
- "Constraint styles" for virtual lists (Ensuring multi-line visibility without truncation).
- Browser-specific overrides for Range/Sliders (Volume/Progress bars).
- Complex pseudo-elements (Gradient masks, fine-grained pointer-events).

Hard Constraints (Design System Consistency):
- CSS must refer only to Design System tokens (Tailwind theme or CSS variables). No "one-off" colors/fonts.
- CSS must be localized: Prefer `@layer components` or local CSS Modules per `docs/design_system.md`.
- No styling of "standard UI" in global CSS; any new CSS must justify why Tailwind was insufficient.

### 2.2 State & Data Layer

| Responsibility | Solution | Replacing Existing Code |
|----------------|----------|-------------------------|
| Global State | Zustand | ✅ Maintain current usage |
| Network/Caching | TanStack Query | Unified caching/invalidation/retry/deduplication. |
| Persistence | IndexedDB | Replace custom wrapper with Dexie. |
| Config/Small Cache | localStorage | ✅ Maintain current usage |

#### 2.2.1 Dexie Testing Strategy (Single-Version Policy)

Current Phase (Initial Development; Clearable Data):
- **No data migration protection tests required.**
- Use a single schema version only; schema changes should reset local data.
- `src/libs/__tests__/dbMigration.test.ts` should focus on:
  - Successful Dexie DB initialization (schema/stores).
  - Basic CRUD (Create/Read/Update/Delete) functionality.

### 2.3 Routing & i18n

| Capability | Solution | Note |
|------------|----------|------|
| Routing | TanStack Router (File-Based) | Integrated early to define pages as routes rather than simple state toggles. |
| i18n | Lightweight `t(key)` pattern | Standardized usage: No hardcoded user-facing strings; no i18next needed until advanced formatting/collaboration is required. |

Routing Principles (UX Baseline):
- **Persistent Player**: The player (including `<audio>` and state components) is hoisted to `__root.tsx` (Global layout) to ensure **playback is never interrupted** when navigating between routes like `/explore` or `/files`.

### 2.4 Large Lists

| Scenario | Solution |
|----------|----------|
| Captions (Multi-line requirement) | **react-virtuoso (Dynamic height, Required)** |
| Fixed height lists (Optional) | react-window (FixedSizeList) |

---

## 3. Conclusions on Next.js / SSR

### 3.0 What is SSR?

**SSR (Server-Side Rendering) = The server renders React components into HTML before sending them to the browser.**

| Mode | Flow | Load Speed | SEO |
|------|------|------------|-----|
| SPA (Current Vite) | Empty HTML → Browser loads JS → JS renders UI | Slower | ❌ Crawlers see empty page |
| SSR (Next.js) | Server runs React → Full HTML sent → Browser displays immediately | Fast | ✅ Crawlers see full content |

**SSR use cases**:
- SEO: Indexing public content for search engines.
- Social Sharing: Preview cards (Title/Image) for links shared on social media.
- First Paint Speed: Users see content before JS downloads.

**Non-SSR use cases**:
- High-interaction apps (Players, Editors, Games) — Interaction requires JS regardless.
- Private user data (History/Settings) — No SEO requirement.
- Real-time dynamic content — Server rendering adds latency.

### 3.1 Functional Needs vs. SSR Value

| Feature | SSR Value? | Why? |
|---------|------------|------|
| Login/Register | ❌ No | Pure interaction, no SEO need. |
| Favorites/Library | ❌ No | Private data, not indexed. |
| Player/Captions | ❌ No | Pure client-side interaction. |
| Comments | ⚠️ Situational | Required only if comments need SEO. |
| Public Podcast Pages | ⚠️ Situational | Required for social sharing previews. |

### 3.2 Architectural Comparison

#### Option A: Vite SPA + Spring Boot API (Recommended)

```
┌─────────────┐     ┌─────────────────┐
│  Vite SPA   │────▶│  Spring Boot    │
│  (Static)   │     │  (REST API)     │
└─────────────┘     └─────────────────┘
```

- ✅ Simple architecture, single backend.
- ✅ Frontend deployable to CDN.
- ❌ No SSR for public pages (no social previews).

#### Option B: Next.js + Spring Boot API

```
┌─────────────┐     ┌─────────────────┐
│  Next.js    │────▶│  Spring Boot    │
│  (Node Srv) │     │  (REST API)     │
└─────────────┘     └─────────────────┘
```

- ✅ Public pages can have SSR.
- ❌ Two servers to maintain.
- ❌ Most pages remain `'use client'`.

### 3.3 Decision

| Condition | Recommended Solution |
|-----------|----------------------|
| No SEO/Social sharing needed | ✅ **Vite SPA + Spring Boot** |
| SEO required for public pages | ⚠️ Next.js + Spring Boot (SSR for select pages) |
| Simplify maintenance | 🔄 Next.js Fullstack (Drop Spring Boot) |

**Current Path**: Vite SPA + Spring Boot; No Next.js SSR.

---

## 4. Migration Path

### Phase 1: High Reward / Low Effort

- [x] TanStack Router (Define route structure and page boundaries).
- [x] Persistent Player in `__root.tsx` (Uninterrupted playback).
- [x] Lightweight i18n implementation (Standardize `t(key)` entry).
- [x] Update `dbMigration.test.ts` (CRUD basics only).
- [x] App Shell & Immersion mode (Sidebar / MiniPlayer / FullPlayer).
- [x] TanStack Query (Caching for Gallery/Explore/Dictionary).
- [x] Radix Toast (Replace custom Toast for A11y).
- [x] Radix Tooltip (Replace hand-rolled hover logic).
- [ ] Radix Dialog/Popover for general modals (Wait for specific UI needs).

### Phase 2: Core Refactor

- [x] react-virtuoso for Captions (Multi-line visibility).
- [x] Tailwind + shadcn/ui for Gallery/Settings UI.
- [x] Cleanup Legacy Styles: Deconstruct `original.css` into Tailwind + minimal "Interaction CSS".

### Phase 3: Backend Integration

- [ ] Spring Boot API Setup.
- [ ] User Authentication.
- [ ] Data Sync (Progress/Subscriptions).
- [ ] Self-hosted CORS Proxy.
- [ ] (Post-launch) Enable Dexie migration protection tests.

---

## 5. Maintained Core Implementations

Some modules are kept custom due to unique interaction requirements:

| Module | File | Rationale |
|--------|------|-----------|
| Transcript Virtual List | `TranscriptView.tsx` | Core logic for Following/Highlighting; styling migrated to Tailwind where possible. |
| Lookup / Selection | `useSelection.ts` | Complex DOM measurement and highlighted cache logic. |
| Player Controls | `FloatingPanel.tsx` | Custom state machine and drag/hotkey logic. |
| Network Fallback | `fetchUtils.ts` | Specific Direct → Proxy fallback logic. |
