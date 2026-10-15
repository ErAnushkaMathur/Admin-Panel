import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { idParamSchema } from '../validators/common.schemas.js'
import { createShiftSchema, updateShiftSchema } from '../validators/shift.schemas.js'
import { listShifts, createShift, updateShift } from '../controllers/shift.controller.js'

const router = Router()

router.use(requireAuth)

router.get('/', asyncHandler(listShifts))
router.post('/', requireRole('owner'), validate(createShiftSchema), asyncHandler(createShift))
router.patch(
  '/:id',
  requireRole('owner'),
  validate(idParamSchema, 'params'),
  validate(updateShiftSchema),
  asyncHandler(updateShift),
)

export default router
