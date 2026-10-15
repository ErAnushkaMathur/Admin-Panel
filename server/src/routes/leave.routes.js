import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { idParamSchema } from '../validators/common.schemas.js'
import { createLeaveSchema, decisionSchema, listLeavesQuerySchema } from '../validators/leave.schemas.js'
import {
  listLeaves,
  requestLeave,
  addLeaveOnBehalf,
  approveLeave,
  rejectLeave,
} from '../controllers/leave.controller.js'

const router = Router()

// Owners and managers handle leaves (SPEC section 1); adding approved leave directly is owner-only
router.use(requireAuth)

router.get('/', validate(listLeavesQuerySchema, 'query'), asyncHandler(listLeaves))
router.post('/', validate(createLeaveSchema), asyncHandler(requestLeave))
router.post('/on-behalf', requireRole('owner'), validate(createLeaveSchema), asyncHandler(addLeaveOnBehalf))
router.post('/:id/approve', validate(idParamSchema, 'params'), validate(decisionSchema), asyncHandler(approveLeave))
router.post('/:id/reject', validate(idParamSchema, 'params'), validate(decisionSchema), asyncHandler(rejectLeave))

export default router
