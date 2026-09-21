import { describe, it, expect } from 'vitest'
import { computeEnvelopeLedger, computeReserveBalance } from '../../../../../server/utils/domain/envelopeLedger'

describe('computeEnvelopeLedger', () => {
  it('uses the default ceiling when no monthly allocation exists yet', () => {
    const result = computeEnvelopeLedger({
      defaultCeiling: 100,
      allocation: null,
      transfersIn: 0,
      transfersOut: 0,
      expensesTotal: 40,
      incomeCreditsTotal: 0,
    })
    expect(result).toEqual({ ceiling: 100, netSpent: 40, remaining: 60 })
  })

  it('uses the allocation base ceiling, carry-over, and overspend deduction instead of the default when one exists', () => {
    const result = computeEnvelopeLedger({
      defaultCeiling: 100,
      allocation: { baseCeiling: 90, carriedOverAmount: 10, overspendDeduction: 5 },
      transfersIn: 0,
      transfersOut: 0,
      expensesTotal: 0,
      incomeCreditsTotal: 0,
    })
    // 90 + 10 - 5 = 95
    expect(result.ceiling).toBe(95)
  })

  it('adds transfers in and subtracts transfers out from the ceiling', () => {
    const result = computeEnvelopeLedger({
      defaultCeiling: 100,
      allocation: null,
      transfersIn: 20,
      transfersOut: 5,
      expensesTotal: 0,
      incomeCreditsTotal: 0,
    })
    expect(result.ceiling).toBe(115)
  })

  it('subtracts income credits from net spent, without affecting the ceiling', () => {
    const result = computeEnvelopeLedger({
      defaultCeiling: 130,
      allocation: null,
      transfersIn: 0,
      transfersOut: 0,
      expensesTotal: 82,
      incomeCreditsTotal: 20,
    })
    expect(result).toEqual({ ceiling: 130, netSpent: 62, remaining: 68 })
  })

  it('produces a negative remaining when the envelope is overspent', () => {
    const result = computeEnvelopeLedger({
      defaultCeiling: 40,
      allocation: null,
      transfersIn: 0,
      transfersOut: 20,
      expensesTotal: 71,
      incomeCreditsTotal: 0,
    })
    // ceiling = 40 - 20 = 20, netSpent = 71, remaining = 20 - 71 = -51
    expect(result).toEqual({ ceiling: 20, netSpent: 71, remaining: -51 })
  })
})

describe('computeReserveBalance', () => {
  it('is income credits minus expenses', () => {
    expect(computeReserveBalance(150, 62)).toBe(88)
  })

  it('can go negative if expenses exceed income credits', () => {
    expect(computeReserveBalance(50, 80)).toBe(-30)
  })

  it('is zero with no activity', () => {
    expect(computeReserveBalance(0, 0)).toBe(0)
  })
})
