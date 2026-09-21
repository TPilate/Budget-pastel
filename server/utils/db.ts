import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../../drizzle/schema'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is not set')
}

// max: 5 — the app's query functions issue several queries per request via Promise.all
// (batched, not per-row: see envelopeCeilingsQuery.ts). With max:1 every one of those
// "concurrent" queries actually serializes onto a single connection, and against a
// database in a different region than the serverless function (real cross-region
// round-trip latency, not just local overhead) that serialization dominates total
// request time. A small pool lets them run genuinely in parallel; connect_timeout below
// bounds the extra per-connection setup cost this adds on a cold start.
// idle_timeout/max_lifetime bound how long a connection is held once opened: without them
// (postgres.js's default is to never expire idle connections), connections are never
// returned to Supabase's pooler, and once its connection slots are exhausted, new
// connection attempts hang indefinitely instead of erroring.
// connect_timeout bounds how long a connection ATTEMPT can hang before failing loudly.
// Without it, a network-level drop (e.g. a firewalled/non-allowlisted IP silently
// discarding the TCP handshake, as opposed to refusing it) hangs until some outer
// platform ceiling gives up — on Vercel that surfaced as a 5-minute FUNCTION_INVOCATION_TIMEOUT
// with no error at all. 10s means a real outage now fails fast with a clear error instead.
const queryClient = postgres(connectionString, { prepare: false, max: 5, idle_timeout: 20, max_lifetime: 60 * 30, connect_timeout: 10 })

export const db = drizzle(queryClient, { schema })
