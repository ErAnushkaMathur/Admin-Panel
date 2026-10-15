import { z } from 'zod'
import { AUDIT_ACTIONS } from '../services/auditLog.service.js'

function isRealDate(value) {
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}
const ymd = (label) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be YYYY-MM-DD`)
    .refine(isRealDate, `${label} is not a real date`)

export const listAuditLogsQuerySchema = z
  .object({
    from: ymd('From date').optional(),
    to: ymd('To date').optional(),
    employeeId: z.string().regex(/^[0-9a-f]{24}$/i, 'Invalid employeeId').optional(),
    type: z.enum(Object.keys(AUDIT_ACTIONS), 'Unknown change type').optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'From date must be on or before To date', path: ['from'] })
