import { and, eq, notExists } from 'drizzle-orm'
import { requireUser } from '../../utils/auth'
import { patchRow } from '../../utils/referenceCrud'
import { validateBody } from '../../utils/validateBody'
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
  // the default ceiling alone no longer reaches that month. Every month that is not
  // closed follows the new default; closed months keep the figure their report used.
  if (input.defaultCeiling !== undefined && input.defaultCeiling !== null) {
    await withDbTimeout(db
      .update(monthlyEnvelopeAllocations)
      .set({ baseCeiling: String(input.defaultCeiling) })
      .where(and(
        eq(monthlyEnvelopeAllocations.envelopeId, id),
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
