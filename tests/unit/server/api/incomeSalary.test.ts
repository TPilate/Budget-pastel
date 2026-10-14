import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ input: null as any, expectation: null as string | null, patched: null as any }))
vi.mock('../../../../server/utils/auth', () => ({ requireUser: vi.fn(async () => ({ id: 'u1' })) }))
vi.mock('../../../../server/utils/validateBody', () => ({ validateBody: vi.fn(async () => state.input) }))
vi.mock('../../../../server/utils/monthLock', () => ({ assertMonthOpen: vi.fn() }))
const salary = vi.hoisted(() => ({
  salaryExpectationFor: vi.fn(async () => state.expectation),
  backfillSalaryExpectation: vi.fn(async () => {}),
}))
vi.mock('../../../../server/utils/salaryExpectation', () => salary)
vi.mock('../../../../server/utils/referenceCrud', () => ({
  patchRow: vi.fn(async (_t: any, id: string, values: any) => ({ id, isSalary: false, expectedAmount: null, ...state.patched, ...values })),
}))

const db = vi.hoisted(() => {
  const chain: any = {}
  chain.insert = vi.fn(() => chain)
  chain.values = vi.fn(() => chain)
  chain.returning = vi.fn(() => Promise.resolve([{ id: 'row' }]))
  return chain
})
vi.mock('../../../../server/utils/db', () => ({ db, withDbTimeout: <T>(p: Promise<T>) => p }))

let postIncome: (e: any) => Promise<any>
let patchIncomeType: (e: any) => Promise<any>
beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (h: any) => h
  postIncome = (await import('../../../../server/api/incomes/index.post.ts')).default as any
  patchIncomeType = (await import('../../../../server/api/income-types/[id].patch.ts')).default as any
})
const event = (id?: string) => ({ context: { params: id ? { id } : {} } }) as any

describe('salary on income entry', () => {
  beforeEach(() => {
    state.expectation = null
    state.patched = null
    db.values.mockClear()
    salary.backfillSalaryExpectation.mockClear()
  })

  it("copies the salary type's expected amount onto a new income", async () => {
    state.input = { incomeTypeId: 't1', label: 'Salaire', amount: 2150, dateReceived: '2026-10-01', monthAssigned: 10, yearAssigned: 2026 }
    state.expectation = '2100.00'
    await postIncome(event())
    expect(db.values).toHaveBeenCalledWith(expect.objectContaining({ expectedAmount: '2100.00', amount: '2150' }))
  })

  it('leaves expected_amount null for a non-salary type', async () => {
    state.input = { incomeTypeId: 't2', label: 'Vinted', amount: 20, dateReceived: '2026-10-01', monthAssigned: 10, yearAssigned: 2026 }
    await postIncome(event())
    expect(db.values).toHaveBeenCalledWith(expect.objectContaining({ expectedAmount: null }))
  })

  it('back-fills open months when the salary flag is switched on', async () => {
    state.input = { isSalary: true }
    state.patched = { expectedAmount: '2100.00' }
    await patchIncomeType(event('t1'))
    expect(salary.backfillSalaryExpectation).toHaveBeenCalledWith(expect.anything(), 't1', '2100.00')
  })

  it('back-fills null when the flag is switched off', async () => {
    state.input = { isSalary: false }
    state.patched = { expectedAmount: '2100.00' }
    await patchIncomeType(event('t1'))
    expect(salary.backfillSalaryExpectation).toHaveBeenCalledWith(expect.anything(), 't1', null)
  })

  it('does not touch entries on a rename', async () => {
    state.input = { name: 'Paie' }
    await patchIncomeType(event('t1'))
    expect(salary.backfillSalaryExpectation).not.toHaveBeenCalled()
  })
})
