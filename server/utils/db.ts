import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { createError } from 'h3'
import * as schema from '../../drizzle/schema'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is not set')
}

// max must stay ABOVE the highest number of queries any single request fires in parallel,
// or that request is forced onto postgres.js's pool-wait queue — which has no timeout
// (src/index.js `handler`: with no free/closed/busy connection it does `queries.push(query)`
// and the promise simply never settles), so one leaked connection can hang a route forever.
//
// The worst offender used to be fetchMovements at 6 parallel queries, which is why max:5
// made /api/movements queue even when healthy. That module now reads through the Supabase
// Data API and no longer uses this pool at all.
//
// The two heaviest consumers now are /api/dashboard (server/utils/dashboardQuery.ts) and
// /api/accounts/overview (server/utils/accountsOverviewQuery.ts): both serialise
// listBudgetEnvelopeLedgers (5 queries) and listReserveEnvelopeBalances (3 queries) one
// after the other instead of running them concurrently, so each holds at most 5 pool
// slots at a time, not 8. On top of that, AppSidebar's SidebarCeilingsWidget calls
// /api/envelopes/ceilings on every page render, adding up to 5 more concurrent slots.
// max:12 covers one of those 5-slot requests plus one sidebar widget request with a
// little room, not much more — it is not a generous margin. A second concurrent request
// to either heavy route (e.g. two tabs, the post-save refresh() in index.vue, or landing
// on /comptes and /  at once) can still push close to the ceiling.
//
// idle_timeout/max_lifetime bound how long a connection is held. max_lifetime is deliberately
// short: if a connection ever does get wedged, it caps how long it can poison the pool.
// connect_timeout bounds opening a connection; statement_timeout (enforced by Postgres) bounds
// running a query. Neither covers waiting for a pool slot — withDbTimeout below does that.
const queryClient = postgres(connectionString, {
  prepare: false,
  max: 12,
  idle_timeout: 20,
  max_lifetime: 60 * 5,
  connect_timeout: 10,
  connection: { statement_timeout: 10000 },
})

export const db = drizzle(queryClient, { schema })

/**
 * Bounds the one gap postgres.js leaves unguarded: waiting for a free pool slot.
 *
 * This does NOT cancel the underlying query — a timed-out query keeps its place in
 * postgres.js's queue. It exists so an exhausted pool surfaces as a fast, honest 503
 * instead of a request that hangs until the platform kills it minutes later.
 */
export function withDbTimeout<T>(promise: Promise<T>, ms = 12000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(
        () => reject(createError({ statusCode: 503, statusMessage: 'Database busy, please retry' })),
        ms,
      )
    }),
  ])
}
