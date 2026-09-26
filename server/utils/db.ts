import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { createError } from 'h3'
import * as schema from '../../drizzle/schema'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is not set')
}

// max must stay ABOVE the highest number of queries any single request fires in parallel,
// or that request is forced onto postgres.js's pool-wait queue. fetchMovements alone fires 6
// (see server/utils/movementsQuery.ts), so max:5 meant /api/movements *always* queued one
// query even when healthy — and postgres.js's queue has no timeout (src/index.js `handler`:
// with no free/closed/busy connection it does `queries.push(query)` and the promise simply
// never settles). One leaked connection was therefore enough to hang that route forever.
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
