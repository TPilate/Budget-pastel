import { describe, it, expect, vi, beforeEach } from 'vitest'
import { incomeEntries, incomeTypes } from '../../../../drizzle/schema'

// Operators become descriptors so the fake db evaluates the real `where` the code builds.
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: any, val: any) => ({ type: 'eq', col, val })),
  gt: vi.fn((col: any, val: any) => ({ type: 'gt', col, val })),
  and: vi.fn((...args: any[]) => ({ type: 'and', args })),
  or: vi.fn((...args: any[]) => ({ type: 'or', args })),
}))

const lock = vi.hoisted(() => ({ latestClosed: null as { year: number, month: number } | null }))
vi.mock('../../../../server/utils/monthLock', () => ({
  fetchLatestClosedMonth: vi.fn(async () => lock.latestClosed),
}))

const fake = vi.hoisted(() => {
  const store = { types: [] as any[], entries: [] as any[] }
  function field(col: any): string {
    if (col === incomeTypes.id) return 'id'
    if (col === incomeEntries.incomeTypeId) return 'incomeTypeId'
    if (col === incomeEntries.yearAssigned) return 'yearAssigned'
    if (col === incomeEntries.monthAssigned) return 'monthAssigned'
    throw new Error('Unrecognized column')
  }
  function matches(row: any, c: any): boolean {
    if (c.type === 'and') return c.args.every((a: any) => matches(row, a))
    if (c.type === 'or') return c.args.some((a: any) => matches(row, a))
    if (c.type === 'eq') return row[field(c.col)] === c.val
    if (c.type === 'gt') return row[field(c.col)] > c.val
    throw new Error(`Unsupported ${c.type}`)
  }
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn((c: any) => Promise.resolve(store.types.filter((r) => matches(r, c)))),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: any) => ({
        where: vi.fn((c: any) => ({
          returning: vi.fn(() => {
            const hit = store.entries.filter((r) => matches(r, c))
            hit.forEach((r) => Object.assign(r, values))
            return Promise.resolve(hit.map((r) => ({ id: r.id })))
          }),
        })),
      })),
    })),
  }
  return { store, db }
})
vi.mock('../../../../server/utils/db', () => ({ db: fake.db, withDbTimeout: <T>(p: Promise<T>) => p }))

import { salaryExpectationFor, backfillSalaryExpectation } from '../../../../server/utils/salaryExpectation'

const event = { context: {} } as any

describe('salaryExpectationFor', () => {
  beforeEach(() => { fake.store.types = [] })

  it("returns the type's expected amount when it is a salary", async () => {
    fake.store.types = [{ id: 't1', isSalary: true, expectedAmount: '2100.00' }]
    expect(await salaryExpectationFor('t1')).toBe('2100.00')
  })

  it('returns null for a type that is not a salary, even with an amount set', async () => {
    fake.store.types = [{ id: 't1', isSalary: false, expectedAmount: '2100.00' }]
    expect(await salaryExpectationFor('t1')).toBeNull()
  })

  it('returns null for an unknown type', async () => {
    expect(await salaryExpectationFor('missing')).toBeNull()
  })
})

describe('backfillSalaryExpectation', () => {
  beforeEach(() => {
    lock.latestClosed = null
    fake.store.entries = [
      { id: 'aug', incomeTypeId: 't1', yearAssigned: 2026, monthAssigned: 8, expectedAmount: null },
      { id: 'sep', incomeTypeId: 't1', yearAssigned: 2026, monthAssigned: 9, expectedAmount: null },
      { id: 'oct', incomeTypeId: 't1', yearAssigned: 2026, monthAssigned: 10, expectedAmount: null },
      { id: 'other', incomeTypeId: 't2', yearAssigned: 2026, monthAssigned: 10, expectedAmount: null },
    ]
  })

  it('updates only open months of that type', async () => {
    lock.latestClosed = { year: 2026, month: 9 }
    await backfillSalaryExpectation(event, 't1', '2100.00')
    const byId = Object.fromEntries(fake.store.entries.map((r) => [r.id, r.expectedAmount]))
    expect(byId).toEqual({ aug: null, sep: null, oct: '2100.00', other: null })
  })

  it('updates every month of that type when nothing was ever closed', async () => {
    await backfillSalaryExpectation(event, 't1', '2100.00')
    expect(fake.store.entries.filter((r) => r.expectedAmount === '2100.00').map((r) => r.id)).toEqual(['aug', 'sep', 'oct'])
  })

  it('clears the expectation in open months when the type stops being a salary', async () => {
    fake.store.entries.forEach((r) => { r.expectedAmount = '2100.00' })
    lock.latestClosed = { year: 2026, month: 9 }
    await backfillSalaryExpectation(event, 't1', null)
    expect(fake.store.entries.find((r) => r.id === 'oct')!.expectedAmount).toBeNull()
    expect(fake.store.entries.find((r) => r.id === 'sep')!.expectedAmount).toBe('2100.00')
  })

  it('crosses year boundaries correctly', async () => {
    lock.latestClosed = { year: 2025, month: 12 }
    fake.store.entries = [
      { id: 'dec', incomeTypeId: 't1', yearAssigned: 2025, monthAssigned: 12, expectedAmount: null },
      { id: 'jan', incomeTypeId: 't1', yearAssigned: 2026, monthAssigned: 1, expectedAmount: null },
    ]
    await backfillSalaryExpectation(event, 't1', '1.00')
    expect(fake.store.entries.map((r) => r.expectedAmount)).toEqual([null, '1.00'])
  })
})
