import { describe, it, expect } from 'vitest'
import { computeAccountBalance } from '../../../../../server/utils/domain/accountBalance'

const base = { referenceBalance: 1000, referenceSetAt: '2026-11-01T10:00:00Z' }

describe('computeAccountBalance', () => {
  it('adds transfers in and subtracts transfers out created after the reference', () => {
    const balance = computeAccountBalance({
      ...base,
      transfers: [
        { fromAccountId: 'other', toAccountId: 'a1', amount: 150, createdAt: '2026-11-02T10:00:00Z' },
        { fromAccountId: 'a1', toAccountId: 'other', amount: 40, createdAt: '2026-11-03T10:00:00Z' },
      ],
    }, 'a1')
    expect(balance).toBe(1110)
  })

  it('ignores transfers created before or exactly at the reference', () => {
    const balance = computeAccountBalance({
      ...base,
      transfers: [
        { fromAccountId: 'other', toAccountId: 'a1', amount: 500, createdAt: '2026-10-31T10:00:00Z' },
        { fromAccountId: 'other', toAccountId: 'a1', amount: 700, createdAt: '2026-11-01T10:00:00Z' },
      ],
    }, 'a1')
    expect(balance).toBe(1000)
  })

  it('ignores transfers of other accounts', () => {
    const balance = computeAccountBalance({
      ...base,
      transfers: [{ fromAccountId: 'x', toAccountId: 'y', amount: 300, createdAt: '2026-11-02T10:00:00Z' }],
    }, 'a1')
    expect(balance).toBe(1000)
  })
})
