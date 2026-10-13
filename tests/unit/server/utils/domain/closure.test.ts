import { describe, it, expect } from 'vitest'
import {
  toCents, monthLabel, nextYearMonth, parisYearMonth, closureWindow,
  computeLeftovers, planClosure, ClosurePlanError, defaultSavingsGoalId,
} from '../../../../../server/utils/domain/closure'
import type { MonthData, LeftoverRow } from '../../../../../server/utils/domain/closure'

const SEPT = { year: 2026, month: 9 }

function monthData(over: Partial<MonthData> = {}): MonthData {
  return {
    month: SEPT,
    envelopes: [], allocations: [], expenses: [], incomes: [], transfers: [],
    savingsEntries: [], savingsGoals: [],
    ...over,
  }
}

const envelope = (id: string, defaultCeiling: number, over = {}) => ({
  id, name: id, emoji: '🥂', kind: 'budget' as const, defaultCeiling, bucket: 'envies' as const, archived: false, ...over,
})
const expense = (envelopeId: string | null, amount: number) => ({
  date: '2026-09-10', label: 'x', amount, envelopeId, financedBy: 'budget' as const,
  categoryName: 'Courses', categoryEmoji: '🛒', categoryBucket: 'besoins' as const,
})
const row = (envelopeId: string, leftover: number, over: Partial<LeftoverRow> = {}): LeftoverRow => ({
  envelopeId, name: envelopeId, emoji: '🥂', defaultCeiling: 90, ceiling: 90, netSpent: 90 - leftover,
  leftover, hasAllocation: true, ...over,
})

describe('toCents and labels', () => {
  it('rounds to the cent and never returns negative zero', () => {
    expect(toCents(0.1 + 0.2)).toBe(0.3)
    expect(Object.is(toCents(-0.000001), 0)).toBe(true)
  })

  it('labels months in French', () => {
    expect(monthLabel(SEPT)).toBe('Septembre 2026')
    expect(nextYearMonth({ year: 2026, month: 12 })).toEqual({ year: 2027, month: 1 })
  })
})

describe('parisYearMonth and closureWindow', () => {
  it('judges the month in Europe/Paris, not UTC', () => {
    // After the 25 Oct 2026 DST change Paris is UTC+1.
    expect(parisYearMonth(new Date('2026-10-31T22:59:00Z'))).toEqual({ year: 2026, month: 10 })
    expect(parisYearMonth(new Date('2026-10-31T23:00:00Z'))).toEqual({ year: 2026, month: 11 })
  })

  it('does not offer October until midnight in Paris on 1 November', () => {
    const base = { firstDataMonth: { year: 2026, month: 10 }, closedMonths: [] }
    expect(closureWindow({ ...base, now: new Date('2026-10-31T22:59:00Z') }).closable).toBeNull()
    expect(closureWindow({ ...base, now: new Date('2026-10-31T23:00:00Z') }).closable).toEqual({ year: 2026, month: 10 })
  })

  it('offers the oldest unclosed month first when several are overdue', () => {
    const result = closureWindow({
      firstDataMonth: { year: 2026, month: 8 },
      closedMonths: [{ year: 2026, month: 8 }],
      now: new Date('2026-11-05T10:00:00Z'),
    })
    expect(result).toEqual({ closable: { year: 2026, month: 9 }, nextOpening: null })
  })

  it('reports when the next closure opens once everything is caught up', () => {
    const result = closureWindow({
      firstDataMonth: SEPT,
      closedMonths: [SEPT],
      now: new Date('2026-10-13T10:00:00Z'),
    })
    expect(result).toEqual({ closable: null, nextOpening: { year: 2026, month: 11 } })
  })

  it('has nothing to close when there is no data at all', () => {
    const result = closureWindow({ firstDataMonth: null, closedMonths: [], now: new Date('2026-10-13T10:00:00Z') })
    expect(result).toEqual({ closable: null, nextOpening: { year: 2026, month: 11 } })
  })
})

