import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const responseByTable: Record<string, { data: any[] | null, error: any }> = {
    expense_entries: { data: [], error: null },
    income_entries: { data: [], error: null },
  }
  const eqCalls: Record<string, [string, unknown][]> = {}

  const makeClient = () => ({
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          (eqCalls[table] ??= []).push([column, value])
          return builder
        },
        abortSignal: () => builder,
        then: (ok: any, err: any) => Promise.resolve(responseByTable[table]).then(ok, err),
      }
      return builder
    },
  })

  return { responseByTable, eqCalls, makeClient }
})

vi.mock('../../../../server/utils/supabase', () => ({
  createSupabaseServerClient: () => mocks.makeClient(),
}))

const ledgerMock = vi.hoisted(() => vi.fn())
const reserveMock = vi.hoisted(() => vi.fn())
const movementsMock = vi.hoisted(() => vi.fn())
const savingsMock = vi.hoisted(() => vi.fn())

vi.mock('../../../../server/utils/envelopeCeilingsQuery', () => ({ listBudgetEnvelopeLedgers: ledgerMock }))
vi.mock('../../../../server/utils/reserveEnvelopeQuery', () => ({ listReserveEnvelopeBalances: reserveMock }))
vi.mock('../../../../server/utils/movementsQuery', () => ({ fetchMovements: movementsMock }))
vi.mock('../../../../server/utils/savingsQuery', () => ({ fetchSavings: savingsMock }))

import { fetchDashboard } from '../../../../server/utils/dashboardQuery'

function fakeEvent() {
  return { context: {} } as any
}

