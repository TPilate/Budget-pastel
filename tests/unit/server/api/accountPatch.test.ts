import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ input: null as any }))
vi.mock('../../../../server/utils/auth', () => ({ requireUser: vi.fn(async () => ({ id: 'u1' })) }))
vi.mock('../../../../server/utils/validateBody', () => ({ validateBody: vi.fn(async () => state.input) }))

const db = vi.hoisted(() => {
  const calls = { set: [] as any[] }
  const db: any = {
    update: vi.fn(() => ({
      set: vi.fn((values: any) => {
        calls.set.push(values)
        return { where: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([{ id: 'a1', ...values }])) })) }
      }),
    })),
  }
  return { db, calls }
})
vi.mock('../../../../server/utils/db', () => ({ db: db.db, withDbTimeout: <T>(p: Promise<T>) => p }))

let patch: (e: any) => Promise<any>
beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (h: any) => h
  ;(globalThis as any).getRouterParam = () => 'a1'
  patch = (await import('../../../../server/api/accounts/[id].patch.ts')).default as any
})

describe('PATCH /api/accounts/:id', () => {
  beforeEach(() => { db.calls.set.length = 0 })

  it('writes current_balance and reference_set_at together when balance is sent', async () => {
    state.input = { balance: 250 }
    await patch({} as any)
    expect(db.calls.set[0].currentBalance).toBe('250')
    expect(db.calls.set[0].referenceSetAt).toBeInstanceOf(Date)
    expect(db.calls.set[0]).not.toHaveProperty('balance')
  })

  it('leaves both untouched when only name, emoji or kind change', async () => {
    state.input = { name: 'Livret', emoji: '🌳', kind: 'epargne' }
    await patch({} as any)
    expect(db.calls.set[0]).toEqual({ name: 'Livret', emoji: '🌳', kind: 'epargne' })
  })
})
