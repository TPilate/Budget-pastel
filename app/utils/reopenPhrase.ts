export function joinFrench(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} et ${items.at(-1)}`
}

/** `months` is the target followed by every later closed month; only the later ones are named. */
export function alsoReopenedPhrase(months: string[]): string | null {
  const later = months.slice(1)
  if (later.length === 0) return null
  return `${joinFrench(later)} ${later.length === 1 ? 'sera aussi rouvert' : 'seront aussi rouverts'}.`
}
