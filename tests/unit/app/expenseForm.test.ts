import { describe, it, expect } from 'vitest'
import { expenseNeedsCategory } from '../../../app/utils/expenseForm'

describe('expenseNeedsCategory', () => {
  it('needs a category when no envelope is chosen', () => {
    expect(expenseNeedsCategory('', 'budget', true)).toBe(true)
  })
  it('does not when an envelope is chosen', () => {
    expect(expenseNeedsCategory('env-1', 'budget', true)).toBe(false)
  })
  it('does not for gift money, which always goes to the reserve envelope', () => {
    expect(expenseNeedsCategory('', 'gift_received', true)).toBe(false)
  })
  it('needs one for gift money when there is no reserve envelope to receive it', () => {
    expect(expenseNeedsCategory('', 'gift_received', false)).toBe(true)
  })
  it('needs one again once the envelope is set back to "Aucune"', () => {
    expect(expenseNeedsCategory('', 'gift_given', true)).toBe(true)
  })
})
