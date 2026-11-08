import { describe, it, expect } from 'vitest'
import { summariseMonthTransfers, netSavings, budgetLibre } from '../../../../../server/utils/domain/transferFlows'
import type { TransferFlow } from '../../../../../server/utils/domain/transferFlows'
import { computeMonthSummary } from '../../../../../server/utils/domain/dashboard'

const kinds = new Map<string, 'courant' | 'epargne'>([['ldds', 'epargne'], ['cc', 'courant'], ['joint', 'courant']])

function flow(partial: Partial<TransferFlow> & Pick<TransferFlow, 'fromKind' | 'toKind' | 'amount'>): TransferFlow {
  return { fromAccountId: null, toAccountId: null, ...partial }
}

// Starting point of examples 1-4: income 2000, spending 1770 (fixed 1000 / envelope 770).
function summary(transfers: TransferFlow[]) {
  const t = summariseMonthTransfers(transfers, kinds)
  const result = computeMonthSummary({
    incomeReceived: 2000, fixed: 1000, envelope: 770, variable: 0, savings: 0, transfers: t, daysRemaining: 10,
  })
  return { t, result }
}

describe('summariseMonthTransfers and the §5.2 examples', () => {
  it('example 1: Budget → LDDS 150', () => {
    const { t, result } = summary([flow({ fromKind: 'budget', toKind: 'account', toAccountId: 'ldds', amount: 150 })])
    expect(result.unspent).toBe(80)
    expect(budgetLibre(result.unspent, [50, 30])).toBe(0)
    expect(netSavings(0, t)).toBe(150)
  })

  it('example 2: LDDS → Budget 100', () => {
    const { t, result } = summary([flow({ fromKind: 'account', fromAccountId: 'ldds', toKind: 'budget', amount: 100 })])
    expect(result.unspent).toBe(330)
    expect(budgetLibre(result.unspent, [50, 30])).toBe(250)
    expect(netSavings(0, t)).toBe(-100)
    for (const slice of result.slices.filter((s) => s.key !== 'unspent')) expect(slice.amount).toBeGreaterThanOrEqual(0)
  })

  it('example 3: LDDS → Voyage 300', () => {
    const { result } = summary([flow({ fromKind: 'account', fromAccountId: 'ldds', toKind: 'envelope', amount: 300 })])
    expect(result.unspent).toBe(530)
    expect(budgetLibre(result.unspent, [50, 30, 300])).toBe(150)
  })

  it('example 4: Restaurants → Budget 40', () => {
    const { t, result } = summary([flow({ fromKind: 'envelope', toKind: 'budget', amount: 40 })])
    expect(t).toEqual({ entering: 0, leaving: 0, toSavingsAccounts: 0, fromSavingsAccounts: 0, toOtherAccounts: 0 })
    expect(result.unspent).toBe(230)
    expect(budgetLibre(result.unspent, [10, 30])).toBe(190)
  })

  it('example 5: Compte courant → LDDS 500', () => {
    const { t, result } = summary([flow({ fromKind: 'account', fromAccountId: 'cc', toKind: 'account', toAccountId: 'ldds', amount: 500 })])
    expect(t).toEqual({ entering: 0, leaving: 0, toSavingsAccounts: 0, fromSavingsAccounts: 0, toOtherAccounts: 0 })
    expect(result.unspent).toBe(230)
    expect(netSavings(0, t)).toBe(0)
  })

  it('example 6: Budget → Compte joint 50', () => {
    const { t, result } = summary([flow({ fromKind: 'budget', toKind: 'account', toAccountId: 'joint', amount: 50 })])
    expect(result.unspent).toBe(180)
    expect(netSavings(0, t)).toBe(0)
    expect(result.slices.find((s) => s.key === 'accounts')?.amount).toBe(50)
  })

  it('slices add up to income + entering', () => {
    const cases: TransferFlow[][] = [
      [flow({ fromKind: 'budget', toKind: 'account', toAccountId: 'ldds', amount: 150 })],
      [flow({ fromKind: 'account', fromAccountId: 'ldds', toKind: 'budget', amount: 100 })],
      [flow({ fromKind: 'budget', toKind: 'account', toAccountId: 'joint', amount: 50 })],
    ]
    for (const transfers of cases) {
      const { t, result } = summary(transfers)
      expect(result.slices.reduce((sum, s) => sum + s.amount, 0)).toBe(2000 + t.entering)
    }
  })

  it('ignores an account whose kind is unknown when splitting savings from other accounts', () => {
    const t = summariseMonthTransfers([flow({ fromKind: 'budget', toKind: 'account', toAccountId: 'gone', amount: 20 })], kinds)
    expect(t.toSavingsAccounts).toBe(0)
    expect(t.toOtherAccounts).toBe(20)
  })
})
