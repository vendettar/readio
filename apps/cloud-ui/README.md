# `@readio/cloud-ui`

This directory is the current Cloud frontend app.

Current intent:

- `apps/lite` remains the standalone PWA.
- `apps/cloud-api` is the current Go backend scaffold and same-origin API owner.
- `apps/cloud-ui` is the current Cloud-only frontend that talks only to the Cloud backend via same-origin APIs.

Rules for the next implementation steps:

- Do not copy the entire `apps/lite` tree into this directory.
- Do not wire browser-direct discovery networking into this app.
- Reuse shared presentation components through `packages/ui`.
- Treat this directory as a current app, not as a mode switch for `apps/lite`.
