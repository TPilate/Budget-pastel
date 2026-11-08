import type { H3Event } from 'h3'
import { listBudgetEnvelopeLedgers } from './envelopeCeilingsQuery'
import { listReserveEnvelopeBalances } from './reserveEnvelopeQuery'
import { fetchMovements } from './movementsQuery'
import { fetchMonthFigures, unwrap } from './monthFigures'
import { compute503020, daysRemainingInMonth } from './domain/dashboard'
import { parisYearMonth } from './domain/closure'
import type { Bucket5030, DashboardSlice } from './domain/dashboard'
import type { Movement } from './domain/movementsFeed'

const RECENT_MOVEMENT_COUNT = 5

const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

export interface DashboardPayload {
  month: { year: number, month: number, label: string, daysRemaining: number }
  income: { received: number, salaryReceived: number, salaryExpected: number, salaryVariance: number }
  savings: {
    total: number
    byGoal: { goalId: string, goalName: string, amount: number }[]
    byAccount: { accountId: string, name: string, emoji: string, amount: number }[]
  }
  envelopes: {
    totalCeiling: number
    totalNetSpent: number
    totalRemaining: number
    overspentCount: number
    cards: { id: string, name: string, emoji: string, ceiling: number, netSpent: number, remaining: number, incomeCreditsTotal: number }[]
  }
  reserves: { id: string, name: string, emoji: string, balance: number, incomeCreditsTotal: number, expensesTotal: number }[]
  summary: { unspent: number, perDay: number, allocatedPercent: number, slices: DashboardSlice[] }
  ruleOfThumb: {
    targets: { besoins: number, envies: number, epargne: number }
    actuals: { besoins: number, envies: number, epargne: number }
    untagged: number
  }
  recentMovements: Movement[]
}

export async function fetchDashboard(
  event: H3Event,
  year: number,
  month: number,
  today: Date,
): Promise<DashboardPayload> {
  // Ledgers now go through the Data API; only listReserveEnvelopeBalances still holds pool
  // slots (3 round-trips), so this route never holds more than 3 at once — see the budget
  // note in server/utils/db.ts.
  const ledgers = await listBudgetEnvelopeLedgers(event, year, month)
  const reserves = await listReserveEnvelopeBalances()

  // Only the running month has days left; a past month has none, so perDay is the whole
  // unspent amount and the UI hides the "par jour" line.
  const current = parisYearMonth(today)
  const daysRemaining = current.year === year && current.month === month ? daysRemainingInMonth(today) : 0
  const [figures, movements] = await Promise.all([
    fetchMonthFigures(event, year, month, daysRemaining),
    fetchMovements(event, year, month),
  ])
  const { expenseRows, income, savingsEntries, savingsTotal, byAccount, summary } = figures

  // An envelope is the more specific intent, so its tag wins outright — including when it
  // has none, which is how reserve spend stays out of 50/30/20. Only an expense with no
  // envelope at all falls back to its category's tag.
  // gift_received spend is dropped here too, matching partitionExpenses.
  const taggedSpend = expenseRows
    .filter((row) => row.financed_by !== 'gift_received')
    .map((row) => {
      const envelope = unwrap<any>(row.envelopes)
      const category = unwrap<any>(row.categories)
      const bucket = (envelope
        ? envelope.fifty_thirty_twenty_bucket
        : category?.fifty_thirty_twenty_bucket) ?? null
      return {
        bucket: bucket as Bucket5030 | null,
        amount: Number(row.amount),
      }
    })

  const ruleOfThumb = compute503020({
    incomeReceived: income.received,
    taggedSpend,
    savings: Math.max(0, savingsTotal),
  })

  return {
    month: {
      year,
      month,
      label: `${MONTH_NAMES[month - 1]} ${year}`,
      daysRemaining,
    },
    income,
    savings: { total: savingsTotal, byGoal: savingsEntries, byAccount },
    envelopes: {
      totalCeiling: ledgers.reduce((sum, l) => sum + l.ceiling, 0),
      totalNetSpent: ledgers.reduce((sum, l) => sum + l.netSpent, 0),
      totalRemaining: ledgers.reduce((sum, l) => sum + l.remaining, 0),
      overspentCount: ledgers.filter((l) => l.remaining < 0).length,
      cards: ledgers.map((l) => ({
        id: l.id,
        name: l.name,
        emoji: l.emoji,
        ceiling: l.ceiling,
        netSpent: l.netSpent,
        remaining: l.remaining,
        incomeCreditsTotal: l.incomeCreditsTotal,
      })),
    },
    reserves,
    summary,
    ruleOfThumb,
    recentMovements: movements.slice(0, RECENT_MOVEMENT_COUNT),
  }
}