describe('computeLeftovers', () => {
  it('computes each budget envelope remaining, rounded to the cent', () => {
    const rows = computeLeftovers(monthData({
      envelopes: [envelope('sorties', 90)],
      expenses: [expense('sorties', 30.1), expense('sorties', 30.2), expense('sorties', 29.4)],
    }))
    expect(rows).toEqual([{
      envelopeId: 'sorties', name: 'sorties', emoji: '🥂', defaultCeiling: 90,
      ceiling: 90, netSpent: 89.7, leftover: 0.3, hasAllocation: false,
    }])
  })

  it('treats a ceiling spent exactly through decimals as zero, not a tiny negative', () => {
    const [result] = computeLeftovers(monthData({
      envelopes: [envelope('beaute', 0.3)],
      expenses: [expense('beaute', 0.1), expense('beaute', 0.2)],
    }))
    expect(Object.is(result.leftover, 0)).toBe(true)
  })

  it('applies allocations, transfers and income credits, and skips reserves and archived envelopes', () => {
    const rows = computeLeftovers(monthData({
      envelopes: [
        envelope('sorties', 90),
        envelope('resto', 110),
        envelope('fetes', 0, { kind: 'reserve' }),
        envelope('old', 50, { archived: true }),
      ],
      allocations: [{ envelopeId: 'sorties', baseCeiling: 80, carriedOverAmount: 15, overspendDeduction: 5 }],
      transfers: [{ date: '2026-09-12', fromEnvelopeId: 'resto', toEnvelopeId: 'sorties', amount: 20, reason: 'anniv' }],
      expenses: [expense('sorties', 100)],
      incomes: [{ date: '2026-09-15', label: 'Coline', amount: 12, expectedAmount: null, targetEnvelopeId: 'sorties', typeName: 'Remboursement', typeEmoji: '🔁' }],
    }))
    expect(rows.map((r) => r.envelopeId)).toEqual(['sorties', 'resto'])
    // 80 + 15 − 5 + 20 = 110 ceiling; 100 − 12 = 88 net; 22 left.
    expect(rows[0]).toMatchObject({ ceiling: 110, netSpent: 88, leftover: 22, hasAllocation: true })
    // 110 − 20 transferred out, nothing spent.
    expect(rows[1]).toMatchObject({ ceiling: 90, netSpent: 0, leftover: 90, hasAllocation: false })
  })
})

