import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

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
})
