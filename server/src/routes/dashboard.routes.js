import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { summaryQuerySchema } from '../validators/dashboard.schemas.js'
import { getSummary } from '../controllers/dashboard.controller.js'

const router = Router()

// Owners and managers; salary widgets are only filled in for owners
router.use(requireAuth)
router.get('/summary', validate(summaryQuerySchema, 'query'), asyncHandler(getSummary))

export default router
