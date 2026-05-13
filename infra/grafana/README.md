# Grafana Dashboard Setup

## Setup Instructions

`dashboard.template.json` is the portable source file committed to version
control. Local copies such as `dashboard.json` are intentionally ignored by git
to avoid committing environment-specific datasource IDs.

Before importing:

1. Go to Connections -> Data sources.
2. Create a Prometheus datasource with Exemplar configured:
   - Label name: `trace_id`
   - Internal link -> your Tempo datasource
3. Note the Prometheus datasource UID from the edit page URL.
4. Note the Loki datasource UID from the edit page URL.
5. Copy `dashboard.template.json` to a local import file such as `dashboard.json`.
6. Replace `REPLACE_WITH_PROMETHEUS_UID` with your Prometheus datasource UID.
7. Replace `REPLACE_WITH_LOKI_UID` with your Loki datasource UID.
8. Import the modified JSON.

This dashboard uses Grafana `dashboard.grafana.app/v2` format. It intentionally
does not use classic import placeholder blocks or a datasource variable because
those mechanisms are not reliable in this v2 source format.
