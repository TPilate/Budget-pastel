import { describe, it, expect } from 'vitest'
import { computeDashboardSummary } from '../../../../../server/utils/domain/dashboardSummary'

describe('computeDashboardSummary', () => {
  const mockupInputs = {
    salaryReceived: 2316,
    salaryExpected: 2300,
    fixedChargesTotal: 861,
    variableChargesTotal: 318,
    envelopeSpendTotal: 424,
    savingsVersedTotal: 345,
    joursRestants: 11,
  }

  it('matches the Figma mockup figures exactly', () => {
    const result = computeDashboardSummary(mockupInputs)

    expect(result.budgetDuMois).toBe(1971)
    expect(result.totalSpent).toBe(1603)
    expect(result.resteADepenser).toBe(368)
    expect(result.resteADepenserParJour).toBeCloseTo(33.45, 2)
    expect(result.salaryVsExpected).toBe(16)
    expect(result.usagePercent).toBe(84)
  })

  it('computes the breakdown amounts and percentages matching the mockup legend', () => {
    const result = computeDashboardSummary(mockupInputs)

    expect(result.breakdown.fixedCharges).toEqual({ amount: 861, percent: 37 })
    expect(result.breakdown.envelopes).toEqual({ amount: 424, percent: 18 })
    expect(result.breakdown.variable).toEqual({ amount: 318, percent: 14 })
    expect(result.breakdown.savings).toEqual({ amount: 345, percent: 15 })
    expect(result.breakdown.unspent).toEqual({ amount: 368, percent: 16 })
  })

  it('returns zero percentages when no salary has been received yet', () => {
    const result = computeDashboardSummary({
      salaryReceived: 0,
      salaryExpected: 2300,
      fixedChargesTotal: 0,
      variableChargesTotal: 0,
      envelopeSpendTotal: 0,
      savingsVersedTotal: 0,
      joursRestants: 20,
    })

    expect(result.usagePercent).toBe(0)
    expect(result.breakdown.fixedCharges.percent).toBe(0)
    expect(result.salaryVsExpected).toBe(-2300)
  })

  it('falls back to the raw remaining amount when no days remain in the month', () => {
    const result = computeDashboardSummary({ ...mockupInputs, joursRestants: 0 })
    expect(result.resteADepenserParJour).toBe(result.resteADepenser)
  })
})
