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
  fetchMovements: deferred.make('fetchMovements'),
  fetchWishlist: deferred.make('fetchWishlist'),
  listBudgetEnvelopeLedgers: deferred.make('listBudgetEnvelopeLedgers'),
  listReserveEnvelopeBalances: deferred.make('listReserveEnvelopeBalances'),
  fetchActiveRows: deferred.make('fetchActiveRows'),
  fetchSavingsGoals: deferred.make('fetchSavingsGoals'),
  getClosureStatus: deferred.make('getClosureStatus'),
}))

vi.mock('../../../../server/utils/dashboardQuery', () => ({ fetchDashboard: src.fetchDashboard }))
vi.mock('../../../../server/utils/movementsQuery', () => ({ fetchMovements: src.fetchMovements }))
vi.mock('../../../../server/utils/wishlistQuery', () => ({ fetchWishlist: src.fetchWishlist }))
vi.mock('../../../../server/utils/envelopeCeilingsQuery', () => ({ listBudgetEnvelopeLedgers: src.listBudgetEnvelopeLedgers }))
vi.mock('../../../../server/utils/reserveEnvelopeQuery', () => ({ listReserveEnvelopeBalances: src.listReserveEnvelopeBalances }))
vi.mock('../../../../server/utils/referenceQuery', () => ({ fetchActiveRows: src.fetchActiveRows, fetchSavingsGoals: src.fetchSavingsGoals }))
vi.mock('../../../../server/utils/closureService', () => ({ getClosureStatus: src.getClosureStatus }))
// The Data-API-only guards live in referenceQuery.test.ts and envelopeCeilingsQuery.test.ts.

import { getDashboardPage, getMouvementsPage, getEnveloppesPage, getEnviesPage, getParametresPage } from '../../../../server/utils/pageData'

const event = { context: {} } as any
const NOW = new Date('2026-10-13T08:00:00Z')

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

  it('Mouvements: the feed and the four reference lists start together, for the current month', async () => {
    const result = getMouvementsPage(event, NOW)
    await Promise.resolve()
    expect(deferred.pending.map((call) => call.name).sort()).toEqual(
      ['fetchActiveRows', 'fetchActiveRows', 'fetchActiveRows', 'fetchActiveRows', 'fetchMovements', 'fetchSavingsGoals'],
    )
    expect(src.fetchMovements).toHaveBeenCalledWith(event, 2026, 10)
    expect(src.fetchActiveRows.mock.calls.map((call) => call[1]).sort()).toEqual(['accounts', 'categories', 'envelopes', 'income_types'])

    const page = await settle(result, {
      fetchMovements: () => [{ id: 'm1' }],
      fetchActiveRows: (args) => [{ table: args[1] }],
      fetchSavingsGoals: () => [{ id: 'g1' }],
    })
    expect(page).toEqual({
      movements: [{ id: 'm1' }],
      reference: {
        categories: [{ table: 'categories' }],
        accounts: [{ table: 'accounts' }],
        envelopes: [{ table: 'envelopes' }],
        incomeTypes: [{ table: 'income_types' }],
        savingsGoals: [{ id: 'g1' }],
      },
    })
  })

  it('Paramètres: four lists in parallel, keyed as the page reads them', async () => {
    const result = getParametresPage(event, NOW)
    await Promise.resolve()
    expect(deferred.pending).toHaveLength(4)
    const page = await settle(result, { fetchActiveRows: (args) => [{ table: args[1] }] })
    expect(page).toEqual({
      categories: [{ table: 'categories' }],
      envelopes: [{ table: 'envelopes' }],
      incomeTypes: [{ table: 'income_types' }],
      accounts: [{ table: 'accounts' }],
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
    const result = getEnveloppesPage(event, NOW)
    await Promise.resolve()
    expect(deferred.pending.map((call) => call.name).sort()).toEqual(['listBudgetEnvelopeLedgers', 'listReserveEnvelopeBalances'])
    expect(src.listBudgetEnvelopeLedgers).toHaveBeenCalledWith(event, 2026, 10)
    const page = await settle(result, { listBudgetEnvelopeLedgers: () => [{ id: 'l1' }], listReserveEnvelopeBalances: () => [{ id: 'r1' }] })
    expect(page).toEqual({ envelopes: [{ id: 'l1' }], reserves: [{ id: 'r1' }] })
  })

  it('Tableau de bord: dashboard and closure status together', async () => {
    const result = getDashboardPage(event, NOW)
    await Promise.resolve()
    expect(deferred.pending.map((call) => call.name).sort()).toEqual(['fetchDashboard', 'getClosureStatus'])
    expect(src.fetchDashboard).toHaveBeenCalledWith(event, 2026, 10, NOW)
    expect(src.getClosureStatus).toHaveBeenCalledWith(event, NOW)
    const page = await settle(result, {
      fetchDashboard: () => ({ month: 'x' }),
      getClosureStatus: () => ({ closableMonth: null }),
    })
    expect(page).toEqual({ dashboard: { month: 'x' }, closureStatus: { closableMonth: null } })
  })

  it('fails the whole page when one read fails, never returning part of it', async () => {
    const result = getParametresPage(event, NOW)
    await Promise.resolve()
    deferred.pending.splice(0).forEach((call, index) => call.resolve(index === 2 ? Promise.reject(new Error('boom')) : []))
    await expect(result).rejects.toThrow('boom')
  })
})
