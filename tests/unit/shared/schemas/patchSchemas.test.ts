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

  it('accountPatchSchema', () => {
    const result = accountPatchSchema.parse({ archivedAt: isoString })
    expect(result.archivedAt).toBeInstanceOf(Date)
  })
})
