# Instruction 023a: Cloud Backend SQLite + Goose Foundation [COMPLETED]

Discuss and approve this document before implementation.

This document is the infrastructure prerequisite for later Cloud work such as:
- user/account persistence
- feed/RSS snapshot storage
- built-in Cloudflare ASR

It is intentionally broader than one feature.

## 1. Purpose

Cloud backend is no longer a pure stateless relay. It now needs a shared persistence foundation that can safely support:
- mutable runtime policy
- bounded backend-owned caches/snapshots
- request/accounting ledgers
- backend-owned file artifacts indexed by SQLite

This document defines that foundation.

## 2. Decisions

- Use SQLite as the first backend persistence layer for Cloud.
- Use `goose` for schema creation and evolution.
- Store migrations as versioned SQL files under `apps/cloud-api/migrations/`.
- Apply migrations automatically during `cloud-api` startup, before serving requests.
- Treat migration failure as a startup blocker.
- Use the same migration path in local development, tests, and production.
- Keep SQLite for structured metadata and ledgers.
- Keep large backend-owned file payloads on disk, not inline in SQLite.

## 3. Shared Data Contract

Cloud backend runtime data must live outside release directories.

Rule:
- anything that must survive deploys/restarts belongs under persistent backend-owned storage, not under ephemeral release-local directories
- `023a` does not define a universal absolute path layout
- concrete deployment topology belongs in deployment docs and deploy automation, not in this foundation instruction

Reference deployment examples may place:
- the SQLite database at a persistent path such as `/opt/readio/shared/data/readio.db`
- backend-owned filesystem artifacts under sibling persistent directories

Those are reference deployment shapes, not universal platform invariants.

Shared data root rule:
- `READIO_CLOUD_DB_PATH` is required; `023a` does not permit a release-local fallback database path
- `READIO_CLOUD_DB_PATH` must be configured as an absolute path
- the default shared data root is derived from the parent directory of `READIO_CLOUD_DB_PATH`
- later work may introduce a dedicated override env for the shared data root or feature-specific artifact roots
- unless and until such an override is explicitly introduced, features should treat the parent directory of `READIO_CLOUD_DB_PATH` as the authoritative shared data root

Feature artifact namespace rule:
- feature-owned filesystem artifacts must live under stable feature-specific subdirectories inside the shared data root
- do not place multiple unrelated artifact families directly at the shared data root
- example: podcast transcript assets live under `podcast/transcripts/`

## 4. SQLite vs Filesystem Split

SQLite should own:
- structured metadata
- request/accounting ledgers
- mutable operator policy
- cache/snapshot indexes
- file-artifact pointers and integrity metadata

Filesystem should own:
- large transcript/subtitle payloads
- other future large backend-owned artifacts

Do not:
- store raw XML snapshots if a parsed snapshot is enough
- store large transcript bodies inline in SQLite
- store raw audio payloads

Artifact path rule:
- SQLite should store relative artifact paths only
- authoritative absolute paths are derived at runtime from the configured data root / artifact root
- do not persist machine-specific absolute filesystem paths as canonical metadata

## 5. Migration Contract

Required migration rules:
- versioned SQL migrations are the required schema path
- filenames are ordered and immutable once shipped
- prefer additive changes
- fix bad shipped migrations with new forward migrations
- do not rely on runtime down-migration behavior
- any exception to the versioned-SQL + goose path requires a separate explicitly approved foundation-level instruction

Recommended layout:

```text
apps/cloud-api/
  migrations/
    0001_*.sql
    0002_*.sql
    ...
```

## 6. Startup Execution Contract

Startup order must be:
1. open SQLite
2. perform an initial connectivity ping
3. apply required SQLite pragmas
4. run pending goose migrations
5. continue repository/bootstrap/server setup

Request handlers must not start before migration completion.

Directory bootstrap responsibility:
- deployer is responsible for pre-creating the parent directory of `READIO_CLOUD_DB_PATH`
- if the parent directory of `READIO_CLOUD_DB_PATH` is missing at startup, `cloud-api` must fail fast rather than silently creating it
- feature-specific artifact subdirectories may be created later by the owning feature implementation when needed
- this split is intentional:
  - deployment automation owns preparation of the base persistent directory contract
  - feature implementations may create their own stable subdirectories inside that already-prepared persistent area

## 7. Empty-DB Bootstrap Rules

Schema bootstrap is automatic.
Feature enablement is not.

Meaning:
- an empty DB with schema present is valid
- startup may materialize schema only by applying goose migrations
- startup must not create tables/indexes through ad hoc feature-local DDL
- startup must not silently seed feature rows unless a feature contract explicitly says so
- feature code must handle empty-table bootstrap states

Migration failure and restart rule:
- if a required migration fails, startup must fail closed and the service must not serve requests
- after a failed startup, the next startup should retry pending migrations through goose
- do not add bespoke recovery logic outside the migration tool
- migrations must be written to be transaction-friendly and restart-safe whenever the engine supports that pattern

## 8. Timestamp Contract

All persisted timestamps must represent UTC instants.

Rules:
- backend writes timestamps in an explicit UTC format
- preferred serialized shape is RFC3339 / RFC3339Nano with `Z`
- backend reads persisted timestamps as UTC instants
- frontend owns presentation-time timezone conversion

Do not:
- persist ambiguous local-time values
- mix timezone-bearing business display logic into backend persistence
- rely on machine-local timezone interpretation when reading persisted timestamps

