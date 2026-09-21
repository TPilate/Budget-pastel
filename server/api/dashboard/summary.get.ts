import { and, eq } from 'drizzle-orm'
import { requireUser } from '../../utils/auth'
import { db } from '../../utils/db'
import { incomeEntries, incomeTypes, expenseEntries, categories, savingsEntries, savingsGoals } from '../../../drizzle/schema'
import { listBudgetEnvelopeLedgers } from '../../utils/envelopeCeilingsQuery'
import { getPrimaryReserveEnvelopeBalance } from '../../utils/reserveEnvelopeQuery'
import { fetchMovements } from '../../utils/movementsQuery'
import { computeDashboardSummary } from '../../utils/domain/dashboardSummary'

export default defineEventHandler(async (event) => {
  await requireUser(event)

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const daysInMonth = new Date(year, month, 0).getDate()
  const joursRestants = Math.max(0, daysInMonth - now.getDate())

  const [
    incomeRows,
    incomeTypeRows,
    expenseRows,
    categoryRows,
    savingsEntryRows,
    savingsGoalRows,
    envelopeLedgers,
    reserveEnvelope,
    recentMovements,
  ] = await Promise.all([
    db.select().from(incomeEntries).where(and(eq(incomeEntries.yearAssigned, year), eq(incomeEntries.monthAssigned, month))),
    db.select().from(incomeTypes),
    db.select().from(expenseEntries).where(and(eq(expenseEntries.yearAssigned, year), eq(expenseEntries.monthAssigned, month))),
    db.select().from(categories),
    db.select().from(savingsEntries).where(and(eq(savingsEntries.year, year), eq(savingsEntries.month, month))),
    db.select().from(savingsGoals),
    listBudgetEnvelopeLedgers(year, month),
    getPrimaryReserveEnvelopeBalance(),
    fetchMovements(year, month),
  ])

  const salaryTypeId = incomeTypeRows.find((incomeType) => incomeType.name === 'Salaire')?.id
  const salaryRows = incomeRows.filter((row) => row.incomeTypeId === salaryTypeId)
  const salaryReceived = salaryRows.reduce((sum, row) => sum + Number(row.amount), 0)
  const salaryExpected = salaryRows.reduce((sum, row) => sum + Number(row.expectedAmount ?? 0), 0)
  const hasSalaryExpected = salaryRows.some((row) => row.expectedAmount != null && Number(row.expectedAmount) !== 0)

  const categoryById = new Map(categoryRows.map((category) => [category.id, category]))
  const fixedChargesTotal = expenseRows
    .filter((row) => categoryById.get(row.categoryId)?.isFixed && !row.envelopeId)
    .reduce((sum, row) => sum + Number(row.amount), 0)
  const variableChargesTotal = expenseRows
    .filter((row) => !categoryById.get(row.categoryId)?.isFixed && !row.envelopeId)
    .reduce((sum, row) => sum + Number(row.amount), 0)

  const envelopeSpendTotal = envelopeLedgers.reduce((sum, envelope) => sum + envelope.netSpent, 0)
  const savingsVersedTotal = savingsEntryRows.reduce((sum, row) => sum + Number(row.amount), 0)

  const summary = computeDashboardSummary({
    salaryReceived,
    salaryExpected,
    fixedChargesTotal,
    variableChargesTotal,
    envelopeSpendTotal,
    savingsVersedTotal,
    joursRestants,
  })

  // Nothing in the app currently writes expectedAmount, so most months have no real
  // figure to compare salaryReceived against — surface null instead of a false "vs prévu" figure.
  const summaryResponse = {
    ...summary,
    salaryVsExpected: hasSalaryExpected ? summary.salaryVsExpected : null,
  }

  const savingsByGoal = savingsGoalRows.map((goal) => ({
    id: goal.id,
    name: goal.name,
    amount: savingsEntryRows
      .filter((row) => row.savingsGoalId === goal.id)
      .reduce((sum, row) => sum + Number(row.amount), 0),
  }))

  return {
    monthLabel: now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
    joursRestants,
    salaryReceived,
    summary: summaryResponse,
    homeEnvelopes: envelopeLedgers.filter((envelope) => envelope.showOnHome),
    envelopesTotalCeiling: envelopeLedgers.reduce((sum, envelope) => sum + envelope.ceiling, 0),
    savingsGoals: savingsByGoal,
    savingsTotal: savingsVersedTotal,
    reserveEnvelope,
    recentMovements: recentMovements.slice(0, 5),
  }
})
