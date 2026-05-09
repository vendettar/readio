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
| `readio_nginx_enable_site` | No | `true` | Creates the `sites-enabled` symlink and reloads Nginx when true. Requires SSL certificates to be present (see Prerequisites). |
| `readio_manage_unattended_upgrades` | No | `false` | When true, ensures `unattended-upgrades` is installed. The playbook does not disable unattended security upgrades. |

## Prerequisites (Important)

1. **Bootstrap User Access**: Before running the `Bootstrap VPS` workflow for the first time, you **must** already have a non-root bootstrap user on the VPS that:
   - can log in with the private key stored in `CLOUD_SSH_PRIVATE_KEY`
   - is selected through the workflow `vps_user` input or the `CLOUD_SSH_USER` secret
   - has passwordless `sudo`, because the playbook runs with `become: true`

   Example bootstrap-user setup on the VPS (replace `<bootstrap-user>` with your actual username):
   ```bash
   # 1. Grant passwordless sudo to the bootstrap user
   echo "<bootstrap-user> ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/readio-bootstrap-<bootstrap-user> && sudo chmod 0440 /etc/sudoers.d/readio-bootstrap-<bootstrap-user>

   # 2. Inject the GitHub Actions SSH public key for initial access
   sudo mkdir -p /home/<bootstrap-user>/.ssh && sudo chmod 700 /home/<bootstrap-user>/.ssh
   echo "ssh-ed25519 AAAAC3... your_github_actions_public_key" | sudo tee -a /home/<bootstrap-user>/.ssh/authorized_keys
   sudo chown -R <bootstrap-user>:<bootstrap-user> /home/<bootstrap-user>/.ssh && sudo chmod 600 /home/<bootstrap-user>/.ssh/authorized_keys
   ```
   *Note: This bootstrap user is only the initial Ansible entry point. The playbook will create or update `readio_deploy_user` and later manage that user's SSH keys based on `READIO_DEPLOY_USER_SSH_KEYS`.*

2. **SSL Certificates**: You **must** manually upload the Cloudflare Origin CA SSL certificates to the target VPS, otherwise Nginx validation will fail. Place them here:
   - `/etc/ssl/cloudflare/origin.pem`
   - `/etc/ssl/cloudflare/origin.key`

## Run

```bash
# Use an inventory that points at your pre-created non-root bootstrap user.
# Example inventory host vars:
#   ansible_host: your-vps-ip
#   ansible_user: bootstrap
#   ansible_port: 22
ansible-playbook -i infra/ansible/inventory.example.yml infra/ansible/vps_optimize.yml
```

Use a real inventory or `--extra-vars` for hostnames, users, and SSH keys. Do not commit real public host IPs if they should remain private, and never place private keys or production secrets in Ansible variables.

## Verification

```bash
ansible-playbook --syntax-check infra/ansible/vps_optimize.yml
ansible-playbook --check -i infra/ansible/inventory.example.yml infra/ansible/vps_optimize.yml
```

Check mode still contacts the target host and validates facts, package state, and file changes. Run the playbook twice against the same VPS to verify idempotency; the second run should report no changes except handlers caused by external drift.
