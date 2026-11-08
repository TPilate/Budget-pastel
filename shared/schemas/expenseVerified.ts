import { z } from 'zod'

export const expenseVerifiedSchema = z.object({ verified: z.boolean() })

export type ExpenseVerifiedInput = z.infer<typeof expenseVerifiedSchema>
