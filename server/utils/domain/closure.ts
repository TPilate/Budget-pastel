import { computeEnvelopeLedger } from './envelopeLedger'
import type { Bucket5030 } from './dashboard'

export interface YearMonth { year: number, month: number }

const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** Rounds to the cent. Normalises -0 to 0 so a fully spent envelope is never "negative". */
export function toCents(value: number): number {
  const rounded = Math.round(value * 100) / 100
  return rounded === 0 ? 0 : rounded
}

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1]
}

export function monthLabel({ year, month }: YearMonth): string {
  const name = monthName(month)
  return `${name[0].toUpperCase()}${name.slice(1)} ${year}`
}

export function compareYearMonth(a: YearMonth, b: YearMonth): number {
  return (a.year - b.year) * 12 + (a.month - b.month)
}

export function nextYearMonth({ year, month }: YearMonth): YearMonth {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
}

const PARIS_MONTH = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: 'numeric' })

/** The household lives in France; Vercel runs in UTC. A month ends at midnight Paris time. */
export function parisYearMonth(now: Date): YearMonth {
  const parts = PARIS_MONTH.formatToParts(now)
  return {
    year: Number(parts.find((part) => part.type === 'year')!.value),
    month: Number(parts.find((part) => part.type === 'month')!.value),
  }
}

const key = ({ year, month }: YearMonth) => `${year}-${month}`

export function closureWindow(input: {
  firstDataMonth: YearMonth | null
  closedMonths: YearMonth[]
  now: Date
}): { closable: YearMonth | null, nextOpening: YearMonth | null } {
  const current = parisYearMonth(input.now)
  const closed = new Set(input.closedMonths.map(key))

  // Months close strictly in order: walk forward from the first month with data, past
  // every month already closed. The first one found is the only candidate.
  let candidate = input.firstDataMonth
  if (candidate) {
    while (closed.has(key(candidate))) candidate = nextYearMonth(candidate)
  }

  if (candidate && compareYearMonth(candidate, current) < 0) {
    return { closable: candidate, nextOpening: null }
  }

  const pending = candidate && compareYearMonth(candidate, current) > 0 ? candidate : current
  return { closable: null, nextOpening: nextYearMonth(pending) }
}

export interface MonthData {
  month: YearMonth
  /** Every envelope, budget and reserve, archived or not — names are needed for the report. */
  envelopes: {
    id: string
    name: string
    emoji: string
    kind: 'budget' | 'reserve'
    defaultCeiling: number
    bucket: Bucket5030 | null
    archived: boolean
  }[]
  allocations: { envelopeId: string, baseCeiling: number, carriedOverAmount: number, overspendDeduction: number }[]
  expenses: {
    date: string
    label: string
    amount: number
    envelopeId: string | null
    financedBy: 'budget' | 'gift_given' | 'gift_received'
    categoryName: string
    categoryEmoji: string
    categoryBucket: Bucket5030 | null
  }[]
  incomes: {
    date: string
    label: string
    amount: number
    expectedAmount: number | null
    targetEnvelopeId: string | null
    typeName: string
    typeEmoji: string
  }[]
  transfers: { date: string, fromEnvelopeId: string, toEnvelopeId: string, amount: number, reason: string }[]
  /** This month only. */
  savingsEntries: { savingsGoalId: string, amount: number, source: 'manual' | 'closure' }[]
  savingsGoals: { id: string, name: string, receivesSalaryVariance: boolean }[]
}

export interface LeftoverRow {
  envelopeId: string
  name: string
  emoji: string
  defaultCeiling: number
  ceiling: number
  netSpent: number
  leftover: number
  hasAllocation: boolean
}

const sum = (rows: { amount: number }[]) => rows.reduce((total, row) => total + row.amount, 0)

export function computeLeftovers(data: MonthData): LeftoverRow[] {
  const allocationByEnvelope = new Map(data.allocations.map((allocation) => [allocation.envelopeId, allocation]))

  // Reserve envelopes never take part in a closure: their balance already carries
  // forward indefinitely.
  return data.envelopes
    .filter((envelope) => envelope.kind === 'budget' && !envelope.archived)
    .map((envelope) => {
      const allocation = allocationByEnvelope.get(envelope.id) ?? null
      const ledger = computeEnvelopeLedger({
        defaultCeiling: envelope.defaultCeiling,
        allocation: allocation
          ? {
              baseCeiling: allocation.baseCeiling,
              carriedOverAmount: allocation.carriedOverAmount,
              overspendDeduction: allocation.overspendDeduction,
            }
          : null,
        transfersIn: sum(data.transfers.filter((t) => t.toEnvelopeId === envelope.id)),
        transfersOut: sum(data.transfers.filter((t) => t.fromEnvelopeId === envelope.id)),
        expensesTotal: sum(data.expenses.filter((e) => e.envelopeId === envelope.id)),
        incomeCreditsTotal: sum(data.incomes.filter((i) => i.targetEnvelopeId === envelope.id)),
      })

      return {
        envelopeId: envelope.id,
        name: envelope.name,
        emoji: envelope.emoji,
        defaultCeiling: envelope.defaultCeiling,
        ceiling: toCents(ledger.ceiling),
        netSpent: toCents(ledger.netSpent),
        leftover: toCents(ledger.remaining),
        hasAllocation: allocation !== null,
      }
    })
}

export type ClosureDestination = 'carry_over' | 'savings' | 'envelope'

