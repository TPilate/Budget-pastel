import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'
import { buildMovementsFeed } from './domain/movementsFeed'
import type { Movement } from './domain/movementsFeed'

// This module deliberately does NOT import ./db. It reads through Supabase's Data
// API (PostgREST) over stateless HTTPS, so there is no connection pool to exhaust
// and no untimed pool-wait queue to hang on — the failure mode that made
// /api/movements unloadable. See docs/superpowers/notes/2026-09-21-vercel-dashboard-hang.md.
//
// It also replaces six flat selects joined with JS Maps by three requests whose
// joins Postgres resolves via embedded resources.
//
// The month feed and a single envelope's journal are the same query at different
// scopes, so they share one implementation. Previously envelopeJournalQuery.ts held
// a verbatim copy of the mapping below, which meant two places to keep in sync with
// the PostgREST row shape.

// `categories`/`envelopes`/`accounts` resolve unambiguously: expense_entries has
// exactly one foreign key to each.
const EXPENSE_SELECT
  = 'id,date,label,amount,financed_by,'
  + 'categories(name,emoji,is_fixed),'
  + 'envelopes(name,emoji),'
  + 'accounts(name)'

// income_entries reaches envelopes through target_envelope_id; naming the column
// picks that relationship.
const INCOME_SELECT
  = 'id,date_received,label,amount,'
  + 'envelopes:target_envelope_id(name,emoji)'

// transfers has TWO foreign keys to envelopes, so a bare `envelopes(...)` embed is
// ambiguous and PostgREST answers 300 (PGRST201). Each side is disambiguated by
// foreign-key name and aliased so the direction is explicit at the call site.
const TRANSFER_SELECT
  = 'id,date,reason,amount,'
  + 'from_envelope:envelopes!from_envelope_id(name),'
  + 'to_envelope:envelopes!to_envelope_id(name)'

// Node's fetch has no default timeout. Without this, a stalled request would hang
// the handler indefinitely — reintroducing exactly the symptom this migration removes.
const REQUEST_TIMEOUT_MS = 10000

interface EmbeddedName { name: string, emoji?: string | null }

/** PostgREST returns `null` for an embed whose foreign key is null. */
function unwrap(embed: EmbeddedName | EmbeddedName[] | null | undefined): EmbeddedName | null {
  if (!embed) return null
  return Array.isArray(embed) ? embed[0] ?? null : embed
}

function assertOk(table: string, error: { message: string } | null) {
  if (!error) return
  // Never degrade to a partial feed: an empty array would read as "nothing this
  // month" and quietly mask an RLS or schema problem.
  throw createError({
    statusCode: 500,
    statusMessage: 'Failed to load movements',
    message: `movements: ${table} request failed: ${error.message}`,
  })
}

/**
 * Fetches one month's movements, optionally narrowed to a single envelope.
 *
 * With `envelopeId`, the scope is that envelope's journal: expenses charged to it,
 * income credited to it, and transfers on either side of it. Without, it is the
 * whole month's feed.
 */
async function fetchFeed(
  event: H3Event,
  year: number,
  month: number,
  envelopeId?: string,
): Promise<Movement[]> {
  const supabase = createSupabaseServerClient(event)
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)

  let expenseQuery = supabase.from('expense_entries').select(EXPENSE_SELECT)
    .eq('year_assigned', year).eq('month_assigned', month)
  let incomeQuery = supabase.from('income_entries').select(INCOME_SELECT)
    .eq('year_assigned', year).eq('month_assigned', month)
  let transferQuery = supabase.from('transfers').select(TRANSFER_SELECT)
    .eq('year_assigned', year).eq('month_assigned', month)

  if (envelopeId) {
    expenseQuery = expenseQuery.eq('envelope_id', envelopeId)
    incomeQuery = incomeQuery.eq('target_envelope_id', envelopeId)
    // A transfer belongs to this envelope's journal whether it left or arrived, so
    // both foreign keys are matched. `or` takes raw PostgREST filter syntax.
    transferQuery = transferQuery.or(
      `from_envelope_id.eq.${envelopeId},to_envelope_id.eq.${envelopeId}`,
    )
  }

  const [expenseRes, incomeRes, transferRes] = await Promise.all([
    expenseQuery.abortSignal(signal),
    incomeQuery.abortSignal(signal),
    transferQuery.abortSignal(signal),
  ])

  assertOk('expense_entries', expenseRes.error)
  assertOk('income_entries', incomeRes.error)
  assertOk('transfers', transferRes.error)

  const expenses = (expenseRes.data ?? []).map((row: any) => {
    const category = unwrap(row.categories)
    const envelope = unwrap(row.envelopes)
    const account = unwrap(row.accounts)
    return {
      id: row.id,
      date: row.date,
      label: row.label,
      amount: Number(row.amount),
      financedBy: row.financed_by,
      envelopeName: envelope?.name ?? null,
      envelopeEmoji: envelope?.emoji ?? null,
      // category_id is NOT NULL, so the embed is always present.
      categoryName: category?.name ?? '',
      categoryEmoji: category?.emoji ?? '',
      categoryIsFixed: Boolean(category && (category as any).is_fixed),
      accountName: account?.name ?? null,
    }
  })

  const incomes = (incomeRes.data ?? []).map((row: any) => {
    const envelope = unwrap(row.envelopes)
    return {
      id: row.id,
      date: row.date_received,
      label: row.label,
      amount: Number(row.amount),
      envelopeName: envelope?.name ?? null,
      envelopeEmoji: envelope?.emoji ?? null,
    }
  })

  const transferMovements = (transferRes.data ?? []).map((row: any) => ({
    id: row.id,
    date: row.date,
    reason: row.reason,
    amount: Number(row.amount),
    fromEnvelopeName: unwrap(row.from_envelope)?.name ?? '?',
    toEnvelopeName: unwrap(row.to_envelope)?.name ?? '?',
  }))

  return buildMovementsFeed({ expenses, incomes, transfers: transferMovements })
}

/** Every movement assigned to the given month. */
export function fetchMovements(event: H3Event, year: number, month: number): Promise<Movement[]> {
  return fetchFeed(event, year, month)
}

/** One envelope's movements for the given month. */
export function fetchEnvelopeJournal(
  event: H3Event,
  envelopeId: string,
  year: number,
  month: number,
): Promise<Movement[]> {
  return fetchFeed(event, year, month, envelopeId)
}
