import { describe, it, expect } from 'vitest'
import {
  summarisePoches,
  monthlyHistory,
  savingsGapAdvice,
  monthsOfChargesCovered,
  monthContributions,
} from '../../../../../server/utils/domain/savings'

const poche = (over: Partial<Parameters<typeof summarisePoches>[0][number]> = {}) => ({
  id: 'p1', name: 'Long terme', targetAmount: null, monthlyAmount: 0,
  note: null, receivesSalaryVariance: false, ...over,
})

describe('summarisePoches', () => {
  it('reproduces the figures from the design', () => {
    // Figma: 5 184 + 2 340 + 888 = 8 412 total, and 216 + 80 + 49 = 345 per month.
    const result = summarisePoches(
      [
        poche({ id: 'a', name: 'Long terme', targetAmount: 10000, monthlyAmount: 216 }),
        poche({ id: 'b', name: 'Sécurité', targetAmount: 2583, monthlyAmount: 80 }),
        poche({ id: 'c', name: 'Projets', targetAmount: 1400, monthlyAmount: 49 }),
      ],
      [
        { savingsGoalId: 'a', amount: 5184 },
        { savingsGoalId: 'b', amount: 2340 },
        { savingsGoalId: 'c', amount: 888 },
      ],
    )
    expect(result.totalBalance).toBe(8412)
    expect(result.totalMonthly).toBe(345)
    expect(result.poches.map((p) => p.progressPercent)).toEqual([52, 91, 63])
  })

  it('sums every month for a poche, not just the latest', () => {
    // The design's 5 184 € is a running total; 345 € is the month. Taking only one month
    // would make every balance look like a single contribution.
    const result = summarisePoches([poche({ id: 'a' })], [
      { savingsGoalId: 'a', amount: 100 },
      { savingsGoalId: 'a', amount: 150 },
    ])
    expect(result.poches[0].balance).toBe(250)
  })

  it('reports no progress for a poche with no target, rather than dividing by zero', () => {
    const result = summarisePoches([poche({ id: 'a', targetAmount: null })], [
      { savingsGoalId: 'a', amount: 500 },
    ])
    expect(result.poches[0].progressPercent).toBeNull()
    expect(result.poches[0].balance).toBe(500)
  })

  it('treats a zero target the same as no target', () => {
    const result = summarisePoches([poche({ id: 'a', targetAmount: 0 })], [
      { savingsGoalId: 'a', amount: 500 },
    ])
    expect(result.poches[0].progressPercent).toBeNull()
  })

  it('clamps progress at 100 when a poche is over its target', () => {
    const result = summarisePoches([poche({ id: 'a', targetAmount: 100 })], [
      { savingsGoalId: 'a', amount: 250 },
    ])
    expect(result.poches[0].progressPercent).toBe(100)
  })

  it('returns zeroes for a poche with no entries at all', () => {
    // This is the DEFAULT state today: savings_entries is empty.
    const result = summarisePoches([poche({ id: 'a', targetAmount: 1000 })], [])
    expect(result.poches[0].balance).toBe(0)
    expect(result.poches[0].progressPercent).toBe(0)
    expect(result.totalBalance).toBe(0)
  })
})

describe('monthlyHistory', () => {
  it('returns exactly the requested window, oldest first, ending at the given month', () => {
    const result = monthlyHistory(
      [{ year: 2026, month: 10, amount: 345 }],
      { year: 2026, month: 10 },
      6,
    )
    expect(result).toHaveLength(6)
    expect(result[0]).toMatchObject({ year: 2026, month: 5 })
    expect(result[5]).toMatchObject({ year: 2026, month: 10, amount: 345 })
  })

  it('includes a month with no savings as zero rather than skipping it', () => {
    // Skipping would compress the gap and misrepresent the trend in the bar chart.
    const result = monthlyHistory(
      [{ year: 2026, month: 10, amount: 100 }, { year: 2026, month: 8, amount: 50 }],
      { year: 2026, month: 10 },
      3,
    )
    expect(result.map((m) => m.amount)).toEqual([50, 0, 100])
  })

  it('walks back across a year boundary', () => {
    const result = monthlyHistory([], { year: 2026, month: 2 }, 4)
    expect(result.map((m) => `${m.year}-${m.month}`)).toEqual(['2025-11', '2025-12', '2026-1', '2026-2'])
  })

  it('sums several entries in the same month', () => {
    const result = monthlyHistory(
      [{ year: 2026, month: 10, amount: 100 }, { year: 2026, month: 10, amount: 45 }],
      { year: 2026, month: 10 },
      1,
    )
    expect(result[0].amount).toBe(145)
  })

  it('labels months the way the design does', () => {
    const result = monthlyHistory([], { year: 2026, month: 9 }, 2)
    expect(result.map((m) => m.label)).toEqual(['Août', 'Sept'])
  })
})

describe('savingsGapAdvice', () => {
  it('reproduces the advice from the design', () => {
    // Figma: target 20 %, actual 15 %, income 2 316 € -> 5 points, ~116 € per month.
    const result = savingsGapAdvice({ targetPercent: 20, actualPercent: 15, incomeReceived: 2316 })
    expect(result).toEqual({ pointsShort: 5, euroPerMonth: 116 })
  })

  it('returns null when the target is already met', () => {
    expect(savingsGapAdvice({ targetPercent: 20, actualPercent: 22, incomeReceived: 2316 })).toBeNull()
    expect(savingsGapAdvice({ targetPercent: 20, actualPercent: 20, incomeReceived: 2316 })).toBeNull()
  })

  it('returns null at zero income, where the advice would be meaningless', () => {
    // The default state today: income_entries is empty.
    expect(savingsGapAdvice({ targetPercent: 20, actualPercent: 0, incomeReceived: 0 })).toBeNull()
  })
})

describe('monthsOfChargesCovered', () => {
  it('divides savings by the monthly fixed charges, to one decimal', () => {
    expect(monthsOfChargesCovered(8412, 861)).toBe(9.8)
  })

  it('returns null when there are no fixed charges, rather than Infinity', () => {
    expect(monthsOfChargesCovered(8412, 0)).toBeNull()
  })

  it('returns 0 when nothing is saved yet', () => {
    expect(monthsOfChargesCovered(0, 861)).toBe(0)
  })
})

describe('monthContributions', () => {
  it('names the poche that receives the salary variance', () => {
    const rows = monthContributions({
      entries: [{ savingsGoalId: 'a', amount: 345 }],
      poches: [
        { id: 'a', name: 'Long terme', receivesSalaryVariance: true },
        { id: 'b', name: 'Sécurité', receivesSalaryVariance: false },
      ],
      salaryVariance: 16,
    })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ kind: 'contribution', amount: 345 })
    expect(rows[1]).toMatchObject({ kind: 'variance', amount: 16 })
    expect(rows[1].detail).toContain('Long terme')
  })

  it('falls back when no poche is marked to receive the variance', () => {
    const rows = monthContributions({
      entries: [],
      poches: [{ id: 'a', name: 'Long terme', receivesSalaryVariance: false }],
      salaryVariance: 16,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].detail).toContain("vers l'épargne")
  })

  it('shows a negative variance rather than hiding it', () => {
    // An underpaid month is information, not an error to suppress.
    const rows = monthContributions({
      entries: [], poches: [], salaryVariance: -50,
    })
    expect(rows[0]).toMatchObject({ kind: 'variance', amount: -50 })
  })

  it('returns nothing when there is neither a contribution nor a variance', () => {
    expect(monthContributions({ entries: [], poches: [], salaryVariance: 0 })).toEqual([])
  })
})
