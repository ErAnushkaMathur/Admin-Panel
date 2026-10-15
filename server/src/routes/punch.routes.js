import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { env } from '../config/env.js'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { punchSchema, punchTokenParamSchema } from '../validators/punch.schemas.js'
import { getPunchInfo, punch } from '../controllers/punch.controller.js'

const router = Router()

// Public, no login. IP-level limit on top of the per-code PIN lockout.
// Generous because a whole shop may punch from one Wi-Fi IP at shift change.
const punchLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: env.punchRateLimitMax,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { message: 'Too many requests from this network. Please wait a few minutes.', code: 'RATE_LIMITED' } },
})

router.use(punchLimiter)
router.get('/:businessToken', validate(punchTokenParamSchema, 'params'), asyncHandler(getPunchInfo))
router.post('/', validate(punchSchema), asyncHandler(punch))

export default router
