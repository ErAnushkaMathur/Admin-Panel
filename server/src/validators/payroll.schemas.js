import { z } from 'zod'

const month = z.string('Month is required').regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM')

function isRealDate(value) {
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}
// Up to ₹1 crore, in whole paise (golden rule 4)
const paise = (label) =>
  z
    .number(`${label} must be a number`)
    .int(`${label} must be whole paise`)
    .min(0, `${label} can't be negative`)
    .max(1_000_000_000, `${label} is too large`)

export const payrollMonthQuerySchema = z.object({ month: month.optional() })

export const payrollMonthSchema = z.object({ month }).strict()

export const reopenSchema = z
  .object({
    month,
    reason: z.string('Reason is required').trim().min(3, 'Write a short reason').max(500, 'Reason is too long'),
  })
  .strict()

export const adjustmentsSchema = z
  .object({
    bonusPaise: paise('Bonus').optional(),
    advancePaise: paise('Advance').optional(),
    reason: z.string().trim().max(500, 'Note is too long').optional(),
  })
  .strict()
  .refine((b) => b.bonusPaise !== undefined || b.advancePaise !== undefined, {
    message: 'Enter a bonus or an advance',
    path: ['bonusPaise'],
  })

export const markPaidSchema = z
  .object({
    paidDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Paid date must be YYYY-MM-DD')
      .refine(isRealDate, 'Paid date is not a real date')
      .optional(),
  })
  .strict()
