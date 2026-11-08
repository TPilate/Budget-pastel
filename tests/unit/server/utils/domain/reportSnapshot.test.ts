import { describe, it, expect } from 'vitest'
import { buildReportLayout } from '../../../../../server/utils/reportLayout'
import { septemberSnapshot } from '../../../fixtures/reportSnapshot'
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
  accounts: [
    { id: 'ldds', name: 'LDDS', emoji: '🏦', kind: 'epargne' },
    { id: 'cc', name: 'Compte courant', emoji: '💳', kind: 'courant' },
  ],
  savingsEntries: [{ savingsGoalId: 'lt', amount: 200, source: 'manual' }],
  savingsGoals: [
    { id: 'lt', name: 'Long terme', receivesSalaryVariance: true },
    { id: 'vac', name: 'Vacances', receivesSalaryVariance: false },
  ],
}

const none = { toSavings: 0, toAccounts: [] }

describe('summariseMonth', () => {
  it('excludes reimbursements from income and gift-funded spend from spending', () => {
    const { summary, rule503020 } = summariseMonth(data, none)
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
    expect(summariseMonth(data, { toSavings: 36, toAccounts: [] }).summary).toEqual({ income: 2000, spent: 726, saved: 236, remaining: 1038 })
  })
})

const transfer = (over: Partial<MonthData['transfers'][number]>): MonthData['transfers'][number] => ({
  date: '2026-09-05', fromKind: 'budget', toKind: 'account', fromEnvelopeId: null, toEnvelopeId: null,
  fromAccountId: null, toAccountId: null, amount: 0, reason: '', source: 'manual', ...over,
})

describe('transfers to and from accounts in the report', () => {
  it('report saved includes net épargne-account transfers', () => {
    // Income 2000, spent 1770, nothing in the poches; Budget → LDDS 150.
    const example: MonthData = {
      ...data,
      expenses: [{ ...data.expenses[0], amount: 1770 }],
      savingsEntries: [],
      transfers: [transfer({ toAccountId: 'ldds', amount: 150 })],
    }
    const { summary, rule503020 } = summariseMonth(example, none)
    // Saved 150; remaining = 2000 − 1770 − 0 + 0 − 150 (leaving) = 80.
    expect(summary).toEqual({ income: 2000, spent: 1770, saved: 150, remaining: 80 })
    expect(rule503020.actuals.epargne).toBe(8)
  })

  it('counts the closure leftovers sent to an account like a transfer from an envelope', () => {
    const { summary } = summariseMonth(data, { toSavings: 0, toAccounts: [{ accountId: 'ldds', amount: 36 }] })
    // 2000 − 726 − 200 manual − 0 + 0 − 36 = 1038; saved 200 + 36.
    expect(summary).toMatchObject({ saved: 236, remaining: 1038 })
  })

  it('money coming back from an épargne account lowers saved and raises remaining', () => {
    const example: MonthData = { ...data, transfers: [transfer({ fromKind: 'account', toKind: 'budget', fromAccountId: 'ldds', amount: 50 })] }
    // saved 200 − 50 = 150; remaining 2000 − 726 − 200 + 50 = 1124.
    expect(summariseMonth(example, none).summary).toMatchObject({ saved: 150, remaining: 1124 })
  })

  it('names budget and account sides in the transfer list', () => {
    const example: MonthData = {
      ...data,
      transfers: [
        transfer({ toAccountId: 'ldds', amount: 150, reason: 'épargne' }),
        transfer({ fromKind: 'account', fromAccountId: 'cc', toKind: 'envelope', toEnvelopeId: 'sorties', amount: 20 }),
        transfer({ fromKind: 'envelope', fromEnvelopeId: 'voyage', toKind: 'budget', amount: 5 }),
      ],
    }
    const leftovers = computeLeftovers(example)
    const plan = planClosure({ leftovers, decisions: [{ envelopeId: 'sorties', destination: 'carry_over' }], savingsGoalIds: [], accountIds: [] })
    const snapshot = buildReportSnapshot({ data: example, leftovers, plan, closedAt: new Date('2026-10-13T08:00:00Z') })
    expect(snapshot.transfers.map((t) => [t.fromName, t.toName])).toEqual([
      ['Budget du mois', '🏦 LDDS'],
      ['💳 Compte courant', 'Sorties'],
      ['Voyage', 'Budget du mois'],
    ])
  })

  it('an old V1 snapshot fixture still builds the PDF layout', () => {
    const pages = buildReportLayout(septemberSnapshot)
    expect(pages).toHaveLength(2)
    expect(pages[0][0]).toMatchObject({ kind: 'title', text: 'Compte rendu — Septembre 2026' })
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
      accountIds: [],
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
    expect(snapshot.closure).toEqual({ carriedOver: 0, toSavings: 36, toOtherEnvelopes: 0, toAccounts: 0, overspendDeducted: 12 })
  })

  it('labels an account destination', () => {
    const leftovers = [
      { envelopeId: 'sorties', name: 'Sorties', emoji: '🥂', defaultCeiling: 90, ceiling: 90, netSpent: 60, leftover: 30, hasAllocation: true },
    ]
    const plan = planClosure({
      leftovers,
      decisions: [{ envelopeId: 'sorties', destination: 'account', accountId: 'ldds' }],
      savingsGoalIds: [],
      accountIds: ['ldds'],
    })
    const snapshot = buildReportSnapshot({ data, leftovers, plan, closedAt: new Date('2026-10-13T08:00:00Z') })
    expect(snapshot.envelopes[0].destinationLabel).toBe('Vers 🏦 LDDS')
    expect(snapshot.closure.toAccounts).toBe(30)
    // Sent to an épargne account: it counts as saved (200 manual + 30).
    expect(snapshot.summary.saved).toBe(230)
  })

  it('counts an account destination of kind epargne in saved', () => {
    const { summary } = summariseMonth(data, { toSavings: 0, toAccounts: [{ accountId: 'ldds', amount: 30 }] })
    expect(summary.saved).toBe(230)
  })

  it('a PDF for a snapshot without closure.toAccounts still renders, and shows the line when present', () => {
    const lines = (snapshot: typeof septemberSnapshot) => JSON.stringify(buildReportLayout(snapshot))
    expect(lines(septemberSnapshot)).not.toContain('Vers les comptes')
    expect(lines({ ...septemberSnapshot, closure: { ...septemberSnapshot.closure, toAccounts: 30 } })).toContain('Vers les comptes')
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
      accountIds: [],
    })
    const snapshot = buildReportSnapshot({ data, leftovers, plan, closedAt: new Date('2026-10-13T08:00:00Z') })
    expect(snapshot.envelopes.map((e) => e.destinationLabel)).toEqual(['Reporté', 'Vers Sorties', null])
  })
})
