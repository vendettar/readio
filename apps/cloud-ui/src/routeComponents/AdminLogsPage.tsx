import { ExternalLink } from 'lucide-react'
import { Button } from '../components/ui/button'
import { getAppConfig } from '../lib/runtimeConfig'

const grafanaCloudURL = 'https://grafana.com/auth/sign-in'

function resolveOpsEnv(): string {
  const env = getAppConfig().GRAFANA_FARO_ENV.trim().toLowerCase()
  if (env === 'prod') return 'production'
  if (env === 'pre' || env === 'preprod') return 'preproduction'
  return env || 'production'
}

export default function AdminLogsPage() {
  const config = getAppConfig()
  const opsEnv = resolveOpsEnv()
  const backendOrigin = config.API_BASE_URL || 'the configured Cloud API backend'
  const logQuery = `{service="readio-cloud", env="${opsEnv}"}`

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col justify-center px-4 py-12">
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Operations
          </p>
          <h1 className="text-2xl font-semibold tracking-normal">Production logs moved</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Cloud runs with the frontend on Cloudflare Pages and the backend on {backendOrigin}.
            This page no longer reads the backend /admin/* memory log endpoints from the browser.
            Use Grafana Cloud Logs for {opsEnv} log inspection.
          </p>
        </div>

        <div className="rounded-md border bg-muted/20 p-4">
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-medium">Grafana Loki query</h2>
              <code className="mt-2 block rounded-md border bg-background px-3 py-2 font-mono text-sm">
                {logQuery}
              </code>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              The in-memory /admin/logs endpoint is retained for same-origin deployments, SSH
              tunnels, or a future protected ops.readio.top reverse proxy. It is not used by the
              Cloudflare Pages app.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <a href={grafanaCloudURL} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden="true" />
              Open Grafana
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href="https://grafana.com/docs/grafana-cloud/" target="_blank" rel="noreferrer">
              Grafana docs
            </a>
          </Button>
        </div>
      </div>
    </main>
  )
}
