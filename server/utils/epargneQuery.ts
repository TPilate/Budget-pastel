import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'
import {
  summarisePoches,
  monthlyHistory,
  savingsGapAdvice,
  monthsOfChargesCovered,
  monthContributions,
} from './domain/savings'
import type { PocheView, ContributionRow } from './domain/savings'
import { partitionExpenses, summariseIncome, compute503020 } from './domain/dashboard'
import type { Bucket5030 } from './domain/dashboard'
import { summariseFixedCharges } from './domain/accountsOverview'

// This route is deliberately Data-API only. It must never import listBudgetEnvelopeLedgers
// or listReserveEnvelopeBalances: those hold pool slots, and the pool-wait queue has no
// timeout, so an exhausted pool hangs a page forever. Nothing here needs envelope ledgers.
const GOALS_SELECT = 'id,name,target_amount,monthly_amount,note,receives_salary_variance,sort_order'
const ENTRIES_SELECT = 'savings_goal_id,year,month,amount'
const INCOME_SELECT = 'amount,expected_amount,target_envelope_id'
const EXPENSE_SELECT
  = 'amount,envelope_id,financed_by,'
  + 'categories(is_fixed,fifty_thirty_twenty_bucket),'
  + 'envelopes(fifty_thirty_twenty_bucket)'
const FIXED_CATEGORIES_SELECT = 'id,name,default_target'

const REQUEST_TIMEOUT_MS = 10000
const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

export interface EpargnePayload {
  month: { year: number, month: number, label: string }
  // The page cannot infer this from the 50/30/20 actuals: they are all zero both when no
  // income was recorded AND when income exists but nothing has been spent or saved yet.
  // Those need different copy, so the figure is carried explicitly.
  income: { received: number }
  poches: PocheView[]
  totals: { balance: number, monthly: number, monthsOfChargesCovered: number | null }
  history: { year: number, month: number, label: string, amount: number }[]
  ruleOfThumb: {
    targets: { besoins: number, envies: number, epargne: number }
    actuals: { besoins: number, envies: number, epargne: number }
    advice: { pointsShort: number, euroPerMonth: number } | null
  }
  contributions: ContributionRow[]
}

function unwrap<T>(embed: T | T[] | null | undefined): T | null {
  if (!embed) return null
  return Array.isArray(embed) ? embed[0] ?? null : embed
}

function assertOk(table: string, error: { message: string } | null) {
  if (!error) return
  throw createError({
    statusCode: 500,
    statusMessage: 'Failed to load savings',
    message: `epargne: ${table} request failed: ${error.message}`,
  })
}

export async function fetchEpargne(
  event: H3Event,
  year: number,
  month: number,
  historyMonths: number,
): Promise<EpargnePayload> {
  const supabase = createSupabaseServerClient(event)
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)

  const [goalsRes, entriesRes, incomeRes, expenseRes, fixedRes] = await Promise.all([
    supabase.from('savings_goals').select(GOALS_SELECT).order('sort_order').abortSignal(signal),
    // All time, not just this month: a poche's balance is a running total.
    supabase.from('savings_entries').select(ENTRIES_SELECT).abortSignal(signal),
    supabase.from('income_entries').select(INCOME_SELECT)
      .eq('year_assigned', year).eq('month_assigned', month).abortSignal(signal),
    supabase.from('expense_entries').select(EXPENSE_SELECT)
      .eq('year_assigned', year).eq('month_assigned', month).abortSignal(signal),
    supabase.from('categories').select(FIXED_CATEGORIES_SELECT)
      .eq('is_fixed', true).is('archived_at', null).order('sort_order').abortSignal(signal),
  ])

  assertOk('savings_goals', goalsRes.error)
  assertOk('savings_entries', entriesRes.error)
  assertOk('income_entries', incomeRes.error)
  assertOk('expense_entries', expenseRes.error)
  assertOk('categories', fixedRes.error)

  const allEntries = (entriesRes.data ?? []).map((row: any) => ({
    savingsGoalId: row.savings_goal_id,
    year: row.year,
    month: row.month,
    amount: Number(row.amount),
  }))

  const { poches, totalBalance, totalMonthly } = summarisePoches(
    (goalsRes.data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      // null must survive: a poche without an objective renders without a progress bar.
      targetAmount: row.target_amount === null ? null : Number(row.target_amount),
      monthlyAmount: Number(row.monthly_amount),
      note: row.note ?? null,
      receivesSalaryVariance: Boolean(row.receives_salary_variance),
    })),
    allEntries,
  )

  const income = summariseIncome((incomeRes.data ?? []).map((row: any) => ({
    amount: Number(row.amount),
    expectedAmount: row.expected_amount === null ? null : Number(row.expected_amount),
    targetEnvelopeId: row.target_envelope_id ?? null,
  })))

  const expenseRows = (expenseRes.data ?? []) as any[]
  const partition = partitionExpenses(expenseRows.map((row) => ({
    amount: Number(row.amount),
    envelopeId: row.envelope_id ?? null,
    categoryIsFixed: Boolean(unwrap<any>(row.categories)?.is_fixed),
    financedBy: row.financed_by,
  })))

  const monthEntries = allEntries.filter((entry) => entry.year === year && entry.month === month)
  const savedThisMonth = monthEntries.reduce((sum, entry) => sum + entry.amount, 0)

  const taggedSpend = expenseRows
    .filter((row) => row.financed_by !== 'gift_received')
    .map((row) => {
      const envelope = unwrap<any>(row.envelopes)
      const category = unwrap<any>(row.categories)
      // Envelope presence short-circuits, matching /api/dashboard: a reserve with no bucket
      // stays untagged rather than borrowing its category's tag.
      const bucket = (envelope
        ? envelope.fifty_thirty_twenty_bucket
        : category?.fifty_thirty_twenty_bucket) ?? null
      return { bucket: bucket as Bucket5030 | null, amount: Number(row.amount) }
    })

  const ruleOfThumb = compute503020({
    incomeReceived: income.received,
    taggedSpend,
    savings: savedThisMonth,
  })

  const fixedCharges = summariseFixedCharges({
    fixedCategories: (fixedRes.data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      defaultTarget: row.default_target === null ? null : Number(row.default_target),
    })),
    expensesThisMonth: [],
  })

  return {
    month: { year, month, label: `${MONTH_NAMES[month - 1]} ${year}` },
    income: { received: income.received },
    poches,
    totals: {
      balance: totalBalance,
      monthly: totalMonthly,
      monthsOfChargesCovered: monthsOfChargesCovered(totalBalance, fixedCharges.total),
    },
    history: monthlyHistory(allEntries, { year, month }, historyMonths),
    ruleOfThumb: {
      targets: ruleOfThumb.targets,
      actuals: ruleOfThumb.actuals,
      advice: savingsGapAdvice({
        targetPercent: ruleOfThumb.targets.epargne,
        actualPercent: ruleOfThumb.actuals.epargne,
        incomeReceived: income.received,
      }),
    },
    contributions: monthContributions({
      entries: monthEntries,
      poches,
      salaryVariance: income.salaryVariance,
    }),
  }
}
