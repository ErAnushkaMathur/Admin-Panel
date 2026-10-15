import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { validate } from '../middleware/validate.js'
import { updateSettingsSchema } from '../validators/settings.schemas.js'
import { getPunchLink, regeneratePunchLink, getSettings, updateSettings } from '../controllers/settings.controller.js'

const router = Router()

router.use(requireAuth)

// Managers run attendance, so they can view/print the QR; only owners can invalidate it
router.get('/punch-link', asyncHandler(getPunchLink))
router.post('/punch-link/regenerate', requireRole('owner'), asyncHandler(regeneratePunchLink))

// Shop settings: everyone signed in can read them; only the owner changes them
router.get('/', asyncHandler(getSettings))
router.patch('/', requireRole('owner'), validate(updateSettingsSchema), asyncHandler(updateSettings))

export default router
