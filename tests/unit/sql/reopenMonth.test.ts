import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createTestDb } from './pglite'
import { readMonthData } from './monthData'
import { computeLeftovers, planClosure } from '../../../server/utils/domain/closure'
import type { ClosureDecision, MonthData, YearMonth } from '../../../server/utils/domain/closure'
import { buildReportSnapshot } from '../../../server/utils/domain/reportSnapshot'
import { computeEnvelopeLedger } from '../../../server/utils/domain/envelopeLedger'
import { computeAccountBalance } from '../../../server/utils/domain/accountBalance'

const SEPTEMBER: YearMonth = { year: 2026, month: 9 }
const OCTOBER: YearMonth = { year: 2026, month: 10 }
const CLOSED_AT = new Date('2026-10-01T08:00:00Z')

let db: PGlite
let ids: { restaurants: string, sorties: string, ldds: string, poche: string }

const insertId = async (sql: string, params: unknown[] = []) => (await db.query<{ id: string }>(sql, params)).rows[0].id
const rows = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows
const count = async (table: string, where = 'true') =>
  (await rows<{ count: number }>(`select count(*)::int as count from ${table} where ${where}`))[0].count

async function seed() {
  const restaurants = await insertId(
    `insert into envelopes (name, emoji, kind, default_ceiling, sort_order) values ('Restaurants', '🍽️', 'budget', 200, 1) returning id`,
  )
  const sorties = await insertId(
    `insert into envelopes (name, emoji, kind, default_ceiling, sort_order) values ('Sorties', '🎉', 'budget', 100, 2) returning id`,
  )
  // Reference set well before every transfer, so each one counts in the balance.
  const ldds = await insertId(
    `insert into accounts (name, emoji, kind, current_balance, reference_set_at)
     values ('LDDS', '🏦', 'epargne', 1000, '2026-01-01T00:00:00Z') returning id`,
  )
  const poche = await insertId(`insert into savings_goals (name, receives_salary_variance) values ('Vacances', true) returning id`)

  const expense = (date: string, label: string, amount: number, envelope: string, month: number) => db.query(
    `insert into expense_entries (date, label, amount, envelope_id, financed_by, month_assigned, year_assigned)
     values ($1, $2, $3, $4, 'budget', $5, 2026)`,
    [date, label, amount, envelope, month],
  )
  await expense('2026-09-05', 'Resto', 150, restaurants, 9)
  await expense('2026-09-12', 'Concert', 120, sorties, 9)
  await db.query(
    `insert into transfers (date, from_kind, to_kind, to_account_id, amount, reason, month_assigned, year_assigned)
     values ('2026-09-20', 'budget', 'account', $1, 30, 'Épargne', 9, 2026)`,
    [ldds],
  )
  await db.query(
    `insert into savings_entries (savings_goal_id, year, month, amount) values ($1, 2026, 9, 10)`,
    [poche],
  )
  await expense('2026-10-03', 'Resto', 40, restaurants, 10)

  ids = { restaurants, sorties, ldds, poche }
}

beforeEach(async () => {
  db = await createTestDb()
  await seed()
}, 60000)
afterEach(async () => {
  await db.close()
})

/** Closes a month the way closureService.closeMonth does; every leftover not named is carried over. */
async function closeMonth(month: YearMonth, decisions: Record<string, Omit<ClosureDecision, 'envelopeId'>> = {}) {
  const data = await readMonthData(db, month)
  const leftovers = computeLeftovers(data)
  const plan = planClosure({
    leftovers,
    decisions: leftovers
      .filter((row) => row.leftover > 0)
      .map((row) => ({ envelopeId: row.envelopeId, ...(decisions[row.envelopeId] ?? { destination: 'carry_over' as const }) })),
    savingsGoalIds: data.savingsGoals.map((goal) => goal.id),
    accountIds: data.accounts.map((account) => account.id),
  })
  const snapshot = buildReportSnapshot({ data, leftovers, plan, closedAt: CLOSED_AT })
  const payload = {
    year: month.year,
    month: month.month,
    decisions: plan.decisions,
    nextAllocations: plan.nextAllocations,
    freezeAllocations: plan.freezeAllocations,
    savingsEntries: plan.savingsEntries,
    accountTransfers: plan.accountTransfers,
    snapshot,
  }
  await db.query('select close_month($1::jsonb)', [JSON.stringify(payload)])
  return { plan, snapshot }
}

const closeSeptember = () => closeMonth(SEPTEMBER, { [ids.restaurants]: { destination: 'account', accountId: ids.ldds } })

async function reopen(month: YearMonth): Promise<number> {
  return (await rows<{ reopened: number }>('select reopen_month($1::int, $2::int) as reopened', [month.year, month.month]))[0].reopened
}

