import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ input: null as any, current: null as any }))
const lock = vi.hoisted(() => ({ assertMonthOpen: vi.fn() }))
vi.mock('../../../../server/utils/monthLock', () => lock)
vi.mock('../../../../server/utils/auth', () => ({ requireUser: vi.fn(async () => ({ id: 'u1' })) }))
vi.mock('../../../../server/utils/validateBody', () => ({ validateBody: vi.fn(async () => state.input) }))

const db = vi.hoisted(() => {
  const calls = { set: [] as any[] }
  const db: any = {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve(state.current ? [state.current] : [])) })) })),
    update: vi.fn(() => ({
      set: vi.fn((values: any) => {
        calls.set.push(values)
        return { where: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([{ ...state.current, ...values }])) })) }
      }),
    })),
  }
  return { db, calls }
})
vi.mock('../../../../server/utils/db', () => ({ db: db.db, withDbTimeout: <T>(p: Promise<T>) => p }))

let route: (e: any) => Promise<any>
beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (h: any) => h
  route = (await import('../../../../server/api/expenses/[id]/verified.patch.ts')).default as any
})

const event = () => ({ context: { params: { id: 'm1' } } }) as any

describe('PATCH /api/expenses/:id/verified', () => {
  beforeEach(() => {
    lock.assertMonthOpen.mockReset()
    db.calls.set.length = 0
    state.current = { id: 'm1', yearAssigned: 2026, monthAssigned: 10 }
  })

  it('sets verified_at when verified is true', async () => {
    state.input = { verified: true }
    const result = await route(event())
    expect(db.calls.set[0].verifiedAt).toBeInstanceOf(Date)
    expect(result).toEqual({ id: 'm1', verified: true })
  })

  it('clears verified_at when verified is false', async () => {
    state.input = { verified: false }
    const result = await route(event())
    expect(db.calls.set[0]).toEqual({ verifiedAt: null })
    expect(result).toEqual({ id: 'm1', verified: false })
  })

  it('does not check the month lock', async () => {
    state.input = { verified: true }
    await route(event())
    expect(lock.assertMonthOpen).not.toHaveBeenCalled()
  })

  it('404s with "Ce mouvement n\'existe plus." when the row is gone', async () => {
    state.current = null
    state.input = { verified: true }
    await expect(route(event())).rejects.toMatchObject({ statusCode: 404, message: "Ce mouvement n'existe plus." })
    expect(db.calls.set).toHaveLength(0)
  })
})
