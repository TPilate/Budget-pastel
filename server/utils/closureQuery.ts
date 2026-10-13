import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'
import { compareYearMonth, monthLabel } from './domain/closure'
import type { MonthData, YearMonth } from './domain/closure'
import type { ReportSnapshotV1 } from './domain/reportSnapshot'

// Data API only, like /api/epargne. This module must never import ./db or the
// pool-backed ledger helpers: an exhausted pool hangs a request forever.
const REQUEST_TIMEOUT_MS = 10000

function assertOk(table: string, error: { message: string } | null) {
  if (!error) return
  console.error(`[closureQuery] ${table} request failed: ${error.message}`)
  throw createError({
    statusCode: 500,
    statusMessage: 'Failed to load closure data',
    message: `closure: ${table} request failed: ${error.message}`,
  })
}

function unwrap<T>(embed: T | T[] | null | undefined): T | null {
  if (!embed) return null
  return Array.isArray(embed) ? embed[0] ?? null : embed
}

export async function fetchClosureState(event: H3Event): Promise<{ firstDataMonth: YearMonth | null, closedMonths: YearMonth[] }> {
  const supabase = createSupabaseServerClient(event)
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const earliest = (table: string, yearColumn: string, monthColumn: string) => supabase
    .from(table)
    .select(`${yearColumn},${monthColumn}`)
    .order(yearColumn, { ascending: true })
    .order(monthColumn, { ascending: true })
    .limit(1)
    .abortSignal(signal)

  const [closuresRes, expenseRes, incomeRes, transferRes, savingsRes] = await Promise.all([
    supabase.from('month_closures').select('year,month').eq('status', 'closed').abortSignal(signal),
    earliest('expense_entries', 'year_assigned', 'month_assigned'),
    earliest('income_entries', 'year_assigned', 'month_assigned'),
    earliest('transfers', 'year_assigned', 'month_assigned'),
    earliest('savings_entries', 'year', 'month'),
  ])

  assertOk('month_closures', closuresRes.error)
  assertOk('expense_entries', expenseRes.error)
  assertOk('income_entries', incomeRes.error)
  assertOk('transfers', transferRes.error)
  assertOk('savings_entries', savingsRes.error)

  const assigned = (rows: any[] | null) => (rows ?? []).map((row) => ({ year: row.year_assigned, month: row.month_assigned }))
  const candidates: YearMonth[] = [
    ...assigned(expenseRes.data),
    ...assigned(incomeRes.data),
    ...assigned(transferRes.data),
    ...(savingsRes.data ?? []).map((row: any) => ({ year: row.year, month: row.month })),
  ]

  return {
    firstDataMonth: candidates.sort(compareYearMonth)[0] ?? null,
    closedMonths: (closuresRes.data ?? []).map((row: any) => ({ year: row.year, month: row.month })),
  }
}

