import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ response: { data: [] as any[] | null, error: null as any }, eqs: [] as unknown[][] }))
vi.mock('../../../../server/utils/supabase', () => ({
  createSupabaseServerClient: () => ({
    from: () => {
      const builder: any = {
        select: () => builder,
        eq: (...args: unknown[]) => { state.eqs.push(args); return builder },
        limit: () => builder,
        abortSignal: () => builder,
        then: (ok: any, err: any) => Promise.resolve(state.response).then(ok, err),
      }
      return builder
    },
  }),
}))
vi.mock('../../../../server/utils/db', () => { throw new Error('monthLock must not touch the connection pool') })

import { assertMonthOpen } from '../../../../server/utils/monthLock'

describe('assertMonthOpen', () => {
  beforeEach(() => {
    state.response = { data: [], error: null }
    state.eqs.length = 0
  })

  it('lets an open month through', async () => {
    await expect(assertMonthOpen({ context: {} } as any, 2026, 10)).resolves.toBeUndefined()
    expect(state.eqs).toEqual([['year', 2026], ['month', 10], ['status', 'closed']])
  })

  it('rejects a closed month with a 409 and a French message', async () => {
    state.response = { data: [{ id: 'c1' }], error: null }
    await expect(assertMonthOpen({ context: {} } as any, 2026, 9)).rejects.toMatchObject({
      statusCode: 409,
      data: { message: 'Septembre 2026 est clôturé. Affectez ce mouvement à un mois ouvert.' },
    })
  })

  it('fails closed with a 500 when the check itself fails', async () => {
    state.response = { data: null, error: { message: 'boom' } }
    await expect(assertMonthOpen({ context: {} } as any, 2026, 9)).rejects.toMatchObject({ statusCode: 500 })
  })
})
