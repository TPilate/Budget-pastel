import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'
import { computeEnvelopeLedger } from './domain/envelopeLedger'
import { deriveEnvelopeSubtitle } from './domain/envelopeSubtitle'

export interface BudgetEnvelopeLedger {
  id: string
  name: string
  emoji: string
  showOnHome: boolean
  ceiling: number
  netSpent: number
  remaining: number
  subtitle: string | null
  // Expenses minus credits gives netSpent, which cannot be un-mixed afterwards. The
  // dashboard needs the credits separately to render "+20 € reçus".
  incomeCreditsTotal: number
  // `ceiling` above is computed (base + carry-over - overspend + transfers) and so is not
  // editable. The envelope edit form needs the stored defaultCeiling, which is the field
  // PATCH /api/envelopes/[id] actually writes.
  defaultCeiling: number
}

// Data API only. This used to hold five pool slots per call, from the sidebar on every
// render, the dashboard, Comptes and Envies; on the Data API it can be combined with other
// reads in one page request without exhausting the pool.
const REQUEST_TIMEOUT_MS = 10000

function assertOk(table: string, error: { message: string } | null) {
  if (!error) return
  console.error(`[envelopeCeilingsQuery] ${table} request failed: ${error.message}`)
  throw createError({
    statusCode: 500,
    statusMessage: 'Failed to load envelopes',
    message: `envelope ledgers: ${table} request failed: ${error.message}`,
  })
}

const sum = (rows: { amount: unknown }[]) => rows.reduce((total, row) => total + Number(row.amount), 0)

export async function listBudgetEnvelopeLedgers(event: H3Event, year: number, month: number): Promise<BudgetEnvelopeLedger[]> {
  const supabase = createSupabaseServerClient(event)
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)

  const [envelopesRes, allocationsRes, expensesRes, incomesRes, transfersRes] = await Promise.all([
    supabase.from('envelopes').select('id,name,emoji,show_on_home,default_ceiling')
      .eq('kind', 'budget').is('archived_at', null).order('sort_order').abortSignal(signal),
    supabase.from('monthly_envelope_allocations').select('envelope_id,base_ceiling,carried_over_amount,overspend_deduction')
      .eq('year', year).eq('month', month).abortSignal(signal),
    supabase.from('expense_entries').select('envelope_id,amount')
      .eq('year_assigned', year).eq('month_assigned', month).not('envelope_id', 'is', null).abortSignal(signal),
    supabase.from('income_entries').select('target_envelope_id,amount')
      .eq('year_assigned', year).eq('month_assigned', month).not('target_envelope_id', 'is', null).abortSignal(signal),
    supabase.from('transfers').select('from_envelope_id,to_envelope_id,amount')
      .eq('year_assigned', year).eq('month_assigned', month).abortSignal(signal),
  ])

  assertOk('envelopes', envelopesRes.error)
  assertOk('monthly_envelope_allocations', allocationsRes.error)
  assertOk('expense_entries', expensesRes.error)
  assertOk('income_entries', incomesRes.error)
  assertOk('transfers', transfersRes.error)

  const allocations = (allocationsRes.data ?? []) as any[]
  const expenses = (expensesRes.data ?? []) as any[]
  const incomes = (incomesRes.data ?? []) as any[]
  const transfers = (transfersRes.data ?? []) as any[]
  const allocationByEnvelopeId = new Map(allocations.map((row) => [row.envelope_id, row]))

  return ((envelopesRes.data ?? []) as any[]).map((envelope) => {
    const allocation = allocationByEnvelopeId.get(envelope.id)
    const carriedOverAmount = allocation ? Number(allocation.carried_over_amount) : 0
    const transfersInTotal = sum(transfers.filter((row) => row.to_envelope_id === envelope.id))
    const transfersOutTotal = sum(transfers.filter((row) => row.from_envelope_id === envelope.id))
    const incomeCreditsTotal = sum(incomes.filter((row) => row.target_envelope_id === envelope.id))
    const defaultCeiling = Number(envelope.default_ceiling ?? 0)

    const ledger = computeEnvelopeLedger({
      defaultCeiling,
      allocation: allocation
        ? {
            baseCeiling: Number(allocation.base_ceiling),
            carriedOverAmount,
            overspendDeduction: Number(allocation.overspend_deduction),
          }
        : null,
      transfersIn: transfersInTotal,
      transfersOut: transfersOutTotal,
      expensesTotal: sum(expenses.filter((row) => row.envelope_id === envelope.id)),
      incomeCreditsTotal,
    })

    return {
      id: envelope.id,
      name: envelope.name,
      emoji: envelope.emoji,
      showOnHome: Boolean(envelope.show_on_home),
      ...ledger,
      incomeCreditsTotal,
      defaultCeiling,
      subtitle: deriveEnvelopeSubtitle({
        carriedOverAmount,
        netTransfer: transfersInTotal - transfersOutTotal,
        incomeCreditsTotal,
      }),
    }
  })
}
