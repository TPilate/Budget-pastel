import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ input: null as any, current: null as any, expectation: null as string | null }))
const lock = vi.hoisted(() => ({ assertMonthOpen: vi.fn() }))
vi.mock('../../../../server/utils/monthLock', () => lock)
vi.mock('../../../../server/utils/auth', () => ({ requireUser: vi.fn(async () => ({ id: 'u1' })) }))
vi.mock('../../../../server/utils/validateBody', () => ({ validateBody: vi.fn(async () => state.input) }))
vi.mock('../../../../server/utils/salaryExpectation', () => ({ salaryExpectationFor: vi.fn(async () => state.expectation) }))

const db = vi.hoisted(() => {
  const calls = { set: [] as any[], deleted: 0 }
  const db: any = {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve(state.current ? [state.current] : [])) })) })),
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
  for (const kind of ['expenses', 'incomes', 'transfers', 'savings']) {
    routes[`${kind}.patch`] = (await import(`../../../../server/api/${kind}/[id].patch.ts`)).default as any
    routes[`${kind}.delete`] = (await import(`../../../../server/api/${kind}/[id].delete.ts`)).default as any
  }
})

const event = () => ({ context: { params: { id: 'm1' } } }) as any
const closed = () => Object.assign(new Error('closed'), { statusCode: 409 })

const expenseInput = { date: '2026-10-12', categoryId: null, label: 'Ramen', amount: 28, envelopeId: 'env', financedBy: 'budget' }
const expenseRow = { id: 'm1', yearAssigned: 2026, monthAssigned: 10 }

describe('edit and delete movements', () => {
  beforeEach(() => {
    lock.assertMonthOpen.mockReset()
    db.calls.set.length = 0
    db.calls.deleted = 0
    state.expectation = null
  })

  it('updates an expense, deriving its month from the new date', async () => {
    state.current = expenseRow
    state.input = expenseInput
    const row = await routes['expenses.patch'](event())
    expect(db.calls.set[0]).toMatchObject({ label: 'Ramen', amount: '28', categoryId: null, monthAssigned: 10, yearAssigned: 2026 })
    expect(row.id).toBe('m1')
  })

  it('checks both the current and the destination month when the date moves', async () => {
    state.current = expenseRow
    state.input = { ...expenseInput, date: '2026-11-02' }
    await routes['expenses.patch'](event())
    expect(lock.assertMonthOpen.mock.calls.map((c) => [c[1], c[2]])).toEqual([[2026, 10], [2026, 11]])
  })

  it('refuses to move an expense into a closed month', async () => {
    state.current = { ...expenseRow, monthAssigned: 11 }
    state.input = expenseInput
    lock.assertMonthOpen.mockResolvedValueOnce(undefined).mockRejectedValueOnce(closed())
    await expect(routes['expenses.patch'](event())).rejects.toMatchObject({ statusCode: 409 })
    expect(db.calls.set).toHaveLength(0)
  })

  it('refuses to edit or delete a movement of a closed month', async () => {
    state.current = expenseRow
    state.input = expenseInput
    lock.assertMonthOpen.mockRejectedValue(closed())
    await expect(routes['expenses.patch'](event())).rejects.toMatchObject({ statusCode: 409 })
    await expect(routes['expenses.delete'](event())).rejects.toMatchObject({ statusCode: 409 })
    expect(db.calls.deleted).toBe(0)
  })

  it.each(['expenses', 'incomes', 'transfers', 'savings'])('answers 404 in French for a movement that no longer exists (%s)', async (kind) => {
    state.current = null
    state.input = expenseInput
    await expect(routes[`${kind}.delete`](event())).rejects.toMatchObject({ statusCode: 404, data: { message: "Ce mouvement n'existe plus." } })
    await expect(routes[`${kind}.patch`](event())).rejects.toMatchObject({ statusCode: 404 })
  })

  it('deletes an expense of an open month', async () => {
    state.current = expenseRow
    expect(await routes['expenses.delete'](event())).toEqual({ id: 'm1' })
    expect(db.calls.deleted).toBe(1)
  })

  it('re-applies the salary expectation when an income changes type', async () => {
    state.current = { id: 'm1', yearAssigned: 2026, monthAssigned: 10 }
    state.input = { incomeTypeId: 'salary', label: 'Paie', amount: 2150, dateReceived: '2026-10-01', monthAssigned: 10, yearAssigned: 2026 }
    state.expectation = '2100.00'
    await routes['incomes.patch'](event())
    expect(db.calls.set[0]).toMatchObject({ incomeTypeId: 'salary', expectedAmount: '2100.00' })
  })

  it('clears the expectation when an income moves to a non-salary type', async () => {
    state.current = { id: 'm1', yearAssigned: 2026, monthAssigned: 10, expectedAmount: '2100.00' }
    state.input = { incomeTypeId: 'gift', label: 'Cadeau', amount: 50, dateReceived: '2026-10-01', monthAssigned: 10, yearAssigned: 2026 }
    await routes['incomes.patch'](event())
    expect(db.calls.set[0]).toMatchObject({ expectedAmount: null })
  })

  it('edits a transfer without moving it to another month', async () => {
    state.current = { id: 'm1', yearAssigned: 2026, monthAssigned: 10 }
    state.input = { fromEnvelopeId: 'a', toEnvelopeId: 'b', amount: 15, reason: 'Resto' }
    await routes['transfers.patch'](event())
    expect(db.calls.set[0]).toEqual({ fromEnvelopeId: 'a', toEnvelopeId: 'b', amount: '15', reason: 'Resto' })
    expect(lock.assertMonthOpen).toHaveBeenCalledTimes(1)
  })

  it('edits a manual savings versement, month from its date', async () => {
    state.current = { id: 'm1', year: 2026, month: 10, source: 'manual' }
    state.input = { savingsGoalId: 'g1', date: '2026-10-20', amount: 60 }
    await routes['savings.patch'](event())
    expect(db.calls.set[0]).toMatchObject({ savingsGoalId: 'g1', date: '2026-10-20', year: 2026, month: 10, amount: '60' })
  })

  it('never edits or deletes a closure versement', async () => {
    state.current = { id: 'm1', year: 2026, month: 10, source: 'closure' }
    state.input = { savingsGoalId: 'g1', date: '2026-10-20', amount: 60 }
    await expect(routes['savings.patch'](event())).rejects.toMatchObject({ statusCode: 409, data: { message: 'Versement de clôture — non modifiable.' } })
    await expect(routes['savings.delete'](event())).rejects.toMatchObject({ statusCode: 409 })
    expect(db.calls.deleted).toBe(0)
  })
})
