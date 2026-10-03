import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { savingsEntries } from '../../../../drizzle/schema'

// Mirrors the mocking pattern established in tests/unit/server/utils/referenceCrud.test.ts:
// `eq`/`and` are replaced with plain descriptor objects so the fake `db` below can evaluate
// the actual `where` conditions the endpoint builds, instead of assuming a fixed shape.
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: any, val: any) => ({ type: 'eq', col, val })),
  and: vi.fn((...args: any[]) => ({ type: 'and', args })),
}))

vi.mock('../../../../server/utils/auth', () => ({
  requireUser: vi.fn(async () => ({ id: 'user-1', email: 'user@example.com' })),
}))

// The endpoint reads its validated input via `validateBody`, which itself reads the raw
// h3 event body. Rather than simulating an HTTP body stream, the input each test wants is
// injected here directly - this keeps the test focused on the POST handler's own
// read-then-write logic, which is what this file exists to cover.
const inputState = vi.hoisted(() => ({ current: null as any }))
vi.mock('../../../../server/utils/validateBody', () => ({
  validateBody: vi.fn(async () => inputState.current),
}))

// `vi.mock` factories are hoisted above regular top-level statements (see the comment in
// referenceCrud.test.ts), so the fake `db` and its backing row store are built inside
// `vi.hoisted` together. The `where` conditions are evaluated against real
// `savingsEntries` column references so a bug that drops a clause (e.g. `month`) from the
// endpoint's `where` actually changes which fake rows match, instead of the mock silently
// assuming the endpoint is correct.
const testDb = vi.hoisted(() => {
  const store = { rows: [] as any[], idCounter: 0 }

  function fieldFor(col: any): string {
    // `savingsEntries` is the real, un-mocked table import from the top of this file.
    // This closure is only ever invoked once the endpoint under test calls `db`, by
    // which point module linking has long completed, so the import is safe to use here
    // despite `vi.hoisted` callbacks running ahead of the rest of this file's top-level code.
    if (col === savingsEntries.savingsGoalId) return 'savingsGoalId'
    if (col === savingsEntries.year) return 'year'
    if (col === savingsEntries.month) return 'month'
    if (col === savingsEntries.id) return 'id'
    throw new Error('Unrecognized column in fake db matcher')
  }

  function matchesCondition(row: any, condition: any): boolean {
    if (condition.type === 'and') return condition.args.every((c: any) => matchesCondition(row, c))
    if (condition.type === 'eq') return row[fieldFor(condition.col)] === condition.val
    throw new Error(`Unsupported condition type: ${condition.type}`)
  }

  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn((condition: any) => Promise.resolve(store.rows.filter((r) => matchesCondition(r, condition)))),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((values: any) => ({
        returning: vi.fn(() => {
          const row = { id: `row-${++store.idCounter}`, ...values }
          store.rows.push(row)
          return Promise.resolve([row])
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: any) => ({
        where: vi.fn((condition: any) => ({
          returning: vi.fn(() => {
            const row = store.rows.find((r) => matchesCondition(r, condition))
            if (row) Object.assign(row, values)
            return Promise.resolve(row ? [row] : [])
          }),
        })),
      })),
    })),
  }

  return { store, db }
})

vi.mock('../../../../server/utils/db', () => ({ db: testDb.db }))

// `defineEventHandler` is normally supplied by Nitro's auto-import; under plain vitest
// (no Nuxt/Nitro runtime) it does not exist, so it is shimmed as an identity function
// before the endpoint module is loaded. The endpoint is imported dynamically, after this
// shim is in place, since a static import would be evaluated before this file's own
// top-level code runs.
let postSavings: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (handler: any) => handler
  const mod = await import('../../../../server/api/savings/index.post.ts')
  postSavings = mod.default as any
})

function fakeEvent() {
  return { context: {} } as any
}

describe('POST /api/savings', () => {
  beforeEach(() => {
    testDb.store.rows.length = 0
    testDb.store.idCounter = 0
    inputState.current = null
  })

  it('inserts a row on a first submission, with amount written as a string', async () => {
    inputState.current = { savingsGoalId: 'g1', year: 2026, month: 9, amount: 150 }

    const row = await postSavings(fakeEvent())

    expect(testDb.store.rows).toHaveLength(1)
    expect(row).toMatchObject({ savingsGoalId: 'g1', year: 2026, month: 9, amount: '150' })
    expect(typeof row.amount).toBe('string')
  })

  it('updates the existing row on a second submission for the same goal+year+month, instead of inserting a second one', async () => {
    inputState.current = { savingsGoalId: 'g1', year: 2026, month: 9, amount: 150 }
    const first = await postSavings(fakeEvent())

    inputState.current = { savingsGoalId: 'g1', year: 2026, month: 9, amount: 216 }
    const second = await postSavings(fakeEvent())

    expect(testDb.store.rows).toHaveLength(1)
    expect(second.id).toBe(first.id)
    expect(second.amount).toBe('216')
    expect(testDb.store.rows[0].amount).toBe('216')
  })

  it('inserts a separate row for the same goal in a different month, and does not touch the first', async () => {
    inputState.current = { savingsGoalId: 'g1', year: 2026, month: 8, amount: 100 }
    const august = await postSavings(fakeEvent())

    inputState.current = { savingsGoalId: 'g1', year: 2026, month: 9, amount: 150 }
    const september = await postSavings(fakeEvent())

    expect(testDb.store.rows).toHaveLength(2)
    expect(september.id).not.toBe(august.id)

    const augustRow = testDb.store.rows.find((r) => r.id === august.id)
    expect(augustRow).toMatchObject({ month: 8, amount: '100' })
  })
})
