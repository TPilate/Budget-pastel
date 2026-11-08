import { describe, it, expect, vi } from 'vitest'

const rows = vi.hoisted(() => ({
  envelopes: [{ id: 'e1', name: 'Restaurants', emoji: '🍽️', show_on_home: true, default_ceiling: '130' }],
  monthly_envelope_allocations: [] as any[],
  expense_entries: [] as any[],
  income_entries: [{ amount: '280.00', expected_amount: null, target_envelope_id: null }],
  transfers: [
    { id: 't1', from_kind: 'budget', to_kind: 'account', from_account_id: null, to_account_id: 'ldds', from_envelope_id: null, to_envelope_id: null, amount: '150.00' },
  ],
  accounts: [{ id: 'ldds', name: 'Livret LDDS', emoji: '🏦', kind: 'epargne' }],
}))

vi.mock('../../../../server/utils/supabase', () => ({
  createSupabaseServerClient: () => ({
    from(table: keyof typeof rows) {
      let data: any[] = rows[table]
      const builder: any = {
        select: () => builder, eq: () => builder, is: () => builder, not: () => builder, order: () => builder,
        neq: (column: string, value: unknown) => { data = data.filter((row) => row[column] !== value); return builder },
        abortSignal: () => builder,
        then: (ok: any, err: any) => Promise.resolve({ data, error: null }).then(ok, err),
      }
      return builder
    },
  }),
}))
vi.mock('../../../../server/utils/savingsQuery', () => ({ fetchSavings: vi.fn(async () => []) }))
vi.mock('../../../../server/utils/db', () => { throw new Error('budget libre must not touch the connection pool') })

import { fetchBudgetLibre } from '../../../../server/utils/budgetLibreQuery'

const event = { context: {} } as any

describe('fetchBudgetLibre', () => {
  it('excludes the given transfer from both unspent and ledgers', async () => {
    // unspent = 280 - 150 (t1 leaves); envelope e1 keeps 130 → 280 - 150 - 130 = 0.
    expect(await fetchBudgetLibre(event, { year: 2026, month: 10 })).toBe(0)
    // Without t1: unspent 280, envelope 130 → 150.
    expect(await fetchBudgetLibre(event, { year: 2026, month: 10 }, { excludeTransferId: 't1' })).toBe(150)
  })
})
