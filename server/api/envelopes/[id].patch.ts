import { and, eq, gt, gte, notExists, or } from 'drizzle-orm'
import { requireUser } from '../../utils/auth'
import { patchRow } from '../../utils/referenceCrud'
import { validateBody } from '../../utils/validateBody'
import { parisYearMonth } from '../../utils/domain/closure'
import { db, withDbTimeout } from '../../utils/db'
import { envelopes, monthlyEnvelopeAllocations, monthClosures } from '../../../drizzle/schema'
import { envelopePatchSchema } from '../../../shared/schemas/envelope'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }

  const input = await validateBody(event, envelopePatchSchema)
  const row = await patchRow(envelopes, id, input)

  // A month closure writes the next month's allocation with a base_ceiling snapshot, so
  // the default ceiling alone no longer reaches that month. The current Paris month and
  // later ones follow the new default, unless closed; earlier months keep the ceiling
  // they were lived with, closed or about to be closed.
  if (input.defaultCeiling !== undefined && input.defaultCeiling !== null) {
    const current = parisYearMonth(new Date())
    await withDbTimeout(db
      .update(monthlyEnvelopeAllocations)
      .set({ baseCeiling: String(input.defaultCeiling) })
      .where(and(
        eq(monthlyEnvelopeAllocations.envelopeId, id),
        or(
          gt(monthlyEnvelopeAllocations.year, current.year),
          and(eq(monthlyEnvelopeAllocations.year, current.year), gte(monthlyEnvelopeAllocations.month, current.month)),
        ),
        notExists(db
          .select()
          .from(monthClosures)
          .where(and(
            eq(monthClosures.year, monthlyEnvelopeAllocations.year),
            eq(monthClosures.month, monthlyEnvelopeAllocations.month),
            eq(monthClosures.status, 'closed'),
          ))),
      )))
  }

  return row
})
