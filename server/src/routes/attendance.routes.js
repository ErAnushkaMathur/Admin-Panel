import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { idParamSchema } from '../validators/common.schemas.js'
import {
  listAttendanceQuerySchema,
  monthlyQuerySchema,
  exceptionsQuerySchema,
  updateAttendanceSchema,
  createManualSchema,
} from '../validators/attendance.schemas.js'
import {
  listAttendance,
  monthlyAttendance,
  listExceptions,
  updateAttendance,
  createManualAttendance,
} from '../controllers/attendance.controller.js'

const router = Router()

// Owners and managers both run attendance (SPEC section 1)
router.use(requireAuth)

router.get('/', validate(listAttendanceQuerySchema, 'query'), asyncHandler(listAttendance))
router.get('/monthly', validate(monthlyQuerySchema, 'query'), asyncHandler(monthlyAttendance))
router.get('/exceptions', validate(exceptionsQuerySchema, 'query'), asyncHandler(listExceptions))
router.post('/manual', validate(createManualSchema), asyncHandler(createManualAttendance))
router.patch('/:id', validate(idParamSchema, 'params'), validate(updateAttendanceSchema), asyncHandler(updateAttendance))

export default router
