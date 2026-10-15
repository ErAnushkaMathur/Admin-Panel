import { z } from 'zod'
import { SALARY_TYPES } from '../models/Employee.js'
import { normalizeIndianPhone } from '../utils/phone.js'

const objectId = (label) => z.string(`${label} is required`).regex(/^[0-9a-f]{24}$/i, `Pick a ${label.toLowerCase()}`)

function isRealDate(value) {
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

// Salary fields without defaults, so a partial PATCH never resets unspecified values
const salaryFields = {
  type: z.enum(SALARY_TYPES, 'Salary type must be monthly, daily or hourly'),
  amountPaise: z
    .number('Salary amount is required')
    .int('Salary must be a whole number of paise')
    .positive('Salary must be more than 0')
    .max(1_000_000_000, 'Salary is too large'),
  overtimeMultiplier: z
    .number('Overtime multiplier must be a number')
    .min(1, 'Overtime multiplier must be at least 1')
    .max(3, 'Overtime multiplier can be at most 3'),
  weeklyOff: z
    .array(z.number().int().min(0).max(6), 'Weekly off must be a list of days (0 = Sunday … 6 = Saturday)')
    .max(6, 'At least one working day is needed')
    .refine((days) => new Set(days).size === days.length, 'Weekly off days must not repeat')
    .transform((days) => [...days].sort()),
}

const fields = {
  name: z.string('Name is required').trim().min(2, 'Name is too short').max(100, 'Name is too long'),
  phone: z
    .string('Phone is required')
    .transform(normalizeIndianPhone)
    .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number')),
  departmentId: objectId('Department'),
  roleTitle: z.string('Role is required').trim().min(2, 'Role is too short').max(60, 'Role is too long'),
  shiftId: objectId('Shift'),
  joinDate: z
    .string('Join date is required')
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Join date must be YYYY-MM-DD')
    .refine(isRealDate, 'Join date is not a real date'),
}

export const createEmployeeSchema = z
  .object({
    ...fields,
    salary: z
      .object({
        ...salaryFields,
        overtimeMultiplier: salaryFields.overtimeMultiplier.default(1.5),
        weeklyOff: salaryFields.weeklyOff.default([]),
      }, 'Salary is required')
      .strict(),
  })
  .strict()

export const updateEmployeeSchema = z
  .object({
    ...fields,
    isActive: z.boolean('isActive must be true or false'),
    salary: z.object(salaryFields).partial().strict(),
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update')

export const listEmployeesQuerySchema = z.object({
  search: z.string().trim().max(60).optional(),
  departmentId: z.string().regex(/^[0-9a-f]{24}$/i, 'Invalid departmentId').optional(),
  shiftId: z.string().regex(/^[0-9a-f]{24}$/i, 'Invalid shiftId').optional(),
  status: z.enum(['active', 'inactive', 'all']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})
