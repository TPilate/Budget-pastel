import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createTestDb } from './pglite'

let db: PGlite
beforeAll(async () => {
  db = await createTestDb()
}, 60000)
afterAll(async () => {
  await db.close()
})

describe('test database', () => {
  it('applies every migration', async () => {
    const result = await db.query<{ count: number }>('select count(*)::int as count from accounts')
    expect(result.rows[0].count).toBe(0)
  })
})

describe('close_month', () => {
  it('writes a closure transfer from the envelope to the account', async () => {
    const envelope = (await db.query<{ id: string }>(
      `insert into envelopes (name, emoji, kind, default_ceiling) values ('Restaurants', '🍽️', 'budget', 100) returning id`,
    )).rows[0].id
    const account = (await db.query<{ id: string }>(
      `insert into accounts (name, emoji, kind) values ('LDDS', '🏦', 'epargne') returning id`,
    )).rows[0].id
    await db.query(
      `insert into expense_entries (date, label, amount, envelope_id, financed_by, month_assigned, year_assigned)
       values ('2026-10-05', 'Resto', 50, $1, 'budget', 10, 2026)`,
      [envelope],
    )

    const payload = {
      year: 2026,
      month: 10,
      decisions: [{
        envelopeId: envelope, leftoverAmount: 50, destination: 'account',
        savingsGoalId: null, targetEnvelopeId: null, accountId: account,
      }],
      nextAllocations: [{ envelopeId: envelope, baseCeiling: 100, carriedOverAmount: 0, overspendDeduction: 0 }],
      freezeAllocations: [{ envelopeId: envelope, baseCeiling: 100 }],
      savingsEntries: [],
      accountTransfers: [{ envelopeId: envelope, accountId: account, amount: 50 }],
      snapshot: { version: 1 },
    }
    await db.query('select close_month($1::jsonb)', [JSON.stringify(payload)])

    const transfers = (await db.query<any>(
      `select source, date::text as date, to_account_id, to_kind, from_kind, from_envelope_id, amount::float as amount,
              reason, month_assigned, year_assigned
       from transfers`,
    )).rows
    expect(transfers).toEqual([{
      source: 'closure', date: '2026-10-31', to_account_id: account, to_kind: 'account', from_kind: 'envelope',
      from_envelope_id: envelope, amount: 50, reason: 'Reliquat de clôture', month_assigned: 10, year_assigned: 2026,
    }])

    const decisions = (await db.query<any>('select destination, destination_account_id from closure_envelope_decisions')).rows
    expect(decisions).toEqual([{ destination: 'account', destination_account_id: account }])
  })
})
