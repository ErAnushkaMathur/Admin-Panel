import { z } from 'zod'
import { DEPARTMENT_ICONS } from '../models/Department.js'

const fields = {
  name: z.string('Name is required').trim().min(2, 'Name is too short').max(60, 'Name is too long'),
  color: z.string('Pick a color').regex(/^#[0-9a-f]{6}$/i, 'Color must be a hex value like #f2727f'),
  icon: z.enum(DEPARTMENT_ICONS, 'Pick an icon from the list'),
}

export const createDepartmentSchema = z.object(fields).strict()

export const updateDepartmentSchema = z
  .object({ ...fields, isActive: z.boolean() })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update')

export const listDepartmentsQuerySchema = z.object({
  includeArchived: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
})
