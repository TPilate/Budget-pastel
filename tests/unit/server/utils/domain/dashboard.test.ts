import { describe, it, expect } from 'vitest'
import {
  partitionExpenses,
  summariseIncome,
  computeMonthSummary,
  compute503020,
  daysRemainingInMonth,
} from '../../../../../server/utils/domain/dashboard'

describe('partitionExpenses', () => {
  it('sends an expense with an envelope to the envelope bucket even when its category is fixed', () => {
    // The envelope is the more specific intent, so it wins over is_fixed.
    const result = partitionExpenses([
      { amount: 50, envelopeId: 'e1', categoryIsFixed: true, financedBy: 'budget' },
    ])
    expect(result).toEqual({ fixed: 0, envelope: 50, variable: 0 })
  })

  it('sends a fixed-category expense with no envelope to the fixed bucket', () => {
    const result = partitionExpenses([
      { amount: 620, envelopeId: null, categoryIsFixed: true, financedBy: 'budget' },
    ])
    expect(result).toEqual({ fixed: 620, envelope: 0, variable: 0 })
  })

  it('sends everything else to the variable bucket', () => {
    const result = partitionExpenses([
      { amount: 30, envelopeId: null, categoryIsFixed: false, financedBy: 'budget' },
    ])
    expect(result).toEqual({ fixed: 0, envelope: 0, variable: 30 })
  })

  it('excludes gift-financed expenses from every bucket', () => {
    // Gift-funded spend sits outside the month's budget and outside 50/30/20.
    // Counting it anywhere would make the slices exceed income.
    const result = partitionExpenses([
      { amount: 62, envelopeId: 'e1', categoryIsFixed: false, financedBy: 'gift_received' },
      { amount: 40, envelopeId: null, categoryIsFixed: true, financedBy: 'gift_received' },
      { amount: 10, envelopeId: null, categoryIsFixed: false, financedBy: 'budget' },
    ])
    expect(result).toEqual({ fixed: 0, envelope: 0, variable: 10 })
  })

  it('still counts gift_given expenses, which are the user\'s own money', () => {
    const result = partitionExpenses([
      { amount: 25, envelopeId: null, categoryIsFixed: false, financedBy: 'gift_given' },
    ])
    expect(result).toEqual({ fixed: 0, envelope: 0, variable: 25 })
  })

  it('returns zeroes for an empty month', () => {
    expect(partitionExpenses([])).toEqual({ fixed: 0, envelope: 0, variable: 0 })
  })
})

describe('summariseIncome', () => {
  it('excludes envelope-targeted income from the base', () => {
    // A reimbursement replaces money already spent; counting it would inflate the
    // donut base and shrink every percentage.
    const result = summariseIncome([
      { amount: 2316, expectedAmount: 2300, targetEnvelopeId: null },
      { amount: 20, expectedAmount: null, targetEnvelopeId: 'e1' },
    ])
    expect(result.received).toBe(2316)
  })

  it('identifies salary by the presence of an expected amount and reports the variance', () => {
    const result = summariseIncome([
      { amount: 2316, expectedAmount: 2300, targetEnvelopeId: null },
      { amount: 150, expectedAmount: null, targetEnvelopeId: null },
    ])
    expect(result.salaryReceived).toBe(2316)
    expect(result.salaryExpected).toBe(2300)
    expect(result.salaryVariance).toBe(16)
    // The 150 € of non-salary income still counts towards the base.
    expect(result.received).toBe(2466)
  })

  it('reports a negative variance when salary underpays', () => {
    const result = summariseIncome([
      { amount: 2250, expectedAmount: 2300, targetEnvelopeId: null },
    ])
    expect(result.salaryVariance).toBe(-50)
  })

  it('returns zeroes when no income exists', () => {
    expect(summariseIncome([])).toEqual({
      received: 0, salaryReceived: 0, salaryExpected: 0, salaryVariance: 0,
    })
  })
})

