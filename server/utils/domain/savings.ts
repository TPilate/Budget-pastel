export interface PocheInput {
  id: string
  name: string
  targetAmount: number | null
  monthlyAmount: number
  note: string | null
  receivesSalaryVariance: boolean
}

export interface PocheView extends PocheInput {
  balance: number
  progressPercent: number | null
}

export interface ContributionRow {
  kind: 'contribution' | 'variance'
  label: string
  detail: string
  amount: number
}

// The design's three-letter months, which are not all three letters.
const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc']

export function summarisePoches(
  poches: PocheInput[],
  entries: { savingsGoalId: string, amount: number }[],
): { poches: PocheView[], totalBalance: number, totalMonthly: number } {
  const balanceByGoal = new Map<string, number>()
  for (const entry of entries) {
    balanceByGoal.set(entry.savingsGoalId, (balanceByGoal.get(entry.savingsGoalId) ?? 0) + entry.amount)
  }

  const views: PocheView[] = poches.map((poche) => {
    const balance = balanceByGoal.get(poche.id) ?? 0
    return {
      ...poche,
      balance,
      // A poche with no objective — "sans échéance" in the design — is a valid state, not
      // an error. Returning null lets the page omit the bar instead of dividing by zero.
      progressPercent: poche.targetAmount && poche.targetAmount > 0
        ? Math.min(100, Math.max(0, Math.round((balance / poche.targetAmount) * 100)))
        : null,
    }
  })

  return {
    poches: views,
    totalBalance: views.reduce((sum, p) => sum + p.balance, 0),
    totalMonthly: views.reduce((sum, p) => sum + p.monthlyAmount, 0),
  }
}

export function monthlyHistory(
  entries: { year: number, month: number, amount: number }[],
  through: { year: number, month: number },
  months: number,
): { year: number, month: number, label: string, amount: number }[] {
  const totals = new Map<string, number>()
  for (const entry of entries) {
    const key = `${entry.year}-${entry.month}`
    totals.set(key, (totals.get(key) ?? 0) + entry.amount)
  }

  const window: { year: number, month: number, label: string, amount: number }[] = []
  for (let back = months - 1; back >= 0; back--) {
    // Date arithmetic rather than manual modulo, so year boundaries need no special case.
    const point = new Date(through.year, through.month - 1 - back, 1)
    const year = point.getFullYear()
    const month = point.getMonth() + 1
    window.push({
      year,
      month,
      label: MONTH_LABELS[month - 1],
      // A month with no savings is a zero bar, never a missing one: skipping it would
      // compress the gap and misrepresent the trend.
      amount: totals.get(`${year}-${month}`) ?? 0,
    })
  }
  return window
}

export function savingsGapAdvice(input: {
  targetPercent: number
  actualPercent: number
  incomeReceived: number
}): { pointsShort: number, euroPerMonth: number } | null {
  // Nothing useful to say when the target is met, and nothing computable at zero income —
  // which is the current state, so this branch is the default rather than an edge case.
  if (input.incomeReceived <= 0) return null
  if (input.actualPercent >= input.targetPercent) return null

  const pointsShort = input.targetPercent - input.actualPercent
  return {
    pointsShort,
    euroPerMonth: Math.round((pointsShort / 100) * input.incomeReceived),
  }
}

export function monthsOfChargesCovered(totalSaved: number, monthlyFixedCharges: number): number | null {
  if (monthlyFixedCharges <= 0) return null
  return Math.round((totalSaved / monthlyFixedCharges) * 10) / 10
}

export function monthContributions(input: {
  entries: { savingsGoalId: string, amount: number }[]
  poches: { id: string, name: string, receivesSalaryVariance: boolean }[]
  salaryVariance: number
}): ContributionRow[] {
  const rows: ContributionRow[] = []

  const contributed = input.entries.reduce((sum, entry) => sum + entry.amount, 0)
  if (contributed !== 0) {
    rows.push({
      kind: 'contribution',
      label: 'Versement du mois',
      detail: 'réparti sur les poches',
      amount: contributed,
    })
  }

  if (input.salaryVariance !== 0) {
    const target = input.poches.find((poche) => poche.receivesSalaryVariance)
    rows.push({
      kind: 'variance',
      label: 'Écart de salaire',
      detail: target ? `vers ${target.name}` : "vers l'épargne",
      amount: input.salaryVariance,
    })
  }

  return rows
}
