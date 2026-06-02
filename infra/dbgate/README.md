# DBGate SQLite Inspection

DBGate can be used for temporary, browser-based inspection of a Readio Cloud
SQLite database on a VPS. It is not part of the normal deployment path; use it as
an operator tool when a richer database UI is useful.

## Recommended Local-Only Run

Run DBGate on the VPS with a local-only bind address, then access it through an
SSH tunnel from your workstation:

```bash
docker run --rm \
  --name readio-dbgate \
  --publish 127.0.0.1:<local-port>:3000 \
  --volume <path-to-readio.db>:/data/readio.db:ro \
  dbgate/dbgate
```

From your workstation:

```bash
ssh -L <local-port>:127.0.0.1:<local-port> <ssh-user>@<vps-host>
```

Then open:

```text
http://127.0.0.1:<local-port>
```

Inside DBGate, create a SQLite connection that points to:

```text
/data/readio.db
```

## Write Access

Prefer read-only mounts for preproduction and production inspection:

```bash
--volume <path-to-readio.db>:/data/readio.db:ro
```

If write access is ever needed, take a database backup first and run DBGate only
for the short maintenance window:

```bash
--volume <path-to-readio.db>:/data/readio.db
```

Do not leave a writable DBGate container running after the maintenance work is
finished.

## Datasette Comparison

Use Datasette when the goal is lightweight read-only browsing or sharing simple
queries. Use DBGate when the operator needs a fuller database client interface,
such as schema navigation, saved connections, or richer query editing.

For routine Readio Cloud inspection, Datasette is usually enough. DBGate is a
fallback for deeper manual inspection.

## Notes

- Replace `<path-to-readio.db>` with the target environment's SQLite database
  path.
- Replace `<local-port>`, `<ssh-user>`, and `<vps-host>` for your environment.
- Keep the Docker port bound to `127.0.0.1`; access it through SSH tunneling.
- Do not bind DBGate to `0.0.0.0` unless it is protected by firewall rules,
  authentication, and a trusted private network.
- Do not commit real VPS addresses, production database paths, or credentials.
- Stop the container after use:

```bash
docker stop readio-dbgate
```
