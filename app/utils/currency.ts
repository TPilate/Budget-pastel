// Intl.NumberFormat is used instead of toFixed().replace() because the
// hand-rolled version never inserted the French thousands separator
// (e.g. "7524,00 €" instead of "7 524,00 €").
const EURO_FORMAT = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const EURO_SHORT_FORMAT = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
// For plain (non-euro) figures, such as "9,8 mois de charges couverts": still a French
// decimal comma, not the "." Number.prototype.toString would print.
const NUMBER_FORMAT = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

export function formatEuro(value: number) {
  return `${EURO_FORMAT.format(value)} €`
}

export function formatEuroShort(value: number) {
  return `${EURO_SHORT_FORMAT.format(value)} €`
}

export function formatNumber(value: number) {
  return NUMBER_FORMAT.format(value)
}
