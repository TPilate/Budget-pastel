import { asc, eq, isNull } from 'drizzle-orm'
import { createError } from 'h3'
import { db, withDbTimeout } from './db'

// Every pool-backed call here goes through withDbTimeout. postgres.js's pool-wait queue has
// no timeout of its own, so a request that cannot get one of the pool's 12 slots waits
// forever rather than failing: that is how /api/movements once hung a page indefinitely.
// connect_timeout and statement_timeout do not cover it — only this wrapper does. These are
// the write paths behind every create and edit form in the app, so an unbounded wait here
// surfaces as a save button that never resolves.

export async function listActiveRows(table: any) {
  return withDbTimeout(db.select().from(table).where(isNull(table.archivedAt)).orderBy(asc(table.sortOrder)))
}

export async function insertRow(table: any, values: Record<string, unknown>) {
  const [row] = await withDbTimeout(db.insert(table).values(values).returning())
  return row
}

export async function patchRow(table: any, id: string, values: Record<string, unknown>) {
  const [row] = await withDbTimeout(db.update(table).set(values).where(eq(table.id, id)).returning())

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  return row
}
