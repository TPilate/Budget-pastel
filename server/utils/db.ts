import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../../drizzle/schema'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is not set')
}

// idle_timeout/max_lifetime are required against Supabase's transaction-mode pooler:
// without them, connections are held open forever once opened (postgres.js's default
// is to never expire idle connections) and are never returned to the pooler's limited
// connection slots. Every dev-server reload or serverless cold start then leaks one
// more connection; once the pooler's slots are exhausted, new connection attempts hang
// indefinitely instead of erroring, which is what was causing DB-backed routes to hang.
const queryClient = postgres(connectionString, { prepare: false, max: 5, idle_timeout: 20, max_lifetime: 60 * 30 })

export const db = drizzle(queryClient, { schema })
