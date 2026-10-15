import mongoose from 'mongoose'
import Business from '../models/Business.js'
import Employee from '../models/Employee.js'
import Attendance from '../models/Attendance.js'
import Leave from '../models/Leave.js'
import { deriveDayStatus, DEFAULT_HALF_DAY_THRESHOLD_MINUTES } from './attendance.service.js'
import { CAME_IN } from './dashboard.service.js'
import { addDays } from '../utils/time.js'

// Staff counts for the Departments, Shifts and Dashboard pages.
// The plain counts read the employees collection directly; "present today" goes through deriveStatus.
const employees = () => mongoose.connection.collection('employees')

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id))

/**
 * Every day's status in [from, to] for each active employee, from the day they joined, via
 * deriveDayStatus -> deriveStatus (golden rule 10) with the same inputs the Attendance page uses:
 * the day's record (and its shift snapshot), approved leave, weekly off and the business half-day
 * threshold. Used by Departments, the Dashboard and Staff Analytics so their numbers always agree.
 * -> [{ employee, department, days: [{ date, record, status, lateMinutes, workedMinutes, overtimeMinutes }] }]
 *    sorted by name. A day without a shift (shouldn't happen: shift is required) is "not_yet_in".
 */
export async function loadStatusesForRange(businessId, from, to, now) {
  const [business, employees] = await Promise.all([
    Business.findById(businessId).select('attendanceSettings').lean(),
    Employee.find({ businessId, isActive: true, joinDate: { $lte: to } })
      .sort({ name: 1 })
      .collation({ locale: 'en', strength: 2 })
      .populate({ path: 'departmentId', select: 'name color', match: { businessId } })
      .populate({ path: 'shiftId', select: 'name startTime endTime graceMinutes crossesMidnight', match: { businessId } })
      .lean(),
  ])
  const ids = employees.map((e) => e._id)
  const [records, leaves] = await Promise.all([
    Attendance.find({ businessId, employeeId: { $in: ids }, date: { $gte: from, $lte: to } }).lean(),
    Leave.find({ businessId, employeeId: { $in: ids }, status: 'approved', fromDate: { $lte: to }, toDate: { $gte: from } }).lean(),
  ])
  const threshold = business?.attendanceSettings?.halfDayThresholdMinutes ?? DEFAULT_HALF_DAY_THRESHOLD_MINUTES
  const recordBy = new Map(records.map((r) => [`${r.employeeId}|${r.date}`, r]))
  const leavesBy = new Map()
  for (const l of leaves) {
    const key = String(l.employeeId)
    if (!leavesBy.has(key)) leavesBy.set(key, [])
    leavesBy.get(key).push(l)
  }

  return employees.map((e) => {
    const start = e.joinDate > from ? e.joinDate : from
    const days = []
    for (let date = start; date <= to; date = addDays(date, 1)) {
      const record = recordBy.get(`${e._id}|${date}`) ?? null
      const derived = deriveDayStatus({
        date,
        record,
        shift: e.shiftId,
        weeklyOff: e.salary?.weeklyOff ?? [],
        leaves: leavesBy.get(String(e._id)) ?? [],
        halfDayThresholdMinutes: threshold,
        now,
      })
      days.push({ date, record, ...derived, status: derived.status ?? 'not_yet_in' })
    }
    return {
      employee: e,
      department: e.departmentId ? { _id: e.departmentId._id, name: e.departmentId.name, color: e.departmentId.color } : null,
      days,
    }
  })
}

/**
 * Today's status for every active employee who has joined by `today` (loadStatusesForRange for one day).
 * Shared by the Dashboard and Departments so their "present today" numbers always agree.
 * -> [{ employee, department, shift, record, status, lateMinutes }] sorted by name
 */
export async function loadTodayStatuses(businessId, today, now) {
  const rows = await loadStatusesForRange(businessId, today, today, now)
  return rows.map(({ employee, department, days: [day] }) => ({
    employee,
    department,
    shift: employee.shiftId,
    record: day.record,
    status: day.status,
    lateMinutes: day.lateMinutes,
  }))
}

/**
 * { [departmentId]: { staffCount, staffToday, presentToday } } for the Departments page.
 * staffCount: all active employees (including someone joining later).
 * staffToday / presentToday: employed today / came in today (on time, late or half day), from
 * loadTodayStatuses, so they match the Dashboard's department bars and the Attendance page.
 */
export async function getDepartmentStaffStats(businessId, today, now) {
  const [counts, todayRows] = await Promise.all([
    employees()
      .aggregate([
        { $match: { businessId: toObjectId(businessId), isActive: true, departmentId: { $ne: null } } },
        { $group: { _id: '$departmentId', staffCount: { $sum: 1 } } },
      ])
      .toArray(),
    loadTodayStatuses(businessId, today, now),
  ])
  const stats = Object.fromEntries(counts.map((r) => [String(r._id), { staffCount: r.staffCount, staffToday: 0, presentToday: 0 }]))
  for (const { department, status } of todayRows) {
    const s = department && stats[String(department._id)]
    if (!s) continue
    s.staffToday += 1
    if (CAME_IN.includes(status)) s.presentToday += 1
  }
  return stats
}

// { [shiftId]: employeeCount } for active employees
export async function getShiftEmployeeCounts(businessId) {
  const rows = await employees()
    .aggregate([
      { $match: { businessId: toObjectId(businessId), isActive: true, shiftId: { $ne: null } } },
      { $group: { _id: '$shiftId', count: { $sum: 1 } } },
    ])
    .toArray()
  return Object.fromEntries(rows.map((r) => [String(r._id), r.count]))
}

export async function countActiveEmployeesInDepartment(businessId, departmentId) {
  return employees().countDocuments({
    businessId: toObjectId(businessId),
    departmentId: toObjectId(departmentId),
    isActive: true,
  })
}
