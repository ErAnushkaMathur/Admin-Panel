import bcrypt from 'bcryptjs'
import Business from '../models/Business.js'
import Employee from '../models/Employee.js'
import Shift from '../models/Shift.js'
import Attendance from '../models/Attendance.js'
import { HttpError } from '../utils/httpError.js'
import { now as serverNow } from '../utils/clock.js'
import { formatTimeIST } from '../utils/time.js'
import { verifyPin } from '../services/pin.service.js'
import { getActiveLock, recordFailedPin, clearFailedPins } from '../services/punchLockout.service.js'
import {
  resolveShiftDate,
  deriveStatus,
  minutesSince,
  recentPunchDevices,
  isDeviceMismatch,
  MIN_MINUTES_BEFORE_PUNCH_OUT,
  MAX_OPEN_SHIFT_HOURS,
  DEVICE_HISTORY_SIZE,
  DEFAULT_HALF_DAY_THRESHOLD_MINUTES,
} from '../services/attendance.service.js'

const INVALID_LINK = 'This punch link is no longer valid. Ask the shop owner for the new QR code.'
// Same message whether the code or the PIN is wrong (never reveal which codes exist)
const WRONG_CREDENTIALS = 'Wrong employee code or PIN'

// Compared against when the employee code doesn't exist, so both cases take the same time
let dummyHashPromise
const dummyHash = () => (dummyHashPromise ??= bcrypt.hash('not-a-real-pin', 10))

async function findBusinessByToken(businessToken) {
  const business = await Business.findOne({ punchToken: businessToken }).select('name attendanceSettings').lean()
  if (!business) throw new HttpError(404, INVALID_LINK, 'INVALID_PUNCH_LINK')
  return business
}

