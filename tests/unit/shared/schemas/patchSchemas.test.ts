import { describe, it, expect } from 'vitest'
import { categoryPatchSchema } from '../../../../shared/schemas/category'
import { envelopePatchSchema } from '../../../../shared/schemas/envelope'
import { incomeTypePatchSchema } from '../../../../shared/schemas/incomeType'
import { accountPatchSchema } from '../../../../shared/schemas/account'

describe('reference patch schemas coerce archivedAt to a Date', () => {
  const isoString = '2026-09-20T12:00:00.000Z'

  it('categoryPatchSchema', () => {
    const result = categoryPatchSchema.parse({ archivedAt: isoString })
    expect(result.archivedAt).toBeInstanceOf(Date)
  })

  it('envelopePatchSchema', () => {
    const result = envelopePatchSchema.parse({ archivedAt: isoString })
    expect(result.archivedAt).toBeInstanceOf(Date)
  })

  it('incomeTypePatchSchema', () => {
    const result = incomeTypePatchSchema.parse({ archivedAt: isoString })
    expect(result.archivedAt).toBeInstanceOf(Date)
  })

  it('accountPatchSchema coerces balance and omits it when absent', () => {
    expect(accountPatchSchema.parse({ balance: '1234,5'.replace(',', '.') }).balance).toBe(1234.5)
    expect(accountPatchSchema.parse({ name: 'X' })).not.toHaveProperty('balance')
  })

  it('accountPatchSchema', () => {
    const result = accountPatchSchema.parse({ archivedAt: isoString })
    expect(result.archivedAt).toBeInstanceOf(Date)
  })
})

describe('incomeTypePatchSchema salary fields', () => {
  it('accepts the flag and a text amount from the Paramètres input', () => {
    expect(incomeTypePatchSchema.parse({ isSalary: true, expectedAmount: '2100.5' })).toEqual({ isSalary: true, expectedAmount: 2100.5 })
  })
  it('keeps null as null rather than coercing it to 0', () => {
    expect(incomeTypePatchSchema.parse({ expectedAmount: null })).toEqual({ expectedAmount: null })
  })
})
