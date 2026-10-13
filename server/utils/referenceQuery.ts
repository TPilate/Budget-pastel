import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'

// Data API twin of referenceCrud.listActiveRows, for page endpoints that combine several
// lists in one request: on the pool, Paramètres alone would hold four slots at once.
// Rows are camelCased so the JSON a page receives is the same shape as before.
const REQUEST_TIMEOUT_MS = 10000

export type ReferenceTable = 'categories' | 'envelopes' | 'income_types' | 'accounts'

export function camelizeRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase()),
    value,
  ]))
}

function assertOk(table: string, error: { message: string } | null) {
  if (!error) return
  console.error(`[referenceQuery] ${table} request failed: ${error.message}`)
  throw createError({
    statusCode: 500,
    statusMessage: 'Failed to load reference data',
    message: `reference: ${table} request failed: ${error.message}`,
  })
}

export async function fetchActiveRows(event: H3Event, table: ReferenceTable): Promise<Record<string, unknown>[]> {
  const { data, error } = await createSupabaseServerClient(event)
    .from(table).select('*').is('archived_at', null).order('sort_order')
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS))
  assertOk(table, error)
  return (data ?? []).map((row: any) => camelizeRow(row))
}

export async function fetchSavingsGoals(event: H3Event): Promise<Record<string, unknown>[]> {
  // savings_goals has no archived_at column, so every row is live.
  const { data, error } = await createSupabaseServerClient(event)
    .from('savings_goals').select('*').order('sort_order')
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS))
  assertOk('savings_goals', error)
  return (data ?? []).map((row: any) => camelizeRow(row))
}
