import { describe, it, expect } from 'vitest'
import { useAmountInput } from '../../../app/composables/useAmountInput'

describe('useAmountInput', () => {
  it('starts at zero', () => {
    const { displayValue, amount } = useAmountInput()
    expect(displayValue.value).toBe('0')
    expect(amount.value).toBe(0)
  })

  it('replaces the leading zero on the first digit', () => {
    const { pressDigit, displayValue } = useAmountInput()
    pressDigit('6')
    expect(displayValue.value).toBe('6')
  })

  it('appends digits to the integer part', () => {
    const { pressDigit, displayValue } = useAmountInput()
    pressDigit('6')
    pressDigit('2')
    expect(displayValue.value).toBe('62')
  })

  it('inserts a comma and appends decimal digits', () => {
    const { pressDigit, pressComma, displayValue, amount } = useAmountInput()
    pressDigit('6')
    pressDigit('2')
    pressComma()
    pressDigit('4')
    pressDigit('0')
    expect(displayValue.value).toBe('62,40')
    expect(amount.value).toBe(62.4)
  })

  it('ignores a second comma', () => {
    const { pressDigit, pressComma, displayValue } = useAmountInput()
    pressDigit('5')
    pressComma()
    pressComma()
    pressDigit('5')
    expect(displayValue.value).toBe('5,5')
  })

  it('ignores digits beyond two decimal places', () => {
    const { pressDigit, pressComma, displayValue } = useAmountInput()
    pressDigit('1')
    pressComma()
    pressDigit('2')
    pressDigit('3')
    pressDigit('4')
    expect(displayValue.value).toBe('1,23')
  })

  it('backspace removes the last character', () => {
    const { pressDigit, pressComma, backspace, displayValue } = useAmountInput()
    pressDigit('6')
    pressDigit('2')
    pressComma()
    pressDigit('4')
    backspace()
    expect(displayValue.value).toBe('62,')
    backspace()
    expect(displayValue.value).toBe('62')
  })

  it('backspace on a single digit resets to zero', () => {
    const { pressDigit, backspace, displayValue } = useAmountInput()
    pressDigit('7')
    backspace()
    expect(displayValue.value).toBe('0')
  })

  it('ignores non-digit input passed to pressDigit', () => {
    const { pressDigit, displayValue } = useAmountInput()
    pressDigit('a')
    expect(displayValue.value).toBe('0')
  })

  it('reset returns to zero', () => {
    const { pressDigit, reset, displayValue } = useAmountInput()
    pressDigit('9')
    reset()
    expect(displayValue.value).toBe('0')
  })
})
