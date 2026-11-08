import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
  input: null as any,
  current: null as any,
  envelopes: [] as any[],
  accounts: [] as any[],
}))
const lock = vi.hoisted(() => ({ assertMonthOpen: vi.fn() }))
vi.mock('../../../../server/utils/monthLock', () => lock)
vi.mock('../../../../server/utils/auth', () => ({ requireUser: vi.fn(async () => ({ id: 'u1' })) }))
vi.mock('../../../../server/utils/validateBody', () => ({ validateBody: vi.fn(async () => state.input) }))

// Data API: envelopes and accounts reads.
vi.mock('../../../../server/utils/supabase', () => ({
  createSupabaseServerClient: () => ({
    from: (table: string) => ({
      select: () => ({
        in: () => ({ abortSignal: () => Promise.resolve({ data: table === 'envelopes' ? state.envelopes : state.accounts, error: null }) }),
      }),
    }),
  }),
}))

const db = vi.hoisted(() => {
  const calls = { inserted: [] as any[], set: [] as any[], deleted: 0 }
  const db: any = {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve(state.current ? [state.current] : [])) })) })),
    insert: vi.fn(() => ({
      values: vi.fn((values: any) => {
        calls.inserted.push(values)
        return { returning: vi.fn(() => Promise.resolve([{ id: 'new', ...values }])) }
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: any) => {
        calls.set.push(values)
        return { where: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([{ ...state.current, ...values }])) })) }
      }),
    })),
    delete: vi.fn(() => ({ where: vi.fn(() => { calls.deleted++; return Promise.resolve([]) }) })),
  }
  return { db, calls }
})
vi.mock('../../../../server/utils/db', () => ({ db: db.db, withDbTimeout: <T>(p: Promise<T>) => p }))

const routes: Record<string, (e: any) => Promise<any>> = {}
beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (h: any) => h
  routes.post = (await import('../../../../server/api/transfers/index.post.ts')).default as any
  routes.patch = (await import('../../../../server/api/transfers/[id].patch.ts')).default as any
  routes.delete = (await import('../../../../server/api/transfers/[id].delete.ts')).default as any
})

const event = () => ({ context: { params: { id: 't1' } } }) as any
const budget = { kind: 'budget' }
const account = (accountId: string) => ({ kind: 'account', accountId })
const envelope = (envelopeId: string) => ({ kind: 'envelope', envelopeId })
const base = { amount: 20, reason: 'Test', date: '2026-10-31' }

