# Cloud API Contract

`apps/cloud-api` is the active Go backend. It owns runtime configuration, backend relay surfaces, SQLite startup/migrations, observability, and admin endpoints.

## Runtime entry

- Default port is `8080` unless `PORT` is provided.
- `READIO_CLOUD_DB_PATH` is required and must be an absolute SQLite path.
- Startup opens SQLite, applies the platform pragma baseline, enables WAL, runs embedded goose migrations, initializes observability/tracing/log shipping, and shuts down gracefully on interrupt or SIGTERM.

## Public and same-origin routes

- Health route: process health check.
- Config route: browser-safe runtime config allowlist.
- ASR relay and verification routes from `internal/asr`.
- Discovery route prefix from `internal/discovery`.
- Media/network fallback route from `internal/proxy`.
- Admin routes from `internal/admin` must remain protected and should not be exposed publicly without outer restrictions.

## Backend modules

- `internal/discovery`: Apple and PodcastIndex discovery flow, error classification, cache/search integration, and route handlers.
- `internal/podcastindex`: retained PodcastIndex metadata, SQLite cache store, refresh/read services, and snapshot mapping.
- `internal/asr`: provider relay, request validation, provider toggles, limits, and verification/readiness handling.
- `internal/proxy`: bounded pass-through fallback for approved media/network failure classes.
- `internal/transcript`: backend-owned shared podcast transcript asset metadata and filesystem payload ownership.
- `internal/observability` and `internal/loki`: metrics, tracing, host/process signals, and bounded log shipping.

## Persistence rules

- Backend SQLite owns backend-governed metadata only; it is not a generic user library or browser data sync layer.
- PodcastIndex retained snapshots are bounded product windows, not full historical archives.
- Episode-list pagination must read from SQLite once a retained snapshot exists; user pagination must not call upstream providers.
- Direct episode detail lookup is keyed by podcast identity plus episode GUID and does not own snapshot freshness.
- Shared transcript assets store metadata in SQLite and canonical cue payloads as deployment-owned compressed files.

## Runtime config rules

- Browser-visible config is allowlisted; never dump process env to the browser.
- Browser-visible tokens are abuse-control values, not secret boundaries.
- Server-private config stays in server environment/config files and must not be emitted through browser config routes.
