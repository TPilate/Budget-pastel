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
}

export interface RawIncomeMovement {
  id: string
  date: string
  label: string
  amount: number
  envelopeName: string | null
  envelopeEmoji: string | null
}

export interface RawTransferMovement {
  id: string
  date: string
  reason: string
  amount: number
  fromEnvelopeName: string
  toEnvelopeName: string
}

export interface Movement {
  id: string
  type: 'expense' | 'income' | 'transfer'
  date: string
  label: string
  envelopeLabel: string
  origin: string
  amount: number
  sign: 'negative' | 'positive' | 'neutral'
}

export function buildMovementsFeed(input: {
  expenses: RawExpenseMovement[]
  incomes: RawIncomeMovement[]
  transfers: RawTransferMovement[]
}): Movement[] {
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
  }))

  return [...expenseMovements, ...incomeMovements, ...transferMovements]
    .sort((a, b) => b.date.localeCompare(a.date))
}
