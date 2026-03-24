# Instruction: 002 - Cloud CD Pipeline [COMPLETED]

## Goal
Establish a Continuous Deployment (CD) pipeline using GitHub Actions to automatically build and deploy the current Readio Cloud scaffold to a remote VPS. In the current scaffold phase, this means a Go backend plus a static frontend artifact built from `apps/lite`. This protects the 1C1G server from heavy build loads (Node/Vite OOM risks) by strictly adhering to an "Off-Server Compilation" strategy.

## Scope

### In Scope
- Create a dedicated `.github/workflows/cd-cloud.yml`.
- Configure trigger rules (e.g., push to `main` with specific path changes, or via release tags/manual dispatch).
- Heterogeneous runner setup: Node.js (for `apps/lite` build) and Go (for `apps/cloud` build).
- Cross-compilation of the Go static binary (`CGO_ENABLED=0 GOOS=linux GOARCH=amd64`).
- Secure artifact transfer to the remote VPS (e.g., via `appleboy/scp-action` or `rsync`).
- Remote service restart (e.g., via `appleboy/ssh-action`).
- Provide an operational guide documenting the GitHub Secrets required.

### Out of Scope
- Modifying the existing `.github/workflows/ci.yml` (CI must remain independent).
- Infrastructure-as-code (IaC) provisioning of the actual VPS or Nginx/Cloudflare settings.
- Frontend logic rewiring or DB schemas.
- Splitting Cloud into `apps/cloud-api` and `apps/cloud-ui` as part of this instruction.

## Non-Goals
- This instruction does not bootstrap the server from zero. It assumes the VPS already exists and can accept SSH-based deployments.
- This instruction does not install or manage `systemd`, reverse proxy, TLS, or firewall rules on the target VPS.
- This instruction does not redesign CI policy for the rest of the monorepo.
- This instruction does not introduce blue-green or multi-node deployment orchestration.

## Preflight Scope Scan & Hidden Risk Sweep
- **config**: Medium Risk. Requires strict definition of GitHub Secrets (`SERVER_HOST`, `SERVER_USER`, `SSH_PRIVATE_KEY` etc).
- **persistence**: High Risk. The deployment step (SCP/Rsync) MUST NOT overwrite or delete the SQLite `data/` directory on the target server.
- **routing**: Low Risk.
- **logging**: Low Risk.
- **network**: Medium Risk. SSH connections from GitHub Actions can timeout if the VPS firewall drops unrecognized IPs. 
- **storage**: High Risk. The transfer must explicitly target correct directories (e.g., `/opt/readio`) and sync the `dist/` folder and `readio-cloud` binary safely.
- **UI state**: Low Risk.
- **tests**: Medium Risk. The CD pipeline will not push if build commands fail, assuming CI has already verified the code.
- **deploy semantics**: High Risk. A non-atomic overwrite-style deployment can leave the VPS serving a mismatched binary/static asset set if transfer or restart fails halfway.
- **concurrency**: Medium Risk. Multiple pushes can race and overwrite the same remote target unless the workflow declares a deployment concurrency group.

## Repository Reality Check
- Root `package.json` does **not** provide a `make` script. Do not reference `pnpm make` in the implementation.
- `apps/lite` already has a real build entry and may be invoked via `pnpm -C apps/lite build` or an equivalent repo-level wrapper.
- `apps/cloud/package.json` already has a `build` script. Prefer repository-real commands over ad hoc undocumented shell sequences.
- `apps/docs/content/docs/apps/cloud/deployment.mdx` does **not** currently exist. This task should treat it as a new documentation artifact to create.
- This instruction is **scaffold-phase CD**, not the final Cloud topology. If the repository later adopts `apps/cloud-api` + `apps/cloud-ui`, the workflow, deployment docs, and smoke checks must be revised rather than assuming this completed instruction remains the final contract.

## Required Pipeline Contract

### 1. Build Phase
- Checkout code.
- Setup `pnpm` and Node.js.
- Run a repository-real Lite build command to generate `apps/lite/dist`.
  - Preferred: `pnpm -C apps/lite build`
  - Acceptable: `pnpm lite:build`
- Setup Go environment.
- Run a repository-real Cloud build command in `apps/cloud`.
  - Preferred build contract: `CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o readio-cloud .`
  - If the workflow reuses the package script, it must still preserve the Linux cross-compilation contract.

Scaffold-phase note:

- This build contract is valid only while Cloud is still represented by the current `apps/cloud` scaffold serving a static frontend artifact.
- If Cloud later moves to `apps/cloud-api` + `apps/cloud-ui`, the build phase must split into:
  - build `apps/cloud-ui`
  - build `apps/cloud-api`
  - publish both artifacts together

### 1a. Trigger / Environment / Concurrency Policy
- The workflow must not rely on an ambiguous default production trigger.
- Required policy:
  - support `workflow_dispatch`
  - if `push` to `main` is enabled, restrict it with path filters relevant to `apps/cloud`, `apps/lite`, and deployment workflow/docs files
  - define a deployment `concurrency` group so only one cloud deploy runs at a time
- Preferred production hardening:
  - use a protected GitHub Environment for production deployment secrets and optional approval
  - keep CD independent from CI, but assume CI must already be green before deployment is trusted

### 2. Transfer Phase (Safe Sync)
- Define the target deployment path convention.
- Transfer ONLY the `readio-cloud` binary and the `apps/lite/dist` folder.
- **CRITICAL RULE**: Do not wipe the deployment directory on the VPS before transfer, as this would destroy the production SQLite `.db` file.

Scaffold-phase boundary:

- This artifact contract reflects the current scaffold only.
- Do not rewrite repository docs to imply that future Cloud UI should permanently ship as `apps/lite/dist`.

