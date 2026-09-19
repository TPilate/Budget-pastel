import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db } from '../server/utils/db'
import { categories, envelopes, incomeTypes, accounts, savingsGoals } from '../drizzle/schema'

const fixedCategories = [
  { name: 'Loyer', emoji: '🏠', isFixed: true, defaultTarget: '650', fiftyThirtyTwentyBucket: 'besoins' as const, sortOrder: 0 },
  { name: 'Électricité', emoji: '⚡', isFixed: true, defaultTarget: '49', fiftyThirtyTwentyBucket: 'besoins' as const, sortOrder: 1 },
  { name: 'Internet', emoji: '📶', isFixed: true, defaultTarget: '30', fiftyThirtyTwentyBucket: 'besoins' as const, sortOrder: 2 },
  { name: 'Téléphone', emoji: '📱', isFixed: true, defaultTarget: '15', fiftyThirtyTwentyBucket: 'besoins' as const, sortOrder: 3 },
  { name: 'Mutuelle', emoji: '🏥', isFixed: true, defaultTarget: '40', fiftyThirtyTwentyBucket: 'besoins' as const, sortOrder: 4 },
  { name: 'Transport', emoji: '🚗', isFixed: true, defaultTarget: '33', fiftyThirtyTwentyBucket: 'besoins' as const, sortOrder: 5 },
  { name: 'MACSF — assurance pro', emoji: '🩺', isFixed: true, defaultTarget: '0', fiftyThirtyTwentyBucket: 'besoins' as const, sortOrder: 6 },
]

const variableCategories = [
  { name: 'Courses', emoji: '🛒', isFixed: false, defaultTarget: '320', fiftyThirtyTwentyBucket: 'besoins' as const, sortOrder: 7 },
  { name: 'Essence', emoji: '⛽', isFixed: false, defaultTarget: '40', fiftyThirtyTwentyBucket: 'besoins' as const, sortOrder: 8 },
  { name: 'Santé', emoji: '💊', isFixed: false, defaultTarget: '40', fiftyThirtyTwentyBucket: 'besoins' as const, sortOrder: 9 },
]

const envelopeDefaults = [
  { name: 'Sorties', emoji: '🥂', kind: 'budget' as const, defaultCeiling: '90', fiftyThirtyTwentyBucket: 'envies' as const, carryOverDefault: true, showOnHome: false, sortOrder: 0 },
  { name: 'Restaurants', emoji: '🍽️', kind: 'budget' as const, defaultCeiling: '110', fiftyThirtyTwentyBucket: 'envies' as const, carryOverDefault: true, showOnHome: false, sortOrder: 1 },
  { name: 'Beauté', emoji: '💅', kind: 'budget' as const, defaultCeiling: '40', fiftyThirtyTwentyBucket: 'envies' as const, carryOverDefault: true, showOnHome: false, sortOrder: 2 },
  { name: 'Mode', emoji: '👗', kind: 'budget' as const, defaultCeiling: '60', fiftyThirtyTwentyBucket: 'envies' as const, carryOverDefault: true, showOnHome: false, sortOrder: 3 },
  { name: 'Sport', emoji: '🏃', kind: 'budget' as const, defaultCeiling: '25', fiftyThirtyTwentyBucket: 'envies' as const, carryOverDefault: true, showOnHome: true, sortOrder: 4 },
  { name: 'Cadeaux', emoji: '🎁', kind: 'budget' as const, defaultCeiling: '50', fiftyThirtyTwentyBucket: 'envies' as const, carryOverDefault: true, showOnHome: false, sortOrder: 5 },
  { name: 'Culture', emoji: '🎬', kind: 'budget' as const, defaultCeiling: '35', fiftyThirtyTwentyBucket: 'envies' as const, carryOverDefault: true, showOnHome: false, sortOrder: 6 },
  { name: 'Plaisirs perso', emoji: '🧸', kind: 'budget' as const, defaultCeiling: '45', fiftyThirtyTwentyBucket: 'envies' as const, carryOverDefault: true, showOnHome: false, sortOrder: 7 },
  { name: 'Voyage', emoji: '✈️', kind: 'budget' as const, defaultCeiling: '0', fiftyThirtyTwentyBucket: 'envies' as const, carryOverDefault: true, showOnHome: true, sortOrder: 8 },
  { name: 'Anniversaire et fêtes', emoji: '🎂', kind: 'reserve' as const, defaultCeiling: null, fiftyThirtyTwentyBucket: null, carryOverDefault: false, showOnHome: false, sortOrder: 9 },
]

const incomeTypeDefaults = [
  { name: 'Salaire', emoji: '💼', requiresDetailsText: false, sortOrder: 0 },
  { name: 'Prime', emoji: '✨', requiresDetailsText: false, sortOrder: 1 },
  { name: 'Babysitting', emoji: '🧸', requiresDetailsText: false, sortOrder: 2 },
  { name: 'Remboursement', emoji: '🔁', requiresDetailsText: false, sortOrder: 3 },
  { name: 'Cadeau reçu', emoji: '🎁', requiresDetailsText: false, sortOrder: 4 },
  { name: 'Autre', emoji: '📎', requiresDetailsText: true, sortOrder: 5 },
]

const accountDefaults = [
  { name: 'Compte courant', emoji: '🏦', sortOrder: 0 },
  { name: 'Compte joint', emoji: '💳', sortOrder: 1 },
  { name: 'Espèces', emoji: '💶', sortOrder: 2 },
]

const savingsGoalDefaults = [
  { name: 'Long terme', receivesSalaryVariance: true, sortOrder: 0 },
  { name: 'Cadeaux et fêtes', receivesSalaryVariance: false, sortOrder: 1 },
  { name: 'Vacances et imprévus', receivesSalaryVariance: false, sortOrder: 2 },
]

async function seedTable<T extends { name: string }>(
  table: any,
  rows: T[],
) {
  for (const row of rows) {
    const [existing] = await db.select().from(table).where(eq(table.name, row.name))

    if (existing) {
      console.log(`  skip: "${row.name}" already exists`)
      continue
    }

    await db.insert(table).values(row)
    console.log(`  created: "${row.name}"`)
  }
}

async function main() {
  console.log('Categories:')
  await seedTable(categories, [...fixedCategories, ...variableCategories])

  console.log('Envelopes:')
  await seedTable(envelopes, envelopeDefaults)

  console.log('Income types:')
  await seedTable(incomeTypes, incomeTypeDefaults)

  console.log('Accounts:')
  await seedTable(accounts, accountDefaults)

  console.log('Savings goals:')
  await seedTable(savingsGoals, savingsGoalDefaults)

  console.log('Done.')
}

main()
