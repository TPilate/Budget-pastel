import { requireUser } from '../utils/auth'
import { listActiveRows } from '../utils/referenceCrud'
import { categories, accounts, envelopes, incomeTypes } from '../../drizzle/schema'

// One endpoint for everything the three entry forms need, instead of each form
// fetching its own lists. Every endpoint pays for its own requireUser() — which is a
// real HTTPS round-trip to Supabase's auth service — so four separate reference-data
// endpoints meant four auth round-trips per page render on top of the page's own.
// Collapsing them into one call removes three of those round-trips.
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const [categoryRows, accountRows, envelopeRows, incomeTypeRows] = await Promise.all([
    listActiveRows(categories),
    listActiveRows(accounts),
    listActiveRows(envelopes),
    listActiveRows(incomeTypes),
  ])

  return {
    categories: categoryRows,
    accounts: accountRows,
    envelopes: envelopeRows,
    incomeTypes: incomeTypeRows,
  }
})
