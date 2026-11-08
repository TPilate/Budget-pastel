// Mouvements search: a query matches a movement when its label contains the query
// (case-insensitively), or when the query reads as an amount and the movement's
// absolute amount contains it in French notation ("12,5" for 12.5). The sign is ignored.
export function matchesMovementSearch(movement: { label: string, amount: number }, query: string): boolean {
  const text = query.trim().toLowerCase()
  if (!text) return true
  if (movement.label.toLowerCase().includes(text)) return true

  // Drop whitespace (including NBSP), the euro sign and a leading sign so "-1 234,50 €" reads as an amount.
  const amountQuery = query.replace(/[\s€]/g, '').replace(/^[-+]/, '').replace('.', ',')
  if (!/^\d+(,\d{0,2})?$/.test(amountQuery)) return false

  return Math.abs(movement.amount).toFixed(2).replace('.', ',').includes(amountQuery)
}
