export interface EnvelopeAllocation {
  baseCeiling: number
  carriedOverAmount: number
  overspendDeduction: number
}

export interface EnvelopeLedgerInputs {
  defaultCeiling: number
  allocation: EnvelopeAllocation | null
  transfersIn: number
  transfersOut: number
  expensesTotal: number
  incomeCreditsTotal: number
}

export interface EnvelopeLedgerResult {
  ceiling: number
  netSpent: number
  remaining: number
}

export function computeEnvelopeLedger(inputs: EnvelopeLedgerInputs): EnvelopeLedgerResult {
  const baseCeiling = inputs.allocation?.baseCeiling ?? inputs.defaultCeiling
  const carriedOverAmount = inputs.allocation?.carriedOverAmount ?? 0
  const overspendDeduction = inputs.allocation?.overspendDeduction ?? 0

  const ceiling = baseCeiling + carriedOverAmount - overspendDeduction + inputs.transfersIn - inputs.transfersOut
  const netSpent = inputs.expensesTotal - inputs.incomeCreditsTotal
  const remaining = ceiling - netSpent

  return { ceiling, netSpent, remaining }
}

export function computeReserveBalance(incomeCreditsTotal: number, expensesTotal: number): number {
  return incomeCreditsTotal - expensesTotal
}
