import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

function runDbGuardWithEnv(envOverrides: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, ['scripts/check-db-guard.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...envOverrides,
    },
    encoding: 'utf8',
  })
}

describe('db guard script failure mode', () => {
  it('fails closed when rg is unavailable', () => {
    const result = runDbGuardWithEnv({ PATH: '' })
    expect(result.status).toBe(1)
  })
})
