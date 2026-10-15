import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { listAuditLogsQuerySchema } from '../validators/auditLog.schemas.js'
import { listAuditLogs } from '../controllers/auditLog.controller.js'

const router = Router()

// Owner only: includes salary before/after values
router.use(requireAuth, requireRole('owner'))
router.get('/', validate(listAuditLogsQuerySchema, 'query'), asyncHandler(listAuditLogs))

export default router
