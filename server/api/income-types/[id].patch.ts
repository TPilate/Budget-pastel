import { createError, getRouterParam } from 'h3'
import { requireUser } from '../../utils/auth'
import { patchRow } from '../../utils/referenceCrud'
import { validateBody } from '../../utils/validateBody'
import { backfillSalaryExpectation } from '../../utils/salaryExpectation'
import { incomeTypes } from '../../../drizzle/schema'
import { incomeTypePatchSchema } from '../../../shared/schemas/incomeType'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }

  const input = await validateBody(event, incomeTypePatchSchema)
  const row = await patchRow(incomeTypes, id, input)

  // Entries already saved in open months follow the type, so flagging the salary type
  // fixes the current month's dashboard straight away.
  if (input.isSalary !== undefined || input.expectedAmount !== undefined) {
    await backfillSalaryExpectation(event, id, row.isSalary ? row.expectedAmount : null)
  }

  return row
})
