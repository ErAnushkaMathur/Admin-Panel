import { z } from 'zod'
import { PERIODS } from '../services/dashboard.service.js'

export const summaryQuerySchema = z.object({
  period: z.enum(PERIODS, 'Period must be week, month or year').default('month'),
})