describe('planClosure', () => {
  const goals = ['long-terme', 'vacances']

  it('routes each destination and builds next month allocations', () => {
    const plan = planClosure({
      leftovers: [
        row('sorties', 26, { defaultCeiling: 90 }),
        row('resto', 40, { defaultCeiling: 110 }),
        row('mode', 10, { defaultCeiling: 60 }),
        row('voyage', -12, { defaultCeiling: 0 }),
        row('sport', 0, { defaultCeiling: 25, hasAllocation: false }),
      ],
      decisions: [
        { envelopeId: 'sorties', destination: 'carry_over' },
        { envelopeId: 'resto', destination: 'savings', savingsGoalId: 'long-terme' },
        { envelopeId: 'mode', destination: 'envelope', targetEnvelopeId: 'sorties' },
      ],
      savingsGoalIds: goals,
    })

    expect(plan.decisions).toEqual([
      { envelopeId: 'sorties', leftoverAmount: 26, destination: 'carry_over', savingsGoalId: null, targetEnvelopeId: null },
      { envelopeId: 'resto', leftoverAmount: 40, destination: 'savings', savingsGoalId: 'long-terme', targetEnvelopeId: null },
      { envelopeId: 'mode', leftoverAmount: 10, destination: 'envelope', savingsGoalId: null, targetEnvelopeId: 'sorties' },
    ])
    expect(plan.nextAllocations).toEqual([
      // Its own 26 plus the 10 sent from Mode.
      { envelopeId: 'sorties', baseCeiling: 90, carriedOverAmount: 36, overspendDeduction: 0 },
      { envelopeId: 'resto', baseCeiling: 110, carriedOverAmount: 0, overspendDeduction: 0 },
      { envelopeId: 'mode', baseCeiling: 60, carriedOverAmount: 0, overspendDeduction: 0 },
      { envelopeId: 'voyage', baseCeiling: 0, carriedOverAmount: 0, overspendDeduction: 12 },
      { envelopeId: 'sport', baseCeiling: 25, carriedOverAmount: 0, overspendDeduction: 0 },
    ])
    expect(plan.freezeAllocations).toEqual([{ envelopeId: 'sport', baseCeiling: 25 }])
    expect(plan.savingsEntries).toEqual([{ savingsGoalId: 'long-terme', amount: 40 }])
    expect(plan.totals).toEqual({ carriedOver: 26, toSavings: 40, toOtherEnvelopes: 10, overspendDeducted: 12 })
  })

  it('sums two leftovers sent to the same poche into one entry', () => {
    const plan = planClosure({
      leftovers: [row('a', 10.1), row('b', 20.2)],
      decisions: [
        { envelopeId: 'a', destination: 'savings', savingsGoalId: 'vacances' },
        { envelopeId: 'b', destination: 'savings', savingsGoalId: 'vacances' },
      ],
      savingsGoalIds: goals,
    })
    expect(plan.savingsEntries).toEqual([{ savingsGoalId: 'vacances', amount: 30.3 }])
  })

  it('keeps a carry-over and an overspend on the same envelope in one row', () => {
    // Voyage is overspent and also receives Mode's leftover.
    const plan = planClosure({
      leftovers: [row('voyage', -12, { defaultCeiling: 0 }), row('mode', 10)],
      decisions: [{ envelopeId: 'mode', destination: 'envelope', targetEnvelopeId: 'voyage' }],
      savingsGoalIds: goals,
    })
    expect(plan.nextAllocations[0]).toEqual({ envelopeId: 'voyage', baseCeiling: 0, carriedOverAmount: 10, overspendDeduction: 12 })
  })

  it.each([
    ['a missing decision', [row('a', 10)], [], /reste 1 reliquat/],
    ['a decision on an overspent envelope', [row('a', -5)], [{ envelopeId: 'a', destination: 'carry_over' }], /pas de reliquat/],
    ['a decision on a zero leftover', [row('a', 0)], [{ envelopeId: 'a', destination: 'carry_over' }], /pas de reliquat/],
    ['an unknown envelope', [row('a', 10)], [{ envelopeId: 'zz', destination: 'carry_over' }], /inconnue/],
    ['two decisions for one envelope', [row('a', 10)], [{ envelopeId: 'a', destination: 'carry_over' }, { envelopeId: 'a', destination: 'carry_over' }], /deux destinations/],
    ['savings without a poche', [row('a', 10)], [{ envelopeId: 'a', destination: 'savings' }], /poche/],
    ['savings to an unknown poche', [row('a', 10)], [{ envelopeId: 'a', destination: 'savings', savingsGoalId: 'nope' }], /poche/],
    ['an envelope sent to itself', [row('a', 10)], [{ envelopeId: 'a', destination: 'envelope', targetEnvelopeId: 'a' }], /autre enveloppe/],
    ['an envelope sent nowhere', [row('a', 10)], [{ envelopeId: 'a', destination: 'envelope' }], /autre enveloppe/],
  ] as const)('rejects %s', (_label, leftovers, decisions, message) => {
    expect(() => planClosure({ leftovers: [...leftovers], decisions: [...decisions] as any, savingsGoalIds: goals }))
      .toThrowError(message)
    expect(() => planClosure({ leftovers: [...leftovers], decisions: [...decisions] as any, savingsGoalIds: goals }))
      .toThrowError(ClosurePlanError)
  })
})

describe('defaultSavingsGoalId', () => {
  it('prefers the poche that receives the salary variance', () => {
    expect(defaultSavingsGoalId([
      { id: 'a', receivesSalaryVariance: false },
      { id: 'b', receivesSalaryVariance: true },
    ])).toBe('b')
  })

  it('falls back to the first poche, then to null', () => {
    expect(defaultSavingsGoalId([{ id: 'a', receivesSalaryVariance: false }])).toBe('a')
    expect(defaultSavingsGoalId([])).toBeNull()
  })
})
