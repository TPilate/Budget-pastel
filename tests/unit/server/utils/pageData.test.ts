import { describe, it, expect, vi, beforeEach } from 'vitest'

// Each source resolves only when the test says so, which proves the composers start every
// read before awaiting any of them.
const deferred = vi.hoisted(() => {
  const pending: { name: string, args: unknown[], resolve: (value: unknown) => void }[] = []
  const make = (name: string) => vi.fn((...args: unknown[]) => new Promise((resolve) => { pending.push({ name, args, resolve }) }))
  return { pending, make }
})

const src = vi.hoisted(() => ({
  fetchDashboard: deferred.make('fetchDashboard'),
  fetchBudgetLibre: deferred.make('fetchBudgetLibre'),
  fetchMovements: deferred.make('fetchMovements'),
  fetchWishlist: deferred.make('fetchWishlist'),
  listBudgetEnvelopeLedgers: deferred.make('listBudgetEnvelopeLedgers'),
  listReserveEnvelopeBalances: deferred.make('listReserveEnvelopeBalances'),
  fetchActiveRows: deferred.make('fetchActiveRows'),
  fetchSavingsGoals: deferred.make('fetchSavingsGoals'),
  getClosureStatus: deferred.make('getClosureStatus'),
  fetchAccountBalances: deferred.make('fetchAccountBalances'),
  fetchMonthContext: deferred.make('fetchMonthContext'),
}))

vi.mock('../../../../server/utils/dashboardQuery', () => ({ fetchDashboard: src.fetchDashboard }))
vi.mock('../../../../server/utils/budgetLibreQuery', () => ({ fetchBudgetLibre: src.fetchBudgetLibre }))
vi.mock('../../../../server/utils/movementsQuery', () => ({ fetchMovements: src.fetchMovements }))
vi.mock('../../../../server/utils/wishlistQuery', () => ({ fetchWishlist: src.fetchWishlist }))
vi.mock('../../../../server/utils/envelopeCeilingsQuery', () => ({ listBudgetEnvelopeLedgers: src.listBudgetEnvelopeLedgers }))
vi.mock('../../../../server/utils/reserveEnvelopeQuery', () => ({ listReserveEnvelopeBalances: src.listReserveEnvelopeBalances }))
vi.mock('../../../../server/utils/referenceQuery', () => ({ fetchActiveRows: src.fetchActiveRows, fetchSavingsGoals: src.fetchSavingsGoals }))
vi.mock('../../../../server/utils/accountBalanceQuery', () => ({ fetchAccountBalances: src.fetchAccountBalances }))
vi.mock('../../../../server/utils/closureService', () => ({ getClosureStatus: src.getClosureStatus }))
vi.mock('../../../../server/utils/monthContext', () => ({ fetchMonthContext: src.fetchMonthContext }))
// The Data-API-only guards live in referenceQuery.test.ts and envelopeCeilingsQuery.test.ts.

import { getDashboardPage, getMouvementsPage, getEnveloppesPage, getEnviesPage, getParametresPage } from '../../../../server/utils/pageData'

const event = { context: {} } as any
const NOW = new Date('2026-10-13T08:00:00Z')
const SEP = { year: 2026, month: 9 }
const CTX = { selected: { year: 2026, month: 9, label: 'Septembre 2026' }, closed: true }

async function settle<T>(promise: Promise<T>, values: Record<string, (args: unknown[]) => unknown>): Promise<T> {
  // Let every synchronous call inside the composer happen, then resolve them all.
  await Promise.resolve()
  const started = deferred.pending.splice(0)
  for (const call of started) call.resolve(values[call.name](call.args))
  return promise
}