function lockedError(lockedUntil, now) {
  const minutes = Math.max(1, Math.ceil((lockedUntil - now) / 60000))
  return new HttpError(
    429,
    `Too many wrong attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    'PUNCH_LOCKED',
  )
}

function deviceFromRequest(req) {
  return { ip: req.ip || '', userAgent: (req.get('user-agent') || '').slice(0, 512) }
}

// Newest punch events for this employee, for the device-mismatch check
async function recentDevices(businessId, employeeId) {
  const records = await Attendance.find({ businessId, employeeId })
    .sort({ punchIn: -1 })
    .limit(DEVICE_HISTORY_SIZE)
    .select('punchIn punchOut punchInDevice punchOutDevice')
    .lean()
  return recentPunchDevices(records)
}

function employeeSummary(employee) {
  return { name: employee.name, employeeCode: employee.employeeCode }
}

// GET /punch/:businessToken — what the public page needs before punching
export async function getPunchInfo(req, res) {
  const business = await findBusinessByToken(req.params.businessToken)
  res.json({ businessName: business.name, serverTime: serverNow().toISOString() })
}

// POST /punch — public. Server decides IN or OUT using server time only.
export async function punch(req, res) {
  const now = serverNow()
  const { businessToken, employeeCode, pin, source } = req.body
  const business = await findBusinessByToken(businessToken)
  const businessId = business._id
  const halfDayThresholdMinutes =
    business.attendanceSettings?.halfDayThresholdMinutes ?? DEFAULT_HALF_DAY_THRESHOLD_MINUTES

  // 1. Lockout (checked before the PIN, so a locked code can't be brute-forced)
  const lockedUntil = await getActiveLock(businessId, employeeCode, now)
  if (lockedUntil) throw lockedError(lockedUntil, now)

  // 2. Verify code + PIN (same work and same answer whether or not the code exists)
  const employee = await Employee.findOne({ businessId, employeeCode }).select('+pinHash').lean()
  const pinOk = await verifyPin(pin, employee?.pinHash ?? (await dummyHash()))
  if (!employee || !pinOk) {
    const result = await recordFailedPin(businessId, employeeCode, now)
    if (result.lockedUntil) throw lockedError(result.lockedUntil, now)
    const left = result.attemptsLeft
    throw new HttpError(401, `${WRONG_CREDENTIALS}. ${left} attempt${left === 1 ? '' : 's'} left.`, 'WRONG_CREDENTIALS')
  }
  await clearFailedPins(businessId, employeeCode)

  // Only reachable with the correct PIN, so this reveals nothing to someone guessing
  if (!employee.isActive) {
    throw new HttpError(403, 'Your account is inactive. Please contact the shop owner.', 'EMPLOYEE_INACTIVE')
  }

  const device = deviceFromRequest(req)
  const who = employeeSummary(employee)

  // 3. Open record from the last MAX_OPEN_SHIFT_HOURS -> punch OUT (handles shifts past midnight)
  const open = await Attendance.findOne({
    businessId,
    employeeId: employee._id,
    punchOut: null,
    punchIn: { $gte: new Date(now.getTime() - MAX_OPEN_SHIFT_HOURS * 3600 * 1000) },
  })
    .sort({ punchIn: -1 })
    .lean()

  if (open) {
    // Accidental double tap right after punching in
    if (minutesSince(open.punchIn, now) < MIN_MINUTES_BEFORE_PUNCH_OUT) {
      return res.json({
        action: 'already_in',
        employee: who,
        punchIn: open.punchIn,
        message: `${employee.name}, you already punched IN at ${formatTimeIST(open.punchIn)}.`,
      })
    }

    const derived = deriveStatus({
      date: open.date,
      shift: open.shiftSnapshot,
      punchIn: open.punchIn,
      punchOut: now,
      manualStatus: open.manualStatus,
      halfDayThresholdMinutes,
      now,
    })
    const { workedMinutes } = derived
    const mismatch = isDeviceMismatch(device, await recentDevices(businessId, employee._id))
    const updated = await Attendance.findOneAndUpdate(
      { _id: open._id, businessId, punchOut: null },
      {
        $set: {
          punchOut: now,
          punchOutDevice: device,
          status: derived.status,
          lateMinutes: derived.lateMinutes,
          workedMinutes,
          overtimeMinutes: derived.overtimeMinutes,
        },
        ...(mismatch && { $addToSet: { flags: 'device_mismatch' } }),
      },
      { new: true },
    ).lean()

    if (!updated) {
      // A simultaneous request punched out first
      const done = await Attendance.findOne({ _id: open._id, businessId }).lean()
      return res.json(alreadyDone(employee, done))
    }
    return res.json({
      action: 'out',
      employee: who,
      date: updated.date,
      punchIn: updated.punchIn,
      punchOut: updated.punchOut,
      workedMinutes,
      message: `${employee.name}, punched OUT at ${formatTimeIST(now)}.`,
    })
  }

  // 4. No open record: punch IN for the shift's date, unless that day is already closed
  const shift = await Shift.findOne({ _id: employee.shiftId, businessId }).lean()
  if (!shift) throw new HttpError(409, 'Your shift is not set up yet. Please contact the shop owner.', 'NO_SHIFT')
  const date = resolveShiftDate(now, shift)

  const existing = await Attendance.findOne({ businessId, employeeId: employee._id, date }).lean()
  if (existing) return res.json(alreadyDone(employee, existing))

  const { status, lateMinutes } = deriveStatus({ date, shift, punchIn: now, halfDayThresholdMinutes, now })
  const mismatch = isDeviceMismatch(device, await recentDevices(businessId, employee._id))
  try {
    await Attendance.create({
      businessId,
      employeeId: employee._id,
      date,
      shiftId: shift._id,
      shiftSnapshot: {
        name: shift.name,
        startTime: shift.startTime,
        endTime: shift.endTime,
        graceMinutes: shift.graceMinutes,
        crossesMidnight: shift.crossesMidnight,
      },
      punchIn: now,
      punchInDevice: device,
      source,
      status,
      lateMinutes,
      flags: mismatch ? ['device_mismatch'] : [],
    })
  } catch (err) {
    // Two simultaneous punch-ins: the unique index lets only one through
    if (err.code !== 11000) throw err
    const winner = await Attendance.findOne({ businessId, employeeId: employee._id, date }).lean()
    return res.json({
      action: 'already_in',
      employee: who,
      punchIn: winner.punchIn,
      message: `${employee.name}, you already punched IN at ${formatTimeIST(winner.punchIn)}.`,
    })
  }

  res.status(201).json({
    action: 'in',
    employee: who,
    date,
    punchIn: now,
    lateMinutes,
    shiftName: shift.name,
    message: `${employee.name}, punched IN at ${formatTimeIST(now)}.`,
  })
}

function alreadyDone(employee, record) {
  return {
    action: 'already_done',
    employee: employeeSummary(employee),
    date: record.date,
    punchIn: record.punchIn,
    punchOut: record.punchOut,
    message: `${employee.name}, you already punched OUT${record.punchOut ? ` at ${formatTimeIST(record.punchOut)}` : ''}. See you next shift!`,
  }
}
