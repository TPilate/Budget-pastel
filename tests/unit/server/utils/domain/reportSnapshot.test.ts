import { describe, it, expect } from 'vitest'
import { summariseMonth, buildReportSnapshot } from '../../../../../server/utils/domain/reportSnapshot'
import { computeLeftovers, planClosure } from '../../../../../server/utils/domain/closure'
import type { MonthData } from '../../../../../server/utils/domain/closure'

// One coherent September. Every expected figure below is worked out by hand in the
// comments, never re-derived with the code under test.
const data: MonthData = {
  month: { year: 2026, month: 9 },
  envelopes: [
    { id: 'sorties', name: 'Sorties', emoji: '🥂', kind: 'budget', defaultCeiling: 90, bucket: 'envies', archived: false },
    { id: 'voyage', name: 'Voyage', emoji: '✈️', kind: 'budget', defaultCeiling: 0, bucket: 'envies', archived: false },
    { id: 'fetes', name: 'Anniversaire et fêtes', emoji: '🎂', kind: 'reserve', defaultCeiling: 0, bucket: null, archived: false },
  ],
  allocations: [],
  expenses: [
    { date: '2026-09-03', label: 'Loyer', amount: 650, envelopeId: null, financedBy: 'budget', categoryName: 'Loyer', categoryEmoji: '🏠', categoryBucket: 'besoins' },
    { date: '2026-09-12', label: 'Bouillon', amount: 64, envelopeId: 'sorties', financedBy: 'budget', categoryName: 'Restaurants', categoryEmoji: '🍽️', categoryBucket: 'besoins' },
    { date: '2026-09-20', label: 'Train', amount: 12, envelopeId: 'voyage', financedBy: 'budget', categoryName: 'Transport', categoryEmoji: '🚗', categoryBucket: 'besoins' },
    { date: '2026-09-22', label: 'Fleurs', amount: 30, envelopeId: 'fetes', financedBy: 'gift_received', categoryName: 'Cadeaux', categoryEmoji: '🎁', categoryBucket: 'envies' },
  ],
  incomes: [
    { date: '2026-09-28', label: 'Salaire septembre', amount: 2000, expectedAmount: 2000, targetEnvelopeId: null, typeName: 'Salaire', typeEmoji: '💼' },
    { date: '2026-09-15', label: 'Coline', amount: 10, expectedAmount: null, targetEnvelopeId: 'sorties', typeName: 'Remboursement', typeEmoji: '🔁' },
  ],
  transfers: [],
  savingsEntries: [{ savingsGoalId: 'lt', amount: 200, source: 'manual' }],
  savingsGoals: [
    { id: 'lt', name: 'Long terme', receivesSalaryVariance: true },
    { id: 'vac', name: 'Vacances', receivesSalaryVariance: false },
  ],
}

describe('summariseMonth', () => {
  it('excludes reimbursements from income and gift-funded spend from spending', () => {
    const { summary, rule503020 } = summariseMonth(data, 0)
    // Income: 2000 (the 10 € reimbursement credits Sorties instead).
    // Spent: 650 + 64 + 12 = 726 (the 30 € gift-received spend is not budget money).
    // Saved: 200 manual. Remaining: 2000 − 726 − 200 = 1074.
    expect(summary).toEqual({ income: 2000, spent: 726, saved: 200, remaining: 1074 })
    // Besoins: 650 (Loyer, no envelope) = 33 %. Envies: 64 + 12 (envelope buckets win) = 4 %.
    // Épargne: 200 = 10 %.
    expect(rule503020.actuals).toEqual({ besoins: 33, envies: 4, epargne: 10 })
    expect(rule503020.targets).toEqual({ besoins: 50, envies: 30, epargne: 20 })
  })

  it('counts closure savings on top of manual savings', () => {
    expect(summariseMonth(data, 36).summary).toEqual({ income: 2000, spent: 726, saved: 236, remaining: 1038 })
  })
})

describe('buildReportSnapshot', () => {
  it('freezes names, amounts and destinations', () => {
    const leftovers = computeLeftovers(data)
    // Sorties: 90 − (64 − 10) = 36 left. Voyage: 0 − 12 = −12.
    const plan = planClosure({
      leftovers,
      decisions: [{ envelopeId: 'sorties', destination: 'savings', savingsGoalId: 'vac' }],
      savingsGoalIds: ['lt', 'vac'],
    })
    const snapshot = buildReportSnapshot({ data, leftovers, plan, closedAt: new Date('2026-10-13T08:00:00Z') })

    expect(snapshot.version).toBe(1)
    expect(snapshot.month).toEqual({ year: 2026, month: 9, label: 'Septembre 2026' })
    expect(snapshot.closedAt).toBe('2026-10-13T08:00:00.000Z')
    expect(snapshot.summary).toEqual({ income: 2000, spent: 726, saved: 236, remaining: 1038 })
    expect(snapshot.envelopes).toEqual([
      { name: 'Sorties', emoji: '🥂', ceiling: 90, netSpent: 54, leftover: 36, destinationLabel: 'Épargne · Vacances' },
      { name: 'Voyage', emoji: '✈️', ceiling: 0, netSpent: 12, leftover: -12, destinationLabel: 'Déduit le mois suivant' },
    ])
    expect(snapshot.incomes[1]).toEqual({
      date: '2026-09-15', label: 'Coline', typeName: 'Remboursement', typeEmoji: '🔁', amount: 10, targetEnvelopeName: 'Sorties',
    })
    expect(snapshot.expenses[3]).toMatchObject({ envelopeName: 'Anniversaire et fêtes', financedBy: 'gift_received' })
    expect(snapshot.savings).toEqual([
      { goalName: 'Long terme', manual: 200, fromClosure: 0 },
      { goalName: 'Vacances', manual: 0, fromClosure: 36 },
    ])
    expect(snapshot.closure).toEqual({ carriedOver: 0, toSavings: 36, toOtherEnvelopes: 0, overspendDeducted: 12 })
  })

  it('labels carry-overs and transfers to another envelope', () => {
    const leftovers = [
      { envelopeId: 'sorties', name: 'Sorties', emoji: '🥂', defaultCeiling: 90, ceiling: 90, netSpent: 60, leftover: 30, hasAllocation: true },
      { envelopeId: 'voyage', name: 'Voyage', emoji: '✈️', defaultCeiling: 50, ceiling: 50, netSpent: 40, leftover: 10, hasAllocation: true },
      { envelopeId: 'sport', name: 'Sport', emoji: '🏃', defaultCeiling: 25, ceiling: 25, netSpent: 25, leftover: 0, hasAllocation: true },
    ]
    const plan = planClosure({
      leftovers,
      decisions: [
        { envelopeId: 'sorties', destination: 'carry_over' },
        { envelopeId: 'voyage', destination: 'envelope', targetEnvelopeId: 'sorties' },
      ],
      savingsGoalIds: [],
    })
    const snapshot = buildReportSnapshot({ data, leftovers, plan, closedAt: new Date('2026-10-13T08:00:00Z') })
    expect(snapshot.envelopes.map((e) => e.destinationLabel)).toEqual(['Reporté', 'Vers Sorties', null])
  })
})
