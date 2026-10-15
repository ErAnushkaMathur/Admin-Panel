import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { attendanceAnalyticsQuerySchema, payrollAnalyticsQuerySchema } from '../validators/analytics.schemas.js'
import { attendanceAnalytics, payrollAnalytics } from '../controllers/analytics.controller.js'

const router = Router()

router.use(requireAuth)
router.get('/attendance', validate(attendanceAnalyticsQuerySchema, 'query'), asyncHandler(attendanceAnalytics))
// Salary numbers are hidden from managers at the API level (SPEC sections 1 and 7)
router.get('/payroll', requireRole('owner'), validate(payrollAnalyticsQuerySchema, 'query'), asyncHandler(payrollAnalytics))

export default router