export async function fetchMonthData(event: H3Event, { year, month }: YearMonth): Promise<MonthData> {
  const supabase = createSupabaseServerClient(event)
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)

  const [envelopesRes, allocationsRes, expensesRes, incomesRes, transfersRes, savingsRes, goalsRes] = await Promise.all([
    supabase.from('envelopes')
      .select('id,name,emoji,kind,default_ceiling,fifty_thirty_twenty_bucket,archived_at')
      .order('sort_order').abortSignal(signal),
    supabase.from('monthly_envelope_allocations')
      .select('envelope_id,base_ceiling,carried_over_amount,overspend_deduction')
      .eq('year', year).eq('month', month).abortSignal(signal),
    supabase.from('expense_entries')
      .select('date,label,amount,envelope_id,financed_by,categories(name,emoji,fifty_thirty_twenty_bucket)')
      .eq('year_assigned', year).eq('month_assigned', month).order('date').abortSignal(signal),
    supabase.from('income_entries')
      .select('date_received,label,amount,expected_amount,target_envelope_id,income_types(name,emoji)')
      .eq('year_assigned', year).eq('month_assigned', month).order('date_received').abortSignal(signal),
    supabase.from('transfers')
      .select('date,from_envelope_id,to_envelope_id,amount,reason')
      .eq('year_assigned', year).eq('month_assigned', month).order('date').abortSignal(signal),
    supabase.from('savings_entries')
      .select('savings_goal_id,amount,source')
      .eq('year', year).eq('month', month).abortSignal(signal),
    supabase.from('savings_goals')
      .select('id,name,receives_salary_variance')
      .order('sort_order').abortSignal(signal),
  ])

  assertOk('envelopes', envelopesRes.error)
  assertOk('monthly_envelope_allocations', allocationsRes.error)
  assertOk('expense_entries', expensesRes.error)
  assertOk('income_entries', incomesRes.error)
  assertOk('transfers', transfersRes.error)
  assertOk('savings_entries', savingsRes.error)
  assertOk('savings_goals', goalsRes.error)

  return {
    month: { year, month },
    envelopes: (envelopesRes.data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      emoji: row.emoji,
      kind: row.kind,
      // Reserve envelopes have no ceiling; 0 keeps the type simple and they never reach
      // the ledger anyway.
      defaultCeiling: row.default_ceiling === null ? 0 : Number(row.default_ceiling),
      bucket: row.fifty_thirty_twenty_bucket ?? null,
      archived: row.archived_at !== null,
    })),
    allocations: (allocationsRes.data ?? []).map((row: any) => ({
      envelopeId: row.envelope_id,
      baseCeiling: Number(row.base_ceiling),
      carriedOverAmount: Number(row.carried_over_amount),
      overspendDeduction: Number(row.overspend_deduction),
    })),
    expenses: (expensesRes.data ?? []).map((row: any) => {
      const category = unwrap<any>(row.categories)
      return {
        date: row.date,
        label: row.label,
        amount: Number(row.amount),
        envelopeId: row.envelope_id ?? null,
        financedBy: row.financed_by,
        categoryName: category?.name ?? '',
        categoryEmoji: category?.emoji ?? '',
        categoryBucket: category?.fifty_thirty_twenty_bucket ?? null,
      }
    }),
    incomes: (incomesRes.data ?? []).map((row: any) => {
      const type = unwrap<any>(row.income_types)
      return {
        date: row.date_received,
        label: row.label,
        amount: Number(row.amount),
        expectedAmount: row.expected_amount === null ? null : Number(row.expected_amount),
        targetEnvelopeId: row.target_envelope_id ?? null,
        typeName: type?.name ?? '',
        typeEmoji: type?.emoji ?? '',
      }
    }),
    transfers: (transfersRes.data ?? []).map((row: any) => ({
      date: row.date,
      fromEnvelopeId: row.from_envelope_id,
      toEnvelopeId: row.to_envelope_id,
      amount: Number(row.amount),
      reason: row.reason,
    })),
    savingsEntries: (savingsRes.data ?? []).map((row: any) => ({
      savingsGoalId: row.savings_goal_id,
      amount: Number(row.amount),
      source: row.source,
    })),
    savingsGoals: (goalsRes.data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      receivesSalaryVariance: Boolean(row.receives_salary_variance),
    })),
  }
}

export interface ArchiveRow { year: number, month: number, label: string, generatedAt: string }

export async function fetchArchives(event: H3Event): Promise<ArchiveRow[]> {
  const supabase = createSupabaseServerClient(event)
  const { data, error } = await supabase
    .from('monthly_reports')
    .select('generated_at,month_closures(year,month)')
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS))
  assertOk('monthly_reports', error)

  return (data ?? [])
    .map((row: any) => {
      const closure = unwrap<any>(row.month_closures)
      return { year: closure.year, month: closure.month, label: monthLabel(closure), generatedAt: row.generated_at }
    })
    .sort((a, b) => compareYearMonth(b, a))
}

export async function fetchReportSnapshot(event: H3Event, { year, month }: YearMonth): Promise<ReportSnapshotV1 | null> {
  const supabase = createSupabaseServerClient(event)
  const { data, error } = await supabase
    .from('monthly_reports')
    .select('snapshot,month_closures!inner(year,month)')
    .eq('month_closures.year', year)
    .eq('month_closures.month', month)
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS))
    .maybeSingle()
  assertOk('monthly_reports', error)

  return (data?.snapshot as ReportSnapshotV1 | undefined) ?? null
}
