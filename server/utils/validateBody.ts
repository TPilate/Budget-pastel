import { createError, readBody } from 'h3'
import type { H3Event } from 'h3'
import type { ZodType } from 'zod'

export async function validateBody<T>(event: H3Event, schema: ZodType<T>): Promise<T> {
  const body = await readBody(event)
  const result = schema.safeParse(body)

  if (!result.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: result.error.flatten() })
  }

  return result.data
}
