import type { H3Event } from 'h3'
import { fetchDashboard } from './dashboardQuery'
import { fetchMovements } from './movementsQuery'
import { fetchWishlist } from './wishlistQuery'
import { listBudgetEnvelopeLedgers } from './envelopeCeilingsQuery'
import { listReserveEnvelopeBalances } from './reserveEnvelopeQuery'
import { fetchActiveRows, fetchSavingsGoals } from './referenceQuery'
import { getClosureStatus } from './closureService'

// One composer per page endpoint. Each starts every read at once and fails as a whole:
// a client navigation then costs exactly one round trip and one session check, instead of
// a chain of calls each paying its own (see the navigation-perf spec, §2).
//
// The current month uses the server clock, exactly as the endpoints these replace did.

function currentMonth(now: Date) {
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

export async function getDashboardPage(event: H3Event, now: Date) {
  const { year, month } = currentMonth(now)
  // fetchDashboard is the only pool-backed read here (reserve balances); the other is
  // Data API, so this never holds more pool slots than /api/dashboard alone did.
  const [dashboard, closureStatus] = await Promise.all([
    fetchDashboard(event, year, month, now),
    getClosureStatus(event, now),
  ])
  return { dashboard, closureStatus }
}

export async function getMouvementsPage(event: H3Event, now: Date) {
  const { year, month } = currentMonth(now)
  const [movements, categories, accounts, envelopes, incomeTypes, savingsGoals] = await Promise.all([
    fetchMovements(event, year, month),
    fetchActiveRows(event, 'categories'),
    fetchActiveRows(event, 'accounts'),
    fetchActiveRows(event, 'envelopes'),
    fetchActiveRows(event, 'income_types'),
    fetchSavingsGoals(event),
  ])
  return { movements, reference: { categories, accounts, envelopes, incomeTypes, savingsGoals } }
}

export async function getEnveloppesPage(event: H3Event, now: Date) {
  const { year, month } = currentMonth(now)
  const [envelopes, reserves] = await Promise.all([
    listBudgetEnvelopeLedgers(event, year, month),
    listReserveEnvelopeBalances(),
  ])
  return { envelopes, reserves }
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
  const [categories, envelopes, incomeTypes, accounts] = await Promise.all([
    fetchActiveRows(event, 'categories'),
    fetchActiveRows(event, 'envelopes'),
    fetchActiveRows(event, 'income_types'),
    fetchActiveRows(event, 'accounts'),
  ])
  return { categories, envelopes, incomeTypes, accounts }
}
