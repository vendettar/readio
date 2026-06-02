# Datasette SQLite Inspection

Datasette can be used for temporary, browser-based inspection of a Readio Cloud
SQLite database on a VPS.

## Recommended Read-Only Run

Run Datasette on the VPS with a local-only bind address, then access it through
an SSH tunnel from your workstation:

```bash
datasette <path-to-readio.db> \
  --read-only \
  --port <local-port> \
  --host 127.0.0.1
```

From your workstation:

```bash
ssh -L <local-port>:127.0.0.1:<local-port> <ssh-user>@<vps-host>
```

Then open:

```text
http://127.0.0.1:<local-port>
```

## Notes

- Replace `<path-to-readio.db>` with the target environment's SQLite database
  path.
- Replace `<local-port>`, `<ssh-user>`, and `<vps-host>` for your environment.
- Prefer `--read-only` for preproduction and production inspection.
- Do not bind Datasette to `0.0.0.0` unless it is protected by firewall rules,
  authentication, and a trusted private network.
- Do not commit real VPS addresses, production database paths, or credentials.
