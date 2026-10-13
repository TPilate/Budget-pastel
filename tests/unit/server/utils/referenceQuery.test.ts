import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const responses: Record<string, { data: any, error: any }> = {}
  const calls: Record<string, unknown[][]> = {}
  const makeClient = () => ({
    from(table: string) {
      const record = (name: string) => (...args: unknown[]) => { (calls[table] ??= []).push([name, ...args]); return builder }
      const builder: any = {
        select: record('select'), is: record('is'), order: record('order'),
        abortSignal: () => builder,
        then: (ok: any, err: any) => Promise.resolve(responses[table] ?? { data: [], error: null }).then(ok, err),
      }
      return builder
    },
  })
  return { responses, calls, makeClient }
})

vi.mock('../../../../server/utils/supabase', () => ({ createSupabaseServerClient: () => mocks.makeClient() }))
vi.mock('../../../../server/utils/db', () => { throw new Error('referenceQuery must not touch the connection pool') })

import { camelizeRow, fetchActiveRows, fetchSavingsGoals } from '../../../../server/utils/referenceQuery'

const event = { context: {} } as any

describe('referenceQuery', () => {
  beforeEach(() => {
    for (const key of Object.keys(mocks.responses)) delete mocks.responses[key]
    for (const key of Object.keys(mocks.calls)) delete mocks.calls[key]
  })

  it('camelCases keys exactly like Drizzle column names, leaving values alone', () => {
    expect(camelizeRow({ id: 'a', default_ceiling: '90.00', fifty_thirty_twenty_bucket: 'envies', show_on_home: false, archived_at: null }))
      .toEqual({ id: 'a', defaultCeiling: '90.00', fiftyThirtyTwentyBucket: 'envies', showOnHome: false, archivedAt: null })
  })

  it('reads only active rows of a reference table, in display order', async () => {
    mocks.responses.income_types = { data: [{ id: 't1', name: 'Salaire', emoji: '💼', requires_details_text: false, default_target_envelope_id: null, sort_order: 0, archived_at: null }], error: null }

    const rows = await fetchActiveRows(event, 'income_types')

    expect(rows).toEqual([{ id: 't1', name: 'Salaire', emoji: '💼', requiresDetailsText: false, defaultTargetEnvelopeId: null, sortOrder: 0, archivedAt: null }])
    expect(mocks.calls.income_types).toEqual([['select', '*'], ['is', 'archived_at', null], ['order', 'sort_order']])
  })

  it('reads every savings goal in display order', async () => {
    mocks.responses.savings_goals = { data: [{ id: 'g1', name: 'Long terme', receives_salary_variance: true, sort_order: 0 }], error: null }
    expect(await fetchSavingsGoals(event)).toEqual([{ id: 'g1', name: 'Long terme', receivesSalaryVariance: true, sortOrder: 0 }])
    expect(mocks.calls.savings_goals).toEqual([['select', '*'], ['order', 'sort_order']])
  })

  it('throws a 500 naming the table on failure', async () => {
    mocks.responses.accounts = { data: null, error: { message: 'boom' } }
    await expect(fetchActiveRows(event, 'accounts')).rejects.toMatchObject({ statusCode: 500, message: expect.stringContaining('accounts') })
  })
})
