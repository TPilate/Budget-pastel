import { describe, it, expect } from 'vitest'
import { closureTotals } from '../../../app/utils/closureTotals'

const goals = [
  { id: 'lt', name: 'Long terme' },
  { id: 'sec', name: 'Sécurité' },
]

describe('closureTotals', () => {
  it('totals each destination and each savings goal receiving leftovers', () => {
    const totals = closureTotals({
      envelopes: [
        { id: 'sorties', leftover: 26 },
        { id: 'courses', leftover: 40 },
        { id: 'cadeaux', leftover: 10 },
        { id: 'loisirs', leftover: 5 },
        { id: 'voyage', leftover: -12 },
        { id: 'bricolage', leftover: 0 },
      ],
      choices: {
        sorties: { destination: 'savings', savingsGoalId: 'lt', targetEnvelopeId: null },
        courses: { destination: 'savings', savingsGoalId: 'sec', targetEnvelopeId: null },
        cadeaux: { destination: 'savings', savingsGoalId: 'lt', targetEnvelopeId: null },
        loisirs: { destination: 'carry_over', savingsGoalId: null, targetEnvelopeId: null },
      },
      savingsGoals: goals,
    })
    expect(totals).toEqual({
      carried: 5,
      savings: 76,
      other: 0,
      unassigned: 0,
      overspendDeducted: 12,
      perGoal: [
        { id: 'lt', name: 'Long terme', amount: 36 },
        { id: 'sec', name: 'Sécurité', amount: 40 },
      ],
    })
  })

  it('counts a leftover without a complete destination as unassigned', () => {
    const totals = closureTotals({
      envelopes: [
        { id: 'a', leftover: 0.3 },
        { id: 'b', leftover: 20 },
        { id: 'c', leftover: 8 },
      ],
      choices: {
        a: { destination: null, savingsGoalId: null, targetEnvelopeId: null },
        b: { destination: 'envelope', savingsGoalId: null, targetEnvelopeId: null },
        c: { destination: 'envelope', savingsGoalId: null, targetEnvelopeId: 'a' },
      },
      savingsGoals: goals,
    })
    expect(totals.unassigned).toBe(20.3)
    expect(totals.other).toBe(8)
    expect(totals.perGoal).toEqual([])
  })

  it('rounds every total to the cent', () => {
    const totals = closureTotals({
      envelopes: [{ id: 'a', leftover: 0.1 }, { id: 'b', leftover: 0.2 }, { id: 'c', leftover: -0.1 }, { id: 'd', leftover: -0.2 }],
      choices: {
        a: { destination: 'carry_over', savingsGoalId: null, targetEnvelopeId: null },
        b: { destination: 'carry_over', savingsGoalId: null, targetEnvelopeId: null },
      },
      savingsGoals: goals,
    })
    expect(totals.carried).toBe(0.3)
    expect(totals.overspendDeducted).toBe(0.3)
  })
})