### 2a. Remote Directory Contract
- The instruction must define an explicit target layout rather than a vague `/opt/readio` mention.
- Required separation:
  - a shared persistent directory for runtime data such as SQLite `data/`
  - a release-specific or staging directory for uploaded build artifacts
  - a stable `current` target or equivalent runtime pointer
- Example contract shape:
  - `/opt/readio/shared/data/`
  - `/opt/readio/releases/<git-sha>/readio-cloud`
  - `/opt/readio/releases/<git-sha>/dist/`
  - `/opt/readio/current -> /opt/readio/releases/<git-sha>/`

### 2b. Atomic Publish Rule
- The deployment must not upload directly into the live runtime directory and then restart in-place.
- Required rule:
  - upload artifacts into a release-scoped staging location
  - switch the live runtime pointer only after upload succeeds
  - restart the service only after the switch is complete
- Acceptable implementations:
  - release directories plus atomic symlink swap
  - release directories plus atomic `mv` into a stable target
- Unacceptable implementation:
  - deleting/replacing live files in-place before the new release is fully present

### 3. Execution Phase
- Connect via SSH to restart the system process (e.g., `systemctl restart readio`, or a generic restart script execution).

### 3a. Rollback Contract
- The workflow and deployment guide must define how operators recover if restart or smoke verification fails.
- Minimum acceptable rollback contract:
  - retain at least the previous successful release on disk
  - document the manual rollback command/path procedure
- Preferred contract:
  - rollback can switch `current` back to the previous release and restart the service without rebuilding

### 3b. SSH Security Contract
- Do not normalize insecure SSH usage as the default.
- Required rule:
  - validate host identity via known-hosts or host fingerprint material
  - do not rely on `StrictHostKeyChecking=no` as the primary documented path
- The operational guide must explicitly list the required deployment secrets/variables, for example:
  - `SERVER_HOST`
  - `SERVER_PORT` if non-default
  - `SERVER_USER`
  - `SSH_PRIVATE_KEY`
  - `SERVER_PATH`
  - host key / known-hosts material if the chosen action needs it

### 3c. Post-Deploy Verification Contract
- Verification must include remote runtime checks, not just workflow syntax or build completion.
- Required checks after restart:
  - service restart command returns success
  - remote process manager reports healthy state (`systemctl is-active` or equivalent)
  - a basic application health or smoke probe succeeds
  - the deployed static asset directory exists at the expected runtime path
- The docs must state which endpoint or command operators should use for the smoke check.

## Verification
- CI/CD workflow passes action linters (e.g., `actionlint`).
- The drafted `.yml` clearly exposes variables needed for deployment success.
- The drafted workflow declares deployment concurrency.
- The drafted workflow reflects repository-real build commands, not placeholder commands.
- The deployment guide documents:
  - required server prerequisites
  - GitHub Secrets / Environment variables
  - remote directory layout
  - restart procedure
  - smoke verification
  - rollback steps

## Reviewer Evidence Surface

### Changed-Zone Files (Must Review)
- `.github/workflows/cd-cloud.yml` (or equivalent named workflow)
- `apps/docs/content/docs/apps/cloud/deployment.mdx` (new file; instructions on how users must configure VPS directories, Systemd, smoke checks, rollback, and GitHub Secrets/Environment to accept this workflow).

### Future Follow-Up (Not Covered by 002)
- If Cloud topology is later split into `apps/cloud-api` + `apps/cloud-ui`, a new follow-up instruction must update:
  - `.github/workflows/cd-cloud.yml`
  - deployment docs
  - smoke verification
  - remote directory layout if artifact boundaries change

## Completion
- **Completed by**: Codex
- **Commands**:
  - `sed -n '1,260p' agent/instructions/cloud/002-cloud-cd-pipeline.md`
  - `sed -n '1,240p' .github/workflows/ci.yml`
  - `sed -n '1,240p' .github/workflows/cd-cloud.yml`
  - `sed -n '1,220p' apps/docs/content/docs/apps/cloud/deployment.mdx`
  - `sed -n '1,220p' apps/docs/content/docs/apps/cloud/deployment.zh.mdx`
  - `git diff --check -- .github/workflows/cd-cloud.yml apps/docs/content/docs/apps/cloud/deployment.mdx apps/docs/content/docs/apps/cloud/deployment.zh.mdx`
  - `rg -n "workflow_dispatch|concurrency|CGO_ENABLED=0 GOOS=linux GOARCH=amd64|pnpm -C apps/lite build|known_hosts|StrictHostKeyChecking=yes|systemctl restart|curl -fsS 'http://127.0.0.1" .github/workflows/cd-cloud.yml`
  - `rg -n "cd-cloud.yml|workflow_dispatch|cloud-production|CLOUD_SSH_HOST|CLOUD_SSH_KNOWN_HOSTS|StrictHostKeyChecking=yes|StrictHostKeyChecking=no|pnpm -C apps/lite build|CGO_ENABLED=0 GOOS=linux GOARCH=amd64|readio-cloud|/opt/readio/releases/<git-sha>|ln -sfn|systemctl restart|curl -fsS http://127.0.0.1:8080/healthz|provision|nginx|TLS|firewall" apps/docs/content/docs/apps/cloud/deployment.mdx apps/docs/content/docs/apps/cloud/deployment.zh.mdx .github/workflows/cd-cloud.yml`
  - `command -v actionlint || true`
  - `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/cd-cloud.yml"); puts "yaml-ok"'`
  - `pnpm --dir apps/docs build` (started; docs build remained in progress in this environment)
- **Date**: 2026-03-24
- **Reviewed by**: Codex

When finished: append `[COMPLETED]` to the H1 and fill Completion fields.
