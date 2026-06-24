# Readio Role Router

Use this router to select the smallest sufficient role set for a task. All roles must first follow `agent/role-prompt/common-protocol.md`.

## Core Flow
- **Top** (`top-role.md`): Owns orchestration, scope decisions, role dispatch, conflict resolution, architectural direction, and final leadership judgment. Does not implement product code.
- **Business Analyst** (`business-analyst-role.md`): Converts user intent into roadmap-aware requirements, backlog updates, and atomic implementation instructions.
- **Worker** (`worker-role.md`): Implements approved instructions, runs local verification, updates tactical docs, and marks instruction completion.
- **Reviewer** (`reviewer-role.md`): Performs final gatekeeping across implementation completeness, docs, architecture, contracts, performance, security evidence, and verification.

## Specialty Roles
- **API Contract Guardian** (`api-contract-role.md`): Use for route params, runtime config, provider payloads, DTOs, local persistence schemas, backend rows, and fixture contract changes.
- **QA / Test Engineer** (`qa-role.md`): Use for test strategy, regression design, fixture quality, async behavior, edge cases, and verification command selection.
- **Documentation / SSOT Steward** (`documentation-steward-role.md`): Use for docs rewrites, path drift, source-of-truth mapping, current-state/first-release wording, role prompt hygiene, decision logs, and bilingual doc alignment.
- **Platform / SRE** (`platform-role.md`): Use for CI, build, deploy, runtime env, health checks, observability, rollback, and operator workflows.
- **Security Reviewer** (`security-role.md`): Use for secrets, auth, trust boundaries, abuse paths, logging redaction, browser/server credential ownership, and supply-chain risk.
- **Performance / Resource Reviewer** (`performance-role.md`): Use for hot paths, render churn, caching, object URLs, memory, storage growth, network cost, and long-session stability.
- **DBA** (`dba-role.md`): Use for SQLite/backend schema, migrations, indexes, query plans, persistence invariants, bootstrap semantics, and data retention.
- **UI Designer** (`ui-designer-role.md`): Use for interaction contracts, accessibility, layout, responsive behavior, design-system usage, and UI documentation.
- **Refactor Specialist** (`refactor-role.md`): Use for behavior-preserving cleanup, module boundaries, duplication removal, naming, and dead-code cleanup.

## Default Dispatch
1. Top decides scope, role set, and whether the task needs an instruction.
2. BA drafts or refines requirements when work is not already concrete.
3. Specialty roles review the risky surfaces before implementation.
4. Worker implements.
5. QA and relevant specialty roles verify changed-zone behavior.
6. Security reviews when trust boundaries, secrets, external inputs, or deployment surfaces changed.
7. Reviewer gives final approve/reject.
8. Top resolves unresolved conflicts or user-level tradeoffs.

## Common Pairings
- Docs restructure: Documentation Steward + Reviewer.
- Runtime config or env: Platform + Security + API Contract + QA.
- ASR/provider changes: API Contract + Security + QA + Performance when media flow changes.
- UI interaction: UI Designer + QA + Performance.
- CI/deploy: Platform + Documentation Steward + Reviewer.
- Persistence or schema: DBA + API Contract + QA.
- Large cleanup: Refactor + API Contract + QA + Reviewer.

## Escalation
- Escalate to Top when roles disagree on scope, roadmap priority, architecture boundary, breaking-change tolerance, or user-visible tradeoffs.
- Ask the user when a decision changes product direction, external compatibility, production deployment risk, or cross-platform strategy.
