import { describe, expect, it } from 'vitest'
import { ABSOLUTE_MAX_CALLS, buildChunkDurationPlan } from '../index'

const STEADY_SECONDS = 600

function toBudget(totalDurationSeconds: number) {
  const baselineCalls = Math.ceil(totalDurationSeconds / STEADY_SECONDS)
  const maxExtraCalls = Math.min(4, Math.max(2, Math.ceil(baselineCalls * 0.5)))
  const hardCallBudget = Math.min(ABSOLUTE_MAX_CALLS, baselineCalls + maxExtraCalls)
  return { hardCallBudget }
}

describe('buildChunkDurationPlan', () => {
  it('returns a single chunk for short audio (<= 90s)', () => {
    expect(buildChunkDurationPlan(90)).toEqual([90])
    expect(buildChunkDurationPlan(45)).toEqual([45])
  })

  it('uses partial ramp for medium audio when budget prevents full ramp', () => {
    expect(buildChunkDurationPlan(125)).toEqual([5, 10, 110])
  })

  it('starts with 5s and 10s, then converges to steady 600s chunks', () => {
    const plan = buildChunkDurationPlan(3600)
    expect(plan[0]).toBe(5)
    expect(plan[1]).toBe(10)
    expect(plan).toContain(600)
  })

  it('returns fallback signal (empty plan) when baseline reaches absolute call cap', () => {
    const atAbsoluteCapDuration = STEADY_SECONDS * ABSOLUTE_MAX_CALLS
    expect(buildChunkDurationPlan(atAbsoluteCapDuration)).toEqual([])
  })

  it('returns fallback signal (empty plan) when baseline exceeds absolute call cap', () => {
    const overAbsoluteCapDuration = STEADY_SECONDS * (ABSOLUTE_MAX_CALLS + 1)
    expect(buildChunkDurationPlan(overAbsoluteCapDuration)).toEqual([])
  })

  it('satisfies plan invariants for representative durations', () => {
    const representativeDurations = [65, 3600, 13800]

    for (const totalSeconds of representativeDurations) {
      const plan = buildChunkDurationPlan(totalSeconds)
      const { hardCallBudget } = toBudget(totalSeconds)

      expect(plan.length).toBeGreaterThan(0)
      expect(plan.every((value) => value > 0)).toBe(true)

      const sum = plan.reduce((acc, value) => acc + value, 0)
      expect(Math.abs(sum - totalSeconds)).toBeLessThanOrEqual(1)

      const rampPhase = plan.slice(0, 4)
      for (let i = 1; i < rampPhase.length; i++) {
        expect(rampPhase[i]).toBeGreaterThanOrEqual(rampPhase[i - 1])
      }

      expect(plan.length).toBeLessThanOrEqual(hardCallBudget)
      expect(plan.length).toBeLessThanOrEqual(ABSOLUTE_MAX_CALLS)
    }
  })
})
