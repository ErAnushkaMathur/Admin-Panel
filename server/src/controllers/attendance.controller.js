import mongoose from 'mongoose'
import Attendance from '../models/Attendance.js'
import Business from '../models/Business.js'
import Employee from '../models/Employee.js'
import Shift from '../models/Shift.js'
import AuditLog from '../models/AuditLog.js'
import Leave from '../models/Leave.js'
import { HttpError } from '../utils/httpError.js'
import { now as serverNow } from '../utils/clock.js'
import { todayIST, addDays } from '../utils/time.js'
import {
  deriveStatus,
  deriveDayStatus,
  resolveEditedPunches,
  weekdayOf,
  STATUSES,
  DEFAULT_HALF_DAY_THRESHOLD_MINUTES,
} from '../services/attendance.service.js'
import { leaveCoversDate } from '../services/leave.service.js'
import { EXCEPTION_FLAGS } from '../validators/attendance.schemas.js'

// Counted in the monthly totals (not_yet_in is only a live state)
const TOTAL_KEYS = ['present', 'late', 'half_day', 'absent', 'on_leave', 'weekly_off']

async function halfDayThreshold(businessId) {
  const business = await Business.findById(businessId).select('attendanceSettings').lean()
  return business?.attendanceSettings?.halfDayThresholdMinutes ?? DEFAULT_HALF_DAY_THRESHOLD_MINUTES
}

// Active employees plus anyone with a record in `recordEmployeeIds` (e.g. deactivated since)
async function loadEmployees(businessId, { departmentId, recordEmployeeIds = [] }) {
  const filter = { businessId, $or: [{ isActive: true }, { _id: { $in: recordEmployeeIds } }] }
  if (departmentId) filter.departmentId = departmentId
  return Employee.find(filter)
    .sort({ name: 1 })
    .collation({ locale: 'en', strength: 2 })
    .populate({ path: 'departmentId', select: 'name color', match: { businessId } })
    .populate({ path: 'shiftId', select: 'name startTime endTime graceMinutes crossesMidnight', match: { businessId } })
    .lean()
}

// What the attendance screens show about an employee (never salary)
function employeeSummary(e) {
  return {
    _id: e._id,
    name: e.name,
    employeeCode: e.employeeCode,
    roleTitle: e.roleTitle,
    isActive: e.isActive,
    department: e.departmentId ? { _id: e.departmentId._id, name: e.departmentId.name, color: e.departmentId.color } : null,
    shift: e.shiftId
      ? { name: e.shiftId.name, startTime: e.shiftId.startTime, endTime: e.shiftId.endTime, crossesMidnight: e.shiftId.crossesMidnight }
      : null,
  }
}

function isWeeklyOff(employee, date) {
  return (employee.salary?.weeklyOff ?? []).includes(weekdayOf(date))
}

// Approved leaves overlapping [fromDate, toDate], grouped by employee id
async function approvedLeavesByEmployee(businessId, fromDate, toDate) {
  const leaves = await Leave.find({ businessId, status: 'approved', fromDate: { $lte: toDate }, toDate: { $gte: fromDate } })
    .select('employeeId fromDate toDate status')
    .lean()
  const byEmployee = new Map()
  for (const l of leaves) {
    const key = String(l.employeeId)
    if (!byEmployee.has(key)) byEmployee.set(key, [])
    byEmployee.get(key).push(l)
  }
  return byEmployee
}

async function hasApprovedLeave(businessId, employeeId, date) {
  return Boolean(await Leave.exists({ businessId, employeeId, status: 'approved', fromDate: { $lte: date }, toDate: { $gte: date } }))
}

// Status for one employee on one date, with or without an attendance record
// (same helper payroll uses, so both always agree)
function statusFor(employee, date, record, threshold, now, leaves = []) {
  return deriveDayStatus({
    date,
    record,
    shift: employee.shiftId,
    weeklyOff: employee.salary?.weeklyOff ?? [],
    leaves,
    halfDayThresholdMinutes: threshold,
    now,
  })
}

// GET /attendance?date=&departmentId=&status= — one row per employee for the day, statuses derived live
export async function listAttendance(req, res) {
  const { businessId } = req.user
  const now = serverNow()
  const date = req.query.date ?? todayIST(now)

  const [records, threshold, leavesByEmployee] = await Promise.all([
    Attendance.find({ businessId, date }).lean(),
    halfDayThreshold(businessId),
    approvedLeavesByEmployee(businessId, date, date),
  ])
  const recordByEmployee = new Map(records.map((r) => [String(r.employeeId), r]))
  const employees = await loadEmployees(businessId, {
    departmentId: req.query.departmentId,
    recordEmployeeIds: records.map((r) => r.employeeId),
  })

  const rows = employees
    // Not employed yet on this date (unless they somehow have a record)
    .filter((e) => e.joinDate <= date || recordByEmployee.has(String(e._id)))
    .map((e) => {
      const record = recordByEmployee.get(String(e._id)) ?? null
      const derived = statusFor(e, date, record, threshold, now, leavesByEmployee.get(String(e._id)))
      return {
        employee: employeeSummary(e),
        attendanceId: record?._id ?? null,
        date,
        ...derived,
        punchIn: record?.punchIn ?? null,
        punchOut: record?.punchOut ?? null,
        flags: record?.flags ?? [],
        manualStatus: record?.manualStatus ?? null,
        editReason: record?.editReason ?? null,
        source: record?.source ?? null,
      }
    })

  // Backend computes every number (golden rule 1)
  const summary = Object.fromEntries(STATUSES.map((s) => [s, 0]))
  for (const r of rows) if (r.status) summary[r.status] += 1
  summary.total = rows.length

  res.json({
    date,
    summary,
    rows: req.query.status ? rows.filter((r) => r.status === req.query.status) : rows,
  })
}

