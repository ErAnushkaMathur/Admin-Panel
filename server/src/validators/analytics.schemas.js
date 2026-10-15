import { z } from 'zod'
import { ATTENDANCE_RANGES, PAYROLL_RANGES } from '../services/analytics.service.js'

export const attendanceAnalyticsQuerySchema = z.object({
  range: z.enum(ATTENDANCE_RANGES, 'Range must be 30d, 90d or 12m').default('30d'),
})

export const payrollAnalyticsQuerySchema = z.object({
  range: z.enum(PAYROLL_RANGES, 'Range must be 6m or 12m').default('6m'),
})
