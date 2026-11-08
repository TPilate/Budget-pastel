import { createError } from 'h3'

/**
 * A user-facing error. h3 strips non-ASCII characters from statusMessage (it is an HTTP
 * header), so the French sentence travels in `message` and `data.message`, which reach the
 * client intact as FetchError.data.
 */
export function userError(statusCode: number, statusMessage: string, message: string) {
  return createError({ statusCode, statusMessage, message, data: { message } })
}

// Same Intl options as formatEuro in app/utils/currency.ts, for messages built on the server.
const EURO_FORMAT = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatEuroServer(value: number) {
  return `${EURO_FORMAT.format(value)} €`
}
