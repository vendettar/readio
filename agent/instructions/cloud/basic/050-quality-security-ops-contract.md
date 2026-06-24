# Quality, Security, and Operations Contract

## Verification commands

Use root workspace scripts unless a task is explicitly scoped:

- `pnpm build`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm --filter @readio/cloud-api vet`

For focused frontend changes, use the matching `@readio/cloud-ui` Vitest or Playwright targets. For focused backend changes, use Go tests under `apps/cloud-api`.

## Security rules

- Treat all public podcast metadata, RSS-derived text, transcript content, and remote artwork URLs as untrusted.
- Sanitize or render untrusted HTML safely before inserting it into the DOM.
- Keep target validation fail-closed for backend fallback routes.
- Never expose provider credentials or server-private config through browser config.
- Keep destructive local-data operations confirmed, auditable in UI tests where practical, and reversible only when an actual restore path exists.

## Performance and reliability

- Keep high-frequency audio and scroll/selection paths away from broad store subscriptions.
- Use atomic selectors and memoized derived data for hot UI paths.
- Bound caches and background work; avoid unbounded full-list ownership in the browser or backend.
- Use request IDs, abort signals, coalescing, or latest-wins guards for async races.
- Preserve graceful degradation for discovery, media fallback, ASR, and observability outages.

## Operations

- Observability is application-owned: request metrics, process/host signals exposed by the app, tracing, and bounded log shipping.
- Admin endpoints must require authentication and should be additionally protected by infrastructure controls in production.
- Logs must avoid private values and include useful fields such as request ID, client IP class, origin/upstream host, status, and error class.

## Documentation lifecycle

- Update `apps/docs/content/docs` when behavior changes.
- Keep `agent/instructions/cloud/basic` concise and final-state oriented.
- Do not preserve superseded steps just for historical completeness; use git history for that.
- Root-level reconstruction summaries should describe what changed and why, but should not become a second source of product truth.
