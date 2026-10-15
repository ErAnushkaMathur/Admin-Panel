import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { idParamSchema } from '../validators/common.schemas.js'
import { createEmployeeSchema, updateEmployeeSchema, listEmployeesQuerySchema } from '../validators/employee.schemas.js'
import {
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  resetEmployeePin,
} from '../controllers/employee.controller.js'

const router = Router()

router.use(requireAuth)

// Owners and managers can view (managers never see salary); only owners can change anything.
// No DELETE route: employees are deactivated with PATCH { isActive: false } (golden rule 6).
router.get('/', validate(listEmployeesQuerySchema, 'query'), asyncHandler(listEmployees))
router.get('/:id', validate(idParamSchema, 'params'), asyncHandler(getEmployee))
router.post('/', requireRole('owner'), validate(createEmployeeSchema), asyncHandler(createEmployee))
router.patch(
  '/:id',
  requireRole('owner'),
  validate(idParamSchema, 'params'),
  validate(updateEmployeeSchema),
  asyncHandler(updateEmployee),
)
router.post('/:id/reset-pin', requireRole('owner'), validate(idParamSchema, 'params'), asyncHandler(resetEmployeePin))

export default router