function daysOfMonth(month) {
  const [y, m] = month.split('-').map(Number)
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
}

// GET /attendance/monthly?month=YYYY-MM&departmentId= — employee × day grid with per-employee totals
export async function monthlyAttendance(req, res) {
  const { businessId } = req.user
  const now = serverNow()
  const today = todayIST(now)
  const month = req.query.month ?? today.slice(0, 7)
  const days = daysOfMonth(month)

  const [records, threshold, leavesByEmployee] = await Promise.all([
    Attendance.find({ businessId, date: { $gte: days[0], $lte: days.at(-1) } }).lean(),
    halfDayThreshold(businessId),
    approvedLeavesByEmployee(businessId, days[0], days.at(-1)),
  ])
  const recordByKey = new Map(records.map((r) => [`${r.employeeId}|${r.date}`, r]))
  const employees = await loadEmployees(businessId, {
    departmentId: req.query.departmentId,
    recordEmployeeIds: [...new Set(records.map((r) => String(r.employeeId)))],
  })

  const rows = employees
    .filter((e) => e.joinDate <= days.at(-1))
    .map((e) => {
      const totals = Object.fromEntries(TOTAL_KEYS.map((k) => [k, 0]))
      const leaves = leavesByEmployee.get(String(e._id)) ?? []
      const cells = days.map((date) => {
        const record = recordByKey.get(`${e._id}|${date}`) ?? null
        // Before joining: no status. Future days show only planned (approved) leave.
        if (!record && date < e.joinDate) return null
        if (!record && date > today && !leaveCoversDate(leaves, date)) return null
        const { status, lateMinutes } = statusFor(e, date, record, threshold, now, leaves)
        if (status in totals) totals[status] += 1
        return {
          status,
          lateMinutes,
          attendanceId: record?._id ?? null,
          flags: record?.flags ?? [],
        }
      })
      return { employee: employeeSummary(e), days: cells, totals }
    })

  res.json({ month, days, today, employees: rows })
}

// GET /attendance/exceptions?from=&to=&type= — flagged records, newest first
export async function listExceptions(req, res) {
  const { businessId } = req.user
  const today = todayIST(serverNow())
  const to = req.query.to ?? today
  const from = req.query.from ?? addDays(to, -30)

  const records = await Attendance.find({
    businessId,
    date: { $gte: from, $lte: to },
    flags: req.query.type ?? { $in: EXCEPTION_FLAGS },
  })
    .sort({ date: -1, punchIn: -1 })
    .limit(300)
    .populate({
      path: 'employeeId',
      select: 'name employeeCode roleTitle isActive departmentId',
      match: { businessId },
      populate: { path: 'departmentId', select: 'name color', match: { businessId } },
    })
    .populate({ path: 'editedBy', select: 'name' })
    .lean()

  res.json({
    from,
    to,
    rows: records
      .filter((r) => r.employeeId)
      .map((r) => ({
        attendanceId: r._id,
        date: r.date,
        employee: {
          _id: r.employeeId._id,
          name: r.employeeId.name,
          employeeCode: r.employeeId.employeeCode,
          roleTitle: r.employeeId.roleTitle,
          department: r.employeeId.departmentId ? { name: r.employeeId.departmentId.name, color: r.employeeId.departmentId.color } : null,
        },
        shift: r.shiftSnapshot,
        punchIn: r.punchIn,
        punchOut: r.punchOut,
        status: r.status,
        manualStatus: r.manualStatus,
        flags: r.flags,
        editReason: r.editReason,
        editedBy: r.editedBy ? { name: r.editedBy.name } : null,
        punchInDevice: r.punchInDevice,
        punchOutDevice: r.punchOutDevice,
        updatedAt: r.updatedAt,
      })),
  })
}

const auditSnapshot = (r) => ({
  punchIn: r.punchIn ? new Date(r.punchIn).toISOString() : null,
  punchOut: r.punchOut ? new Date(r.punchOut).toISOString() : null,
  status: r.status ?? null,
  manualStatus: r.manualStatus ?? null,
})

function assertValidPunches(punchIn, punchOut, manualStatus) {
  if (punchOut && !punchIn) {
    throw new HttpError(400, 'Validation failed', undefined, [{ field: 'punchIn', message: 'Enter the punch-in time too' }])
  }
  if (!punchIn && !manualStatus) {
    throw new HttpError(400, 'Validation failed', undefined, [
      { field: 'punchIn', message: 'Enter a punch-in time or pick a status' },
    ])
  }
}

