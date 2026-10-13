import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'

const lock = vi.hoisted(() => ({ assertMonthOpen: vi.fn(), input: null as any }))
vi.mock('../../../../server/utils/monthLock', () => ({ assertMonthOpen: lock.assertMonthOpen }))
vi.mock('../../../../server/utils/auth', () => ({ requireUser: vi.fn(async () => ({ id: 'u1', email: null })) }))
vi.mock('../../../../server/utils/validateBody', () => ({ validateBody: vi.fn(async () => lock.input) }))

const db = vi.hoisted(() => {
  const chain: any = {}
  chain.insert = vi.fn(() => chain)
  chain.values = vi.fn(() => chain)
  chain.select = vi.fn(() => chain)
  chain.from = vi.fn(() => chain)
  chain.where = vi.fn(() => Promise.resolve([]))
  chain.returning = vi.fn(() => Promise.resolve([{ id: 'row' }]))
  return chain
})
vi.mock('../../../../server/utils/db', () => ({ db, withDbTimeout: <T>(p: Promise<T>) => p }))

const routes: Record<string, (event: any) => Promise<any>> = {}
beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (handler: any) => handler
  routes.expenses = (await import('../../../../server/api/expenses/index.post.ts')).default as any
  routes.incomes = (await import('../../../../server/api/incomes/index.post.ts')).default as any
  routes.transfers = (await import('../../../../server/api/transfers/index.post.ts')).default as any
  routes.savings = (await import('../../../../server/api/savings/index.post.ts')).default as any
})

const event = () => ({ context: {} }) as any

describe('closed-month lock on every create endpoint', () => {
  beforeEach(() => {
    lock.assertMonthOpen.mockReset()
    db.insert.mockClear()
    db.values.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('checks an expense against the month of its date', async () => {
    lock.input = { date: '2026-09-28', categoryId: 'c', label: 'x', amount: 10, financedBy: 'budget' }
    await routes.expenses(event())
    expect(lock.assertMonthOpen).toHaveBeenCalledWith(expect.anything(), 2026, 9)
  })

  it('checks an income against its assigned month, not its reception date', async () => {
    lock.input = { incomeTypeId: 'i', label: 'x', amount: 10, dateReceived: '2026-10-02', monthAssigned: 9, yearAssigned: 2026 }
    await routes.incomes(event())
    expect(lock.assertMonthOpen).toHaveBeenCalledWith(expect.anything(), 2026, 9)
  })

  it('checks a savings entry against its month', async () => {
    lock.input = { savingsGoalId: 'g', year: 2026, month: 9, amount: 10 }
    await routes.savings(event())
    expect(lock.assertMonthOpen).toHaveBeenCalledWith(expect.anything(), 2026, 9)
  })

  it('checks a transfer against the current month', async () => {
    lock.input = { fromEnvelopeId: 'a', toEnvelopeId: 'b', amount: 10, reason: 'r' }
    await routes.transfers(event())
    expect(lock.assertMonthOpen).toHaveBeenCalledTimes(1)
  })

  it('dates a transfer by the Paris month, not UTC', async () => {
    // 23:30 UTC on 31 October is 00:30 on 1 November in Paris. The form has no month
    // field, so a UTC date would drop the transfer into October, possibly closed.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-31T23:30:00Z'))
    lock.input = { fromEnvelopeId: 'a', toEnvelopeId: 'b', amount: 10, reason: 'r' }
    await routes.transfers(event())
    expect(lock.assertMonthOpen).toHaveBeenCalledWith(expect.anything(), 2026, 11)
    expect(db.values).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-11-01', monthAssigned: 11, yearAssigned: 2026 }))
  })

  it.each(['expenses', 'incomes', 'transfers', 'savings'])('writes nothing to a closed month (%s)', async (name) => {
    lock.input = {
      date: '2026-09-28', categoryId: 'c', label: 'x', amount: 10, financedBy: 'budget',
      incomeTypeId: 'i', dateReceived: '2026-09-28', monthAssigned: 9, yearAssigned: 2026,
      fromEnvelopeId: 'a', toEnvelopeId: 'b', reason: 'r', savingsGoalId: 'g', year: 2026, month: 9,
    }
    lock.assertMonthOpen.mockRejectedValueOnce(Object.assign(new Error('closed'), { statusCode: 409 }))
    await expect(routes[name](event())).rejects.toMatchObject({ statusCode: 409 })
    expect(db.insert).not.toHaveBeenCalled()
  })
})
