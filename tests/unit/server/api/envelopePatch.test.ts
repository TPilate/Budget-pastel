import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

const state = vi.hoisted(() => ({ input: null as any }))
vi.mock('../../../../server/utils/auth', () => ({ requireUser: vi.fn(async () => ({ id: 'u1', email: null })) }))
vi.mock('../../../../server/utils/validateBody', () => ({ validateBody: vi.fn(async () => state.input) }))
vi.mock('../../../../server/utils/referenceCrud', () => ({ patchRow: vi.fn(async () => ({ id: 'env-1' })) }))

const db = vi.hoisted(() => {
  const chain: any = {}
  chain.update = vi.fn(() => chain)
  chain.set = vi.fn(() => chain)
  chain.where = vi.fn(() => Promise.resolve([]))
  chain.select = vi.fn(() => chain)
  chain.from = vi.fn(() => chain)
  return chain
})
vi.mock('../../../../server/utils/db', () => ({ db, withDbTimeout: <T>(p: Promise<T>) => p }))

let patchEnvelope: (event: any) => Promise<any>
beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (handler: any) => handler
  ;(globalThis as any).getRouterParam = () => 'env-1'
  patchEnvelope = (await import('../../../../server/api/envelopes/[id].patch.ts')).default as any
})

describe('PATCH /api/envelopes/[id]', () => {
  beforeEach(() => {
    db.update.mockClear()
    db.set.mockClear()
    db.where.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('carries a new default ceiling into the allocations of every month that is not closed', async () => {
    // A closure writes next month's allocation with a base_ceiling snapshot. Without
    // this, editing the ceiling during that month would silently change nothing.
    state.input = { defaultCeiling: 120 }
    await patchEnvelope({ context: {} })
    expect(db.update).toHaveBeenCalledTimes(1)
    expect(db.set).toHaveBeenCalledWith({ baseCeiling: '120' })
  })

  it('touches no allocation when the ceiling is not part of the edit', async () => {
    state.input = { name: 'Sorties' }
    await patchEnvelope({ context: {} })
    expect(db.update).not.toHaveBeenCalled()
  })

  it('leaves every month before the current Paris month alone, closed or not', async () => {
    // A finished month that is not closed yet is about to be closed: its report must use
    // the ceiling the household lived with, not one edited afterwards. 23:30 UTC on
    // 31 October is already 1 November in Paris.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-31T23:30:00Z'))
    state.input = { defaultCeiling: 120 }
    await patchEnvelope({ context: {} })

    // The outer update's condition is the last where() call (the closure subquery is built first).
    const condition = db.where.mock.calls.at(-1)![0]
    const { sql, params } = new PgDialect().sqlToQuery(condition)
    // Inline each $n placeholder with its value so the bound reads as plain SQL.
    const rendered = sql.replace(/\$(\d+)/g, (_, n) => String(params[Number(n) - 1]))
    const year = '"monthly_envelope_allocations"."year"'
    const month = '"monthly_envelope_allocations"."month"'
    expect(rendered).toContain(`(${year} > 2026 or (${year} = 2026 and ${month} >= 11))`)
    expect(rendered).toContain('not exists')
  })
})