describe('computeMonthSummary', () => {
  it('reproduces the figures from the design', () => {
    // Figma: 2 316 income; 861 fixes, 424 enveloppes, 318 variables, 345 épargne;
    // 368 non dépensé; 84 % du revenu affecté.
    const result = computeMonthSummary({
      incomeReceived: 2316,
      fixed: 861,
      envelope: 424,
      variable: 318,
      savings: 345,
      daysRemaining: 11,
    })
    expect(result.unspent).toBe(368)
    expect(result.allocatedPercent).toBe(84)
    expect(Math.round(result.perDay)).toBe(33)
    expect(result.slices.map((s) => [s.key, s.amount, s.percent])).toEqual([
      ['fixed', 861, 37],
      ['envelope', 424, 18],
      ['variable', 318, 14],
      ['savings', 345, 15],
      ['unspent', 368, 16],
    ])
  })

  it('reports a negative unspent when spending exceeds income', () => {
    const result = computeMonthSummary({
      incomeReceived: 1000, fixed: 900, envelope: 200, variable: 0, savings: 0, daysRemaining: 5,
    })
    expect(result.unspent).toBe(-100)
    expect(result.perDay).toBe(-20)
  })

  it('produces zeroes rather than NaN when no income is recorded', () => {
    // Percentages are amount/income; with income 0 this must not divide by zero.
    const result = computeMonthSummary({
      incomeReceived: 0, fixed: 100, envelope: 0, variable: 0, savings: 0, daysRemaining: 10,
    })
    expect(result.allocatedPercent).toBe(0)
    for (const slice of result.slices) {
      expect(Number.isNaN(slice.percent)).toBe(false)
      expect(slice.percent).toBe(0)
    }
  })

  it('does not divide by zero when no days remain', () => {
    const result = computeMonthSummary({
      incomeReceived: 100, fixed: 0, envelope: 0, variable: 0, savings: 0, daysRemaining: 0,
    })
    expect(Number.isFinite(result.perDay)).toBe(true)
  })
})

describe('compute503020', () => {
  it('reproduces the design\'s actuals as percentages of income', () => {
    // Figma: 51 / 18 / 15 against targets 50 / 30 / 20.
    const result = compute503020({
      incomeReceived: 2316,
      taggedSpend: [
        { bucket: 'besoins', amount: 861 },
        { bucket: 'besoins', amount: 318 },
        { bucket: 'envies', amount: 424 },
      ],
      savings: 345,
    })
    expect(result.targets).toEqual({ besoins: 50, envies: 30, epargne: 20 })
    expect(result.actuals).toEqual({ besoins: 51, envies: 18, epargne: 15 })
  })

  it('reports untagged spend separately and keeps it out of the actuals', () => {
    const result = compute503020({
      incomeReceived: 1000,
      taggedSpend: [
        { bucket: 'besoins', amount: 500 },
        { bucket: null, amount: 200 },
      ],
      savings: 0,
    })
    expect(result.actuals.besoins).toBe(50)
    expect(result.untagged).toBe(200)
  })

  it('counts savings towards the epargne bucket', () => {
    const result = compute503020({ incomeReceived: 1000, taggedSpend: [], savings: 200 })
    expect(result.actuals.epargne).toBe(20)
  })

  it('produces zero actuals rather than NaN when no income is recorded', () => {
    const result = compute503020({
      incomeReceived: 0,
      taggedSpend: [{ bucket: 'besoins', amount: 50 }],
      savings: 10,
    })
    expect(result.actuals).toEqual({ besoins: 0, envies: 0, epargne: 0 })
  })
})

describe('daysRemainingInMonth', () => {
  it('counts today as remaining, so the last day of the month returns 1', () => {
    expect(daysRemainingInMonth(new Date(2026, 8, 30))).toBe(1)  // 30 September
  })

  it('matches the design: 11 days remain on 20 September', () => {
    expect(daysRemainingInMonth(new Date(2026, 8, 20))).toBe(11)
  })

  it('handles a 31-day month', () => {
    expect(daysRemainingInMonth(new Date(2026, 0, 1))).toBe(31)  // 1 January
  })

  it('handles February in a leap year', () => {
    expect(daysRemainingInMonth(new Date(2024, 1, 1))).toBe(29)
  })

  it('never returns less than 1', () => {
    expect(daysRemainingInMonth(new Date(2026, 1, 28))).toBeGreaterThanOrEqual(1)
  })
})
