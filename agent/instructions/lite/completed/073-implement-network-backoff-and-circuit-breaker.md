> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/coding-standards/data-fetching.mdx` before starting.

# Task: Network Backoff & Circuit Breaker

## Objective
Protect the application and external proxies from "retry storms" by implementing exponential backoff and circuit breaker patterns.

## 1. Exponential Backoff
- **Target**: `apps/lite/src/lib/fetchUtils.ts`.
- **Implementation**: Add a retry utility with increasing delays (e.g. 1s, 2s, 4s, 8s) and jitter.
- **Condition**: Only retry on 5xx errors. **DO NOT** retry on 4xx, network disconnects (TypeError/CORS), or timeouts for the current source; instead, trigger immediate fallback to the next available source.
- **Abort**: If the `AbortSignal` is aborted, cancel any backoff sleep and exit immediately.
- **Cap**: Max 3 retries total per eligible error.

## 2. Circuit Breaker
- **Logic**: If 5 consecutive requests to a specific proxy fail, "trip" the circuit for 30 seconds.
- **Behavior**: During the "tripped" state, all requests should fail immediately (or switch to the next proxy if using failover from 062).
- **Scope**: Track state per proxy URL; reset on the first successful response.

## 3. Verification
- **Test**: Mock a proxy returning 500.
- **Check**: Verify the logs show increasing delays between attempts and finally a circuit-trip error.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/coding-standards/logic-flow.mdx` (Resilience patterns).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Patch Additions (Integrated)
# Patch: 073-implement-network-backoff-and-circuit-breaker

## Why
Content-level normalization to align with Leadership requirements and prevent execution drift.

## Global Additions
- Add Scope Scan (config, persistence, routing, logging, network, storage, UI state, tests).
- Add Hidden Risk Sweep for async control flow and hot-path performance.
- Add State Transition Integrity check.
- Add Dynamic Context Consistency check for locale/theme/timezone/permissions.
- Add Impact Checklist: affected modules, regression risks, required verification.
- Add Forbidden Dependencies / Required Patterns when touching architecture or cross-module refactors.

## Task-Specific Additions
- Define max retry window + reset conditions.
