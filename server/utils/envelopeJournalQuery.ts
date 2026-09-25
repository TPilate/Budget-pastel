import { and, eq, or } from 'drizzle-orm'
import { db } from './db'
import { expenseEntries, incomeEntries, transfers, categories, accounts, envelopes } from '../../drizzle/schema'
import { buildMovementsFeed } from './domain/movementsFeed'
import type { Movement } from './domain/movementsFeed'

export async function fetchEnvelopeJournal(envelopeId: string, year: number, month: number): Promise<Movement[]> {
  const [expenseRows, incomeRows, transferRows, categoryRows, accountRows, envelopeRows] = await Promise.all([
    db
      .select()
      .from(expenseEntries)
      .where(and(
        eq(expenseEntries.envelopeId, envelopeId),
        eq(expenseEntries.yearAssigned, year),
        eq(expenseEntries.monthAssigned, month),
      )),
    db
      .select()
      .from(incomeEntries)
      .where(and(
        eq(incomeEntries.targetEnvelopeId, envelopeId),
        eq(incomeEntries.yearAssigned, year),
        eq(incomeEntries.monthAssigned, month),
      )),
    db
      .select()
      .from(transfers)
      .where(and(
        or(eq(transfers.fromEnvelopeId, envelopeId), eq(transfers.toEnvelopeId, envelopeId)),
        eq(transfers.yearAssigned, year),
        eq(transfers.monthAssigned, month),
      )),
    db.select().from(categories),
    db.select().from(accounts),
    db.select().from(envelopes),
  ])

  const categoryById = new Map(categoryRows.map((row) => [row.id, row]))
  const accountById = new Map(accountRows.map((row) => [row.id, row]))
  const envelopeById = new Map(envelopeRows.map((row) => [row.id, row]))

  const expenses = expenseRows.map((row) => {
    const category = categoryById.get(row.categoryId)!
    const envelope = row.envelopeId ? envelopeById.get(row.envelopeId) : undefined
    const account = row.accountId ? accountById.get(row.accountId) : undefined
    return {
      id: row.id,
      date: row.date,
      label: row.label,
      amount: Number(row.amount),
      financedBy: row.financedBy,
      envelopeName: envelope?.name ?? null,
      envelopeEmoji: envelope?.emoji ?? null,
      categoryName: category.name,
      categoryEmoji: category.emoji,
      categoryIsFixed: category.isFixed,
      accountName: account?.name ?? null,
    }
  })

  const incomes = incomeRows.map((row) => {
    const envelope = row.targetEnvelopeId ? envelopeById.get(row.targetEnvelopeId) : undefined
    return {
      id: row.id,
      date: row.dateReceived,
      label: row.label,
      amount: Number(row.amount),
      envelopeName: envelope?.name ?? null,
      envelopeEmoji: envelope?.emoji ?? null,
    }
  })

  const transferMovements = transferRows.map((row) => ({
    id: row.id,
    date: row.date,
    reason: row.reason,
    amount: Number(row.amount),
    fromEnvelopeName: envelopeById.get(row.fromEnvelopeId)?.name ?? '?',
    toEnvelopeName: envelopeById.get(row.toEnvelopeId)?.name ?? '?',
  }))

  return buildMovementsFeed({ expenses, incomes, transfers: transferMovements })
}
