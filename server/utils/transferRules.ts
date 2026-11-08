import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'
import { userError, formatEuroServer } from './userError'
import { fetchBudgetLibre } from './budgetLibreQuery'
import { transferYearMonth } from '../../shared/schemas/transfer'
import type { TransferEndpoint, TransferInput } from '../../shared/schemas/transfer'
import type { transfers } from '../../drizzle/schema'

const REQUEST_TIMEOUT_MS = 10000

type TransferRow = typeof transfers.$inferSelect

function sideValues(endpoint: TransferEndpoint) {
  return {
    kind: endpoint.kind,
    envelopeId: endpoint.kind === 'envelope' ? endpoint.envelopeId : null,
    accountId: endpoint.kind === 'account' ? endpoint.accountId : null,
  }
}

// The row each create and edit endpoint writes, so POST and PATCH never derive it differently.
export function transferRowValues(input: TransferInput) {
  const { year: yearAssigned, month: monthAssigned } = transferYearMonth(input.date)
  const from = sideValues(input.from)
  const to = sideValues(input.to)
  return {
    date: input.date,
    fromKind: from.kind,
    fromEnvelopeId: from.envelopeId,
    fromAccountId: from.accountId,
    toKind: to.kind,
    toEnvelopeId: to.envelopeId,
    toAccountId: to.accountId,
    amount: String(input.amount),
    reason: input.reason,
    monthAssigned,
    yearAssigned,
  }
}

async function readByIds(event: H3Event, table: 'envelopes' | 'accounts', columns: string, ids: string[]): Promise<any[]> {
  if (ids.length === 0) return []
  const supabase = createSupabaseServerClient(event)
  const { data, error } = await supabase.from(table)
    .select(columns)
    .in('id', ids)
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS))
  if (error) {
    console.error(`[transferRules] ${table} request failed: ${error.message}`)
    throw createError({ statusCode: 500, statusMessage: 'Failed to check transfer endpoints', message: `transfer endpoints: ${table} request failed: ${error.message}` })
  }
  return data ?? []
}

// Reserves hold money set aside, not a spending allowance: they take no transfer. An account
// archived since the transfer was written stays valid for that transfer's own edits only.
export async function assertTransferEndpoints(event: H3Event, input: TransferInput, current?: TransferRow): Promise<void> {
  const sides = [input.from, input.to]
  const envelopeIds = sides.flatMap((s) => (s.kind === 'envelope' ? [s.envelopeId] : []))
  const accountIds = sides.flatMap((s) => (s.kind === 'account' ? [s.accountId] : []))

  const [envelopes, accounts] = await Promise.all([
    readByIds(event, 'envelopes', 'id,kind', envelopeIds),
    readByIds(event, 'accounts', 'id,archived_at', accountIds),
  ])

  for (const id of envelopeIds) {
    const envelope = envelopes.find((e) => e.id === id)
    if (!envelope) throw userError(400, 'Unknown envelope', "Cette enveloppe n'existe plus.")
    if (envelope.kind === 'reserve') {
      throw userError(400, 'Reserve envelope', 'Les enveloppes de réserve ne peuvent pas recevoir de transfert.')
    }
  }

  // An archived account is accepted only where the row already had it: same account, same side.
  const keptAccount = (side: 'from' | 'to', id: string) =>
    (side === 'from' ? current?.fromAccountId : current?.toAccountId) === id
  for (const [side, endpoint] of [['from', input.from], ['to', input.to]] as const) {
    if (endpoint.kind !== 'account') continue
    const id = endpoint.accountId
    const account = accounts.find((a) => a.id === id)
    if (!account || (account.archived_at && !keptAccount(side, id))) {
      throw userError(400, 'Account unavailable', "Ce compte n'est plus disponible.")
    }
  }
}

export function assertNotClosureRow(row: { source: string }, message: string): void {
  if (row.source === 'closure') throw userError(409, 'Closure row', message)
}

// Money taken from the month's budget cannot exceed what no envelope holds. An edit is
// re-checked with the row itself left out, so it is not counted against its own change.
export async function assertWithinBudgetLibre(event: H3Event, input: TransferInput, excludeTransferId?: string): Promise<void> {
  if (input.from.kind !== 'budget') return
  const { year, month } = transferYearMonth(input.date)
  const libre = await fetchBudgetLibre(event, { year, month }, { excludeTransferId })
  if (input.amount > libre + 0.005) {
    throw userError(400, 'Budget libre exceeded', `Le budget du mois n'a que ${formatEuroServer(Math.max(libre, 0))} de disponible.`)
  }
}
