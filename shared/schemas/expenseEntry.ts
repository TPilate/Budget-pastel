import { z } from 'zod'

export const expenseEntryInputSchema = z.object({
  date: z.string().min(1),
  categoryId: z.string().uuid(),
  label: z.string().min(1),
  amount: z.number().positive(),
  accountId: z.string().uuid().nullable().optional(),
  envelopeId: z.string().uuid().nullable().optional(),
  financedBy: z.enum(['budget', 'gift_given', 'gift_received']).default('budget'),
})

export type ExpenseEntryInput = z.infer<typeof expenseEntryInputSchema>
