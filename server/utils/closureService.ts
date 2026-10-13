import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'
import { fetchClosureState, fetchMonthData, fetchArchives } from './closureQuery'
import type { ArchiveRow } from './closureQuery'
import {
  closureWindow, computeLeftovers, planClosure, ClosurePlanError,
  defaultSavingsGoalId, monthLabel, monthName, nextYearMonth,
} from './domain/closure'
import type { YearMonth } from './domain/closure'
import { summariseMonth, buildReportSnapshot } from './domain/reportSnapshot'
import type { MonthSummary, Rule503020View } from './domain/reportSnapshot'
import { userError } from './userError'
import type { ClosureInput } from '../../shared/schemas/closure'

// Data API only — see closureQuery.ts.

export interface ClosureStatusPayload {
  closableMonth: { year: number, month: number, label: string, name: string } | null
}

export interface ClosurePagePayload {
  closable: { year: number, month: number, label: string, nextMonthName: string } | null
  nextOpening: { year: number, month: number, label: string } | null
  envelopes: { id: string, name: string, emoji: string, ceiling: number, netSpent: number, leftover: number }[]
  summary: MonthSummary | null
  rule503020: Rule503020View | null
  savingsGoals: { id: string, name: string, receivesSalaryVariance: boolean }[]
  defaultSavingsGoalId: string | null
  archives: ArchiveRow[]
}

async function currentWindow(event: H3Event, now: Date) {
  return closureWindow({ ...(await fetchClosureState(event)), now })
}

export async function getClosureStatus(event: H3Event, now: Date): Promise<ClosureStatusPayload> {
  const { closable } = await currentWindow(event, now)
  return {
    closableMonth: closable ? { ...closable, label: monthLabel(closable), name: monthName(closable.month) } : null,
  }
}

export async function getClosurePage(event: H3Event, now: Date): Promise<ClosurePagePayload> {
  const [{ closable, nextOpening }, archives] = await Promise.all([currentWindow(event, now), fetchArchives(event)])

  if (!closable) {
    return {
      closable: null,
      nextOpening: nextOpening ? { ...nextOpening, label: `1er ${monthName(nextOpening.month)}` } : null,
      envelopes: [],
      summary: null,
      rule503020: null,
      savingsGoals: [],
      defaultSavingsGoalId: null,
      archives,
    }
  }

  const data = await fetchMonthData(event, closable)
  const { summary, rule503020 } = summariseMonth(data, 0)

  return {
    closable: { ...closable, label: monthLabel(closable), nextMonthName: monthName(nextYearMonth(closable).month) },
    nextOpening: null,
    envelopes: computeLeftovers(data).map((row) => ({
      id: row.envelopeId,
      name: row.name,
      emoji: row.emoji,
      ceiling: row.ceiling,
      netSpent: row.netSpent,
      leftover: row.leftover,
    })),
    summary,
    rule503020,
    savingsGoals: data.savingsGoals,
    defaultSavingsGoalId: defaultSavingsGoalId(data.savingsGoals),
    archives,
  }
}

export async function closeMonth(event: H3Event, input: ClosureInput, now: Date): Promise<YearMonth> {
  const { closable } = await currentWindow(event, now)
  if (!closable || closable.year !== input.year || closable.month !== input.month) {
    throw userError(409, 'Month not closable', closable
      ? `Seul ${monthLabel(closable).toLowerCase()} peut être clôturé maintenant.`
      : "Aucun mois ne peut être clôturé pour l'instant.")
  }

  // Leftovers are always recomputed here; the client only sends destinations.
  const data = await fetchMonthData(event, closable)
  const leftovers = computeLeftovers(data)

  let plan
  try {
    plan = planClosure({ leftovers, decisions: input.decisions, savingsGoalIds: data.savingsGoals.map((goal) => goal.id) })
  }
  catch (error) {
    if (error instanceof ClosurePlanError) throw userError(400, 'Invalid closure', error.message)
    throw error
  }

  const snapshot = buildReportSnapshot({ data, leftovers, plan, closedAt: now })

  const supabase = createSupabaseServerClient(event)
  const { error } = await supabase
    .rpc('close_month', {
      payload: {
        year: closable.year,
        month: closable.month,
        decisions: plan.decisions,
        nextAllocations: plan.nextAllocations,
        freezeAllocations: plan.freezeAllocations,
        savingsEntries: plan.savingsEntries,
        snapshot,
      },
    })
    .abortSignal(AbortSignal.timeout(10000))

  if (error) {
    // The database re-checks what was checked above: a second tab or a double click can
    // get here after the first closure committed.
    if (error.message.includes('MONTH_ALREADY_CLOSED') || error.code === '23505') {
      throw userError(409, 'Month already closed', `${monthLabel(closable)} est déjà clôturé.`)
    }
    if (error.message.includes('PREVIOUS_MONTH_OPEN')) {
      throw userError(409, 'Previous month open', 'Le mois précédent doit être clôturé avant celui-ci.')
    }
    if (error.message.includes('LATER_MONTH_CLOSED')) {
      throw userError(409, 'Later month closed', 'Un mois plus récent est déjà clôturé.')
    }
    console.error(`[closureService] close_month failed: ${error.message}`)
    throw createError({ statusCode: 500, statusMessage: 'Month closure failed' })
  }

  return closable
}
