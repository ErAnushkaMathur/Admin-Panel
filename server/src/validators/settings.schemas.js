import { z } from 'zod'
import { WORKING_DAYS_POLICIES } from '../services/payroll.service.js'

const int = (label, min, max, unit = '') =>
  z
    .number(`${label} must be a number`)
    .int(`${label} must be a whole number`)
    .min(min, `${label} must be at least ${min}${unit}`)
    .max(max, `${label} can be at most ${max}${unit}`)

// PATCH /settings. Timezone is not editable (all date logic is IST), so it is rejected as an unknown key.
export const updateSettingsSchema = z
  .object({
    name: z.string('Shop name is required').trim().min(2, 'Shop name is too short').max(120, 'Shop name is too long'),
    // Business.attendanceSettings.halfDayThresholdMinutes (the existing field): 30 min to 12 h
    halfDayThresholdMinutes: int('Half-day threshold', 30, 720, ' minutes'),
    defaultGraceMinutes: int('Default grace', 0, 180, ' minutes'),
    workingDaysPolicy: z.enum(WORKING_DAYS_POLICIES, 'Pick actual days or fixed 26'),
    overtimeEnabled: z.boolean('Overtime must be on or off'),
    lateRuleEnabled: z.boolean('Late deduction must be on or off'),
    lateRuleEvery: int('Late count', 1, 31),
  })
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update')
