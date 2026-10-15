import { z } from 'zod'
import { STATUSES, MANUAL_STATUSES } from '../services/attendance.service.js'

export const EXCEPTION_FLAGS = ['missing_checkout', 'manual_edit', 'device_mismatch']

function isRealDate(value) {
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

const ymd = (label = 'Date') =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be YYYY-MM-DD`)
    .refine(isRealDate, `${label} is not a real date`)
const objectId = (label) => z.string().regex(/^[0-9a-f]{24}$/i, `Invalid ${label}`)
const hhmm = (label) => z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${label} must be HH:mm`)
const reason = z
  .string('A reason is required')
  .trim()
  .min(5, 'Please give a reason (at least 5 characters)')
  .max(500, 'Reason is too long')

export const listAttendanceQuerySchema = z.object({
  date: ymd().optional(),
  departmentId: objectId('departmentId').optional(),
  status: z.enum(STATUSES).optional(),
})

export const monthlyQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM')
    .optional(),
  departmentId: objectId('departmentId').optional(),
})

export const exceptionsQuerySchema = z.object({
  from: ymd('From date').optional(),
  to: ymd('To date').optional(),
  type: z.enum(EXCEPTION_FLAGS).optional(),
})

// Manual edit of an existing record. Times are IST "HH:mm" on the record's date;
// null clears a punch / the manual status. The reason is mandatory (SPEC 4.7).
export const updateAttendanceSchema = z
  .object({
    punchIn: hhmm('Punch in').nullable().optional(),
    punchOut: hhmm('Punch out').nullable().optional(),
    status: z.enum(MANUAL_STATUSES, 'Pick a valid status').nullable().optional(),
    reason,
  })
  .strict()
  .refine((b) => 'punchIn' in b || 'punchOut' in b || 'status' in b, 'Change a punch time or the status')

// Manual record for a day with no punch (forgot phone, marked absent/leave, ...)
export const createManualSchema = z
  .object({
    employeeId: objectId('employeeId'),
    date: ymd(),
    punchIn: hhmm('Punch in').optional(),
    punchOut: hhmm('Punch out').optional(),
    status: z.enum(MANUAL_STATUSES, 'Pick a valid status').optional(),
    reason,
  })
  .strict()
  .refine((b) => b.punchIn || b.status, { message: 'Enter a punch-in time or pick a status', path: ['punchIn'] })
  .refine((b) => !b.punchOut || b.punchIn, { message: 'Enter the punch-in time too', path: ['punchIn'] })
