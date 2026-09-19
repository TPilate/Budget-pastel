import { z } from 'zod'

export const incomeEntryInputSchema = z.object({
  incomeTypeId: z.string().uuid(),
  label: z.string().min(1),
  amount: z.number().positive(),
  dateReceived: z.string().min(1),
  monthAssigned: z.number().int().min(1).max(12),
  yearAssigned: z.number().int().min(2000),
  detailsText: z.string().nullable().optional(),
  targetEnvelopeId: z.string().uuid().nullable().optional(),
})

export type IncomeEntryInput = z.infer<typeof incomeEntryInputSchema>
