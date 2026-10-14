import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const responseByTable: Record<string, { data: any, error: any }> = {}
  const calls: Record<string, [string, ...unknown[]][]> = {}

  const makeClient = () => ({
    from(table: string) {
      const record = (name: string) => (...args: unknown[]) => { (calls[table] ??= []).push([name, ...args]); return builder }
      const builder: any = {
        select: record('select'), eq: record('eq'), is: record('is'), order: record('order'),
        limit: record('limit'), abortSignal: () => builder,
        maybeSingle: () => Promise.resolve(responseByTable[table] ?? { data: null, error: null }),
        then: (ok: any, err: any) => Promise.resolve(responseByTable[table] ?? { data: [], error: null }).then(ok, err),
      }
      return builder
    },
  })
  return { responseByTable, calls, makeClient }
})

vi.mock('../../../../server/utils/supabase', () => ({ createSupabaseServerClient: () => mocks.makeClient() }))
// The pool is this project's main hazard. Importing it from here must fail the suite.
vi.mock('../../../../server/utils/db', () => { throw new Error('closureQuery must not touch the connection pool') })

import { fetchClosureState, fetchMonthData, fetchArchives, fetchReportSnapshot } from '../../../../server/utils/closureQuery'

const event = { context: {} } as any

describe('closureQuery', () => {
  beforeEach(() => {
    for (const key of Object.keys(mocks.responseByTable)) delete mocks.responseByTable[key]
    for (const key of Object.keys(mocks.calls)) delete mocks.calls[key]
  })

  it('finds the earliest month with data across all four tables, and the closed months', async () => {
    mocks.responseByTable.month_closures = { data: [{ year: 2026, month: 8 }], error: null }
    mocks.responseByTable.expense_entries = { data: [{ year_assigned: 2026, month_assigned: 9 }], error: null }
    mocks.responseByTable.income_entries = { data: [{ year_assigned: 2026, month_assigned: 8 }], error: null }
    mocks.responseByTable.transfers = { data: [], error: null }
    mocks.responseByTable.savings_entries = { data: [{ year: 2025, month: 12 }], error: null }

    const state = await fetchClosureState(event)

    expect(state).toEqual({ firstDataMonth: { year: 2025, month: 12 }, closedMonths: [{ year: 2026, month: 8 }] })
    expect(mocks.calls.month_closures).toContainEqual(['eq', 'status', 'closed'])
  })

  it('maps one month of rows, keeping nulls and turning numeric strings into numbers', async () => {
    mocks.responseByTable.envelopes = { data: [
      { id: 'e1', name: 'Sorties', emoji: '🥂', kind: 'budget', default_ceiling: '90.00', fifty_thirty_twenty_bucket: 'envies', archived_at: null },
      { id: 'e2', name: 'Fêtes', emoji: '🎂', kind: 'reserve', default_ceiling: null, fifty_thirty_twenty_bucket: null, archived_at: '2026-01-01' },
    ], error: null }
    mocks.responseByTable.monthly_envelope_allocations = { data: [
      { envelope_id: 'e1', base_ceiling: '80.00', carried_over_amount: '5.50', overspend_deduction: '0.00' },
    ], error: null }
    mocks.responseByTable.expense_entries = { data: [
      { date: '2026-09-12', label: 'Bouillon', amount: '64.00', envelope_id: 'e1', financed_by: 'budget', categories: { name: 'Restaurants', emoji: '🍽️', fifty_thirty_twenty_bucket: 'envies' } },
    ], error: null }
    mocks.responseByTable.income_entries = { data: [
      { date_received: '2026-09-28', label: 'Salaire', amount: '2000.00', expected_amount: null, target_envelope_id: null, income_types: [{ name: 'Salaire', emoji: '💼' }] },
    ], error: null }
    mocks.responseByTable.transfers = { data: [
      { date: '2026-09-02', from_envelope_id: 'e1', to_envelope_id: 'e2', amount: '10.00', reason: 'test' },
    ], error: null }
    mocks.responseByTable.savings_entries = { data: [{ savings_goal_id: 'g1', amount: '200.00', source: 'manual' }], error: null }
    mocks.responseByTable.savings_goals = { data: [{ id: 'g1', name: 'Long terme', receives_salary_variance: true }], error: null }

    const data = await fetchMonthData(event, { year: 2026, month: 9 })

    expect(data.envelopes).toEqual([
      { id: 'e1', name: 'Sorties', emoji: '🥂', kind: 'budget', defaultCeiling: 90, bucket: 'envies', archived: false },
      { id: 'e2', name: 'Fêtes', emoji: '🎂', kind: 'reserve', defaultCeiling: 0, bucket: null, archived: true },
    ])
    expect(data.allocations).toEqual([{ envelopeId: 'e1', baseCeiling: 80, carriedOverAmount: 5.5, overspendDeduction: 0 }])
    expect(data.expenses[0]).toEqual({
      date: '2026-09-12', label: 'Bouillon', amount: 64, envelopeId: 'e1', financedBy: 'budget',
      categoryName: 'Restaurants', categoryEmoji: '🍽️', categoryBucket: 'envies',
    })
    expect(data.incomes[0]).toMatchObject({ amount: 2000, expectedAmount: null, targetEnvelopeId: null, typeName: 'Salaire' })
    expect(data.transfers[0]).toEqual({ date: '2026-09-02', fromEnvelopeId: 'e1', toEnvelopeId: 'e2', amount: 10, reason: 'test' })
    expect(data.savingsEntries).toEqual([{ savingsGoalId: 'g1', amount: 200, source: 'manual' }])
    expect(data.savingsGoals).toEqual([{ id: 'g1', name: 'Long terme', receivesSalaryVariance: true }])

    // Month scoping is real, not assumed.
    expect(mocks.calls.expense_entries).toContainEqual(['eq', 'year_assigned', 2026])
    expect(mocks.calls.expense_entries).toContainEqual(['eq', 'month_assigned', 9])
    expect(mocks.calls.savings_entries).toContainEqual(['eq', 'month', 9])
    expect(mocks.calls.monthly_envelope_allocations).toContainEqual(['eq', 'month', 9])
  })

  it('names an uncategorised envelope expense after its envelope', async () => {
    mocks.responseByTable.expense_entries = { data: [
      { date: '2026-09-14', label: 'Plein', amount: '40.00', envelope_id: 'e1', financed_by: 'budget', categories: null, envelopes: { name: 'Courses', emoji: '🛒' } },
    ], error: null }

    const data = await fetchMonthData(event, { year: 2026, month: 9 })

    expect(data.expenses[0]).toMatchObject({ categoryName: 'Courses', categoryEmoji: '🛒', categoryBucket: null })
    const select = mocks.calls.expense_entries.find(([name]) => name === 'select')!
    expect(String(select[1])).toContain('envelopes(name,emoji)')
  })

  it('throws a 500 naming the table when a request fails', async () => {
    mocks.responseByTable.transfers = { data: null, error: { message: 'boom' } }
    await expect(fetchMonthData(event, { year: 2026, month: 9 })).rejects.toMatchObject({
      statusCode: 500, message: expect.stringContaining('transfers'),
    })
  })

  it('lists archives newest first with French labels', async () => {
    mocks.responseByTable.monthly_reports = { data: [
      { generated_at: '2026-10-13T08:00:00Z', month_closures: { year: 2026, month: 9 } },
      { generated_at: '2026-11-02T08:00:00Z', month_closures: { year: 2026, month: 10 } },
    ], error: null }

    expect(await fetchArchives(event)).toEqual([
      { year: 2026, month: 10, label: 'Octobre 2026', generatedAt: '2026-11-02T08:00:00Z' },
      { year: 2026, month: 9, label: 'Septembre 2026', generatedAt: '2026-10-13T08:00:00Z' },
    ])
  })

  it('returns a stored snapshot, or null when the month has no report', async () => {
    expect(await fetchReportSnapshot(event, { year: 2026, month: 9 })).toBeNull()

    mocks.responseByTable.monthly_reports = { data: { snapshot: { version: 1 } }, error: null }
    expect(await fetchReportSnapshot(event, { year: 2026, month: 9 })).toEqual({ version: 1 })
    expect(mocks.calls.monthly_reports).toContainEqual(['eq', 'month_closures.year', 2026])
    expect(mocks.calls.monthly_reports).toContainEqual(['eq', 'month_closures.month', 9])
  })
})
