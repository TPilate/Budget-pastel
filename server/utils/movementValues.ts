import type { ExpenseEntryInput } from '../../shared/schemas/expenseEntry'
import type { IncomeEntryInput } from '../../shared/schemas/incomeEntry'
import type { SavingsInput } from '../../shared/schemas/savings'

// The row each create and edit endpoint writes, built in one place so POST and PATCH can
// never derive months or amounts differently.

export function incomeRowValues(input: IncomeEntryInput, expectedAmount: string | null) {
  return {
    incomeTypeId: input.incomeTypeId,
    label: input.label,
    amount: String(input.amount),
    dateReceived: input.dateReceived,
    monthAssigned: input.monthAssigned,
    yearAssigned: input.yearAssigned,
    detailsText: input.detailsText ?? null,
    targetEnvelopeId: input.targetEnvelopeId ?? null,
    expectedAmount,
  }
}

export function expenseRowValues(input: ExpenseEntryInput) {
  const [yearAssigned, monthAssigned] = input.date.split('-').map(Number)
  return {
    date: input.date,
    categoryId: input.categoryId ?? null,
    label: input.label,
    amount: String(input.amount),
    accountId: input.accountId ?? null,
    envelopeId: input.envelopeId ?? null,
    financedBy: input.financedBy,
    monthAssigned,
    yearAssigned,
  }
}

export function savingsRowValues(input: SavingsInput) {
  const [year, month] = input.date.split('-').map(Number)
  return {
    savingsGoalId: input.savingsGoalId,
    date: input.date,
    year,
    month,
    amount: String(input.amount),
    source: 'manual' as const,
  }
}
