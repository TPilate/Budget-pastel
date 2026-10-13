import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MonthData } from '../../../../server/utils/domain/closure'

const q = vi.hoisted(() => ({
  fetchClosureState: vi.fn(),
  fetchMonthData: vi.fn(),
  fetchArchives: vi.fn(),
}))
vi.mock('../../../../server/utils/closureQuery', () => q)

const rpc = vi.hoisted(() => ({ calls: [] as any[], result: { data: 'closure-id', error: null as any } }))
vi.mock('../../../../server/utils/supabase', () => ({
  createSupabaseServerClient: () => ({
    rpc: (name: string, args: any) => {
      rpc.calls.push([name, args])
      return { abortSignal: () => Promise.resolve(rpc.result) }
    },
  }),
}))
vi.mock('../../../../server/utils/db', () => { throw new Error('closureService must not touch the connection pool') })

import { getClosureStatus, getClosurePage, closeMonth } from '../../../../server/utils/closureService'

const event = { context: {} } as any
const NOW = new Date('2026-10-13T08:00:00Z')
const SEPT = { year: 2026, month: 9 }

const septemberData: MonthData = {
  month: SEPT,
  envelopes: [
    { id: 'sorties', name: 'Sorties', emoji: '🥂', kind: 'budget', defaultCeiling: 90, bucket: 'envies', archived: false },
    { id: 'voyage', name: 'Voyage', emoji: '✈️', kind: 'budget', defaultCeiling: 0, bucket: 'envies', archived: false },
  ],
  allocations: [],
  expenses: [
    { date: '2026-09-12', label: 'Bouillon', amount: 64, envelopeId: 'sorties', financedBy: 'budget', categoryName: 'Restaurants', categoryEmoji: '🍽️', categoryBucket: 'envies' },
    { date: '2026-09-20', label: 'Train', amount: 12, envelopeId: 'voyage', financedBy: 'budget', categoryName: 'Transport', categoryEmoji: '🚗', categoryBucket: 'besoins' },
  ],
  incomes: [],
  transfers: [],
  savingsEntries: [],
  savingsGoals: [{ id: 'lt', name: 'Long terme', receivesSalaryVariance: true }],
}

describe('closureService', () => {
  beforeEach(() => {
    q.fetchClosureState.mockResolvedValue({ firstDataMonth: SEPT, closedMonths: [] })
    q.fetchMonthData.mockResolvedValue(septemberData)
    q.fetchArchives.mockResolvedValue([])
    q.fetchMonthData.mockClear()
    rpc.calls.length = 0
    rpc.result = { data: 'closure-id', error: null }
  })

  it('reports the closable month for the dashboard', async () => {
    expect(await getClosureStatus(event, NOW)).toEqual({
      closableMonth: { year: 2026, month: 9, label: 'Septembre 2026', name: 'septembre' },
    })
  })

  it('builds the page payload for the closable month', async () => {
    const page = await getClosurePage(event, NOW)
    expect(page.closable).toEqual({ year: 2026, month: 9, label: 'Septembre 2026', nextMonthName: 'octobre' })
    expect(page.envelopes).toEqual([
      { id: 'sorties', name: 'Sorties', emoji: '🥂', ceiling: 90, netSpent: 64, leftover: 26 },
      { id: 'voyage', name: 'Voyage', emoji: '✈️', ceiling: 0, netSpent: 12, leftover: -12 },
    ])
    expect(page.summary).toEqual({ income: 0, spent: 76, saved: 0, remaining: -76 })
    expect(page.defaultSavingsGoalId).toBe('lt')
    expect(page.nextOpening).toBeNull()
  })

  it('shows when the next closure opens once nothing is closable', async () => {
    q.fetchClosureState.mockResolvedValue({ firstDataMonth: SEPT, closedMonths: [SEPT] })
    const page = await getClosurePage(event, NOW)
    expect(page.closable).toBeNull()
    expect(page.envelopes).toEqual([])
    expect(page.summary).toBeNull()
    expect(page.nextOpening).toEqual({ year: 2026, month: 11, label: '1er novembre' })
    expect(q.fetchMonthData).not.toHaveBeenCalled()
  })

  it('sends one atomic RPC with the plan and the snapshot', async () => {
    const result = await closeMonth(event, {
      year: 2026, month: 9, decisions: [{ envelopeId: 'sorties', destination: 'carry_over' }],
    }, NOW)

    expect(result).toEqual(SEPT)
    expect(rpc.calls).toHaveLength(1)
    const [name, { payload }] = rpc.calls[0]
    expect(name).toBe('close_month')
    expect(payload.year).toBe(2026)
    expect(payload.month).toBe(9)
    expect(payload.nextAllocations).toEqual([
      { envelopeId: 'sorties', baseCeiling: 90, carriedOverAmount: 26, overspendDeduction: 0 },
      { envelopeId: 'voyage', baseCeiling: 0, carriedOverAmount: 0, overspendDeduction: 12 },
    ])
    expect(payload.freezeAllocations).toHaveLength(2)
    expect(payload.snapshot.version).toBe(1)
    expect(payload.snapshot.closure).toEqual({ carriedOver: 26, toSavings: 0, toOtherEnvelopes: 0, overspendDeducted: 12 })
  })

  it('refuses a month that is not the closable one, before any write', async () => {
    await expect(closeMonth(event, { year: 2026, month: 10, decisions: [] }, NOW))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(rpc.calls).toHaveLength(0)
  })

  it('turns an incomplete plan into a 400 with the French reason', async () => {
    await expect(closeMonth(event, { year: 2026, month: 9, decisions: [] }, NOW))
      .rejects.toMatchObject({ statusCode: 400, data: { message: 'Il reste 1 reliquat à répartir (« Sorties »).' } })
    expect(rpc.calls).toHaveLength(0)
  })

  it.each([
    [{ message: 'MONTH_ALREADY_CLOSED', code: 'P0001' }, 409],
    [{ message: 'duplicate key value violates unique constraint', code: '23505' }, 409],
    [{ message: 'PREVIOUS_MONTH_OPEN', code: 'P0001' }, 409],
    [{ message: 'something else', code: 'XX000' }, 500],
  ])('maps a database refusal %o to %i', async (error, status) => {
    // A double click or a second tab reaches the database after the first closure won.
    rpc.result = { data: null, error }
    await expect(closeMonth(event, {
      year: 2026, month: 9, decisions: [{ envelopeId: 'sorties', destination: 'carry_over' }],
    }, NOW)).rejects.toMatchObject({ statusCode: status })
  })
})
