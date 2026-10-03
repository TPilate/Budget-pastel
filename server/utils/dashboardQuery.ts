import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'
import { listBudgetEnvelopeLedgers } from './envelopeCeilingsQuery'
import { listReserveEnvelopeBalances } from './reserveEnvelopeQuery'
import { fetchMovements } from './movementsQuery'
import { fetchSavings } from './savingsQuery'
import {
  partitionExpenses,
  summariseIncome,
  computeMonthSummary,
  compute503020,
  daysRemainingInMonth,
} from './domain/dashboard'
import type { Bucket5030, DashboardSlice } from './domain/dashboard'
import type { Movement } from './domain/movementsFeed'

const EXPENSE_SELECT
  = 'amount,envelope_id,financed_by,'
  + 'categories(is_fixed,fifty_thirty_twenty_bucket),'
  + 'envelopes(fifty_thirty_twenty_bucket)'

const INCOME_SELECT = 'amount,expected_amount,target_envelope_id'

const REQUEST_TIMEOUT_MS = 10000
const RECENT_MOVEMENT_COUNT = 5

const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

export interface DashboardPayload {
  month: { year: number, month: number, label: string, daysRemaining: number }
  income: { received: number, salaryReceived: number, salaryExpected: number, salaryVariance: number }
  savings: { total: number, byGoal: { goalId: string, goalName: string, amount: number }[] }
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

function unwrap<T>(embed: T | T[] | null | undefined): T | null {
  if (!embed) return null
  return Array.isArray(embed) ? embed[0] ?? null : embed
}

function assertOk(table: string, error: { message: string } | null) {
  if (!error) return
  throw createError({
    statusCode: 500,
    statusMessage: 'Failed to load dashboard',
    message: `dashboard: ${table} request failed: ${error.message}`,
  })
}

export async function fetchDashboard(
  event: H3Event,
  year: number,
  month: number,
  today: Date,
): Promise<DashboardPayload> {
  const supabase = createSupabaseServerClient(event)
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)

  // listBudgetEnvelopeLedgers and listReserveEnvelopeBalances are both pool-backed (5 and 3
  // round-trips respectively). They are awaited one after another, not inside the Promise.all
  // below, so this route never holds more than 5 pool slots at once instead of 8 — see the
  // budget note in server/utils/db.ts.
  const ledgers = await listBudgetEnvelopeLedgers(year, month)
  const reserves = await listReserveEnvelopeBalances()

  const [expenseRes, incomeRes, movements, savingsEntries] = await Promise.all([
    supabase.from('expense_entries').select(EXPENSE_SELECT)
      .eq('year_assigned', year).eq('month_assigned', month).abortSignal(signal),
    supabase.from('income_entries').select(INCOME_SELECT)
      .eq('year_assigned', year).eq('month_assigned', month).abortSignal(signal),
    fetchMovements(event, year, month),
    fetchSavings(event, year, month),
  ])

  assertOk('expense_entries', expenseRes.error)
  assertOk('income_entries', incomeRes.error)

  const expenseRows = (expenseRes.data ?? []) as any[]

  const partition = partitionExpenses(expenseRows.map((row) => ({
    amount: Number(row.amount),
    envelopeId: row.envelope_id ?? null,
    categoryIsFixed: Boolean(unwrap<any>(row.categories)?.is_fixed),
    financedBy: row.financed_by,
  })))

  const income = summariseIncome((incomeRes.data ?? []).map((row: any) => ({
    amount: Number(row.amount),
    expectedAmount: row.expected_amount === null ? null : Number(row.expected_amount),
    targetEnvelopeId: row.target_envelope_id ?? null,
  })))

  const savingsTotal = savingsEntries.reduce((sum, entry) => sum + entry.amount, 0)

  const summary = computeMonthSummary({
    incomeReceived: income.received,
    fixed: partition.fixed,
    envelope: partition.envelope,
    variable: partition.variable,
    savings: savingsTotal,
    daysRemaining: daysRemainingInMonth(today),
  })

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
    savings: savingsTotal,
  })

  return {
    month: {
      year,
      month,
      label: `${MONTH_NAMES[month - 1]} ${year}`,
      daysRemaining: daysRemainingInMonth(today),
    },
    income,
    savings: { total: savingsTotal, byGoal: savingsEntries },
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
