export type ClosureDestination = 'carry_over' | 'savings' | 'envelope'

export interface ClosureChoice {
  destination: ClosureDestination | null
  savingsGoalId: string | null
  targetEnvelopeId: string | null
}

export interface ClosureTotals {
  carried: number
  savings: number
  other: number
  unassigned: number
  /** Positive: the sum of the overspends deducted from next month's ceilings. */
  overspendDeducted: number
  /** One entry per savings goal receiving at least one leftover, in the goals' order. */
  perGoal: { id: string, name: string, amount: number }[]
}

const cents = (value: number) => {
  const rounded = Math.round(value * 100) / 100
  return rounded === 0 ? 0 : rounded
}

export function isClosureChoiceComplete(choice: ClosureChoice | undefined): boolean {
  if (!choice?.destination) return false
  if (choice.destination === 'savings') return Boolean(choice.savingsGoalId)
  if (choice.destination === 'envelope') return Boolean(choice.targetEnvelopeId)
  return true
}

/**
 * What the closure page's tiles and confirmation modal show while the household chooses
 * destinations. The server recomputes everything on submit; this is display only.
 */
export function closureTotals(input: {
  envelopes: { id: string, leftover: number }[]
  choices: Record<string, ClosureChoice>
  savingsGoals: { id: string, name: string }[]
}): ClosureTotals {
  let carried = 0
  let savings = 0
  let other = 0
  let unassigned = 0
  let overspendDeducted = 0
  const byGoal = new Map<string, number>()

  for (const envelope of input.envelopes) {
    if (envelope.leftover < 0) {
      overspendDeducted -= envelope.leftover
      continue
    }
    if (envelope.leftover === 0) continue

    const choice = input.choices[envelope.id]
    if (!isClosureChoiceComplete(choice)) unassigned += envelope.leftover
    else if (choice.destination === 'carry_over') carried += envelope.leftover
    else if (choice.destination === 'savings') {
      savings += envelope.leftover
      byGoal.set(choice.savingsGoalId!, (byGoal.get(choice.savingsGoalId!) ?? 0) + envelope.leftover)
    }
    else other += envelope.leftover
  }

  return {
    carried: cents(carried),
    savings: cents(savings),
    other: cents(other),
    unassigned: cents(unassigned),
    overspendDeducted: cents(overspendDeducted),
    perGoal: input.savingsGoals
      .filter((goal) => byGoal.has(goal.id))
      .map((goal) => ({ id: goal.id, name: goal.name, amount: cents(byGoal.get(goal.id)!) })),
  }
}
