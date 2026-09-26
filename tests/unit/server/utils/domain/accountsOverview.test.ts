import { describe, it, expect } from 'vitest'
import { computeAccountTotals, summariseFixedCharges } from '../../../../../server/utils/domain/accountsOverview'

describe('computeAccountTotals', () => {
  it('reproduces the figures from the design', () => {
    // Figma: Solde bancaire 1 216 €, Engagé 119 € ("31 € de plafonds + 88 € de
    // cadeaux"), Vraiment libre 1 097 €.
    const result = computeAccountTotals({
      accounts: [{ balance: 1216, kind: 'courant' }],
      budgetEnvelopeRemaining: [31],
      reserveBalances: [88],
    })
    expect(result).toEqual({ bankBalance: 1216, committed: 119, reallyFree: 1097 })
  })

  it('excludes savings accounts from the bank balance', () => {
    // The card is labelled "compte courant seul".
    const result = computeAccountTotals({
      accounts: [
        { balance: 1216, kind: 'courant' },
        { balance: 7524, kind: 'epargne' },
      ],
      budgetEnvelopeRemaining: [],
      reserveBalances: [],
    })
    expect(result.bankBalance).toBe(1216)
  })

  it('floors an overspent envelope at zero instead of freeing money', () => {
    // An overspent envelope has nothing set aside for it. Summing -50 would make
    // committed smaller and reallyFree larger, which is exactly backwards.
    const result = computeAccountTotals({
      accounts: [{ balance: 1000, kind: 'courant' }],
      budgetEnvelopeRemaining: [100, -50],
      reserveBalances: [],
    })
    expect(result.committed).toBe(100)
    expect(result.reallyFree).toBe(900)
  })

  it('can report a negative free amount when envelopes commit more than the balance', () => {
    const result = computeAccountTotals({
      accounts: [{ balance: 100, kind: 'courant' }],
      budgetEnvelopeRemaining: [300],
      reserveBalances: [],
    })
    expect(result.reallyFree).toBe(-200)
  })

  it('returns zeroes when there are no accounts at all', () => {
    const result = computeAccountTotals({ accounts: [], budgetEnvelopeRemaining: [], reserveBalances: [] })
    expect(result).toEqual({ bankBalance: 0, committed: 0, reallyFree: 0 })
  })
})

describe('summariseFixedCharges', () => {
  it('reproduces the totals from the design', () => {
    // Figma: "861 € · 7 sur 7 pointées".
    const fixedCategories = [
      { id: 'c1', name: 'Loyer', defaultTarget: 620 },
      { id: 'c2', name: 'MACSF — assurance pro', defaultTarget: 41 },
      { id: 'c3', name: 'Internet', defaultTarget: 32 },
      { id: 'c4', name: 'Abonnements', defaultTarget: 26 },
      { id: 'c5', name: 'Transport', defaultTarget: 75 },
      { id: 'c6', name: 'Mutuelle', defaultTarget: 38 },
      { id: 'c7', name: 'Téléphone', defaultTarget: 29 },
    ]
    const result = summariseFixedCharges({
      fixedCategories,
      expensesThisMonth: fixedCategories.map((category) => ({ categoryId: category.id })),
    })
    expect(result.total).toBe(861)
    expect(result.settledCount).toBe(7)
    expect(result.totalCount).toBe(7)
  })

  it('marks a charge settled only when an expense exists for it this month', () => {
    const result = summariseFixedCharges({
      fixedCategories: [
        { id: 'c1', name: 'Loyer', defaultTarget: 620 },
        { id: 'c2', name: 'Internet', defaultTarget: 32 },
      ],
      expensesThisMonth: [{ categoryId: 'c1' }],
    })
    expect(result.lines).toEqual([
      { id: 'c1', name: 'Loyer', amount: 620, isSettled: true },
      { id: 'c2', name: 'Internet', amount: 32, isSettled: false },
    ])
    expect(result.settledCount).toBe(1)
  })

  it('counts several expenses in one category as a single settled charge', () => {
    const result = summariseFixedCharges({
      fixedCategories: [{ id: 'c1', name: 'Loyer', defaultTarget: 620 }],
      expensesThisMonth: [{ categoryId: 'c1' }, { categoryId: 'c1' }],
    })
    expect(result.settledCount).toBe(1)
  })

  it('treats a missing default target as zero without dropping the line', () => {
    const result = summariseFixedCharges({
      fixedCategories: [{ id: 'c1', name: 'Divers', defaultTarget: null }],
      expensesThisMonth: [],
    })
    expect(result.lines).toEqual([{ id: 'c1', name: 'Divers', amount: 0, isSettled: false }])
    expect(result.total).toBe(0)
    expect(result.totalCount).toBe(1)
  })

  it('totals what is expected for the month, not what has been paid', () => {
    const result = summariseFixedCharges({
      fixedCategories: [
        { id: 'c1', name: 'Loyer', defaultTarget: 620 },
        { id: 'c2', name: 'Internet', defaultTarget: 32 },
      ],
      expensesThisMonth: [],
    })
    expect(result.total).toBe(652)
  })
})