const sum = (list: { amount: number }[]) => list.reduce((total, row) => total + row.amount, 0)

/** Every budget envelope's ledger for the month, from the rows in the database. */
async function ledgers(month: YearMonth) {
  const data: MonthData = await readMonthData(db, month)
  return Object.fromEntries(data.envelopes.filter((e) => e.kind === 'budget').map((envelope) => {
    const allocation = data.allocations.find((a) => a.envelopeId === envelope.id) ?? null
    return [envelope.name, computeEnvelopeLedger({
      defaultCeiling: envelope.defaultCeiling,
      allocation,
      transfersIn: sum(data.transfers.filter((t) => t.toEnvelopeId === envelope.id)),
      transfersOut: sum(data.transfers.filter((t) => t.fromEnvelopeId === envelope.id)),
      expensesTotal: sum(data.expenses.filter((e) => e.envelopeId === envelope.id)),
      incomeCreditsTotal: sum(data.incomes.filter((i) => i.targetEnvelopeId === envelope.id)),
    })]
  }))
}

async function lddsBalance() {
  const account = (await rows(`select current_balance, reference_set_at from accounts where id = $1`, [ids.ldds]))[0]
  const transfers = (await rows(
    `select from_account_id, to_account_id, amount, created_at from transfers where from_kind = 'account' or to_kind = 'account'`,
  )).map((row) => ({
    fromAccountId: row.from_account_id,
    toAccountId: row.to_account_id,
    amount: Number(row.amount),
    createdAt: new Date(row.created_at).toISOString(),
  }))
  return computeAccountBalance({
    referenceBalance: Number(account.current_balance),
    referenceSetAt: new Date(account.reference_set_at).toISOString(),
    transfers,
  }, ids.ldds)
}

const allocationsOf = (month: YearMonth) => rows(
  `select envelope_id, base_ceiling::float as base_ceiling, carried_over_amount::float as carried_over_amount,
          overspend_deduction::float as overspend_deduction
   from monthly_envelope_allocations where year = $1 and month = $2 order by envelope_id`,
  [month.year, month.month],
)

const decisionRows = () => rows(
  `select envelope_id, leftover_amount::float as leftover_amount, destination, destination_savings_goal_id,
          destination_envelope_id, destination_account_id
   from closure_envelope_decisions order by envelope_id`,
)

const closureTransferRows = () => rows(
  `select date::text as date, from_kind, from_envelope_id, to_kind, to_account_id, amount::float as amount, reason,
          month_assigned, year_assigned
   from transfers where source = 'closure' order by from_envelope_id`,
)

async function expectNoClosureRows() {
  expect(await count('month_closures')).toBe(0)
  expect(await count('monthly_reports')).toBe(0)
  expect(await count('closure_envelope_decisions')).toBe(0)
  expect(await count('savings_entries', `source = 'closure'`)).toBe(0)
  expect(await count('transfers', `source = 'closure'`)).toBe(0)
}

