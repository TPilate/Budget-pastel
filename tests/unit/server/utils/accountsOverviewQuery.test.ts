import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const responseByTable: Record<string, { data: any[] | null, error: any }> = {
    accounts: { data: [], error: null },
    categories: { data: [], error: null },
    expense_entries: { data: [], error: null },
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

vi.mock('../../../../server/utils/supabase', () => ({
  createSupabaseServerClient: () => mocks.makeClient(),
}))

const ledgerMock = vi.hoisted(() => vi.fn())
const reserveMock = vi.hoisted(() => vi.fn())
vi.mock('../../../../server/utils/envelopeCeilingsQuery', () => ({ listBudgetEnvelopeLedgers: ledgerMock }))
vi.mock('../../../../server/utils/reserveEnvelopeQuery', () => ({ listReserveEnvelopeBalances: reserveMock }))

import { fetchAccountsOverview } from '../../../../server/utils/accountsOverviewQuery'

function fakeEvent() {
  return { context: {} } as any
}

describe('fetchAccountsOverview', () => {
  beforeEach(() => {
    mocks.responseByTable.accounts = { data: [], error: null }
    mocks.responseByTable.categories = { data: [], error: null }
    mocks.responseByTable.expense_entries = { data: [], error: null }
    for (const key of Object.keys(mocks.eqCalls)) delete mocks.eqCalls[key]
    ledgerMock.mockReset().mockResolvedValue([])
    reserveMock.mockReset().mockResolvedValue([])
  })

  it('composes the three KPIs from accounts, ceilings and reserves', async () => {
    mocks.responseByTable.accounts = {
      data: [
        { id: 'a1', name: 'Compte courant', emoji: '💳', current_balance: '1216.00', kind: 'courant' },
        { id: 'a2', name: 'Livret A', emoji: '🌳', current_balance: '7524.00', kind: 'epargne' },
      ],
      error: null,
    }
    ledgerMock.mockResolvedValue([
      { id: 'e1', name: 'Courses', emoji: '🛒', showOnHome: true, ceiling: 320, netSpent: 289, remaining: 31, subtitle: null },
    ])
    reserveMock.mockResolvedValue([
      { id: 'r1', name: 'Anniversaire et fêtes', emoji: '🎂', balance: 88, incomeCreditsTotal: 88, expensesTotal: 0 },
    ])

    const overview = await fetchAccountsOverview(fakeEvent(), 2026, 9)

    expect(overview.bankBalance).toBe(1216)
    expect(overview.committed).toBe(119)
    expect(overview.reallyFree).toBe(1097)
    expect(overview.accounts).toHaveLength(2)
  })

  it('derives fixed-charge tick state from this month\'s expenses', async () => {
    mocks.responseByTable.categories = {
      data: [
        { id: 'c1', name: 'Loyer', default_target: '620.00' },
        { id: 'c2', name: 'Internet', default_target: '32.00' },
      ],
      error: null,
    }
    mocks.responseByTable.expense_entries = { data: [{ category_id: 'c1' }], error: null }

    const overview = await fetchAccountsOverview(fakeEvent(), 2026, 9)

    expect(overview.fixedCharges.total).toBe(652)
    expect(overview.fixedCharges.settledCount).toBe(1)
    expect(overview.fixedCharges.lines.find((l) => l.id === 'c1')?.isSettled).toBe(true)
    expect(overview.fixedCharges.lines.find((l) => l.id === 'c2')?.isSettled).toBe(false)
  })

  it('scopes the expense lookup to the requested month', async () => {
    await fetchAccountsOverview(fakeEvent(), 2026, 9)
    expect(mocks.eqCalls.expense_entries).toEqual([
      ['year_assigned', 2026], ['month_assigned', 9],
    ])
  })

  it('asks the database for fixed categories only', async () => {
    await fetchAccountsOverview(fakeEvent(), 2026, 9)
    expect(mocks.eqCalls.categories).toContainEqual(['is_fixed', true])
  })

  it('maps variable spend from the budget envelope ledgers', async () => {
    ledgerMock.mockResolvedValue([
      { id: 'e1', name: 'Courses', emoji: '🛒', showOnHome: true, ceiling: 320, netSpent: 238, remaining: 82, subtitle: null },
    ])

    const overview = await fetchAccountsOverview(fakeEvent(), 2026, 9)

    expect(overview.variableSpend).toEqual([{ id: 'e1', name: 'Courses', spent: 238, ceiling: 320 }])
  })

  it('throws rather than returning a partial overview when a request fails', async () => {
    mocks.responseByTable.accounts = { data: null, error: { message: 'permission denied for table accounts' } }
    await expect(fetchAccountsOverview(fakeEvent(), 2026, 9)).rejects.toThrow(/accounts/)
  })
})
