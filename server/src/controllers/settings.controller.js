import Business from '../models/Business.js'
import { HttpError } from '../utils/httpError.js'
import { DEFAULT_PAYROLL_SETTINGS } from '../services/payroll.service.js'
import { DEFAULT_HALF_DAY_THRESHOLD_MINUTES } from '../services/attendance.service.js'
import { generatePunchToken } from '../utils/token.js'
import { inTransaction, recordAudit } from '../services/auditTrail.service.js'

async function loadBusiness(businessId) {
  const business = await Business.findById(businessId)
  if (!business) throw new HttpError(404, 'Business not found')
  return business
}

// GET /settings/punch-link — token for the punch URL / QR. Creates one for older businesses.
export async function getPunchLink(req, res) {
  const business = await loadBusiness(req.user.businessId)
  if (!business.punchToken) {
    business.punchToken = generatePunchToken()
    await business.save()
  }
  res.json({ punchToken: business.punchToken, businessName: business.name })
}

// POST /settings/punch-link/regenerate — old QR codes and links stop working immediately
export async function regeneratePunchLink(req, res) {
  const { businessId, id: actorId } = req.user
  const business = await loadBusiness(businessId)
  business.punchToken = generatePunchToken()
  // Logged without the tokens: the event matters, the secret values must not be stored
  await inTransaction(async (session) => {
    await business.save({ session })
    await recordAudit(session, {
      businessId,
      actorId,
      action: 'settings.punch_link_regenerate',
      entity: 'Business',
      entityId: business._id,
      before: null,
      after: null,
    })
  })
  res.json({ punchToken: business.punchToken, businessName: business.name })
}

// Editable settings, flat, with defaults for businesses created before a field existed
function settingsOf(business) {
  const a = business.attendanceSettings ?? {}
  const p = business.payrollSettings ?? {}
  return {
    name: business.name,
    halfDayThresholdMinutes: a.halfDayThresholdMinutes ?? DEFAULT_HALF_DAY_THRESHOLD_MINUTES,
    defaultGraceMinutes: a.defaultGraceMinutes ?? 10,
    workingDaysPolicy: p.workingDaysPolicy ?? DEFAULT_PAYROLL_SETTINGS.workingDaysPolicy,
    overtimeEnabled: p.overtimeEnabled ?? DEFAULT_PAYROLL_SETTINGS.overtimeEnabled,
    lateRuleEnabled: p.lateRuleEnabled ?? false,
    lateRuleEvery: p.lateRuleEvery ?? 3,
  }
}
// Where each setting lives on the Business document (the half-day threshold is the existing field)
const PATHS = {
  name: 'name',
  halfDayThresholdMinutes: 'attendanceSettings.halfDayThresholdMinutes',
  defaultGraceMinutes: 'attendanceSettings.defaultGraceMinutes',
  workingDaysPolicy: 'payrollSettings.workingDaysPolicy',
  overtimeEnabled: 'payrollSettings.overtimeEnabled',
  lateRuleEnabled: 'payrollSettings.lateRuleEnabled',
  lateRuleEvery: 'payrollSettings.lateRuleEvery',
}

function settingsResponse(business) {
  return { settings: settingsOf(business), timezone: business.timezone, plan: business.plan, business: business.toJSON() }
}

// GET /settings: owners and managers (no salary numbers in here)
export async function getSettings(req, res) {
  res.json(settingsResponse(await loadBusiness(req.user.businessId)))
}

// PATCH /settings: owner only; every change is audit-logged with before/after (only changed fields)
export async function updateSettings(req, res) {
  const { businessId, id: actorId } = req.user
  const business = await loadBusiness(businessId)
  const current = settingsOf(business)
  const before = {}
  const after = {}
  for (const [key, value] of Object.entries(req.body)) {
    if (current[key] === value) continue
    before[key] = current[key]
    after[key] = value
    business.set(PATHS[key], value)
  }
  if (Object.keys(after).length === 0) throw new HttpError(400, 'Nothing changed')

  await inTransaction(async (session) => {
    await business.save({ session })
    await recordAudit(session, { businessId, actorId, action: 'settings.update', entity: 'Business', entityId: business._id, before, after })
  })
  res.json(settingsResponse(business))
}