describe('fetchDashboard', () => {
  beforeEach(() => {
    mocks.responseByTable.expense_entries = { data: [], error: null }
    mocks.responseByTable.income_entries = { data: [], error: null }
    for (const key of Object.keys(mocks.eqCalls)) delete mocks.eqCalls[key]
    ledgerMock.mockReset().mockResolvedValue([])
    reserveMock.mockReset().mockResolvedValue([])
    movementsMock.mockReset().mockResolvedValue([])
    savingsMock.mockReset().mockResolvedValue([])
  })

  it('composes the month summary from the partitioned expenses and income', async () => {
    mocks.responseByTable.income_entries = {
      data: [{ amount: '2316.00', expected_amount: '2300.00', target_envelope_id: null }],
      error: null,
    }
    mocks.responseByTable.expense_entries = {
      data: [
        { amount: '861.00', envelope_id: null, financed_by: 'budget', categories: { is_fixed: true, fifty_thirty_twenty_bucket: 'besoins' }, envelopes: null },
        { amount: '424.00', envelope_id: 'e1', financed_by: 'budget', categories: { is_fixed: false, fifty_thirty_twenty_bucket: 'besoins' }, envelopes: { fifty_thirty_twenty_bucket: 'envies' } },
        { amount: '318.00', envelope_id: null, financed_by: 'budget', categories: { is_fixed: false, fifty_thirty_twenty_bucket: 'besoins' }, envelopes: null },
      ],
      error: null,
    }
    savingsMock.mockResolvedValue([{ goalId: 'g1', goalName: 'Long terme', amount: 345 }])

    const payload = await fetchDashboard(fakeEvent(), 2026, 9, new Date(2026, 8, 20))

    expect(payload.income.received).toBe(2316)
    expect(payload.income.salaryVariance).toBe(16)
    expect(payload.savings.total).toBe(345)
    expect(payload.summary.unspent).toBe(368)
    expect(payload.summary.allocatedPercent).toBe(84)
    expect(payload.month.daysRemaining).toBe(11)
  })

  it('takes an envelope\'s bucket over its category\'s for 50/30/20', async () => {
    // The envelope is the more specific tag; using the category would score this as
    // besoins instead of envies.
    mocks.responseByTable.income_entries = {
      data: [{ amount: '1000.00', expected_amount: null, target_envelope_id: null }],
      error: null,
    }
    mocks.responseByTable.expense_entries = {
      data: [
        { amount: '300.00', envelope_id: 'e1', financed_by: 'budget', categories: { is_fixed: false, fifty_thirty_twenty_bucket: 'besoins' }, envelopes: { fifty_thirty_twenty_bucket: 'envies' } },
      ],
      error: null,
    }

    const payload = await fetchDashboard(fakeEvent(), 2026, 9, new Date(2026, 8, 20))

    expect(payload.ruleOfThumb.actuals.envies).toBe(30)
    expect(payload.ruleOfThumb.actuals.besoins).toBe(0)
  })

  it('leaves an envelope expense untagged when the envelope itself has no bucket, even if its category does', async () => {
    // Regression for F1: presence of an envelope must short-circuit the fallback to the
    // category's tag. The only real envelopes with a null bucket are reserves
    // (Anniversaire et fêtes, Extras), and reserve spend must stay out of 50/30/20.
    mocks.responseByTable.income_entries = {
      data: [{ amount: '1000.00', expected_amount: null, target_envelope_id: null }],
      error: null,
    }
    mocks.responseByTable.expense_entries = {
      data: [
        { amount: '252.00', envelope_id: 'reserve-1', financed_by: 'budget', categories: { is_fixed: false, fifty_thirty_twenty_bucket: 'besoins' }, envelopes: { fifty_thirty_twenty_bucket: null } },
      ],
      error: null,
    }

    const payload = await fetchDashboard(fakeEvent(), 2026, 9, new Date(2026, 8, 20))

    expect(payload.ruleOfThumb.untagged).toBe(252)
    expect(payload.ruleOfThumb.actuals.besoins).toBe(0)
  })

  it('excludes gift_received expenses from both the donut slices and the 50/30/20 actuals', async () => {
    // Regression for F2: the donut and the 50/30/20 row must agree that gift-funded
    // spend does not exist for either calculation.
    mocks.responseByTable.income_entries = {
      data: [{ amount: '1000.00', expected_amount: null, target_envelope_id: null }],
      error: null,
    }
    mocks.responseByTable.expense_entries = {
      data: [
        { amount: '500.00', envelope_id: null, financed_by: 'gift_received', categories: { is_fixed: false, fifty_thirty_twenty_bucket: 'besoins' }, envelopes: null },
      ],
      error: null,
    }

    const payload = await fetchDashboard(fakeEvent(), 2026, 9, new Date(2026, 8, 20))

    const variableSlice = payload.summary.slices.find((slice) => slice.key === 'variable')
    expect(variableSlice?.amount).toBe(0)
    expect(payload.ruleOfThumb.actuals.besoins).toBe(0)
    expect(payload.ruleOfThumb.untagged).toBe(0)
  })

  it('summarises the envelope totals and counts overspends', async () => {
    ledgerMock.mockResolvedValue([
      { id: 'e1', name: 'Restaurants', emoji: '🍽️', showOnHome: true, ceiling: 130, netSpent: 82, remaining: 48, subtitle: null, incomeCreditsTotal: 20 },
      { id: 'e2', name: 'Mode', emoji: '👗', showOnHome: true, ceiling: 40, netSpent: 71, remaining: -31, subtitle: null, incomeCreditsTotal: 0 },
    ])

    const payload = await fetchDashboard(fakeEvent(), 2026, 9, new Date(2026, 8, 20))

    expect(payload.envelopes.totalCeiling).toBe(170)
    expect(payload.envelopes.totalNetSpent).toBe(153)
    expect(payload.envelopes.totalRemaining).toBe(17)
    expect(payload.envelopes.overspentCount).toBe(1)
    expect(payload.envelopes.cards[0].incomeCreditsTotal).toBe(20)
  })

  it('intentionally diverges: the donut envelope slice is gross spend, the KPI total is net of credits', async () => {
    // F3: partitionExpenses (donut) counts every envelope expense gross, including the
    // credit-funded portion; the ledger (KPI card) reports netSpent, i.e. gross minus the
    // income credit. Both are correct for what they measure, they are just not the same
    // number, and app/pages/index.vue now labels them differently (`Dépenses enveloppes`
    // vs `Enveloppes`) so this file documents the gap rather than hiding it.
    mocks.responseByTable.income_entries = {
      data: [{ amount: '1000.00', expected_amount: null, target_envelope_id: null }],
      error: null,
    }
    mocks.responseByTable.expense_entries = {
      data: [
        { amount: '102.00', envelope_id: 'e1', financed_by: 'budget', categories: { is_fixed: false, fifty_thirty_twenty_bucket: 'envies' }, envelopes: { fifty_thirty_twenty_bucket: 'envies' } },
      ],
      error: null,
    }
    ledgerMock.mockResolvedValue([
      { id: 'e1', name: 'Restaurants', emoji: '🍽️', showOnHome: true, ceiling: 130, netSpent: 82, remaining: 48, subtitle: null, incomeCreditsTotal: 20 },
    ])

    const payload = await fetchDashboard(fakeEvent(), 2026, 9, new Date(2026, 8, 20))

    const envelopeSlice = payload.summary.slices.find((slice) => slice.key === 'envelope')
    expect(envelopeSlice?.amount).toBe(102)
    expect(payload.envelopes.totalNetSpent).toBe(82)
    expect(envelopeSlice!.amount - payload.envelopes.totalNetSpent).toBe(20)
  })

  it('keeps only the five most recent movements', async () => {
    movementsMock.mockResolvedValue(Array.from({ length: 9 }, (_, i) => ({ id: `m${i}` })))
    const payload = await fetchDashboard(fakeEvent(), 2026, 9, new Date(2026, 8, 20))
    expect(payload.recentMovements).toHaveLength(5)
    expect(payload.recentMovements[0].id).toBe('m0')
  })

  it('scopes both new reads to the requested month', async () => {
    await fetchDashboard(fakeEvent(), 2026, 9, new Date(2026, 8, 20))
    expect(mocks.eqCalls.expense_entries).toEqual([['year_assigned', 2026], ['month_assigned', 9]])
    expect(mocks.eqCalls.income_entries).toEqual([['year_assigned', 2026], ['month_assigned', 9]])
  })

  it('throws rather than returning a partial payload when a request fails', async () => {
    mocks.responseByTable.expense_entries = { data: null, error: { message: 'permission denied for table expense_entries' } }
    await expect(fetchDashboard(fakeEvent(), 2026, 9, new Date(2026, 8, 20))).rejects.toThrow(/expense_entries/)
  })
})