## 9. SQLite Pragma Baseline

The first platform-level SQLite baseline for Cloud backend is:

- `PRAGMA foreign_keys = ON`
- `PRAGMA journal_mode = WAL`
- `PRAGMA busy_timeout = 5000`
- `PRAGMA synchronous = NORMAL`

Why this baseline:
- foreign-key enforcement should not depend on feature-local setup
- WAL is the preferred read/write mode for the current single-host service shape
- a bounded busy timeout is better than immediate lock-failure churn
- `NORMAL` is the current default durability/performance balance for Cloud's workload

Other pragma tuning is intentionally out of scope for the first foundation contract and should be introduced later only with workload-specific justification.

Pragma enforcement model:
- implementations must make pragma behavior consistent for both migration-time and runtime database use
- it is not enough to configure pragmas on a one-off migration connection if later runtime work may execute through differently configured connections
- the implementation must choose one explicit model and apply it consistently:
  - either a single long-lived configured SQLite handle for runtime work
  - or a per-connection initialization path that guarantees required pragmas are set on every runtime connection before use
- `023a` keeps a single runtime `*sql.DB` with one open SQLite connection, and also encodes `foreign_keys`, `busy_timeout`, and `synchronous` in the DSN so any later connection inherits the same baseline; `journal_mode=WAL` is established in the ordered startup path before migrations
- verification must cover the actual runtime connection model, not only initial startup wiring

## 10. Cross-Feature Governance Rules

All Cloud backend features that persist state must follow the same rules:
- no ad hoc `CREATE TABLE IF NOT EXISTS` in feature code
- no test-only schema path that production never runs
- no release-local runtime data
- no mixing large artifact bodies into structured ledger tables
- every feature must define retention ownership and cleanup responsibility
- every feature must define authoritative vs derived state explicitly

Schema design boundary:
- `023a` defines cross-feature principles only
- concrete primary keys, unique constraints, and foreign-key layouts belong in the feature-specific schema documents
- no feature should skip that design step and jump directly to migrations

This applies to:
- feed snapshot storage
- built-in ASR policy/usage
- shared transcript assets
- future user/account state

## 11. Implementation Expectations

Any feature built on this foundation should explicitly state:
- what is authoritative in SQLite
- what is only derived/cache state
- what large payloads live on disk instead
- what migration(s) introduce the schema

Required delivery order for new persistence features:
1. schema contract / design instruction
2. migration plan
3. implementation

Do not let implementation lead the schema contract.

## 12. Scope Boundary For `023a`

`023a` is infrastructure-only.

It should include:
- goose integration
- startup migration execution
- SQLite pragma baseline
- shared data root derivation rules
- platform-level empty-DB/bootstrap rules

It should **not** include:
- feature-specific transcript asset tables
- feature-specific feed snapshot tables
- built-in ASR product routing or quota UX
- feature-local filesystem artifact logic beyond the platform contract
- user/account feature schema

Feature-specific schema and product behavior belong in the later companion instructions, not in `023a`.

## 13. Verification

At minimum, the foundation implementation should prove:
- empty SQLite applies all migrations successfully
- rerunning startup on an already migrated DB is idempotent
- migration failure blocks startup
- restart after a failed or partial migration attempt retries safely through goose
- tests and production use the same migration source of truth
- configured SQLite pragmas are actually applied on opened connections

Pre-production rollout rule:
- production rollout must be preceded by a pre-production migration rehearsal
- that rehearsal should use the same startup migration path, deployment layout shape, and SQLite/goose wiring as production
- production should not be the first environment where a new migration set is exercised

## 14. Return

Implementation following this document should report:
1. goose integration points
2. migration directory path
3. startup migration hook location
4. shared data root assumptions
5. verification results

## Completion

- Completed by: Codex
- Goose integration points:
  - embedded SQL migrations via `//go:embed migrations/*.sql`
  - startup migration runner in `apps/cloud-api/main.go`
- Migration directory path:
  - `apps/cloud-api/migrations/`
- Startup migration hook location:
  - `runCloudServer -> cloudOpenSQLite -> runCloudSQLiteMigrations`
- Shared data root assumptions:
  - `READIO_CLOUD_DB_PATH` is required and absolute
  - deployer pre-creates the parent directory
  - later features derive their shared data root from the database file's parent directory unless a dedicated artifact root is introduced
- Verification results:
  - `resolveCloudDBPath` requires an explicit absolute path
  - startup fails fast when the SQLite parent directory is missing
  - `foreign_keys`, `busy_timeout`, and `synchronous` are asserted on opened SQLite connections
  - `journal_mode=WAL` is established before migrations
  - goose migrations create `goose_db_version`, rerun idempotently, and retry safely after a failed migration set on restart
  - migration failure blocks request serving
- Commands run:
  - `gofmt -w main.go main_test.go`
  - `go test ./...`
  - `git diff --check -- apps/cloud-api/main.go apps/cloud-api/main_test.go apps/cloud-api/go.mod apps/cloud-api/go.sum apps/docs/content/docs/apps/cloud/handoff/backend-sqlite-governance.mdx apps/docs/content/docs/apps/cloud/handoff/backend-sqlite-governance.zh.mdx apps/docs/content/docs/apps/cloud/deployment.mdx apps/docs/content/docs/apps/cloud/deployment.zh.mdx agent/instructions/cloud/023a-cloud-backend-sqlite-goose-foundation.md`
- Date: 2026-04-29
