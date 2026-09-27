import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'

const SAVINGS_SELECT = 'savings_goal_id,amount,savings_goals(name)'
const REQUEST_TIMEOUT_MS = 10000

export interface SavingsEntryView {
  goalId: string
  goalName: string
  amount: number
}

interface EmbeddedGoal { name: string }

function unwrap(embed: EmbeddedGoal | EmbeddedGoal[] | null | undefined): EmbeddedGoal | null {
  if (!embed) return null
  return Array.isArray(embed) ? embed[0] ?? null : embed
}

export async function fetchSavings(event: H3Event, year: number, month: number): Promise<SavingsEntryView[]> {
  const supabase = createSupabaseServerClient(event)

  const result = await supabase
    .from('savings_entries')
    .select(SAVINGS_SELECT)
    .eq('year', year)
    .eq('month', month)
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS))

  if (result.error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to load savings',
      message: `savings: savings_entries request failed: ${result.error.message}`,
    })
  }

  // savings_entries has no unique index on (savings_goal_id, year, month), so two rows
  // for one goal are possible. Summing keeps the displayed total correct either way.
  const byGoal = new Map<string, SavingsEntryView>()
  for (const row of result.data ?? []) {
    const goalId = (row as any).savings_goal_id
    const existing = byGoal.get(goalId)
    const amount = Number((row as any).amount)
    if (existing) existing.amount += amount
    else byGoal.set(goalId, { goalId, goalName: unwrap((row as any).savings_goals)?.name ?? '', amount })
  }

  return [...byGoal.values()]
}
