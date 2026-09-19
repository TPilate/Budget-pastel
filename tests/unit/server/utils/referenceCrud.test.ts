import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('drizzle-orm', () => ({
  isNull: vi.fn((col) => ({ type: 'isNull', col })),
  eq: vi.fn((col, val) => ({ type: 'eq', col, val })),
  asc: vi.fn((col) => ({ type: 'asc', col })),
  and: vi.fn((...args) => ({ type: 'and', args })),
}))

// `vi.mock` factories are hoisted above regular top-level statements, so a
// plain `const chain = {}` declared here would not be initialized yet when
// the `db` mock factory below runs. `vi.hoisted` ensures `chain` is set up
// as part of that same hoisting pass.
const chain: any = vi.hoisted(() => {
  const c: any = {}
  c.select = vi.fn(() => c)
  c.from = vi.fn(() => c)
  c.where = vi.fn(() => c)
  c.orderBy = vi.fn(() => Promise.resolve([{ id: '1' }]))
  c.insert = vi.fn(() => c)
  c.values = vi.fn(() => c)
  c.update = vi.fn(() => c)
  c.set = vi.fn(() => c)
  c.returning = vi.fn(() => Promise.resolve([{ id: '2' }]))
  return c
})

vi.mock('../../../../server/utils/db', () => ({ db: chain }))

import { listActiveRows, insertRow, patchRow } from '../../../../server/utils/referenceCrud'

const fakeTable = { archivedAt: 'archivedAt', sortOrder: 'sortOrder', id: 'id' } as any

describe('referenceCrud', () => {
  beforeEach(() => {
    chain.returning.mockResolvedValue([{ id: '2' }])
  })

  it('listActiveRows returns the active rows', async () => {
    const rows = await listActiveRows(fakeTable)
    expect(rows).toEqual([{ id: '1' }])
  })

  it('insertRow returns the inserted row', async () => {
    const row = await insertRow(fakeTable, { name: 'Test' })
    expect(row).toEqual({ id: '2' })
  })

  it('patchRow returns the updated row', async () => {
    const row = await patchRow(fakeTable, 'some-id', { name: 'Updated' })
    expect(row).toEqual({ id: '2' })
  })

  it('patchRow throws a 404 when no row matches', async () => {
    chain.returning.mockResolvedValueOnce([])
    await expect(patchRow(fakeTable, 'missing-id', {})).rejects.toMatchObject({ statusCode: 404 })
  })
})
