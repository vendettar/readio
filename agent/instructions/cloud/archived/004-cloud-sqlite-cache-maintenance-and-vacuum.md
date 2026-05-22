---
description: Future plan for Cloud SQLite cache maintenance, PRAGMA optimize, and safe VACUUM strategy after real PI episode cache growth is observed
---

# Archived 004: Cloud SQLite Cache Maintenance And Vacuum

## 1. Status

This is a future instruction. Do not implement automatic VACUUM or incremental vacuum as part of the current PI episode cache cutover.

Current decision:

- keep the current `podcast_shows` / `podcast_episodes` / `podcast_cache_state` table design
- keep cache eviction based on podcast-level removal and approximate byte budget
- do not run `VACUUM` automatically after cache eviction
- revisit SQLite maintenance only after production data shows real DB file growth or query planner degradation

## 2. Why This Exists

SQLite does not necessarily return disk space to the operating system immediately after rows are deleted.

For PI episode cache eviction, this means:

- deleting old podcast snapshots removes rows logically
- SQLite may keep freed pages inside the database file for future reuse
- the `.db` file can remain large even after eviction

This is normal SQLite behavior. It is not data corruption and does not mean eviction failed.

## 3. Risks Of Doing It Too Early

Automatic maintenance can introduce avoidable production risk:

- `VACUUM` rewrites the database file and can be IO-heavy
- running it after every eviction can create latency spikes
- full compaction can compete with normal API reads and refresh writes
- incremental vacuum requires early database-level setup and should not be retrofitted casually

Because the PI episode cache has not yet accumulated real production size, implementing this now would be premature.

## 4. Future Trigger Conditions

Reopen this instruction when at least one of these is true:

- Grafana / disk monitoring shows the Cloud SQLite database growing faster than expected
- eviction removes many podcast snapshots but the database file does not stabilize
- query latency increases after large cache churn
- backup, deploy, or migration time becomes noticeably affected by SQLite file size
- manual inspection shows high unused page count via SQLite pragmas

Useful future diagnostics:

```sql
PRAGMA page_count;
PRAGMA freelist_count;
PRAGMA page_size;
PRAGMA optimize;
```

## 5. Recommended Future Plan

### Phase 1: Low-Risk Planner Maintenance

Add a low-frequency maintenance path that can run:

```sql
PRAGMA optimize;
```

Constraints:

- must not run on every request
- must not run inside hot request handlers
- should run on startup, low-frequency maintenance endpoint, or scheduled maintenance path
- must be observable through logs

### Phase 2: Manual Or Maintenance-Window VACUUM

Only add full compaction if file size becomes a real problem.

Use:

```sql
VACUUM;
```

Constraints:

- must run only from an explicit maintenance operation
- must not run automatically after normal cache eviction
- must log start, end, duration, and failure
- must have a clear operator-facing warning that it can be IO-heavy

### Phase 3: Consider Incremental Vacuum Only For New DB Lifecycle

If long-term production behavior proves that steady incremental reclaim is needed, evaluate:

```sql
PRAGMA auto_vacuum = INCREMENTAL;
PRAGMA incremental_vacuum;
```

Constraints:

- must be designed as a database lifecycle decision, not a small patch
- must account for existing database files
- must include migration / rebuild implications

## 6. Non-Goals

Do not use this future work to:

- split `podcast_episodes` into per-podcast tables
- evict individual episodes across podcasts
- make cache state a permanent archive
- add heavy DDL constraints unrelated to physical database maintenance

The current episode table design is still the expected shape: one `podcast_shows` table, one `podcast_episodes` table, and one cache-state table.

## 7. Definition Of Done For Future Implementation

When this instruction is eventually implemented:

- maintenance is explicit, low-frequency, and observable
- normal API reads do not run heavy compaction
- cache eviction remains podcast-level
- `podcast_episodes` queries still use podcast-scoped indexes
- docs explain that SQLite file size may lag behind logical deletion
- tests cover that maintenance failures do not break normal discovery reads
