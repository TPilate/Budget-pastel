import { eq } from 'drizzle-orm'
import { createError, getRouterParam } from 'h3'
import type { H3Event } from 'h3'
import { db, withDbTimeout } from './db'
import { assertMonthOpen } from './monthLock'
import { compareYearMonth } from './domain/closure'
import type { YearMonth } from './domain/closure'
import { userError } from './userError'

// Shared by the edit and delete handlers of every movement kind. Every call is pool-backed
// and therefore wrapped in withDbTimeout (see referenceCrud.ts for why).

export function requireId(event: H3Event): string {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  return id
}

export async function loadRowOr404<T>(table: any, id: string): Promise<T> {
  const [row] = await withDbTimeout(db.select().from(table).where(eq(table.id, id)))
  // A stale drawer (second tab, double click) can target a row that is already gone.
  if (!row) throw userError(404, 'Not found', "Ce mouvement n'existe plus.")
  return row as T
}

/** The month a movement leaves and, if different, the month it lands in must both be open. */
export async function assertMovable(event: H3Event, from: YearMonth, to: YearMonth = from): Promise<void> {
  await assertMonthOpen(event, from.year, from.month)
  if (compareYearMonth(from, to) !== 0) await assertMonthOpen(event, to.year, to.month)
}

export async function updateRow<T>(table: any, id: string, values: Record<string, unknown>): Promise<T> {
  const [row] = await withDbTimeout(db.update(table).set(values).where(eq(table.id, id)).returning())
  return row as T
}

export async function deleteRow(table: any, id: string): Promise<{ id: string }> {
  await withDbTimeout(db.delete(table).where(eq(table.id, id)))
  return { id }
}

export function assertNotClosureVersement(row: { source: string }): void {
  if (row.source === 'closure') {
    throw userError(409, 'Closure versement', 'Versement de clôture — non modifiable.')
  }
}