describe('page composers', () => {
  beforeEach(() => {
    deferred.pending.length = 0
    for (const fn of Object.values(src)) fn.mockClear()
  })

  it('Mouvements: the feed, the four reference lists and the budget libre start together, for the current month', async () => {
    const result = getMouvementsPage(event, SEP, NOW)
    await Promise.resolve()
    expect(deferred.pending.map((call) => call.name).sort()).toEqual(
      ['fetchActiveRows', 'fetchActiveRows', 'fetchActiveRows', 'fetchActiveRows', 'fetchBudgetLibre', 'fetchMonthContext', 'fetchMovements', 'fetchSavingsGoals'],
    )
    expect(src.fetchMovements).toHaveBeenCalledWith(event, 2026, 9)
    expect(src.fetchBudgetLibre).toHaveBeenCalledWith(event, { year: 2026, month: 9 })
    expect(src.fetchMonthContext).toHaveBeenCalledWith(event, SEP, NOW)
    expect(src.fetchActiveRows.mock.calls.map((call) => call[1]).sort()).toEqual(['accounts', 'categories', 'envelopes', 'income_types'])

    const page = await settle(result, {
      fetchMovements: () => [{ id: 'm1' }],
      fetchActiveRows: (args) => [{ table: args[1] }],
      fetchSavingsGoals: () => [{ id: 'g1' }],
      fetchBudgetLibre: () => 150,
      fetchMonthContext: () => CTX,
    })
    expect(page).toEqual({
      movements: [{ id: 'm1' }],
      budgetLibre: 150,
      monthContext: CTX,
      reference: {
        categories: [{ table: 'categories' }],
        accounts: [{ table: 'accounts' }],
        envelopes: [{ table: 'envelopes' }],
        incomeTypes: [{ table: 'income_types' }],
        savingsGoals: [{ id: 'g1' }],
      },
    })
  })

  it('Paramètres: four lists and the account balances in parallel, keyed as the page reads them', async () => {
    const result = getParametresPage(event, NOW)
    await Promise.resolve()
    expect(deferred.pending).toHaveLength(5)
    const page = await settle(result, {
      fetchActiveRows: (args) => [{ table: args[1] }],
      fetchAccountBalances: () => new Map([['a1', 1110]]),
    })
    expect(page).toEqual({
      categories: [{ table: 'categories' }],
      envelopes: [{ table: 'envelopes' }],
      incomeTypes: [{ table: 'income_types' }],
      accounts: [{ table: 'accounts' }],
      accountBalances: { a1: 1110 },
    })
  })

  it('Envies: wishlist and envelope options together', async () => {
    const result = getEnviesPage(event, NOW)
    await Promise.resolve()
    expect(deferred.pending.map((call) => call.name).sort()).toEqual(['fetchActiveRows', 'fetchWishlist'])
    expect(src.fetchWishlist).toHaveBeenCalledWith(event, 2026, 10)
    const page = await settle(result, { fetchWishlist: () => [{ id: 'w1' }], fetchActiveRows: () => [{ id: 'e1' }] })
    expect(page).toEqual({ items: [{ id: 'w1' }], envelopes: [{ id: 'e1' }] })
  })

  it('Enveloppes: ledgers and reserves together', async () => {
    const result = getEnveloppesPage(event, SEP, NOW)
    await Promise.resolve()
    expect(deferred.pending.map((call) => call.name).sort()).toEqual(['fetchMonthContext', 'listBudgetEnvelopeLedgers', 'listReserveEnvelopeBalances'])
    expect(src.listBudgetEnvelopeLedgers).toHaveBeenCalledWith(event, 2026, 9)
    const page = await settle(result, { listBudgetEnvelopeLedgers: () => [{ id: 'l1' }], listReserveEnvelopeBalances: () => [{ id: 'r1' }], fetchMonthContext: () => CTX })
    expect(page).toEqual({ envelopes: [{ id: 'l1' }], reserves: [{ id: 'r1' }], monthContext: CTX })
  })

  it('Tableau de bord: dashboard and closure status together', async () => {
    const result = getDashboardPage(event, SEP, NOW)
    await Promise.resolve()
    expect(deferred.pending.map((call) => call.name).sort()).toEqual(['fetchDashboard', 'fetchMonthContext', 'getClosureStatus'])
    expect(src.fetchDashboard).toHaveBeenCalledWith(event, 2026, 9, NOW)
    expect(src.getClosureStatus).toHaveBeenCalledWith(event, NOW)
    const page = await settle(result, {
      fetchDashboard: () => ({ month: 'x' }),
      getClosureStatus: () => ({ closableMonth: null }),
      fetchMonthContext: () => CTX,
    })
    expect(page).toEqual({ dashboard: { month: 'x' }, closureStatus: { closableMonth: null }, monthContext: CTX })
  })

  it('fails the whole page when one read fails, never returning part of it', async () => {
    const result = getParametresPage(event, NOW)
    await Promise.resolve()
    deferred.pending.splice(0).forEach((call, index) => call.resolve(index === 2 ? Promise.reject(new Error('boom')) : []))
    await expect(result).rejects.toThrow('boom')
  })
})
