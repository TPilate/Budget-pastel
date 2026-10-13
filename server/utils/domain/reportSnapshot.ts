import { summariseIncome, compute503020 } from './dashboard'
import type { Bucket5030 } from './dashboard'
import { monthLabel, toCents } from './closure'
import type { MonthData, LeftoverRow, ClosurePlan, PlannedDecision } from './closure'

export interface MonthSummary { income: number, spent: number, saved: number, remaining: number }
export interface Rule503020View {
  targets: Record<Bucket5030, number>
  actuals: Record<Bucket5030, number>
}

export interface ReportSnapshotV1 {
  version: 1
  month: { year: number, month: number, label: string }
  closedAt: string
  summary: MonthSummary
  rule503020: Rule503020View
  incomes: { date: string, label: string, typeName: string, typeEmoji: string, amount: number, targetEnvelopeName: string | null }[]
  expenses: { date: string, label: string, categoryName: string, categoryEmoji: string, envelopeName: string | null, financedBy: string, amount: number }[]
  transfers: { date: string, fromName: string, toName: string, reason: string | null, amount: number }[]
  envelopes: { name: string, emoji: string, ceiling: number, netSpent: number, leftover: number, destinationLabel: string | null }[]
  savings: { goalName: string, manual: number, fromClosure: number }[]
  closure: ClosurePlan['totals']
}

const sum = (rows: { amount: number }[]) => rows.reduce((total, row) => total + row.amount, 0)

/**
 * The month's headline figures, with the same rules as the dashboard and Épargne:
 * envelope-targeted income is a reimbursement, gift-received spend is not budget money,
 * and an envelope's bucket outranks its category's.
 */
export function summariseMonth(data: MonthData, closureSavings: number): { summary: MonthSummary, rule503020: Rule503020View } {
  const income = summariseIncome(data.incomes.map((income) => ({
    amount: income.amount,
    expectedAmount: income.expectedAmount,
    targetEnvelopeId: income.targetEnvelopeId,
  }))).received

  const budgetSpend = data.expenses.filter((expense) => expense.financedBy !== 'gift_received')
  const spent = sum(budgetSpend)
  const saved = sum(data.savingsEntries.filter((entry) => entry.source === 'manual')) + closureSavings

  const bucketByEnvelope = new Map(data.envelopes.map((envelope) => [envelope.id, envelope.bucket]))
  const rule = compute503020({
    incomeReceived: income,
    taggedSpend: budgetSpend.map((expense) => ({
      amount: expense.amount,
      bucket: (expense.envelopeId !== null ? bucketByEnvelope.get(expense.envelopeId) : expense.categoryBucket) ?? null,
    })),
    savings: saved,
  })

  return {
    summary: {
      income: toCents(income),
      spent: toCents(spent),
      saved: toCents(saved),
      remaining: toCents(income - spent - saved),
    },
    rule503020: { targets: rule.targets, actuals: rule.actuals },
  }
}

export function buildReportSnapshot(input: {
  data: MonthData
  leftovers: LeftoverRow[]
  plan: ClosurePlan
  closedAt: Date
}): ReportSnapshotV1 {
  const { data, leftovers, plan } = input
  const envelopeName = (id: string | null) => (id ? data.envelopes.find((e) => e.id === id)?.name ?? null : null)
  const goalName = (id: string | null) => data.savingsGoals.find((g) => g.id === id)?.name ?? ''
  const decisionByEnvelope = new Map(plan.decisions.map((decision) => [decision.envelopeId, decision]))

  function destinationLabel(row: LeftoverRow, decision: PlannedDecision | undefined): string | null {
    if (row.leftover < 0) return 'Déduit le mois suivant'
    if (!decision) return null
    if (decision.destination === 'carry_over') return 'Reporté'
    if (decision.destination === 'savings') return `Épargne · ${goalName(decision.savingsGoalId)}`
    return `Vers ${envelopeName(decision.targetEnvelopeId)}`
  }

  const { summary, rule503020 } = summariseMonth(data, plan.totals.toSavings)

  return {
    version: 1,
    month: { ...data.month, label: monthLabel(data.month) },
    closedAt: input.closedAt.toISOString(),
    summary,
    rule503020,
    incomes: data.incomes.map((income) => ({
      date: income.date,
      label: income.label,
      typeName: income.typeName,
      typeEmoji: income.typeEmoji,
      amount: income.amount,
      targetEnvelopeName: envelopeName(income.targetEnvelopeId),
    })),
    expenses: data.expenses.map((expense) => ({
      date: expense.date,
      label: expense.label,
      categoryName: expense.categoryName,
      categoryEmoji: expense.categoryEmoji,
      envelopeName: envelopeName(expense.envelopeId),
      financedBy: expense.financedBy,
      amount: expense.amount,
    })),
    transfers: data.transfers.map((transfer) => ({
      date: transfer.date,
      fromName: envelopeName(transfer.fromEnvelopeId) ?? '—',
      toName: envelopeName(transfer.toEnvelopeId) ?? '—',
      reason: transfer.reason || null,
      amount: transfer.amount,
    })),
    envelopes: leftovers.map((row) => ({
      name: row.name,
      emoji: row.emoji,
      ceiling: row.ceiling,
      netSpent: row.netSpent,
      leftover: row.leftover,
      destinationLabel: destinationLabel(row, decisionByEnvelope.get(row.envelopeId)),
    })),
    savings: data.savingsGoals.map((goal) => ({
      goalName: goal.name,
      manual: toCents(sum(data.savingsEntries.filter((e) => e.savingsGoalId === goal.id && e.source === 'manual'))),
      fromClosure: plan.savingsEntries.find((entry) => entry.savingsGoalId === goal.id)?.amount ?? 0,
    })),
    closure: plan.totals,
  }
}
