import type { Movement } from '../../../shared/types/movement'

export type { Movement } from '../../../shared/types/movement'

export interface RawExpenseMovement {
  id: string
  date: string
  label: string
  amount: number
  financedBy: 'budget' | 'gift_given' | 'gift_received'
  envelopeName: string | null
  envelopeEmoji: string | null
  categoryName: string
  categoryEmoji: string
  categoryIsFixed: boolean
  accountName: string | null
  categoryId: string | null
  envelopeId: string | null
  accountId: string | null
}

export interface RawIncomeMovement {
  id: string
  date: string
  label: string
  amount: number
  envelopeName: string | null
  envelopeEmoji: string | null
  incomeTypeId: string
  monthAssigned: number
  yearAssigned: number
  detailsText: string | null
  targetEnvelopeId: string | null
}

export interface RawTransferMovement {
  id: string
  date: string
  reason: string
  amount: number
  fromEnvelopeName: string
  toEnvelopeName: string
  fromEnvelopeId: string
  toEnvelopeId: string
}

export interface RawSavingsMovement {
  id: string
  date: string | null
  year: number
  month: number
  amount: number
  goalName: string
  source: 'manual' | 'closure'
  savingsGoalId: string
}

function firstOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

export function buildMovementsFeed(input: {
  expenses: RawExpenseMovement[]
  incomes: RawIncomeMovement[]
  transfers: RawTransferMovement[]
  savings?: RawSavingsMovement[]
  // A closed month is frozen, so nothing in it can be opened for editing.
  monthOpen?: boolean
}): Movement[] {
  const monthOpen = input.monthOpen ?? true

  const expenseMovements: Movement[] = input.expenses.map((expense) => ({
    id: expense.id,
    type: 'expense',
    date: expense.date,
    label: expense.label,
    envelopeLabel: expense.envelopeName
      ? `${expense.envelopeEmoji} ${expense.envelopeName}`
      : expense.categoryIsFixed
        ? 'Charges fixes'
        : `${expense.categoryEmoji} ${expense.categoryName}`,
    origin: expense.financedBy === 'gift_received'
      ? 'Cadeau reçu'
      : expense.financedBy === 'gift_given'
        ? 'Cadeau offert'
        : (expense.accountName ?? '—'),
    amount: -expense.amount,
    sign: 'negative',
    editable: monthOpen,
    fields: {
      date: expense.date,
      categoryId: expense.categoryId,
      label: expense.label,
      amount: expense.amount,
      accountId: expense.accountId,
      envelopeId: expense.envelopeId,
      financedBy: expense.financedBy,
    },
  }))

  const incomeMovements: Movement[] = input.incomes.map((income) => ({
    id: income.id,
    type: 'income',
    date: income.date,
    label: income.label,
    envelopeLabel: income.envelopeName ? `${income.envelopeEmoji} ${income.envelopeName}` : '—',
    origin: 'Virement',
    amount: income.amount,
    sign: 'positive',
    editable: monthOpen,
    fields: {
      incomeTypeId: income.incomeTypeId,
      label: income.label,
      amount: income.amount,
      dateReceived: income.date,
      monthAssigned: income.monthAssigned,
      yearAssigned: income.yearAssigned,
      detailsText: income.detailsText,
      targetEnvelopeId: income.targetEnvelopeId,
    },
  }))

  const transferMovements: Movement[] = input.transfers.map((transfer) => ({
    id: transfer.id,
    type: 'transfer',
    date: transfer.date,
    label: `Transfert ${transfer.fromEnvelopeName} → ${transfer.toEnvelopeName}`,
    envelopeLabel: '⇄ deux enveloppes',
    origin: transfer.reason,
    amount: transfer.amount,
    sign: 'neutral',
    editable: monthOpen,
    fields: {
      fromEnvelopeId: transfer.fromEnvelopeId,
      toEnvelopeId: transfer.toEnvelopeId,
      amount: transfer.amount,
      reason: transfer.reason,
    },
  }))

  const savingsMovements: Movement[] = (input.savings ?? []).map((entry) => {
    // Closure versements and rows from before versements were dated have no date.
    const date = entry.date ?? firstOfMonth(entry.year, entry.month)
    return {
      id: entry.id,
      type: 'savings',
      date,
      label: `Épargne — ${entry.goalName}`,
      envelopeLabel: '🐷 Épargne',
      origin: entry.source === 'closure' ? 'Clôture' : 'Versement',
      amount: -entry.amount,
      sign: 'negative',
      editable: monthOpen && entry.source === 'manual',
      fields: { savingsGoalId: entry.savingsGoalId, date, amount: entry.amount },
    }
  })

  return [...expenseMovements, ...incomeMovements, ...transferMovements, ...savingsMovements]
    .sort((a, b) => b.date.localeCompare(a.date))
}
