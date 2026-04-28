# Instruction 023b: Built-In ASR Per-User Governance Plan

Execute only after `023` is implemented and reviewed.

This instruction is intentionally a **planning/design instruction**, not an immediate coding instruction. The goal is to define how Cloud should evolve from a global built-in ASR daily quota to finer-grained per-user governance without pretending that current Cloud already has a trustworthy user identity layer.

## 1. Why This Is Split Out

Current Cloud handoff docs still say the product is not yet a full multi-user SaaS/auth system. That means "per-user usage", "per-user cap", and "whitelist" cannot be implemented robustly unless we first define what a "user" means in Cloud.

`023` covers the production-critical first phase:
- built-in Cloudflare ASR
- global daily quota
- hard stop on exhaustion
- operator-facing usage page

`023b` covers the second-phase governance expansion:
- per-user attribution
- per-user cap
- whitelist / allowlist policy
- operator search/filter by subject

## 2. Planning Scope

Produce a concrete implementation plan for:
- how Cloud identifies a stable ASR subject
- how built-in usage is attributed to that subject
- how per-subject caps interact with the global daily quota
- how whitelist policy should behave
- how operator tooling should expose those controls safely

## 3. Non-Negotiable Boundaries

- Do **not** ship "per-user" enforcement keyed only by IP address.
- Do **not** claim whitelist/cap robustness if the only identifier is a spoofable browser string.
- Do **not** backdoor a full auth system into this instruction.
- Do **not** overload the existing admin token with end-user identity semantics.

## 4. Design Questions That Must Be Answered

### 4.1 Identity Source

Decide which subject identity model is acceptable for Cloud's next phase. Evaluate at least:
- future authenticated account ID
- backend-issued anonymous installation ID persisted in browser storage and signed/validated by backend
- IP/UA only as operator hints, never as the primary identity boundary

The plan must explicitly recommend one primary model and explain why the rejected alternatives are insufficient.

### 4.2 Policy Hierarchy

Define exact precedence for:
- global daily quota
- per-user daily cap
- whitelist bypass
- temporary disable/ban

At minimum, answer:
- Does whitelist bypass the per-user cap only, or both per-user and global quota?
- If a subject is over their cap but global quota remains, what exact error code is returned?
- If global quota is exhausted, can whitelist still pass?

### 4.3 Data Model

Propose a minimal persistence model for:
- subject identity
- subject policy
- subject usage attribution
- policy audit trail if needed

Prefer additive evolution from the `023` usage ledger, not a rewrite.

### 4.4 Operator Surface

Plan the `/ops` additions needed for:
- searching subjects
- seeing recent built-in usage by subject
- setting per-subject caps
- toggling whitelist
- viewing current effective policy

The plan should respect the existing `/ops` admin-token-only contract.

## 5. Recommended Deliverables

The `023b` implementation plan should produce:
1. exact identity recommendation
2. API surface proposal
3. schema/table proposal
4. operator UX proposal
5. migration path from `023`
6. abuse/risk analysis

## 6. Suggested Future API Shape

The final plan may revise this, but it should evaluate endpoints like:
- `GET /admin/asr/subjects`
- `GET /admin/asr/subjects/:id`
- `PUT /admin/asr/subjects/:id/policy`
- `GET /admin/asr/subjects/:id/usage`

This is only a planning seed, not an implementation mandate.

## 7. Verification For The Plan

The plan is complete only if it answers:
- what counts as a user
- why that identity is good enough
- how policy precedence works
- how ops users will inspect and edit policy
- what parts of `023` can be reused directly

## 8. Return

1. recommended identity model
2. rejected identity models and why
3. proposed schema/API additions
4. ops UX plan
5. migration strategy from `023`
