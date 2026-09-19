import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../../drizzle/schema'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is not set')
}

const queryClient = postgres(connectionString, { prepare: false, max: 1 })

export const db = drizzle(queryClient, { schema })
