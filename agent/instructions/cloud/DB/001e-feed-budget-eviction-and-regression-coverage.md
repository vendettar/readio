# Instruction 001e: Feed Budget, Eviction, And Regression Coverage

Execute last.

## Goal

Bound the SQLite feed cache by size/priority and close the main regression gaps after the route cutover.

## Scope

- per-feed limits
- global budget
- priority-based eviction
- regression test coverage
- schema evolution for budget-related metadata

## Must

### 1. Per-Feed Limits

Each feed snapshot must obey:

- max episodes per feed
- optional max bytes per feed

If oversized:

- keep newest bounded subset
- mark `is_truncated = 1`

### 2. Global Budget

Add global cache controls such as:

- max feeds
- max total approximate bytes

### 3. Priority

Support feed priority tiers:

- `hot`
- `normal`
- `cold`

### 4. Eviction Policy

When over budget, evict in this order:

1. stale + cold
2. stale + lowest priority + oldest access
3. oldest low-priority entries

Do not evict the row currently being refreshed inside the same transaction.

### 5. Cleanup

Budget enforcement and cleanup should remain simple.

Acceptable:

- opportunistic eviction after writes
- lightweight periodic cleanup if justified

Do not introduce a large always-on feed crawler as part of this instruction.

### 6. Migration Discipline For Budget Evolution

If eviction or budgeting later needs:
- new columns
- new indexes
- new helper tables

those schema changes must be introduced through new versioned migrations. Do not smuggle budget-related DDL into cleanup code or repository startup.

## Tests

1. oversized feeds are clipped correctly
2. total budget enforcement evicts lower-priority data first
3. hot feeds survive eviction longer than cold feeds
4. route/regression coverage still passes for feed request behavior after SQLite cutover
5. any budget-related schema assumptions are satisfied by the same migration path used in production startup

## Return

1. budget knobs
2. eviction order
3. verification results
