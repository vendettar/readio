# Instruction 023-pre-production: Cloud Pre-Production Environment Strategy

Discuss and approve this document before implementation.

This document defines the concrete pre-production environment strategy for the current Cloud deployment shape.

It depends on:
- `023a-cloud-backend-sqlite-goose-foundation.md`
- `apps/docs/content/docs/apps/cloud/deployment.mdx`

## 1. Purpose

Cloud now depends on startup-time SQLite/goose migrations and shared persistent data.

Production should not be the first environment where a new release exercises:
- service startup
- goose migrations
- shared data directory assumptions
- Cloud browser entry

This document defines a low-cost pre-production strategy using the existing single VPS.

## 2. Current Constraint

Current infrastructure reality:
- one public VPS
- Cloudflare proxy in front
- no second server
- Cloud memory footprint is modest enough to tolerate a second short-lived instance on the same host

Given that constraint, pre-production will run on the same VPS as production, but with isolated runtime state.

## 3. Concrete Environment Shape

Production remains unchanged:
- root: `/opt/readio`
- service: `readio-cloud.service`
- existing production port and runtime config remain unchanged

Pre-production adds a parallel environment:
- root: `/opt/readio-pre`
- service: `readio-cloud-pre.service`
- port: `8079`
- browser entry: `pre.readio.top`

Cloudflare should proxy:

```text
pre.readio.top -> Cloudflare -> VPS:8079
```

## 4. Isolation Rules

Pre-production must not share mutable runtime state with production.

It must use its own:
- release root
- `current` symlink
- shared data root
- SQLite database file
- podcast transcript asset directory
- `systemd` unit
- env file

Required shape:

```text
Production:
  /opt/readio/
    current
    releases/
    shared/data/readio.db
    shared/data/podcast/transcripts/

Pre-production:
  /opt/readio-pre/
    current
    releases/
    shared/data/readio.db
    shared/data/podcast/transcripts/
```

Do not:
- point pre-production at production SQLite
- point pre-production at production transcript assets
- reuse the production `current` symlink
- reuse the production env file

## 5. Access Control

`pre.readio.top` must not rely on a frontend-only token gate.

Required rule:
- browser access to pre-production must be protected at the infrastructure layer

Preferred implementation:
- Cloudflare Access in front of `pre.readio.top`

Why:
- it protects the full browser entry, not just the homepage
- it avoids exposing `/env.js`, static assets, and API routes to arbitrary public traffic
- it is simpler and safer than building a bespoke in-app gate

## 6. Runtime Differences Allowed

Pre-production should match production startup and persistence wiring, but some runtime values may differ:

- public hostname
- listen port
- provider credentials
- built-in quota policy
- rate limits
- machine resource allocation expectations

Recommended differences:
- lower built-in ASR quota
- lower rate-limit thresholds
- lower-cost or test provider credentials where available

## 7. Runtime Similarities Required

Pre-production should match production in the things that matter for deployment rehearsal:

- same binary artifact shape
- same release/current deployment pattern
- same `systemd` startup model
- same goose migration execution during startup
- same shared-data layout shape
- same `READIO_CLOUD_DB_PATH` style
- same transcript asset directory contract
- same browser entry model for Cloud app access

## 8. Operating Model

Pre-production is an on-demand environment, not a 24/7 user-facing environment.

Default operating mode:
- service installed
- env file prepared
- Cloudflare route prepared
- shared data directories persist
- service starts only for rehearsal or debugging

After a rehearsal completes:
- manual shutdown is acceptable

This means:
- data remains
- service does not need to remain running continuously

## 9. Release Gate

Before production rollout, the same release must first pass pre-production verification.

Minimum gate:
1. deploy the release to `/opt/readio-pre/releases/<sha>/`
2. point `/opt/readio-pre/current` to that release
3. start `readio-cloud-pre.service`
4. allow startup-time goose migrations to complete
5. verify service active state
6. verify `/healthz`
7. verify at least one DB-backed path succeeds
8. verify browser entry through `pre.readio.top`

Production rollout should stop if pre-production fails any of these gates.

## 10. Scope Boundary

This document defines environment strategy only.

It does not yet define:
- exact `systemd` unit content
- exact Cloudflare Access policy configuration
- CI/CD workflow changes
- exact pre-production rehearsal checklist implementation

Those belong in later implementation instructions.

## 11. Return

Implementation following this document should report:
1. pre-production root paths
2. pre-production service/env names
3. access-control choice
4. isolation proof from production data
5. release-gate verification results
