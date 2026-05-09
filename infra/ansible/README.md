# Readio Cloud VPS Ansible Bootstrap

`vps_optimize.yml` provisions a raw Ubuntu Noble VPS for Readio Cloud. It installs Docker Engine, the Docker Compose plugin, Nginx, a deployment user, scoped SSH access, Readio data directories, journald limits, and documented conservative sysctl settings.

## Required Variables

Set these in an inventory or extra-vars file:

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `readio_deploy_user` | Yes | none | Linux user used by deployment automation. |
| `readio_deploy_user_home` | No | `/home/{{ readio_deploy_user }}` | Home directory for the deployment user's SSH configuration. |
| `readio_deploy_user_ssh_keys` | Yes | `[]` | Public SSH keys installed into the deployment user's `authorized_keys`. |
| `readio_sudo_command_allowlist` | No | `[]` | Exact sudo command allowlist. Leave empty unless deployment needs a root command. |
| `readio_prod_data_root` | No | `/etc/readio/prod/data` | Production SQLite/data directory. |
| `readio_pre_data_root` | No | `/etc/readio/pre/data` | Preproduction SQLite/data directory. |
| `readio_nginx_site_name` | No | `readio-cloud` | Name under `/etc/nginx/sites-available`. |
| `readio_nginx_site_source` | No | `scripts/nginx-readio-cloud.conf` | Controller-side Nginx config copied by the playbook. |
| `readio_nginx_enable_site` | No | `false` | Creates the `sites-enabled` symlink and reloads Nginx when true. Keep false until TLS certificates required by the site file exist. |
| `readio_manage_unattended_upgrades` | No | `false` | When true, ensures `unattended-upgrades` is installed. The playbook does not disable unattended security updates. |

## Run

```bash
ansible-playbook -i infra/ansible/inventory.example.yml infra/ansible/vps_optimize.yml
```

Use a real inventory or `--extra-vars` for hostnames, users, and SSH keys. Do not commit real public host IPs if they should remain private, and never place private keys or production secrets in Ansible variables.

## Verification

```bash
ansible-playbook --syntax-check infra/ansible/vps_optimize.yml
ansible-playbook --check -i infra/ansible/inventory.example.yml infra/ansible/vps_optimize.yml
```

Check mode still contacts the target host and validates facts, package state, and file changes. Run the playbook twice against the same VPS to verify idempotency; the second run should report no changes except handlers caused by external drift.

## Notes

The Nginx config is copied into `sites-available` by default. `readio_nginx_enable_site` is opt-in because `scripts/nginx-readio-cloud.conf` defines HTTPS listeners whose certificate paths are expected to be completed by the operator or Certbot before Nginx can validate the enabled site.

Sysctl settings are intentionally small and documented inline in `vps_optimize.yml`: lower swappiness for low-memory VPS behavior and a modest socket backlog for Nginx/container HTTP traffic.
