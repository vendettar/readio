# Instruction 023d: Built-In ASR Per-User Governance Plan

Discuss and approve this document before implementation.

This is a future planning document, not an immediate implementation instruction.

It should execute only after:
- `023a` foundation is in place
- `023b` transcript asset storage is in place
- `023c` built-in Cloudflare ASR is implemented and reviewed

## 1. Purpose

Current Cloud first needs:
- built-in ASR
- global daily quota
- operator-facing usage governance

Only after that should Cloud evolve toward:
- per-user attribution
- per-user caps
- whitelist / allowlist
- subject search/filter in `/ops`

## 2. Non-Negotiable Boundaries

- Do not implement per-user enforcement keyed only by IP address.
- Do not pretend spoofable browser strings are a real user identity.
- Do not backdoor a full auth system through this instruction.
- Do not overload the admin token with end-user identity semantics.

## 3. Questions This Plan Must Answer

### 3.1 Identity source

Evaluate at least:
- future authenticated account ID
- backend-issued anonymous installation ID
- IP/UA only as operator hints

The plan must recommend one primary model and explain why the others are insufficient.

### 3.2 Policy precedence

Define precedence for:
- global quota
- per-user cap
- whitelist
- temporary disable/ban

The plan must pin the exact returned error/status for each outcome.

### 3.3 Data model

Propose additive schema for:
- subject identity
- subject policy
- subject usage attribution
- optional audit trail

Reuse `023c` request ledger where possible instead of rewriting from scratch.

### 3.4 Ops tooling

Plan `/ops` additions for:
- subject search
- per-subject recent usage
- per-subject policy editing
- current effective policy visibility

## 4. Deliverables

The plan should produce:
1. identity recommendation
2. rejected alternatives and why
3. schema/API additions
4. ops UX plan
5. migration path from `023c`
6. abuse/risk analysis

## 5. Verification For The Plan

The plan is complete only if it answers:
- what counts as a user
- why that identity is strong enough
- how policy precedence works
- how `/ops` users will inspect and edit policy
- how later account binding / reset / rotation behaves

## 6. Return

1. recommended identity model
2. rejected identity models
3. proposed schema/API additions
4. ops UX plan
5. migration strategy
