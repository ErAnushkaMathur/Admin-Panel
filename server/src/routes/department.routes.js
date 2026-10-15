import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { idParamSchema } from '../validators/common.schemas.js'
import {
  createDepartmentSchema,
  updateDepartmentSchema,
  listDepartmentsQuerySchema,
} from '../validators/department.schemas.js'
import { listDepartments, createDepartment, updateDepartment } from '../controllers/department.controller.js'

const router = Router()

router.use(requireAuth)

router.get('/', validate(listDepartmentsQuerySchema, 'query'), asyncHandler(listDepartments))
router.post('/', requireRole('owner'), validate(createDepartmentSchema), asyncHandler(createDepartment))
router.patch(
  '/:id',
  requireRole('owner'),
  validate(idParamSchema, 'params'),
  validate(updateDepartmentSchema),
  asyncHandler(updateDepartment),
)

export default router
