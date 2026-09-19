import { asc, eq, isNull } from 'drizzle-orm'
import { createError } from 'h3'
import { db } from './db'

export async function listActiveRows(table: any) {
  return db.select().from(table).where(isNull(table.archivedAt)).orderBy(asc(table.sortOrder))
}

export async function insertRow(table: any, values: Record<string, unknown>) {
  const [row] = await db.insert(table).values(values).returning()
  return row
}

export async function patchRow(table: any, id: string, values: Record<string, unknown>) {
  const [row] = await db.update(table).set(values).where(eq(table.id, id)).returning()

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  return row
}
