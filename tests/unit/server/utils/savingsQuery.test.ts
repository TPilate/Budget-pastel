import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  let response: { data: any[] | null, error: any } = { data: [], error: null }
  const calls = { select: '', eq: [] as [string, unknown][], abortSignals: [] as AbortSignal[] }

  const makeClient = () => ({
    from: () => {
      const builder: any = {
        select: (columns: string) => { calls.select = columns; return builder },
        eq: (column: string, value: unknown) => { calls.eq.push([column, value]); return builder },
        abortSignal: (signal: AbortSignal) => { calls.abortSignals.push(signal); return builder },
        then: (ok: any, err: any) => Promise.resolve(response).then(ok, err),
      }
      return builder
    },
  })

  return { makeClient, calls, setResponse: (r: typeof response) => { response = r } }
})

vi.mock('../../../../server/utils/supabase', () => ({
  createSupabaseServerClient: () => mocks.makeClient(),
}))

import { fetchSavings } from '../../../../server/utils/savingsQuery'

function fakeEvent() {
  return { context: {} } as any
}

describe('fetchSavings', () => {
  beforeEach(() => {
    mocks.setResponse({ data: [], error: null })
    mocks.calls.select = ''
    mocks.calls.eq = []
    mocks.calls.abortSignals = []
  })

  it('returns one entry per goal with the goal name resolved', async () => {
    mocks.setResponse({
      data: [
        { savings_goal_id: 'g1', amount: '216.00', savings_goals: { name: 'Long terme' } },
        { savings_goal_id: 'g2', amount: '80.00', savings_goals: { name: 'Sécurité' } },
      ],
      error: null,
    })

    const result = await fetchSavings(fakeEvent(), 2026, 9)

    expect(result).toEqual([
      { goalId: 'g1', goalName: 'Long terme', amount: 216 },
      { goalId: 'g2', goalName: 'Sécurité', amount: 80 },
    ])
  })

  it('sums duplicate rows for the same goal instead of showing one of them', async () => {
    // savings_entries has no unique index, so two rows for one goal and month are
    // possible. Taking the first would understate the total.
    mocks.setResponse({
      data: [
        { savings_goal_id: 'g1', amount: '100.00', savings_goals: { name: 'Long terme' } },
        { savings_goal_id: 'g1', amount: '116.00', savings_goals: { name: 'Long terme' } },
      ],
      error: null,
    })

    const result = await fetchSavings(fakeEvent(), 2026, 9)

    expect(result).toEqual([{ goalId: 'g1', goalName: 'Long terme', amount: 216 }])
  })

  it('scopes the lookup to the requested year and month', async () => {
    await fetchSavings(fakeEvent(), 2026, 9)
    expect(mocks.calls.eq).toEqual([['year', 2026], ['month', 9]])
  })

  it('bounds the request with an abort signal', async () => {
    await fetchSavings(fakeEvent(), 2026, 9)
    expect(mocks.calls.abortSignals).toHaveLength(1)
  })

  it('throws rather than returning an empty list when the request fails', async () => {
    mocks.setResponse({ data: null, error: { message: 'permission denied for table savings_entries' } })
    await expect(fetchSavings(fakeEvent(), 2026, 9)).rejects.toThrow(/savings_entries/)
  })
})