export interface ClosureDecision {
  envelopeId: string
  destination: ClosureDestination
  savingsGoalId?: string | null
  targetEnvelopeId?: string | null
}

export interface PlannedDecision {
  envelopeId: string
  leftoverAmount: number
  destination: ClosureDestination
  savingsGoalId: string | null
  targetEnvelopeId: string | null
}

export interface ClosurePlan {
  decisions: PlannedDecision[]
  /** Month M+1, one row per budget envelope. */
  nextAllocations: { envelopeId: string, baseCeiling: number, carriedOverAmount: number, overspendDeduction: number }[]
  /** Month M, for envelopes that were read live from default_ceiling. */
  freezeAllocations: { envelopeId: string, baseCeiling: number }[]
  /** Dated month M, source 'closure'. */
  savingsEntries: { savingsGoalId: string, amount: number }[]
  totals: { carriedOver: number, toSavings: number, toOtherEnvelopes: number, overspendDeducted: number }
}

export class ClosurePlanError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ClosurePlanError'
  }
}

export function planClosure(input: {
  leftovers: LeftoverRow[]
  decisions: ClosureDecision[]
  savingsGoalIds: string[]
}): ClosurePlan {
  const rowsById = new Map(input.leftovers.map((row) => [row.envelopeId, row]))
  const goalIds = new Set(input.savingsGoalIds)
  const seen = new Set<string>()
  const decisions: PlannedDecision[] = []

  for (const decision of input.decisions) {
    const row = rowsById.get(decision.envelopeId)
    if (!row) throw new ClosurePlanError('Enveloppe inconnue dans la répartition.')
    if (seen.has(row.envelopeId)) throw new ClosurePlanError(`« ${row.name} » a reçu deux destinations.`)
    seen.add(row.envelopeId)

    // Amounts always come from the server-side recomputation, never from the client.
    if (row.leftover <= 0) throw new ClosurePlanError(`« ${row.name} » n'a pas de reliquat à répartir.`)

    if (decision.destination === 'savings' && !(decision.savingsGoalId && goalIds.has(decision.savingsGoalId))) {
      throw new ClosurePlanError(`Choisissez une poche d'épargne pour « ${row.name} ».`)
    }
    if (decision.destination === 'envelope') {
      const target = decision.targetEnvelopeId
      if (!target || target === row.envelopeId || !rowsById.has(target)) {
        throw new ClosurePlanError(`Choisissez une autre enveloppe pour « ${row.name} ».`)
      }
    }

    decisions.push({
      envelopeId: row.envelopeId,
      leftoverAmount: row.leftover,
      destination: decision.destination,
      savingsGoalId: decision.destination === 'savings' ? decision.savingsGoalId! : null,
      targetEnvelopeId: decision.destination === 'envelope' ? decision.targetEnvelopeId! : null,
    })
  }

  const missing = input.leftovers.filter((row) => row.leftover > 0 && !seen.has(row.envelopeId))
  if (missing.length === 1) throw new ClosurePlanError(`Il reste 1 reliquat à répartir (« ${missing[0].name} »).`)
  if (missing.length > 1) throw new ClosurePlanError(`Il reste ${missing.length} reliquats à répartir.`)

  const carried = new Map<string, number>()
  const savings = new Map<string, number>()
  const totals = { carriedOver: 0, toSavings: 0, toOtherEnvelopes: 0, overspendDeducted: 0 }
  const add = (map: Map<string, number>, id: string, amount: number) => map.set(id, (map.get(id) ?? 0) + amount)

  for (const decision of decisions) {
    if (decision.destination === 'carry_over') {
      add(carried, decision.envelopeId, decision.leftoverAmount)
      totals.carriedOver += decision.leftoverAmount
    }
    else if (decision.destination === 'envelope') {
      add(carried, decision.targetEnvelopeId!, decision.leftoverAmount)
      totals.toOtherEnvelopes += decision.leftoverAmount
    }
    else {
      add(savings, decision.savingsGoalId!, decision.leftoverAmount)
      totals.toSavings += decision.leftoverAmount
    }
  }

  const nextAllocations = input.leftovers.map((row) => {
    // An overspend is never a choice: it is taken off the same envelope next month.
    const overspend = row.leftover < 0 ? -row.leftover : 0
    totals.overspendDeducted += overspend
    return {
      envelopeId: row.envelopeId,
      baseCeiling: row.defaultCeiling,
      carriedOverAmount: toCents(carried.get(row.envelopeId) ?? 0),
      overspendDeduction: toCents(overspend),
    }
  })

  return {
    decisions,
    nextAllocations,
    // Without a row, month M's ceiling is read live from default_ceiling, and editing
    // that later would rewrite the history of a closed month.
    freezeAllocations: input.leftovers
      .filter((row) => !row.hasAllocation)
      .map((row) => ({ envelopeId: row.envelopeId, baseCeiling: row.defaultCeiling })),
    savingsEntries: [...savings].map(([savingsGoalId, amount]) => ({ savingsGoalId, amount: toCents(amount) })),
    totals: {
      carriedOver: toCents(totals.carriedOver),
      toSavings: toCents(totals.toSavings),
      toOtherEnvelopes: toCents(totals.toOtherEnvelopes),
      overspendDeducted: toCents(totals.overspendDeducted),
    },
  }
}

export function defaultSavingsGoalId(goals: { id: string, receivesSalaryVariance: boolean }[]): string | null {
  return (goals.find((goal) => goal.receivesSalaryVariance) ?? goals[0])?.id ?? null
}
