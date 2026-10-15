import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { idParamSchema } from '../validators/common.schemas.js'
import {
  payrollMonthQuerySchema,
  payrollMonthSchema,
  reopenSchema,
  adjustmentsSchema,
  markPaidSchema,
} from '../validators/payroll.schemas.js'
import {
  listPayroll,
  calculateMonth,
  updateAdjustments,
  finalizeMonth,
  reopenMonth,
  markPaid,
  getPayslip,
} from '../controllers/payroll.controller.js'

const router = Router()

// Owner only: salary numbers are hidden from managers at the API level (SPEC sections 1 and 7)
router.use(requireAuth, requireRole('owner'))

router.get('/', validate(payrollMonthQuerySchema, 'query'), asyncHandler(listPayroll))
router.post('/calculate', validate(payrollMonthSchema), asyncHandler(calculateMonth))
router.post('/finalize', validate(payrollMonthSchema), asyncHandler(finalizeMonth))
router.post('/reopen', validate(reopenSchema), asyncHandler(reopenMonth))
router.patch('/:id/adjustments', validate(idParamSchema, 'params'), validate(adjustmentsSchema), asyncHandler(updateAdjustments))
router.patch('/:id/paid', validate(idParamSchema, 'params'), validate(markPaidSchema), asyncHandler(markPaid))
router.get('/:id/payslip', validate(idParamSchema, 'params'), asyncHandler(getPayslip))

export default router
