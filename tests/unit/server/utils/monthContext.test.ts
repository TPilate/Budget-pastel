import { describe, it, expect, vi } from 'vitest'

const state = vi.hoisted(() => ({ value: { firstDataMonth: { year: 2026, month: 8 }, closedMonths: [{ year: 2026, month: 9 }] } as any }))
vi.mock('../../../../server/utils/closureQuery', () => ({ fetchClosureState: vi.fn(async () => state.value) }))

import { fetchMonthContext } from '../../../../server/utils/monthContext'

const NOW = new Date('2026-11-08T12:00:00Z')

describe('fetchMonthContext', () => {
  it('flags a closed month', async () => {
    const ctx = await fetchMonthContext({} as any, { year: 2026, month: 9 }, NOW)
    expect(ctx).toEqual({
      selected: { year: 2026, month: 9, label: 'Septembre 2026' },
      current: { year: 2026, month: 11 },
      firstDataMonth: { year: 2026, month: 8 },
      latestClosed: { year: 2026, month: 9 },
      closed: true,
      reopenable: true,
    })
  })
  it('an open month after the latest closed one is not closed', async () => {
    const ctx = await fetchMonthContext({} as any, { year: 2026, month: 10 }, NOW)
    expect(ctx.closed).toBe(false)
  })
  it('a month before the latest closed one, never closed itself, is frozen but not reopenable', async () => {
    state.value = { firstDataMonth: { year: 2026, month: 8 }, closedMonths: [{ year: 2026, month: 10 }] }
    const ctx = await fetchMonthContext({} as any, { year: 2026, month: 9 }, NOW)
    expect(ctx).toMatchObject({ closed: true, reopenable: false })
    expect((await fetchMonthContext({} as any, { year: 2026, month: 10 }, NOW)).reopenable).toBe(true)
    state.value = { firstDataMonth: { year: 2026, month: 8 }, closedMonths: [{ year: 2026, month: 9 }] }
  })
  it('no closure at all means nothing is closed', async () => {
    state.value = { firstDataMonth: null, closedMonths: [] }
    const ctx = await fetchMonthContext({} as any, { year: 2026, month: 9 }, NOW)
    expect(ctx).toMatchObject({ closed: false, latestClosed: null, firstDataMonth: null })
  })
})
