import { createError } from 'h3'

/**
 * A user-facing error. h3 strips non-ASCII characters from statusMessage (it is an HTTP
 * header), so the French sentence travels in `message` and `data.message`, which reach the
 * client intact as FetchError.data.
 */
export function userError(statusCode: number, statusMessage: string, message: string) {
  return createError({ statusCode, statusMessage, message, data: { message } })
}
