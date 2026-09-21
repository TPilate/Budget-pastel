import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../../drizzle/schema'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is not set')
}

// max: 1 — this runs in a serverless function (Vercel): every cold invocation pays for
// each connection's TCP+TLS+auth handshake from scratch with no reuse benefit, so a
// bigger pool only adds startup latency. idle_timeout/max_lifetime bound how long a
// connection is held once opened: without them (postgres.js's default is to never expire
// idle connections), connections are never returned to Supabase's pooler, and once its
// connection slots are exhausted, new connection attempts hang indefinitely instead of
// erroring — this is what was causing DB-backed routes to hang.
// connect_timeout bounds how long a connection ATTEMPT can hang before failing loudly.
// Without it, a network-level drop (e.g. a firewalled/non-allowlisted IP silently
// discarding the TCP handshake, as opposed to refusing it) hangs until some outer
// platform ceiling gives up — on Vercel that surfaced as a 5-minute FUNCTION_INVOCATION_TIMEOUT
// with no error at all. 10s means a real outage now fails fast with a clear error instead.
const queryClient = postgres(connectionString, { prepare: false, max: 1, idle_timeout: 20, max_lifetime: 60 * 30, connect_timeout: 10 })

export const db = drizzle(queryClient, { schema })
