import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'
import { fetchSavings } from './savingsQuery'
import { partitionExpenses, summariseIncome, computeMonthSummary } from './domain/dashboard'
import { summariseMonthTransfers, netSavings, netByEpargneAccount } from './domain/transferFlows'
import type { TransferFlow } from './domain/transferFlows'

const EXPENSE_SELECT
  = 'amount,envelope_id,financed_by,'
  + 'categories(is_fixed,fifty_thirty_twenty_bucket),'
  + 'envelopes(fifty_thirty_twenty_bucket)'
const INCOME_SELECT = 'amount,expected_amount,target_envelope_id'
const TRANSFER_SELECT = 'id,from_kind,to_kind,from_account_id,to_account_id,amount'
const REQUEST_TIMEOUT_MS = 10000

export function unwrap<T>(embed: T | T[] | null | undefined): T | null {
  if (!embed) return null
  return Array.isArray(embed) ? embed[0] ?? null : embed
}

function assertOk(table: string, error: { message: string } | null) {
  if (!error) return
  // Log before throwing. Nitro does not surface a handler error's `message` to the server
  // console, so a 500 from here used to leave no trace at all: a real failure on this route
  // was investigated from the browser's status text alone, with the actual PostgREST error
  // lost. The underlying cause is the only thing worth having when this fires.
  console.error(`[monthFigures] ${table} request failed: ${error.message}`)
  throw createError({
    statusCode: 500,
    statusMessage: 'Failed to load dashboard',
    message: `dashboard: ${table} request failed: ${error.message}`,
  })
}

/**
 * The month's figures behind both the dashboard and the budget libre cap: one set of Data API
 * reads and one formula, so the two can never disagree. `excludeTransferId` leaves one
 * transfer out, for re-checking an edit against the month without the row being edited.
 */
export async function fetchMonthFigures(
  event: H3Event,
  year: number,
  month: number,
  daysRemaining: number,
  options: { excludeTransferId?: string } = {},
) {
  const supabase = createSupabaseServerClient(event)
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)

  let transferQuery = supabase.from('transfers').select(TRANSFER_SELECT)
    .eq('year_assigned', year).eq('month_assigned', month)
  if (options.excludeTransferId) transferQuery = transferQuery.neq('id', options.excludeTransferId)

  const [expenseRes, incomeRes, transferRes, accountRes, savingsEntries] = await Promise.all([
    supabase.from('expense_entries').select(EXPENSE_SELECT)
      .eq('year_assigned', year).eq('month_assigned', month).abortSignal(signal),
    supabase.from('income_entries').select(INCOME_SELECT)
      .eq('year_assigned', year).eq('month_assigned', month).abortSignal(signal),
    transferQuery.abortSignal(signal),
    // Every account, archived included: a closed month's transfers still name them.
    supabase.from('accounts').select('id,name,emoji,kind').abortSignal(signal),
    fetchSavings(event, year, month),
  ])

  assertOk('expense_entries', expenseRes.error)
  assertOk('income_entries', incomeRes.error)
  assertOk('transfers', transferRes.error)
  assertOk('accounts', accountRes.error)

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

  const pocheTotal = savingsEntries.reduce((sum, entry) => sum + entry.amount, 0)

  const accounts = (accountRes.data ?? []) as any[]
  const accountKinds = new Map<string, 'courant' | 'epargne'>(accounts.map((row) => [row.id, row.kind]))
  const transferFlows = ((transferRes.data ?? []) as any[]).map((row): TransferFlow => ({
    fromKind: row.from_kind,
    toKind: row.to_kind,
    fromAccountId: row.from_account_id ?? null,
    toAccountId: row.to_account_id ?? null,
    amount: Number(row.amount),
  }))
  const transferTotals = summariseMonthTransfers(transferFlows, accountKinds)
  const savingsTotal = netSavings(pocheTotal, transferTotals)

  const netByAccount = netByEpargneAccount(transferFlows, accountKinds)
  const byAccount = accounts
    .filter((row) => (netByAccount.get(row.id) ?? 0) !== 0)
    .map((row) => ({ accountId: row.id as string, name: row.name as string, emoji: row.emoji as string, amount: netByAccount.get(row.id)! }))

  const summary = computeMonthSummary({
    incomeReceived: income.received,
    fixed: partition.fixed,
    envelope: partition.envelope,
    variable: partition.variable,
    savings: pocheTotal,
    transfers: transferTotals,
    daysRemaining,
  })

  return { expenseRows, income, savingsEntries, savingsTotal, byAccount, summary }
}
