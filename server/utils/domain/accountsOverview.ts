export type AccountKind = 'courant' | 'epargne'

export function computeAccountTotals(input: {
  accounts: { balance: number, kind: AccountKind }[]
  budgetEnvelopeRemaining: number[]
  reserveBalances: number[]
}): { bankBalance: number, committed: number, reallyFree: number } {
  // "Solde bancaire" is labelled "compte courant seul" in the design: savings
  // vehicles are money you have, but not money you are about to spend.
  const bankBalance = input.accounts
    .filter((account) => account.kind === 'courant')
    .reduce((sum, account) => sum + account.balance, 0)

  // An overspent envelope has nothing set aside for it. Letting a negative
  // remainder through would shrink `committed` and inflate `reallyFree`.
  const ceilingsCommitted = input.budgetEnvelopeRemaining
    .reduce((sum, remaining) => sum + Math.max(0, remaining), 0)

  const reservesCommitted = input.reserveBalances.reduce((sum, balance) => sum + balance, 0)
  const committed = ceilingsCommitted + reservesCommitted

  return { bankBalance, committed, reallyFree: bankBalance - committed }
}

export function summariseFixedCharges(input: {
  fixedCategories: { id: string, name: string, defaultTarget: number | null }[]
  expensesThisMonth: { categoryId: string }[]
}): {
  lines: { id: string, name: string, amount: number, isSettled: boolean }[]
  total: number
  settledCount: number
  totalCount: number
} {
  // "Pointée" is derived rather than stored: a fixed charge counts as settled once
  // an expense exists for its category this month. A Set collapses repeats, so two
  // expenses in one category are still one settled charge.
  const categoriesWithExpense = new Set(input.expensesThisMonth.map((expense) => expense.categoryId))

  const lines = input.fixedCategories.map((category) => ({
    id: category.id,
    name: category.name,
    amount: category.defaultTarget ?? 0,
    isSettled: categoriesWithExpense.has(category.id),
  }))

  return {
    lines,
    // The month's expected fixed cost, settled or not — not what has been paid.
    total: lines.reduce((sum, line) => sum + line.amount, 0),
    settledCount: lines.filter((line) => line.isSettled).length,
    totalCount: lines.length,
  }
}
