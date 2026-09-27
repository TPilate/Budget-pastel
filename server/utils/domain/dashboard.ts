export type Bucket5030 = 'besoins' | 'envies' | 'epargne'
export type SliceKey = 'fixed' | 'envelope' | 'variable' | 'savings' | 'unspent'

export interface DashboardSlice {
  key: SliceKey
  amount: number
  percent: number
}

export interface PartitionExpense {
  amount: number
  envelopeId: string | null
  categoryIsFixed: boolean
  financedBy: 'budget' | 'gift_given' | 'gift_received'
}

/**
 * Splits the month's expenses into the three spending slices of the donut.
 *
 * The slices must partition income exactly, so every expense lands in one bucket and
 * no expense lands in two.
 */
export function partitionExpenses(expenses: PartitionExpense[]): {
  fixed: number
  envelope: number
  variable: number
} {
  const totals = { fixed: 0, envelope: 0, variable: 0 }

  for (const expense of expenses) {
    // Gift-funded spend is somebody else's money: it sits outside the month's budget
    // and outside 50/30/20. Counting it would push the slices past income received.
    if (expense.financedBy === 'gift_received') continue

    // The envelope is the more specific intent, so it outranks the category's flag.
    if (expense.envelopeId !== null) totals.envelope += expense.amount
    else if (expense.categoryIsFixed) totals.fixed += expense.amount
    else totals.variable += expense.amount
  }

  return totals
}

export interface PartitionIncome {
  amount: number
  expectedAmount: number | null
  targetEnvelopeId: string | null
}

export function summariseIncome(incomes: PartitionIncome[]): {
  received: number
  salaryReceived: number
  salaryExpected: number
  salaryVariance: number
} {
  let received = 0
  let salaryReceived = 0
  let salaryExpected = 0

  for (const income of incomes) {
    // Income aimed at an envelope is a reimbursement for money already spent, not new
    // money. Including it would inflate the donut base and shrink every percentage.
    if (income.targetEnvelopeId === null) received += income.amount

    // Salary is whatever was forecast: an expected amount is what makes a variance
    // meaningful. This avoids matching on a renameable income-type name and avoids a
    // new column that nothing in the product could set.
    if (income.expectedAmount !== null) {
      salaryReceived += income.amount
      salaryExpected += income.expectedAmount
    }
  }

  return { received, salaryReceived, salaryExpected, salaryVariance: salaryReceived - salaryExpected }
}

/** Percentage of `total`, rounded, and 0 rather than NaN when `total` is 0. */
function share(amount: number, total: number): number {
  return total > 0 ? Math.round((amount / total) * 100) : 0
}

export function computeMonthSummary(input: {
  incomeReceived: number
  fixed: number
  envelope: number
  variable: number
  savings: number
  daysRemaining: number
}): {
  unspent: number
  perDay: number
  allocatedPercent: number
  slices: DashboardSlice[]
} {
  const { incomeReceived, fixed, envelope, variable, savings, daysRemaining } = input

  // May be negative, and is shown as such — overspending is information, not an error.
  const unspent = incomeReceived - fixed - envelope - variable - savings

  const slices: DashboardSlice[] = [
    { key: 'fixed', amount: fixed, percent: share(fixed, incomeReceived) },
    { key: 'envelope', amount: envelope, percent: share(envelope, incomeReceived) },
    { key: 'variable', amount: variable, percent: share(variable, incomeReceived) },
    { key: 'savings', amount: savings, percent: share(savings, incomeReceived) },
    { key: 'unspent', amount: unspent, percent: share(unspent, incomeReceived) },
  ]

  return {
    unspent,
    // Callers floor daysRemaining at 1, so this guard is defensive only.
    perDay: daysRemaining > 0 ? unspent / daysRemaining : unspent,
    allocatedPercent: incomeReceived > 0 ? 100 - share(unspent, incomeReceived) : 0,
    slices,
  }
}

export function compute503020(input: {
  incomeReceived: number
  taggedSpend: { bucket: Bucket5030 | null, amount: number }[]
  savings: number
}): {
  targets: { besoins: 50, envies: 30, epargne: 20 }
  actuals: { besoins: number, envies: number, epargne: number }
  untagged: number
} {
  const amounts = { besoins: 0, envies: 0, epargne: input.savings }
  let untagged = 0

  for (const entry of input.taggedSpend) {
    // Spend with no bucket tag is reported on its own rather than silently folded into
    // one of the three, which is why the actuals need not sum to 100.
    if (entry.bucket === null) untagged += entry.amount
    else amounts[entry.bucket] += entry.amount
  }

  return {
    targets: { besoins: 50, envies: 30, epargne: 20 },
    actuals: {
      besoins: share(amounts.besoins, input.incomeReceived),
      envies: share(amounts.envies, input.incomeReceived),
      epargne: share(amounts.epargne, input.incomeReceived),
    },
    untagged,
  }
}

/** Days left in the month, counting today. Never less than 1. */
export function daysRemainingInMonth(today: Date): number {
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  return Math.max(1, daysInMonth - today.getDate() + 1)
}
