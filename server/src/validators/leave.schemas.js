import { z } from 'zod'
import { LEAVE_TYPES, LEAVE_STATUSES, MAX_LEAVE_DAYS, leaveDays } from '../services/leave.service.js'

function isRealDate(value) {
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}
const ymd = (label) =>
  z
    .string(`${label} is required`)
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be YYYY-MM-DD`)
    .refine(isRealDate, `${label} is not a real date`)
const objectId = (label) => z.string(`${label} is required`).regex(/^[0-9a-f]{24}$/i, `Pick ${label.toLowerCase()}`)

// Used for both a pending request and an owner-added (approved) leave
export const createLeaveSchema = z
  .object({
    employeeId: objectId('an employee'),
    fromDate: ymd('Start date'),
    toDate: ymd('End date'),
    type: z.enum(LEAVE_TYPES, 'Pick paid, unpaid or sick leave'),
    reason: z.string().trim().max(500, 'Reason is too long').default(''),
  })
  .strict()
  .refine((b) => b.toDate >= b.fromDate, { message: 'End date must be on or after the start date', path: ['toDate'] })
  .refine((b) => b.toDate < b.fromDate || leaveDays(b.fromDate, b.toDate) <= MAX_LEAVE_DAYS, {
    message: `Leave can be at most ${MAX_LEAVE_DAYS} days`,
    path: ['toDate'],
  })

export const decisionSchema = z
  .object({
    note: z.string().trim().max(500, 'Note is too long').optional(),
  })
  .strict()

export const listLeavesQuerySchema = z
  .object({
    status: z.enum([...LEAVE_STATUSES, 'all']).default('all'),
    employeeId: z.string().regex(/^[0-9a-f]{24}$/i, 'Invalid employeeId').optional(),
    // Leaves overlapping this date range
    from: ymd('From date').optional(),
    to: ymd('To date').optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'From date must be on or before To date', path: ['from'] })
