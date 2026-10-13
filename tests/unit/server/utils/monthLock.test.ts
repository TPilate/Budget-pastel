import { describe, it, expect, vi, beforeEach } from 'vitest'

// The fake applies eq / order / limit to `state.closures`, so the test pins what the
// query returns, not just how it is spelled.
const state = vi.hoisted(() => ({
  closures: [] as { year: number, month: number, status: string }[],
  error: null as any,
  eqs: [] as unknown[][],
  orders: [] as unknown[][],
  limits: [] as unknown[],
}))
vi.mock('../../../../server/utils/supabase', () => ({
  createSupabaseServerClient: () => ({
    from: () => {
      let rows: any[] = [...state.closures]
      const builder: any = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          state.eqs.push([column, value])
          rows = rows.filter((row) => row[column] === value)
          return builder
        },
        order: (column: string, options: { ascending: boolean }) => {
          state.orders.push([column, options])
          // Supabase orders by the first call first; a stable sort applied in reverse gets that.
          const sorts = [...state.orders]
          rows = [...rows].sort((a, b) => {
            for (const [col, opt] of sorts as [string, { ascending: boolean }][]) {
              const diff = (a[col] - b[col]) * (opt.ascending ? 1 : -1)
              if (diff !== 0) return diff
            }
            return 0
          })
          return builder
        },
        limit: (n: number) => { state.limits.push(n); rows = rows.slice(0, n); return builder },
        abortSignal: () => builder,
        then: (ok: any, err: any) => Promise.resolve(state.error ? { data: null, error: state.error } : { data: rows, error: null }).then(ok, err),
      }
      return builder
    },
  }),
}))
vi.mock('../../../../server/utils/db', () => { throw new Error('monthLock must not touch the connection pool') })

import { assertMonthOpen } from '../../../../server/utils/monthLock'

describe('assertMonthOpen', () => {
  beforeEach(() => {
    state.closures = []
    state.error = null
    state.eqs.length = 0
    state.orders.length = 0
    state.limits.length = 0
  })

  it('reads only the latest closed month', async () => {
    await expect(assertMonthOpen({ context: {} } as any, 2026, 10)).resolves.toBeUndefined()
    expect(state.eqs).toEqual([['status', 'closed']])
    expect(state.orders).toEqual([['year', { ascending: false }], ['month', { ascending: false }]])
    expect(state.limits).toEqual([1])
  })

  it('lets a month after the latest closed month through', async () => {
    state.closures = [{ year: 2026, month: 8, status: 'pending' }, { year: 2026, month: 9, status: 'closed' }]
    await expect(assertMonthOpen({ context: {} } as any, 2026, 10)).resolves.toBeUndefined()
  })

  it('rejects a closed month with a 409 and a French message', async () => {
    state.closures = [{ year: 2026, month: 8, status: 'pending' }, { year: 2026, month: 9, status: 'closed' }]
    await expect(assertMonthOpen({ context: {} } as any, 2026, 9)).rejects.toMatchObject({
      statusCode: 409,
      data: { message: 'Septembre 2026 est clôturé. Affectez ce mouvement à un mois ouvert.' },
    })
  })

  it('rejects a month before the latest closed month, even if it was never closed itself', async () => {
    // A backdated movement would make that month closable, and closing it would rewrite
    // the allocations of the month after it, which is already closed.
    state.closures = [{ year: 2026, month: 8, status: 'pending' }, { year: 2026, month: 9, status: 'closed' }]
    await expect(assertMonthOpen({ context: {} } as any, 2026, 8)).rejects.toMatchObject({
      statusCode: 409,
      data: { message: 'Août 2026 est clôturé. Affectez ce mouvement à un mois ouvert.' },
    })
    await expect(assertMonthOpen({ context: {} } as any, 2025, 12)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('fails closed with a 500 when the check itself fails', async () => {
    state.error = { message: 'boom' }
    await expect(assertMonthOpen({ context: {} } as any, 2026, 9)).rejects.toMatchObject({ statusCode: 500 })
  })
})