describe('transfer writes', () => {
  beforeEach(() => {
    lock.assertMonthOpen.mockReset()
    db.calls.inserted.length = 0
    db.calls.set.length = 0
    db.calls.deleted = 0
    state.envelopes = [{ id: 'e1', kind: 'budget' }, { id: 'e2', kind: 'budget' }]
    state.accounts = [{ id: 'a1', archived_at: null }]
    state.current = null
  })

  it('POST writes kinds, ids and the month from the date', async () => {
    state.input = { ...base, from: budget, to: account('a1') }
    await routes.post(event())
    expect(db.calls.inserted[0]).toMatchObject({
      date: '2026-10-31', fromKind: 'budget', fromEnvelopeId: null, fromAccountId: null,
      toKind: 'account', toEnvelopeId: null, toAccountId: 'a1', amount: '20', monthAssigned: 10, yearAssigned: 2026,
    })
  })

  it('POST checks the month of the date, not today', async () => {
    state.input = { ...base, from: budget, to: account('a1') }
    await routes.post(event())
    expect(lock.assertMonthOpen.mock.calls.map((c) => [c[1], c[2]])).toEqual([[2026, 10]])
  })

  it('refuses a reserve envelope on either side', async () => {
    state.envelopes = [{ id: 'e1', kind: 'budget' }, { id: 'r1', kind: 'reserve' }]
    for (const [from, to] of [[envelope('e1'), envelope('r1')], [envelope('r1'), envelope('e1')]]) {
      state.input = { ...base, from, to }
      await expect(routes.post(event())).rejects.toMatchObject({
        statusCode: 400, data: { message: 'Les enveloppes de réserve ne peuvent pas recevoir de transfert.' },
      })
    }
    expect(db.calls.inserted).toHaveLength(0)
  })

  it('refuses an unknown envelope', async () => {
    state.input = { ...base, from: envelope('e1'), to: envelope('ghost') }
    await expect(routes.post(event())).rejects.toMatchObject({ statusCode: 400, data: { message: "Cette enveloppe n'existe plus." } })
  })

  it('refuses an archived or unknown account on a new transfer', async () => {
    state.accounts = [{ id: 'a1', archived_at: '2026-09-01T00:00:00Z' }]
    state.input = { ...base, from: budget, to: account('a1') }
    await expect(routes.post(event())).rejects.toMatchObject({ statusCode: 400, data: { message: "Ce compte n'est plus disponible." } })
    state.input = { ...base, from: budget, to: account('ghost') }
    await expect(routes.post(event())).rejects.toMatchObject({ statusCode: 400, data: { message: "Ce compte n'est plus disponible." } })
    expect(db.calls.inserted).toHaveLength(0)
  })

  it('lets an edit keep an account archived since', async () => {
    state.accounts = [{ id: 'a1', archived_at: '2026-09-01T00:00:00Z' }]
    state.current = { id: 't1', source: 'manual', yearAssigned: 2026, monthAssigned: 10, toKind: 'account', toAccountId: 'a1', fromKind: 'budget' }
    state.input = { ...base, from: budget, to: account('a1') }
    await routes.patch(event())
    expect(db.calls.set).toHaveLength(1)
    expect(db.calls.set[0]).toMatchObject({ toKind: 'account', toAccountId: 'a1' })
  })

  it('refuses to move an archived account to the other side on edit', async () => {
    state.accounts = [{ id: 'a1', archived_at: '2026-09-01T00:00:00Z' }]
    state.current = { id: 't1', source: 'manual', yearAssigned: 2026, monthAssigned: 10, toKind: 'account', toAccountId: 'a1', fromKind: 'budget', fromAccountId: null }
    state.input = { ...base, from: account('a1'), to: budget }
    await expect(routes.patch(event())).rejects.toMatchObject({ statusCode: 400, data: { message: "Ce compte n'est plus disponible." } })
    expect(db.calls.set).toHaveLength(0)
  })

  it('refuses to switch to a different archived account on edit', async () => {
    state.accounts = [{ id: 'a1', archived_at: '2026-09-01T00:00:00Z' }, { id: 'a2', archived_at: '2026-09-02T00:00:00Z' }]
    state.current = { id: 't1', source: 'manual', yearAssigned: 2026, monthAssigned: 10, toKind: 'account', toAccountId: 'a1', fromKind: 'budget', fromAccountId: null }
    state.input = { ...base, from: budget, to: account('a2') }
    await expect(routes.patch(event())).rejects.toMatchObject({ statusCode: 400, data: { message: "Ce compte n'est plus disponible." } })
    expect(db.calls.set).toHaveLength(0)
  })

  it('PATCH checks both months when the date moves', async () => {
    state.current = { id: 't1', source: 'manual', yearAssigned: 2026, monthAssigned: 10, fromKind: 'budget', toKind: 'account', toAccountId: 'a1' }
    state.input = { ...base, date: '2026-11-02', from: budget, to: account('a1') }
    await routes.patch(event())
    expect(lock.assertMonthOpen.mock.calls.map((c) => [c[1], c[2]])).toEqual([[2026, 10], [2026, 11]])
  })

  it('PATCH and DELETE refuse a closure transfer', async () => {
    state.current = { id: 't1', source: 'closure', yearAssigned: 2026, monthAssigned: 10 }
    state.input = { ...base, from: budget, to: account('a1') }
    await expect(routes.patch(event())).rejects.toMatchObject({ statusCode: 409, data: { message: 'Transfert de clôture — non modifiable.' } })
    await expect(routes.delete(event())).rejects.toMatchObject({ statusCode: 409, data: { message: 'Transfert de clôture — non modifiable.' } })
    expect(db.calls.set).toHaveLength(0)
    expect(db.calls.deleted).toBe(0)
  })
})
