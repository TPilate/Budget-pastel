import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const responseByTable: Record<string, { data: any[] | null, error: any }> = {
    savings_goals: { data: [], error: null },
    savings_entries: { data: [], error: null },
    income_entries: { data: [], error: null },
    expense_entries: { data: [], error: null },
    categories: { data: [], error: null },
  }
  const eqCalls: Record<string, [string, unknown][]> = {}

  const makeClient = () => ({
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: (c: string, v: unknown) => { (eqCalls[table] ??= []).push([c, v]); return builder },
        is: () => builder,
        order: () => builder,
        abortSignal: () => builder,
        then: (ok: any, err: any) => Promise.resolve(responseByTable[table]).then(ok, err),
      }
      return builder
    },
  })

  return { responseByTable, eqCalls, makeClient }
})

vi.mock('../../../../server/utils/supabase', () => ({ createSupabaseServerClient: () => mocks.makeClient() }))

// These are the pool-backed helpers this route must never touch. Mocking them lets the
// test assert they are not called, which is the plan's hardest constraint.
const ledgerMock = vi.hoisted(() => vi.fn())
const reserveMock = vi.hoisted(() => vi.fn())
vi.mock('../../../../server/utils/envelopeCeilingsQuery', () => ({ listBudgetEnvelopeLedgers: ledgerMock }))
vi.mock('../../../../server/utils/reserveEnvelopeQuery', () => ({ listReserveEnvelopeBalances: reserveMock }))

import { fetchEpargne } from '../../../../server/utils/epargneQuery'

function fakeEvent() {
  return { context: {} } as any
}

describe('fetchEpargne', () => {
  beforeEach(() => {
    for (const key of Object.keys(mocks.responseByTable)) {
      mocks.responseByTable[key] = { data: [], error: null }
    }
    for (const key of Object.keys(mocks.eqCalls)) delete mocks.eqCalls[key]
    ledgerMock.mockReset()
    reserveMock.mockReset()
  })

  it('never touches the connection pool', async () => {
    // The pool is why /api/dashboard and /api/accounts/overview are the heaviest routes,
    // and an exhausted pool hangs a request forever rather than erroring. Nothing on this
    // page needs envelope ledgers, so a sixth page must not add pressure.
    await fetchEpargne(fakeEvent(), 2026, 10, 6)
    expect(ledgerMock).not.toHaveBeenCalled()
    expect(reserveMock).not.toHaveBeenCalled()
  })

  it('composes the poches from goals and all-time entries', async () => {
    mocks.responseByTable.savings_goals = {
      data: [{ id: 'a', name: 'Long terme', target_amount: '10000.00', monthly_amount: '216.00', note: 'sans échéance', receives_salary_variance: true }],
      error: null,
    }
    mocks.responseByTable.savings_entries = {
      data: [
        { savings_goal_id: 'a', year: 2026, month: 9, amount: '5000.00' },
        { savings_goal_id: 'a', year: 2026, month: 10, amount: '184.00' },
      ],
      error: null,
    }

    const payload = await fetchEpargne(fakeEvent(), 2026, 10, 6)

    expect(payload.poches[0]).toMatchObject({
      name: 'Long terme', balance: 5184, targetAmount: 10000, monthlyAmount: 216, progressPercent: 52,
    })
    expect(payload.totals.balance).toBe(5184)
    expect(payload.totals.monthly).toBe(216)
  })

  it('keeps a null target as null rather than coercing it to zero', async () => {
    mocks.responseByTable.savings_goals = {
      data: [{ id: 'a', name: 'Long terme', target_amount: null, monthly_amount: '0.00', note: null, receives_salary_variance: false }],
      error: null,
    }

    const payload = await fetchEpargne(fakeEvent(), 2026, 10, 6)

    expect(payload.poches[0].targetAmount).toBeNull()
    expect(payload.poches[0].progressPercent).toBeNull()
  })

  it('returns a full history window even with no savings at all', async () => {
    // The default state today: savings_entries is empty.
    const payload = await fetchEpargne(fakeEvent(), 2026, 10, 6)
    expect(payload.history).toHaveLength(6)
    expect(payload.history.every((m) => m.amount === 0)).toBe(true)
  })

  it('produces no advice and no NaN at zero income', async () => {
    const payload = await fetchEpargne(fakeEvent(), 2026, 10, 6)
    expect(payload.income.received).toBe(0)
    expect(payload.ruleOfThumb.advice).toBeNull()
    for (const value of Object.values(payload.ruleOfThumb.actuals)) {
      expect(Number.isNaN(value)).toBe(false)
    }
  })

  it('reports income even when nothing has been spent, so the page can tell the two apart', async () => {
    // Both states give all-zero 50/30/20 actuals; only income.received distinguishes
    // "no revenue recorded" from "revenue recorded, nothing spent yet".
    mocks.responseByTable.income_entries = {
      data: [{ amount: '2316.00', expected_amount: null, target_envelope_id: null }],
      error: null,
    }

    const payload = await fetchEpargne(fakeEvent(), 2026, 10, 6)

    expect(payload.income.received).toBe(2316)
    expect(payload.ruleOfThumb.actuals.besoins).toBe(0)
  })

  it('scopes the month-specific reads to the requested month', async () => {
    await fetchEpargne(fakeEvent(), 2026, 10, 6)
    expect(mocks.eqCalls.income_entries).toEqual([['year_assigned', 2026], ['month_assigned', 10]])
    expect(mocks.eqCalls.expense_entries).toEqual([['year_assigned', 2026], ['month_assigned', 10]])
  })

  it('throws rather than returning a partial payload when a request fails', async () => {
    mocks.responseByTable.savings_goals = { data: null, error: { message: 'permission denied for table savings_goals' } }
    await expect(fetchEpargne(fakeEvent(), 2026, 10, 6)).rejects.toThrow(/savings_goals/)
  })
})
