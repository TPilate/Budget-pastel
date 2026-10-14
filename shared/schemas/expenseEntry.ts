import { z } from 'zod'

export const expenseEntryInputSchema = z.object({
  date: z.string().min(1),
  // Optional when the expense comes out of an envelope: the envelope already says where it
  // belongs. The database CHECK expense_entries_category_or_envelope enforces the same rule.
  categoryId: z.string().uuid().nullable().optional(),
  label: z.string().min(1),
  amount: z.number().positive(),
  accountId: z.string().uuid().nullable().optional(),
  envelopeId: z.string().uuid().nullable().optional(),
  financedBy: z.enum(['budget', 'gift_given', 'gift_received']).default('budget'),
}).refine((input) => Boolean(input.categoryId) || Boolean(input.envelopeId), {
  message: 'Choisissez une catégorie ou une enveloppe.',
  path: ['categoryId'],
})

export type ExpenseEntryInput = z.infer<typeof expenseEntryInputSchema>
