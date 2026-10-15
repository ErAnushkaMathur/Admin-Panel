import Shift from '../models/Shift.js'
import Business from '../models/Business.js'
import { HttpError } from '../utils/httpError.js'
import { crossesMidnight, shiftDurationMinutes } from '../services/shift.service.js'
import { getShiftEmployeeCounts } from '../services/staffStats.service.js'
import { inTransaction, recordAudit } from '../services/auditTrail.service.js'

// Fields recorded in the audit log for a shift edit
const shiftSnapshot = (s) => ({
  name: s.name,
  startTime: s.startTime,
  endTime: s.endTime,
  graceMinutes: s.graceMinutes,
  crossesMidnight: s.crossesMidnight,
})

function serialize(shift, counts) {
  const json = typeof shift.toJSON === 'function' ? shift.toJSON() : shift
  return {
    ...json,
    durationMinutes: shiftDurationMinutes(json.startTime, json.endTime),
    employeeCount: counts[String(json._id)] || 0,
  }
}

function duplicateNameError(err, name) {
  if (err.code === 11000) return new HttpError(409, `A shift named "${name}" already exists`)
  return err
}

export async function listShifts(req, res) {
  const { businessId } = req.user
  const [shifts, counts] = await Promise.all([
    Shift.find({ businessId }).sort({ startTime: 1, name: 1 }).select('-__v').lean(),
    getShiftEmployeeCounts(businessId),
  ])
  res.json({ shifts: shifts.map((s) => serialize(s, counts)) })
}

export async function createShift(req, res) {
  const { businessId } = req.user
  const { startTime, endTime } = req.body
  let { graceMinutes } = req.body
  if (graceMinutes === undefined) {
    const business = await Business.findById(businessId).select('attendanceSettings').lean()
    graceMinutes = business?.attendanceSettings?.defaultGraceMinutes ?? 10
  }
  try {
    const shift = await Shift.create({ ...req.body, graceMinutes, businessId, crossesMidnight: crossesMidnight(startTime, endTime) })
    res.status(201).json({ shift: serialize(shift, {}) })
  } catch (err) {
    throw duplicateNameError(err, req.body.name)
  }
}

export async function updateShift(req, res) {
  const { businessId, id: actorId } = req.user
  const shift = await Shift.findOne({ _id: req.params.id, businessId })
  if (!shift) throw new HttpError(404, 'Shift not found')

  const before = shiftSnapshot(shift)
  shift.set(req.body)
  if (shift.startTime === shift.endTime) {
    throw new HttpError(400, 'End time must be different from start time')
  }
  shift.crossesMidnight = crossesMidnight(shift.startTime, shift.endTime)
  const after = shiftSnapshot(shift)
  const changed = JSON.stringify(before) !== JSON.stringify(after)

  // Shift times drive lateness for everyone on the shift, so every real edit is audit-logged
  try {
    await inTransaction(async (session) => {
      await shift.save({ session })
      if (changed) {
        await recordAudit(session, {
          businessId,
          actorId,
          action: 'shift.update',
          entity: 'Shift',
          entityId: shift._id,
          before,
          after,
        })
      }
    })
  } catch (err) {
    throw duplicateNameError(err, req.body.name)
  }
  res.json({ shift: serialize(shift, await getShiftEmployeeCounts(businessId)) })
}
