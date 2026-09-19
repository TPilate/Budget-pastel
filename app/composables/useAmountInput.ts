import { ref, computed } from 'vue'

export function useAmountInput(initial = '0') {
  const buffer = ref(initial)

  const displayValue = computed(() => buffer.value)

  const amount = computed(() => Number(buffer.value.replace(',', '.')) || 0)

  function pressDigit(digit: string) {
    if (!/^[0-9]$/.test(digit)) return

    const [integerPart, decimalPart] = buffer.value.split(',')

    if (decimalPart !== undefined) {
      if (decimalPart.length >= 2) return
      buffer.value = `${integerPart},${decimalPart}${digit}`
      return
    }

    buffer.value = buffer.value === '0' ? digit : `${buffer.value}${digit}`
  }

  function pressComma() {
    if (buffer.value.includes(',')) return
    buffer.value = `${buffer.value},`
  }

  function backspace() {
    if (buffer.value.length <= 1) {
      buffer.value = '0'
      return
    }
    buffer.value = buffer.value.slice(0, -1)
  }

  function reset() {
    buffer.value = '0'
  }

  return { buffer, displayValue, amount, pressDigit, pressComma, backspace, reset }
}
