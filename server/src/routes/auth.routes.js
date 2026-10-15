import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { validate } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { registerSchema, loginSchema, changePasswordSchema } from '../validators/auth.schemas.js'
import { register, login, logout, me, changePassword } from '../controllers/auth.controller.js'

const router = Router()

// Brute-force protection for credential endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts, please try again later' } },
})

router.post('/register', authLimiter, validate(registerSchema), asyncHandler(register))
router.post('/login', authLimiter, validate(loginSchema), asyncHandler(login))
router.post('/logout', logout)
router.get('/me', requireAuth, asyncHandler(me))
router.post('/change-password', authLimiter, requireAuth, validate(changePasswordSchema), asyncHandler(changePassword))

export default router
