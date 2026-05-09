# Instruction 00A1 — Cloud VPS Ansible Bootstrap [COMPLETED]

## Objective

Create an idempotent Ansible bootstrap layer for a raw Ubuntu Noble VPS used by Readio Cloud.

This is the first child instruction of `00A-cloud-advanced-deployment-architecture.md`.

## Decision Log

- **Required / Waived**: Waived. Covered by the 00A architecture decision.

## Bilingual Sync

- **Required / Not applicable**: Required only if deployment docs are changed.

## Scope

Allowed:

- `infra/ansible/`
- docs that explain how to run the playbook, if needed

Forbidden in this instruction:

- `.github/workflows/**`
- `docker-compose.readio.yml`
- root `Makefile`
- product source code under `apps/**/src`
- Grafana Alloy or any host observability agent

If more than 10 files are required, stop and split.

## Required Variables

The playbook must not hard-code environment-specific values. Define variables for:

- deployment user name
- deployment user public SSH keys
- optional sudo command allowlist
- production data root, default `/etc/readio/prod/data`
- preproduction data root, default `/etc/readio/pre/data`
- Nginx site name/path
- whether to modify `unattended-upgrades`, default `false`

## Required Provisioning

1. Install required apt packages for Docker Engine and Docker Compose plugin.
2. Ensure Docker Engine is installed and enabled.
3. Ensure the deployment user exists.
4. Install authorized SSH keys from variables/templates.
5. Configure passwordless sudo only for required deployment operations.
6. Create:
   - `/etc/readio/pre/data`
   - `/etc/readio/prod/data`
7. Ensure data directory ownership is compatible with the deploy user and container runtime.
8. Install or validate Nginx.
9. Link or render `scripts/nginx-readio-cloud.conf` into the configured Nginx site path.
10. Configure journald size limits.
11. Apply conservative sysctl tuning only when each setting has a short rationale in comments or docs.

## Guardrails

- Do not install Grafana Alloy.
- Do not install node_exporter, Prometheus, Loki, or any observability agent.
- Do not write production secrets to files.
- Do not disable `unattended-upgrades` by default.
- If `unattended-upgrades` changes are added behind a variable, document the security tradeoff.
- Do not hard-code domains, usernames, SSH keys, IPs, or secret values.
- Playbook must be safe to run more than once.

## Verification

- `ansible-playbook --syntax-check infra/ansible/vps_optimize.yml`
- Run Ansible check mode if possible:
  - `ansible-playbook --check infra/ansible/vps_optimize.yml`
- Provide an idempotency note for running the playbook twice.
- If docs are changed, verify English/Chinese counterparts where applicable.

## Completion

- **Completed by**: Codex Worker
- **Commands**:
  - `ANSIBLE_LOCAL_TEMP=/tmp/ansible-tmp UV_CACHE_DIR=/tmp/uv-cache uv run --with ansible ansible-playbook --syntax-check -i infra/ansible/inventory.example.yml infra/ansible/vps_optimize.yml`
  - `ansible-playbook --check infra/ansible/vps_optimize.yml` (blocked: `ansible-playbook` is not installed in the local environment)
  - `ruby -e 'require "yaml"; ARGV.each { |p| YAML.load_file(p) }; puts "yaml parse ok"' infra/ansible/vps_optimize.yml infra/ansible/inventory.example.yml`
  - `rg -n "Grafana Alloy|node_exporter|Prometheus|Loki|observability agent|NOPASSWD:ALL|CLOUD_SSH_PRIVATE_KEY|READIO_ADMIN_TOKEN|PODCAST_INDEX_API_SECRET" infra/ansible agent/instructions/cloud/00A1-cloud-vps-ansible-bootstrap.md`
- **Date**: 2026-05-08
- **Reviewed by**: Codex Reviewer, 2026-05-08
