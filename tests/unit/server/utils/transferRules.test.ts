import { describe, it, expect, vi } from 'vitest'

const libre = vi.hoisted(() => ({ value: 0 }))
vi.mock('../../../../server/utils/budgetLibreQuery', () => ({ fetchBudgetLibre: vi.fn(async () => libre.value) }))
vi.mock('../../../../server/utils/supabase', () => ({ createSupabaseServerClient: vi.fn() }))

import { assertWithinBudgetLibre } from '../../../../server/utils/transferRules'

const input = { from: { kind: 'budget' }, to: { kind: 'account', accountId: '33333333-3333-3333-3333-333333333333' }, amount: 10, reason: 'x', date: '2026-10-12' } as any

describe('assertWithinBudgetLibre', () => {
  it('never shows a negative amount as available', async () => {
    libre.value = -5
    await expect(assertWithinBudgetLibre({} as any, input)).rejects.toMatchObject({ message: expect.stringMatching(/n'a que 0,00\s€ de disponible/) })
  })
  it('accepts an amount within the libre', async () => {
    libre.value = 10
    await expect(assertWithinBudgetLibre({} as any, input)).resolves.toBeUndefined()
  })
})
