import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'
import { computeAccountBalance } from './domain/accountBalance'

const REQUEST_TIMEOUT_MS = 10000

// Balance of every account, archived included, through the Data API.
// Task 6 feeds the account-side transfers in; until then no transfer can touch an account.
export async function fetchAccountBalances(event: H3Event): Promise<Map<string, number>> {
  const supabase = createSupabaseServerClient(event)
  const { data, error } = await supabase.from('accounts')
    .select('id,current_balance,reference_set_at')
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS))

  if (error) {
    console.error(`[accountBalanceQuery] accounts request failed: ${error.message}`)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to load account balances',
      message: `account balances: accounts request failed: ${error.message}`,
    })
  }

  return new Map((data ?? []).map((row: any) => [
    row.id as string,
    computeAccountBalance({
      referenceBalance: Number(row.current_balance),
      referenceSetAt: row.reference_set_at,
      transfers: [],
    }, row.id),
  ]))
}
