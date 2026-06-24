# Readio Common Role Protocol

All Readio roles must follow this protocol before applying role-specific rules.

## Read Order
- Read the user request, the assigned instruction if any, and only the task-relevant docs under `apps/docs/content/docs/`.
- For role selection, read `agent/role-prompt/role-router.md`.
- For implementation tasks, read the current code paths before proposing or changing behavior.
- For doc or instruction work, verify referenced paths, commands, env vars, routes, config keys, and package names against the repository.

## Documentation Rules
- Use repo-relative paths for in-repo files. Do not write local absolute filesystem paths.
- Write steady-state docs: describe what the system is and how it works now. Put migration history only in explicit audit/history/rationale docs.
- If a touched docs file has a `.zh.mdx` counterpart, keep both synchronized.
- Keep `apps/docs/content/docs/apps/cloud/handoff/index.mdx` as a map/status entry point. Put implementation detail in the specific sub-doc.
- If a change alters durable product direction, architecture, workflow policy, deployment topology, security posture, or rule docs, require a matching decision-log entry unless the instruction explicitly waives it.

## Instruction Lifecycle
- This section applies when a task explicitly uses instruction files. Ordinary code, docs, review, and prompt-maintenance tasks follow the user request, task-relevant docs, and the applicable role prompt.
- Instructions live under `agent/instructions/cloud/basic/` unless a task explicitly targets another instruction area.
- Each executable instruction must be atomic, reviewable in one pass, and include scope, required changes, forbidden dependencies or required patterns, acceptance criteria, tests, verification commands, `Decision Log`, and `Bilingual Sync`.
- Worker marks completion by adding `[COMPLETED]` to the instruction H1 and a `## Completion` section with `Completed by`, `Commands`, and `Date`.
- Reviewer approval requires adding `Reviewed by` to the completion section.
- An instruction is officially done only when both `[COMPLETED]` and `Reviewed by` exist.
- For instruction-driven roadmap changes, Worker updates `technical-roadmap.mdx` only after Reviewer approval.

## Quality Bar
- Do not accept "good enough" framing when a robust, best-practice implementation is feasible in scope.
- Prefer existing project patterns, documented primitives, and structured schemas over ad hoc alternatives.
- Do not preserve legacy fields, aliases, routes, payloads, or compatibility layers unless the current product contract still owns them.
- If replacing a system or pattern, require negative verification that the old pattern is gone where in scope.

## Verification
- Evidence comes before completion claims.
- Follow instruction-specified verification commands.
- If no command is specified, default to relevant scoped checks; for broad implementation work use root `pnpm lint` and `pnpm typecheck`.
- Run build only at phase boundaries or when the task changes build/deploy behavior.
- Verification reports must include commands run, pass/fail status, and residual risk.

## Coordination
- Preserve concurrent edits. Re-read files before editing and merge with existing user or agent changes.
- If requirements conflict with code reality, docs, roadmap sequence, or role authority, stop and escalate to Top.
- If the same execution attempt fails twice for the same reason, stop repeating and refine the instruction or architecture.

## Skills
- Check relevant local skills before substantial planning, implementation, testing, security, documentation, deployment, or prompt work.
- Apply only the skill files needed for the task. Do not load unrelated references.
