# Readio Project Audit Report
**Date:** Tuesday, April 28, 2026
**Auditors:** Main Agent (Leadership), Security Sub-agent, Architecture Sub-agent, BA Sub-agent.

## 1. Executive Summary
The Readio project demonstrates a high level of engineering discipline with robust backend services and a sophisticated frontend. However, the audit identified a critical structural breakdown in the monorepo, significant technical debt in frontend component architecture, and a few high-priority security and documentation misalignments.

---

## 2. Structural & Architectural Issues

### 2.1 Monorepo Corruption (Missing `@readio/core`)
- **Finding:** The project structure is inconsistent. Root scripts (e.g., `package.json`'s `typecheck`) reference `@readio/core`, but this package does not exist in the `apps/` or `packages/` directory (verified via `ls` and `codebase_investigator`).
- **Impact:** This indicates a broken refactor or incomplete migration. Shared logic is currently trapped in `apps/cloud-ui/src/lib` instead of being deduplicated into a core package.
- **Severity:** High (Architectural)

### 2.2 "God Components" & Bloated Stores
- **Finding:** Several frontend components are monolithic and handle too many responsibilities. 
    - `PlayerSurfaceFrame.tsx` and `ReadingContent.tsx` exceed recommended size/complexity limits.
    - `playerStore.ts` (26KB) is overloaded with unrelated playback and discovery state.
- **Finding:** While atomic selectors are generally used, components like `GlobalAudioController` have excessive store subscriptions (10+), increasing the risk of render thrashing.
- **Severity:** Medium (Maintainability)

### 2.3 TanStack Router Bypass
- **Finding:** `__root.tsx` uses a custom `readio:navigate` window event to trigger navigation, effectively bypassing the type-safe routing contract of TanStack Router.
- **Severity:** Medium (Technical Debt)

---

## 3. Security & Abuse Risks

### 3.1 Stored XSS in `stripHtml`
- **Location:** `apps/cloud-ui/src/lib/htmlUtils.ts`
- **Vulnerability:** The `stripHtml` function uses `tmp.innerHTML = processedHtml` without prior sanitization. While `innerHTML` doesn't execute `<script>` tags, it will execute inline event handlers (e.g., `onerror`) from untrusted RSS/Media descriptions.
- **Severity:** **P1 (High)**

### 3.2 Browser-Visible Proxy Credentials
- **Location:** `apps/cloud-api/browser-env-allowlist.json`
- **Observation:** `READIO_NETWORK_PROXY_AUTH_VALUE` is exposed to the browser. While documentation claims this is "not a secret boundary" and intended for JS proxy calls, exposing authentication values in the browser runtime increases the risk of credential reuse and proxy abuse.
- **Severity:** P2 (Information Disclosure)

### 3.3 Proxy Abuse Potential
- **Location:** `apps/cloud-api/asr_relay.go` and `proxy.go`
- **Observation:** Large `Range` requests or repeated large media relays could be used to consume server bandwidth/CPU if rate limits are not strictly tuned for these high-throughput endpoints.
- **Severity:** P3 (Abuse)

---

## 4. Documentation & Logic Drift

### 4.1 Roadmap vs. Implementation Discrepancy
- **Finding:** `technical-roadmap.mdx` (Phase 10) claims that `BOOTSTRAP_TIMEOUT_MS` was extended to **10s** for resilience.
- **Reality:** `apps/cloud-ui/src/hooks/useAudioProxyFallback.ts` uses `AUDIO_DIRECT_FAILOVER_TIMEOUT_MS` hardcoded to **3000ms (3s)**. The `BOOTSTRAP_TIMEOUT_MS` constant is missing from the codebase.
- **Severity:** Medium (Documentation Drift)

### 4.2 Orphaned App Placeholder
- **Finding:** `apps/native` is an empty directory with only a `.gitkeep`. It should be removed or clearly marked as "Future" to avoid confusion.
- **Severity:** Low (Hygiene)

---

## 5. History & Churn Analysis

### 5.1 High Churn Modules
- **Modules:** `remoteTranscript.ts`, `dexieDb.ts`, `discovery.go`, and `main.go` show the highest frequency of changes and refactors.
- **Observation:** Recent commits indicate a heavy focus on stabilizing the audio fallback watchdog (`useAudioProxyFallback.ts`) and discovery enrichment logic.
- **Risk:** High churn in `dexieDb.ts` suggests the local-first schema is still volatile, which may lead to data migration issues if not handled with stable Zod schemas.

---

## 6. Recommendations

1.  **Monorepo Restoration:** Immediately initialize/restore `packages/core` and migrate shared logic (Dexie schemas, Zod DTOs, fetch utilities) from `apps/cloud-ui/src/lib`.
2.  **Security Hotfix:** Update `stripHtml` in `htmlUtils.ts` to use `DOMPurify` (which is already a dependency) before setting `innerHTML`.
3.  **Timeout Sync:** Update `AUDIO_DIRECT_FAILOVER_TIMEOUT_MS` to 10s as per the roadmap or reconcile the documentation.
4.  **Component Refactoring:** Break down `PlayerSurfaceFrame.tsx` into smaller sub-components (PlayerControls, ProgressBar, MetadataDisplay, etc.).
5.  **Router Hardening:** Replace manual window events for navigation with TanStack Router's `useNavigate` or `Link` components.

---
*Report generated by Gemini CLI Audit Suite.*
