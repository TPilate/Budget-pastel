import type { PGlite } from '@electric-sql/pglite'
import type { MonthData, YearMonth } from '../../../server/utils/domain/closure'

// The same MonthData as server/utils/closureQuery.ts fetchMonthData, read with plain SQL
// from a PGlite database instead of the Data API. Test-only.
export async function readMonthData(db: PGlite, { year, month }: YearMonth): Promise<MonthData> {
  const rows = async (sql: string, params: unknown[] = []) => (await db.query<any>(sql, params)).rows

  const [envelopes, allocations, expenses, incomes, transfers, savings, goals, accounts] = await Promise.all([
    rows(`select id, name, emoji, kind, default_ceiling, fifty_thirty_twenty_bucket, archived_at
          from envelopes order by sort_order, name`),
    rows(`select envelope_id, base_ceiling, carried_over_amount, overspend_deduction
          from monthly_envelope_allocations where year = $1 and month = $2`, [year, month]),
    rows(`select e.date::text as date, e.label, e.amount, e.envelope_id, e.financed_by,
                 c.name as category_name, c.emoji as category_emoji, c.fifty_thirty_twenty_bucket as category_bucket,
                 v.name as envelope_name, v.emoji as envelope_emoji
          from expense_entries e
          left join categories c on c.id = e.category_id
          left join envelopes v on v.id = e.envelope_id
          where e.year_assigned = $1 and e.month_assigned = $2 order by e.date, e.created_at`, [year, month]),
    rows(`select i.date_received::text as date_received, i.label, i.amount, i.expected_amount, i.target_envelope_id,
                 t.name as type_name, t.emoji as type_emoji
          from income_entries i left join income_types t on t.id = i.income_type_id
          where i.year_assigned = $1 and i.month_assigned = $2 order by i.date_received`, [year, month]),
    rows(`select date::text as date, from_kind, to_kind, from_envelope_id, to_envelope_id, from_account_id, to_account_id,
                 amount, reason, source
          from transfers where year_assigned = $1 and month_assigned = $2 order by date, created_at`, [year, month]),
    rows(`select savings_goal_id, amount, source from savings_entries where year = $1 and month = $2`, [year, month]),
    rows('select id, name, receives_salary_variance from savings_goals order by sort_order, name'),
    rows('select id, name, emoji, kind from accounts order by sort_order, name'),
  ])

  return {
    month: { year, month },
    envelopes: envelopes.map((row) => ({
      id: row.id,
      name: row.name,
      emoji: row.emoji,
      kind: row.kind,
      defaultCeiling: row.default_ceiling === null ? 0 : Number(row.default_ceiling),
      bucket: row.fifty_thirty_twenty_bucket ?? null,
      archived: row.archived_at !== null,
    })),
    allocations: allocations.map((row) => ({
      envelopeId: row.envelope_id,
      baseCeiling: Number(row.base_ceiling),
      carriedOverAmount: Number(row.carried_over_amount),
      overspendDeduction: Number(row.overspend_deduction),
    })),
    expenses: expenses.map((row) => ({
      date: row.date,
      label: row.label,
      amount: Number(row.amount),
      envelopeId: row.envelope_id ?? null,
      financedBy: row.financed_by,
      categoryName: row.category_name ?? row.envelope_name ?? '',
      categoryEmoji: row.category_emoji ?? row.envelope_emoji ?? '',
      categoryBucket: row.category_bucket ?? null,
    })),
    incomes: incomes.map((row) => ({
      date: row.date_received,
      label: row.label,
      amount: Number(row.amount),
      expectedAmount: row.expected_amount === null ? null : Number(row.expected_amount),
      targetEnvelopeId: row.target_envelope_id ?? null,
      typeName: row.type_name ?? '',
      typeEmoji: row.type_emoji ?? '',
    })),
    transfers: transfers.map((row) => ({
      date: row.date,
      fromKind: row.from_kind ?? 'envelope',
      toKind: row.to_kind ?? 'envelope',
      fromEnvelopeId: row.from_envelope_id ?? null,
      toEnvelopeId: row.to_envelope_id ?? null,
      fromAccountId: row.from_account_id ?? null,
      toAccountId: row.to_account_id ?? null,
      amount: Number(row.amount),
      reason: row.reason,
      source: row.source ?? 'manual',
    })),
    accounts: accounts.map((row) => ({ id: row.id, name: row.name, emoji: row.emoji, kind: row.kind })),
    savingsEntries: savings.map((row) => ({
      savingsGoalId: row.savings_goal_id,
      amount: Number(row.amount),
      source: row.source,
    })),
    savingsGoals: goals.map((row) => ({
      id: row.id,
      name: row.name,
      receivesSalaryVariance: Boolean(row.receives_salary_variance),
    })),
  }
}
