import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'
import { computeAccountBalance } from './domain/accountBalance'

const REQUEST_TIMEOUT_MS = 10000

// Balance of every account, archived included, through the Data API: the hand-set reference
// plus the account-side transfers recorded since.
export async function fetchAccountBalances(event: H3Event): Promise<Map<string, number>> {
  const supabase = createSupabaseServerClient(event)
  const [accountsResult, transfersResult] = await Promise.all([
    supabase.from('accounts')
      .select('id,current_balance,reference_set_at')
      .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS)),
    supabase.from('transfers')
      .select('from_account_id,to_account_id,amount,created_at')
      .or('from_kind.eq.account,to_kind.eq.account')
      .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS)),
  ])

  if (accountsResult.error) {
    console.error(`[accountBalanceQuery] accounts request failed: ${accountsResult.error.message}`)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to load account balances',
      message: `account balances: accounts request failed: ${accountsResult.error.message}`,
    })
  }
  if (transfersResult.error) {
    console.error(`[accountBalanceQuery] transfers request failed: ${transfersResult.error.message}`)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to load account balances',
      message: `account balances: transfers request failed: ${transfersResult.error.message}`,
    })
  }

  const transfers = (transfersResult.data ?? []).map((row: any) => ({
    fromAccountId: row.from_account_id as string | null,
    toAccountId: row.to_account_id as string | null,
    amount: Number(row.amount),
    createdAt: row.created_at as string,
  }))

  return new Map((accountsResult.data ?? []).map((row: any) => [
    row.id as string,
    computeAccountBalance({
      referenceBalance: Number(row.current_balance),
      referenceSetAt: row.reference_set_at,
      transfers,
    }, row.id),
  ]))
}