async function saveWithAudit(doc, audit) {
  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      await doc.save({ session })
      await AuditLog.create([{ ...audit, entityId: doc._id }], { session })
    })
  } finally {
    await session.endSession()
  }
}

// PATCH /attendance/:id — manual correction. Reason is mandatory and every edit is audit-logged.
export async function updateAttendance(req, res) {
  const { businessId, id: actorId } = req.user
  const { reason, ...changes } = req.body
  const now = serverNow()

  const record = await Attendance.findOne({ _id: req.params.id, businessId })
  if (!record) throw new HttpError(404, 'Attendance record not found')
  const employee = await Employee.findOne({ _id: record.employeeId, businessId }).select('salary.weeklyOff').lean()

  const before = auditSnapshot(record)
  const { punchIn, punchOut } = resolveEditedPunches(record.date, record.shiftSnapshot, {
    punchInTime: changes.punchIn,
    punchOutTime: changes.punchOut,
    currentPunchIn: record.punchIn,
    currentPunchOut: record.punchOut,
  })
  const manualStatus = 'status' in changes ? changes.status : record.manualStatus
  assertValidPunches(punchIn, punchOut, manualStatus)

  const derived = deriveStatus({
    date: record.date,
    shift: record.shiftSnapshot,
    punchIn,
    punchOut,
    manualStatus,
    onApprovedLeave: await hasApprovedLeave(businessId, record.employeeId, record.date),
    isWeeklyOff: isWeeklyOff(employee ?? {}, record.date),
    halfDayThresholdMinutes: await halfDayThreshold(businessId),
    now,
  })

  record.set({
    punchIn,
    punchOut,
    manualStatus,
    status: derived.status === 'not_yet_in' ? null : derived.status,
    lateMinutes: derived.lateMinutes,
    workedMinutes: derived.workedMinutes,
    overtimeMinutes: derived.overtimeMinutes,
    editedBy: actorId,
    editReason: reason,
  })
  const after = auditSnapshot(record)
  if (JSON.stringify(before) === JSON.stringify(after)) throw new HttpError(400, 'Nothing changed')

  const flags = new Set(record.flags)
  flags.add('manual_edit')
  // Adding the missing punch-out resolves the exception (the manual_edit flag keeps the trail)
  if (punchOut) flags.delete('missing_checkout')
  record.flags = [...flags]

  await saveWithAudit(record, {
    businessId,
    actorId,
    action: 'attendance.manual_edit',
    entity: 'Attendance',
    before,
    after,
    reason,
  })
  res.json({ attendance: record.toJSON() })
}

// POST /attendance/manual — create a record for a day with no punch
export async function createManualAttendance(req, res) {
  const { businessId, id: actorId } = req.user
  const { employeeId, date, reason, status: manualStatus = null } = req.body
  const now = serverNow()

  if (date > todayIST(now)) {
    throw new HttpError(400, 'Validation failed', undefined, [{ field: 'date', message: "Can't add attendance for a future date" }])
  }
  const employee = await Employee.findOne({ _id: employeeId, businessId }).lean()
  if (!employee) throw new HttpError(404, 'Employee not found')
  const shift = await Shift.findOne({ _id: employee.shiftId, businessId }).lean()
  if (!shift) throw new HttpError(409, 'This employee has no shift set up', 'NO_SHIFT')

  const { punchIn, punchOut } = resolveEditedPunches(date, shift, { punchInTime: req.body.punchIn, punchOutTime: req.body.punchOut })
  const derived = deriveStatus({
    date,
    shift,
    punchIn,
    punchOut,
    manualStatus,
    onApprovedLeave: await hasApprovedLeave(businessId, employee._id, date),
    isWeeklyOff: isWeeklyOff(employee, date),
    halfDayThresholdMinutes: await halfDayThreshold(businessId),
    now,
  })

  const record = new Attendance({
    businessId,
    employeeId,
    date,
    shiftId: shift._id,
    shiftSnapshot: {
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      graceMinutes: shift.graceMinutes,
      crossesMidnight: shift.crossesMidnight,
    },
    punchIn,
    punchOut,
    source: 'manual',
    manualStatus,
    status: derived.status === 'not_yet_in' ? null : derived.status,
    lateMinutes: derived.lateMinutes,
    workedMinutes: derived.workedMinutes,
    overtimeMinutes: derived.overtimeMinutes,
    flags: ['manual_edit'],
    editedBy: actorId,
    editReason: reason,
  })

  try {
    await saveWithAudit(record, {
      businessId,
      actorId,
      action: 'attendance.manual_create',
      entity: 'Attendance',
      before: null,
      after: auditSnapshot(record),
      reason,
    })
  } catch (err) {
    if (err.code === 11000) {
      throw new HttpError(409, 'Attendance for this day already exists. Edit that record instead.', 'ATTENDANCE_EXISTS')
    }
    throw err
  }
  res.status(201).json({ attendance: record.toJSON() })
}
