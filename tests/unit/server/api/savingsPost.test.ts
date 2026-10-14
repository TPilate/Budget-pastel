import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { savingsInputSchema } from '../../../../shared/schemas/savings'

const state = vi.hoisted(() => ({ input: null as any, rows: [] as any[] }))
const lock = vi.hoisted(() => ({ assertMonthOpen: vi.fn() }))
vi.mock('../../../../server/utils/monthLock', () => lock)
vi.mock('../../../../server/utils/auth', () => ({ requireUser: vi.fn(async () => ({ id: 'user-1' })) }))
vi.mock('../../../../server/utils/validateBody', () => ({ validateBody: vi.fn(async () => state.input) }))

const db = vi.hoisted(() => ({
  insert: vi.fn(() => ({
    values: vi.fn((values: any) => ({
      returning: vi.fn(() => {
        const row = { id: `row-${state.rows.length + 1}`, ...values }
        state.rows.push(row)
        return Promise.resolve([row])
      }),
    })),
  })),
  update: vi.fn(),
}))
vi.mock('../../../../server/utils/db', () => ({ db, withDbTimeout: <T>(p: Promise<T>) => p }))

let postSavings: (event: any) => Promise<any>
beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (handler: any) => handler
  postSavings = (await import('../../../../server/api/savings/index.post.ts')).default as any
})

describe('POST /api/savings', () => {
  beforeEach(() => {
    state.rows = []
    lock.assertMonthOpen.mockReset()
    db.update.mockClear()
  })

  it('records a dated manual versement, month and year taken from the date', async () => {
    state.input = { savingsGoalId: 'g1', date: '2026-10-05', amount: 100 }
    const row = await postSavings({ context: {} })
    expect(row).toMatchObject({ savingsGoalId: 'g1', date: '2026-10-05', year: 2026, month: 10, amount: '100', source: 'manual' })
    expect(lock.assertMonthOpen).toHaveBeenCalledWith(expect.anything(), 2026, 10)
  })

  it('adds a second versement for the same poche and month instead of replacing the first', async () => {
    state.input = { savingsGoalId: 'g1', date: '2026-10-05', amount: 100 }
    await postSavings({ context: {} })
    state.input = { savingsGoalId: 'g1', date: '2026-10-20', amount: 50 }
    await postSavings({ context: {} })
    expect(state.rows.map((r) => r.amount)).toEqual(['100', '50'])
    expect(db.update).not.toHaveBeenCalled()
  })
})

describe('savingsInputSchema', () => {
  const valid = { savingsGoalId: '11111111-1111-1111-1111-111111111111', date: '2026-10-05', amount: '12,5'.replace(',', '.') }
  it('accepts a dated positive amount', () => {
    expect(savingsInputSchema.parse(valid)).toEqual({ ...valid, amount: 12.5 })
  })
  it('rejects zero, which used to mean "reset" and no longer means anything', () => {
    expect(savingsInputSchema.safeParse({ ...valid, amount: 0 }).success).toBe(false)
  })
  it('rejects a malformed date', () => {
    expect(savingsInputSchema.safeParse({ ...valid, date: '05/10/2026' }).success).toBe(false)
  })
})
