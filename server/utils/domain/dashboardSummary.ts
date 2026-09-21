export interface DashboardSummaryInputs {
  salaryReceived: number
  salaryExpected: number
  fixedChargesTotal: number
  variableChargesTotal: number
  envelopeSpendTotal: number
  savingsVersedTotal: number
  joursRestants: number
}

export interface DashboardSummaryBreakdownEntry {
  amount: number
  percent: number
}

export interface DashboardSummaryResult {
  budgetDuMois: number
  totalSpent: number
  resteADepenser: number
  resteADepenserParJour: number
  salaryVsExpected: number
  usagePercent: number
  breakdown: {
    fixedCharges: DashboardSummaryBreakdownEntry
    envelopes: DashboardSummaryBreakdownEntry
    variable: DashboardSummaryBreakdownEntry
    savings: DashboardSummaryBreakdownEntry
    unspent: DashboardSummaryBreakdownEntry
  }
}

export function computeDashboardSummary(inputs: DashboardSummaryInputs): DashboardSummaryResult {
  const budgetDuMois = inputs.salaryReceived - inputs.savingsVersedTotal
  const totalSpent = inputs.fixedChargesTotal + inputs.variableChargesTotal + inputs.envelopeSpendTotal
  const resteADepenser = budgetDuMois - totalSpent
  const resteADepenserParJour = inputs.joursRestants > 0 ? resteADepenser / inputs.joursRestants : resteADepenser
  const salaryVsExpected = inputs.salaryReceived - inputs.salaryExpected

  const percentOf = (amount: number) =>
    inputs.salaryReceived > 0 ? Math.round((amount / inputs.salaryReceived) * 100) : 0

  const usagePercent = inputs.salaryReceived > 0
    ? Math.round(((totalSpent + inputs.savingsVersedTotal) / inputs.salaryReceived) * 100)
    : 0

  return {
    budgetDuMois,
    totalSpent,
    resteADepenser,
    resteADepenserParJour,
    salaryVsExpected,
    usagePercent,
    breakdown: {
      fixedCharges: { amount: inputs.fixedChargesTotal, percent: percentOf(inputs.fixedChargesTotal) },
      envelopes: { amount: inputs.envelopeSpendTotal, percent: percentOf(inputs.envelopeSpendTotal) },
      variable: { amount: inputs.variableChargesTotal, percent: percentOf(inputs.variableChargesTotal) },
      savings: { amount: inputs.savingsVersedTotal, percent: percentOf(inputs.savingsVersedTotal) },
      unspent: { amount: resteADepenser, percent: percentOf(resteADepenser) },
    },
  }
}
