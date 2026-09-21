import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../../drizzle/schema'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is not set')
}

// max: 5 lets the app's Promise.all-batched queries run in real parallel instead of
// serializing on one connection. idle_timeout/max_lifetime return connections to
// Supabase's pooler instead of holding them forever (postgres.js's default). connect_timeout
// bounds a hung connection ATTEMPT; statement_timeout is enforced by Postgres itself and
// bounds a query that hangs after the connection is already open — without it, a stuck
// query silently leaks its connection out of the pool instead of ever being released.
const queryClient = postgres(connectionString, {
  prepare: false,
  max: 5,
  idle_timeout: 20,
  max_lifetime: 60 * 30,
  connect_timeout: 10,
  connection: { statement_timeout: 10000 },
})

export const db = drizzle(queryClient, { schema })
