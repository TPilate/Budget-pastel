import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'
import { listBudgetEnvelopeLedgers } from './envelopeCeilingsQuery'
import { listReserveEnvelopeBalances } from './reserveEnvelopeQuery'
import { computeAccountTotals, summariseFixedCharges } from './domain/accountsOverview'
import type { AccountKind } from './domain/accountsOverview'

const REQUEST_TIMEOUT_MS = 10000

export interface AccountsOverview {
  bankBalance: number
  committed: number
  reallyFree: number
  accounts: { id: string, name: string, emoji: string, balance: number, kind: AccountKind }[]
  fixedCharges: {
    lines: { id: string, name: string, amount: number, isSettled: boolean }[]
    total: number
    settledCount: number
    totalCount: number
  }
  variableSpend: { id: string, name: string, spent: number, ceiling: number }[]
}

function assertOk(table: string, error: { message: string } | null) {
  if (!error) return
  // Log before throwing: Nitro does not surface a handler error's `message` to the server
  // console, so without this a 500 from here leaves no server-side trace of the cause.
  console.error(`[accountsOverviewQuery] ${table} request failed: ${error.message}`)
  throw createError({
    statusCode: 500,
    statusMessage: 'Failed to load accounts overview',
    message: `accounts overview: ${table} request failed: ${error.message}`,
  })
}

export async function fetchAccountsOverview(
  event: H3Event,
  year: number,
  month: number,
): Promise<AccountsOverview> {
  const supabase = createSupabaseServerClient(event)
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)

  // New reads go through the Data API; the two envelope helpers already exist and
  // are reused rather than reimplemented.
  //
  // listBudgetEnvelopeLedgers and listReserveEnvelopeBalances are both pool-backed (5
  // and 3 round-trips respectively). They are awaited one after another, not inside the
  // Promise.all below, so this route never holds more than 5 pool slots at once instead
  // of 8 — the same reasoning as /api/dashboard (server/utils/dashboardQuery.ts): the
  // pool-wait queue postgres.js falls back to has no timeout, so an exhausted pool hangs
  // a request forever instead of erroring. Do not fold these back into the Promise.all.
  const ledgers = await listBudgetEnvelopeLedgers(year, month)
  const reserves = await listReserveEnvelopeBalances()

  const [accountsRes, categoriesRes, expensesRes] = await Promise.all([
    supabase.from('accounts').select('id,name,emoji,current_balance,kind')
      .is('archived_at', null).order('sort_order').abortSignal(signal),
    supabase.from('categories').select('id,name,default_target')
      .eq('is_fixed', true).is('archived_at', null).order('sort_order').abortSignal(signal),
    supabase.from('expense_entries').select('category_id')
      .eq('year_assigned', year).eq('month_assigned', month).abortSignal(signal),
  ])

  assertOk('accounts', accountsRes.error)
  assertOk('categories', categoriesRes.error)
  assertOk('expense_entries', expensesRes.error)

  const accounts = (accountsRes.data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    balance: Number(row.current_balance),
    kind: row.kind as AccountKind,
  }))

  const totals = computeAccountTotals({
    accounts: accounts.map((account) => ({ balance: account.balance, kind: account.kind })),
    budgetEnvelopeRemaining: ledgers.map((ledger) => ledger.remaining),
    reserveBalances: reserves.map((reserve) => reserve.balance),
  })

  const fixedCharges = summariseFixedCharges({
    fixedCategories: (categoriesRes.data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      defaultTarget: row.default_target === null ? null : Number(row.default_target),
    })),
    expensesThisMonth: (expensesRes.data ?? []).map((row: any) => ({ categoryId: row.category_id })),
  })

  return {
    ...totals,
    accounts,
    fixedCharges,
    variableSpend: ledgers.map((ledger) => ({
      id: ledger.id,
      name: ledger.name,
      spent: ledger.netSpent,
      ceiling: ledger.ceiling,
    })),
  }
}
