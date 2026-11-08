import type { H3Event } from 'h3'
import { fetchDashboard } from './dashboardQuery'
import { fetchBudgetLibre } from './budgetLibreQuery'
import { fetchMovements } from './movementsQuery'
import { fetchWishlist } from './wishlistQuery'
import { listBudgetEnvelopeLedgers } from './envelopeCeilingsQuery'
import { listReserveEnvelopeBalances } from './reserveEnvelopeQuery'
import { fetchActiveRows, fetchSavingsGoals } from './referenceQuery'
import { fetchAccountBalances } from './accountBalanceQuery'
import { getClosureStatus } from './closureService'
import { fetchMonthContext } from './monthContext'
import type { YearMonth } from './domain/closure'

// One composer per page endpoint. Each starts every read at once and fails as a whole:
// a client navigation then costs exactly one round trip and one session check, instead of
// a chain of calls each paying its own (see the navigation-perf spec, §2).
//
// Month pages take the selected month (parseMonthParam) and carry its monthContext, read
// in the same Promise.all. Envies keeps the server clock: it is not month-navigable.

function currentMonth(now: Date) {
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

export async function getDashboardPage(event: H3Event, { year, month }: YearMonth, now: Date) {
  // fetchDashboard is the only pool-backed read here (reserve balances); the other is
  // Data API, so this never holds more pool slots than /api/dashboard alone did.
  const [dashboard, closureStatus, monthContext] = await Promise.all([
    fetchDashboard(event, year, month, now),
    getClosureStatus(event, now),
    fetchMonthContext(event, { year, month }, now),
  ])
  return { dashboard, closureStatus, monthContext }
}

export async function getMouvementsPage(event: H3Event, { year, month }: YearMonth, now: Date) {
  const [movements, categories, accounts, envelopes, incomeTypes, savingsGoals, budgetLibre, monthContext] = await Promise.all([
    fetchMovements(event, year, month),
    fetchActiveRows(event, 'categories'),
    fetchActiveRows(event, 'accounts'),
    fetchActiveRows(event, 'envelopes'),
    fetchActiveRows(event, 'income_types'),
    fetchSavingsGoals(event),
    fetchBudgetLibre(event, { year, month }),
    fetchMonthContext(event, { year, month }, now),
  ])
  return { movements, budgetLibre, monthContext, reference: { categories, accounts, envelopes, incomeTypes, savingsGoals } }
}

export async function getEnveloppesPage(event: H3Event, { year, month }: YearMonth, now: Date) {
  const [envelopes, reserves, monthContext] = await Promise.all([
    listBudgetEnvelopeLedgers(event, year, month),
    listReserveEnvelopeBalances(),
    fetchMonthContext(event, { year, month }, now),
  ])
  return { envelopes, reserves, monthContext }
}

export async function getEnviesPage(event: H3Event, now: Date) {
  const { year, month } = currentMonth(now)
  const [items, envelopes] = await Promise.all([
    fetchWishlist(event, year, month),
    fetchActiveRows(event, 'envelopes'),
  ])
  return { items, envelopes }
}

export async function getParametresPage(event: H3Event, _now: Date) {
  const [categories, envelopes, incomeTypes, accounts, balances] = await Promise.all([
    fetchActiveRows(event, 'categories'),
    fetchActiveRows(event, 'envelopes'),
    fetchActiveRows(event, 'income_types'),
    fetchActiveRows(event, 'accounts'),
    fetchAccountBalances(event),
  ])
  return { categories, envelopes, incomeTypes, accounts, accountBalances: Object.fromEntries(balances) }
}