describe('reopen_month', () => {
  it('undoes everything a closure wrote', async () => {
    const septemberBefore = await ledgers(SEPTEMBER)
    const octoberBefore = await ledgers(OCTOBER)
    const balanceBefore = await lddsBalance()
    // The seed itself: 1000 reference + 30 manual transfer.
    expect(balanceBefore).toBe(1030)
    expect(septemberBefore.Restaurants.remaining).toBe(50)
    expect(septemberBefore.Sorties.remaining).toBe(-20)

    await closeSeptember()

    expect(await count('month_closures', `year = 2026 and month = 9 and status = 'closed'`)).toBe(1)
    expect(await count('monthly_reports')).toBe(1)
    expect(await count('closure_envelope_decisions')).toBe(1)
    expect(await closureTransferRows()).toEqual([{
      date: '2026-09-30', from_kind: 'envelope', from_envelope_id: ids.restaurants, to_kind: 'account',
      to_account_id: ids.ldds, amount: 50, reason: 'Reliquat de clôture', month_assigned: 9, year_assigned: 2026,
    }])
    expect(await lddsBalance()).toBe(1080)
    expect(await count('monthly_envelope_allocations', `year = 2026 and month = 10 and overspend_deduction = 20`)).toBe(1)

    expect(await reopen(SEPTEMBER)).toBe(1)

    await expectNoClosureRows()
    // Manual movements are untouched.
    expect(await rows(`select to_kind, to_account_id, amount::float as amount, source from transfers`)).toEqual([
      { to_kind: 'account', to_account_id: ids.ldds, amount: 30, source: 'manual' },
    ])
    expect(await rows(`select savings_goal_id, amount::float as amount, source from savings_entries`)).toEqual([
      { savings_goal_id: ids.poche, amount: 10, source: 'manual' },
    ])
    // The freeze rows of September stay, with the ceilings it was lived with.
    expect(await allocationsOf(SEPTEMBER)).toEqual([
      { envelope_id: ids.restaurants, base_ceiling: 200, carried_over_amount: 0, overspend_deduction: 0 },
      { envelope_id: ids.sorties, base_ceiling: 100, carried_over_amount: 0, overspend_deduction: 0 },
    ].sort((a, b) => a.envelope_id.localeCompare(b.envelope_id)))
    const october = await allocationsOf(OCTOBER)
    expect(october).toHaveLength(2)
    for (const row of october) {
      expect(row.carried_over_amount).toBe(0)
      expect(row.overspend_deduction).toBe(0)
    }

    expect(await ledgers(SEPTEMBER)).toEqual(septemberBefore)
    expect(await ledgers(OCTOBER)).toEqual(octoberBefore)
    expect(await lddsBalance()).toBe(balanceBefore)
  })

  it('closes and reopens under the authenticated role, as the app does', async () => {
    // Supabase's default privileges give authenticated the tables; PGlite has none, and RLS still applies.
    await db.exec('GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated')
    await db.exec('SET ROLE authenticated')
    try {
      await closeSeptember()
      expect(await count('month_closures')).toBe(1)
      expect(await reopen(SEPTEMBER)).toBe(1)
      await expectNoClosureRows()
    } finally {
      await db.exec('RESET ROLE')
    }
  })

  it('reopens later closed months too', async () => {
    await closeSeptember()
    await closeMonth(OCTOBER)
    expect(await count('month_closures', `status = 'closed'`)).toBe(2)
    // October's leftovers were carried over into November.
    expect(await count('monthly_envelope_allocations', `year = 2026 and month = 11 and carried_over_amount > 0`)).toBe(2)

    expect(await reopen(SEPTEMBER)).toBe(2)

    await expectNoClosureRows()
    expect(await count('monthly_envelope_allocations', `carried_over_amount <> 0 or overspend_deduction <> 0`)).toBe(0)
  })

  it('refuses a month that is not closed', async () => {
    await expect(reopen(SEPTEMBER)).rejects.toThrow('MONTH_NOT_CLOSED')

    // October is not closed either, even with September closed.
    await closeSeptember()
    await expect(reopen(OCTOBER)).rejects.toThrow('MONTH_NOT_CLOSED')
    expect(await count('month_closures')).toBe(1)
  })

  it('runs as the caller and only authenticated may call it', async () => {
    const fn = (await rows<{ prosecdef: boolean }>(`select prosecdef from pg_proc where proname = 'reopen_month'`))[0]
    expect(fn.prosecdef).toBe(false)
    const can = async (role: string) => (await rows<{ ok: boolean }>(
      `select has_function_privilege($1, 'public.reopen_month(int, int)', 'execute') as ok`, [role],
    ))[0].ok
    expect(await can('authenticated')).toBe(true)
    expect(await can('anon')).toBe(false)
  })

  it('closing again after reopening gives the same rows as closing once', async () => {
    const first = await closeSeptember()
    const decisionsOnce = await decisionRows()
    const transfersOnce = await closureTransferRows()
    const septemberOnce = await allocationsOf(SEPTEMBER)
    const octoberOnce = await allocationsOf(OCTOBER)
    const balanceOnce = await lddsBalance()

    await reopen(SEPTEMBER)
    const second = await closeSeptember()

    expect(decisionsOnce).toEqual([{
      envelope_id: ids.restaurants, leftover_amount: 50, destination: 'account',
      destination_savings_goal_id: null, destination_envelope_id: null, destination_account_id: ids.ldds,
    }])
    expect(await decisionRows()).toEqual(decisionsOnce)
    expect(transfersOnce.map((t) => t.amount)).toEqual([50])
    expect(await closureTransferRows()).toEqual(transfersOnce)
    expect(await allocationsOf(SEPTEMBER)).toEqual(septemberOnce)
    expect(await allocationsOf(OCTOBER)).toEqual(octoberOnce)
    expect(octoberOnce.find((row) => row.envelope_id === ids.sorties)?.overspend_deduction).toBe(20)
    expect(await lddsBalance()).toBe(balanceOnce)
    // Only difference in the plan: September's freeze rows were kept, so there is nothing to freeze again.
    expect(first.plan.freezeAllocations).toHaveLength(2)
    expect(second.plan.freezeAllocations).toEqual([])
    expect({ ...second.plan, freezeAllocations: [] }).toEqual({ ...first.plan, freezeAllocations: [] })
    expect(second.snapshot).toEqual(first.snapshot)
    expect((await rows<{ snapshot: unknown }>('select snapshot from monthly_reports'))[0].snapshot).toEqual(first.snapshot)
  })
})
