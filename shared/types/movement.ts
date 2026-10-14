import type { ExpenseEntryInput } from '../schemas/expenseEntry'
import type { IncomeEntryInput } from '../schemas/incomeEntry'
import type { TransferInput } from '../schemas/transfer'
import type { SavingsInput } from '../schemas/savings'

export type MovementType = 'expense' | 'income' | 'transfer' | 'savings'
export interface Movement {
  id: string
  type: MovementType
  date: string
  label: string
  envelopeLabel: string
  origin: string
  amount: number
  sign: 'negative' | 'positive' | 'neutral'
  editable: boolean
  // The movement as its entry form submits it, so the edit drawer can prefill that form.
  fields: ExpenseEntryInput | IncomeEntryInput | TransferInput | SavingsInput
}
