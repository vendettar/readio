# Instruction 023d: Built-In ASR SQLite Migration Delivery Plan

Execute this document as the migration-delivery companion to `023` and `023c`.

It does **not** replace:
- `023-cloudflare-asr-readio.md` for product and API behavior
- `023b-cloudflare-asr-ops-governance-plan.md` for future subject governance
- `023c-cloudflare-asr-sqlite-schema-plan.md` for table and index design

This document exists to pin down **how** the SQLite schema is created and evolved in `apps/cloud-api`.

## 1. Decision

- **Decision**: Use `goose` as the migration mechanism for Cloud built-in ASR schema changes.
- **Decision**: Store migrations as versioned SQL files under a dedicated `migrations/` directory in `apps/cloud-api`.
- **Decision**: Apply migrations automatically during `cloud-api` startup, immediately after SQLite is opened and pragmas are configured, before request-serving begins.
- **Decision**: Treat migration failure as a startup blocker. The service must fail fast instead of serving with a partially initialized schema.
- **Decision**: Prefer forward-only additive migrations. Do not make runtime startup depend on destructive down-migration behavior.

## 2. Why This Approach

This repository currently looks like:
- single Go service
- SQLite
- no existing Flyway / goose / golang-migrate migration system
- a narrow first-phase schema footprint for built-in ASR

For this shape, `goose` is the most pragmatic choice:
- lighter than Flyway
- more standard than a one-off handwritten runner
- native fit for Go services
- SQL-first, which keeps schema review explicit

`Flyway` is intentionally not the chosen default here because it adds more toolchain and operational weight than this repo currently needs.

## 3. Scope

`023d` covers:
- migration tool choice
- migration file layout
- startup execution contract
- failure semantics
- local/test/prod consistency expectations

`023d` does **not** redefine:
- table shapes from `023c`
- ASR product semantics from `023`
- future per-subject schema from `023b`

## 4. Required Layout

Recommended backend layout:

```text
apps/cloud-api/
  migrations/
    0001_create_asr_builtin_quota_config.sql
    0002_create_asr_builtin_usage_requests.sql
    0003_create_asr_builtin_usage_indexes.sql
  ...
```

Required rules:
- migration filenames must be ordered and immutable once shipped
- use SQL migrations as the default, not Go-coded migrations
- one migration should represent one coherent schema step
- migration files must be committed with the application code that depends on them

## 5. Migration Authoring Contract

### 5.1 Style

- Prefer plain SQL files checked into the repo.
- Prefer additive changes.
- Keep each migration narrow and reviewable.
- Avoid mixing unrelated table/index changes into one migration.

### 5.2 Allowed Change Types

Preferred in this phase:
- `CREATE TABLE`
- `CREATE INDEX`
- additive `ALTER TABLE`
- backfill statements only when narrowly scoped and deterministic

Avoid in normal forward flow:
- destructive column drops
- table rewrites unless unavoidable
- runtime dependence on down migrations

### 5.3 Rollback Philosophy

- The primary operational path is **roll forward**, not "apply down migration on production startup".
- If a shipped migration is wrong, fix it with a new migration unless there is a compelling reason to restore from backup.
- Down migrations may exist for developer convenience, but the production contract must not rely on them.

## 6. Goose Integration Contract

Implementation should use:
- `github.com/pressly/goose/v3`
- SQL migrations embedded into the binary where practical

Recommended direction:
- use `embed` to bundle `migrations/*.sql`
- configure goose to read from the embedded filesystem
- run migrations from application startup, not via a separate manual deploy-only step

Why embed is preferred here:
- removes dependency on external working-directory correctness
- keeps local, test, and deployed binaries aligned
- avoids “binary updated but migration files missing” drift

## 7. Startup Execution Contract

Migrations must run in this order:

1. open SQLite connection
2. apply required SQLite pragmas
3. run pending goose migrations
4. continue bootstrapping repositories, handlers, and HTTP server

Required startup semantics:
- if no migrations are pending, startup continues normally
- if pending migrations succeed, startup continues normally
- if any migration fails, startup must stop with a clear error
- request handlers must not start before migration completion

This is important because built-in ASR quota enforcement must not run against an ambiguous or partially initialized schema.

## 8. Empty-DB Bootstrap Semantics

`023c` already defines the product/bootstrap rule:
- empty DB + valid built-in env credentials still means built-in ASR is not implicitly enabled

`023d` adds the delivery rule:
- migrations may create the policy table structure on first boot
- migrations must **not** auto-insert an enabled built-in quota row as a side effect
- migrations must **not** auto-seed a disabled policy row either unless a later instruction explicitly changes the bootstrap contract
- if a seed/default row is ever introduced, it must preserve the `disabled / not_configured` bootstrap contract from `023c`

In other words:
- schema bootstrap is automatic
- operator enablement is explicit

## 9. Environment Consistency Contract

Local, test, and deployed environments must use the same migration source of truth.

Required consistency rules:
- do not maintain one schema path for tests and another for production
- do not hand-create tables in test helpers that bypass migrations unless the test is intentionally unit-scoped below the DB layer
- integration-style backend tests should exercise the real migration path

This prevents silent drift between:
- startup schema
- CI schema
- developer local schema

## 10. Testing Expectations

At minimum, implementation should verify:

1. empty SQLite database applies all pending migrations successfully
2. re-running startup on an already migrated DB is idempotent
3. first-phase migrations create the exact tables/indexes required by `023c`
4. migration failure blocks startup
5. empty DB bootstrap still does not auto-enable built-in ASR policy

Recommended additional coverage:
- startup with partially applied historical schema migrates forward correctly
- migration ordering is stable in CI

## 11. Operational Expectations

For the first implementation phase:
- application startup is the canonical migration execution point
- operators should not need a separate manual Flyway-style step
- schema history should be visible through goose's normal bookkeeping table

Do not add extra migration-control surfaces in `/ops` for this phase.

## 12. Future Evolution Boundary

This plan should scale to later work such as:
- `023b` subject-governance tables
- optional audit table addition
- optional daily summary table addition

Those later schema changes should arrive as new versioned migrations, not as edits to historical migration files.

## 13. Do Not

- Do not introduce Flyway for this scope.
- Do not keep schema creation scattered across ad hoc `CREATE TABLE IF NOT EXISTS` calls in unrelated startup code.
- Do not make tests depend on a schema path that production never executes.
- Do not auto-enable built-in quota policy during migration bootstrap.
- Do not rewrite old shipped migration files after they have been used outside a purely local branch.

## 14. Recommended First Migration Set

For the first implementation that follows `023c`, the expected initial migration set is:

1. create `asr_builtin_quota_config`
2. create `asr_builtin_usage_requests`
3. create the required indexes defined in `023c`

If optional future tables are later approved, add them in later numbered migrations rather than front-loading them now.

## 15. Return

Implementation following this document should report:

1. goose integration points added
2. migration files added
3. startup migration path location
4. bootstrap behavior confirmed
5. verification results
