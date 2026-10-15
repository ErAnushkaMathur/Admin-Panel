import Employee from '../models/Employee.js'
import Attendance from '../models/Attendance.js'
import Leave from '../models/Leave.js'
import Payroll from '../models/Payroll.js'
import Business from '../models/Business.js'
import { now as serverNow } from '../utils/clock.js'
import { todayIST } from '../utils/time.js'
import { deriveDayStatus, DEFAULT_HALF_DAY_THRESHOLD_MINUTES } from '../services/attendance.service.js'
import {
  summarizeToday,
  summarizePeriod,
  departmentAttendance,
  periodRange,
  projectMonthlyPayPaise,
  salaryOverview,
  datesBetween,
} from '../services/dashboard.service.js'
import { loadSettings, calculateFor } from './payroll.controller.js'
import { loadTodayStatuses } from '../services/staffStats.service.js'

const STAFF_TABLE_SIZE = 8
const PAYMENTS_SIZE = 6

const groupByEmployee = (list) => {
  const map = new Map()
  for (const item of list) {
    const key = String(item.employeeId)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(item)
  }
  return map
}

// Shift shown next to a check-in: the one the punch was recorded against (SPEC 5, mockup bug 4)
const shiftOf = (record, employee) => {
  const s = record?.shiftSnapshot?.startTime ? record.shiftSnapshot : employee.shiftId
  return s ? { name: s.name, startTime: s.startTime, endTime: s.endTime } : null
}

// Owner-only salary widgets (managers see no salary numbers: SPEC sections 1 and 7)
async function salaryWidgets(businessId, employees, today, now) {
  const month = today.slice(0, 7)
  const estMonthlyPaymentPaise = employees.reduce((sum, e) => sum + projectMonthlyPayPaise(e.salary, e.shiftId, month), 0)

  // What the month costs so far: calculatePayroll on attendance up to today (nothing saved)
  const settings = await loadSettings(businessId, month, now)
  const results = await calculateFor(businessId, employees, settings, new Map())
  const overview = salaryOverview([...results.values()].map((r) => r.snapshot))

  // Upcoming payments: the latest month that has been finalized
  const latest = await Payroll.findOne({ businessId, status: { $in: ['finalized', 'paid'] } })
    .sort({ month: -1 })
    .select('month')
    .lean()
  let payments = null
  if (latest) {
    const rows = await Payroll.find({ businessId, month: latest.month, status: { $in: ['finalized', 'paid'] } }).lean()
    // Pending first, then by name
    rows.sort((a, b) => (a.status === b.status ? (a.employee?.name ?? '').localeCompare(b.employee?.name ?? '') : a.status === 'finalized' ? -1 : 1))
    const pending = rows.filter((r) => r.status === 'finalized')
    payments = {
      month: latest.month,
      pendingCount: pending.length,
      pendingPaise: pending.reduce((s, r) => s + r.snapshot.netPaise, 0),
      paidCount: rows.length - pending.length,
      paidPaise: rows.filter((r) => r.status === 'paid').reduce((s, r) => s + r.snapshot.netPaise, 0),
      total: rows.length,
      rows: rows.slice(0, PAYMENTS_SIZE).map((r) => ({
        _id: r._id,
        employee: { _id: r.employeeId, name: r.employee?.name, employeeCode: r.employee?.employeeCode },
        netPaise: r.snapshot.netPaise,
        status: r.status === 'paid' ? 'paid' : 'pending',
        paidDate: r.paidDate,
      })),
    }
  }
  return { estMonthlyPaymentPaise, salaryMonth: month, salaryOverview: overview, upcomingPayments: payments }
}

// GET /dashboard/summary?period=week|month|year — every number on the dashboard (golden rule 1)
export async function getSummary(req, res) {
  const { businessId, role } = req.user
  const period = req.query.period ?? 'month'
  const now = serverNow()
  const today = todayIST(now)
  const range = periodRange(period, today)

  const [business, employees] = await Promise.all([
    Business.findById(businessId).select('plan attendanceSettings').lean(),
    Employee.find({ businessId, isActive: true, joinDate: { $lte: today } })
      .sort({ name: 1 })
      .collation({ locale: 'en', strength: 2 })
      .populate({ path: 'departmentId', select: 'name color', match: { businessId } })
      .populate({ path: 'shiftId', select: 'name startTime endTime graceMinutes crossesMidnight', match: { businessId } })
      .lean(),
  ])
  const threshold = business?.attendanceSettings?.halfDayThresholdMinutes ?? DEFAULT_HALF_DAY_THRESHOLD_MINUTES
  const ids = employees.map((e) => e._id)
  const [records, leaves, pendingLeaveRequests] = await Promise.all([
    Attendance.find({ businessId, employeeId: { $in: ids }, date: { $gte: range.from, $lte: range.to } }).lean(),
    Leave.find({ businessId, employeeId: { $in: ids }, status: 'approved', fromDate: { $lte: range.to }, toDate: { $gte: range.from } }).lean(),
    Leave.countDocuments({ businessId, status: 'pending' }),
  ])
  const recordByKey = new Map(records.map((r) => [`${r.employeeId}|${r.date}`, r]))
  const leavesBy = groupByEmployee(leaves)

  const statusOf = (e, date) =>
    deriveDayStatus({
      date,
      record: recordByKey.get(`${e._id}|${date}`) ?? null,
      shift: e.shiftId,
      weeklyOff: e.salary?.weeklyOff ?? [],
      leaves: leavesBy.get(String(e._id)) ?? [],
      halfDayThresholdMinutes: threshold,
      now,
    })

  // Today: one row per active employee, from the loader the Departments page also uses
  const todayRows = (await loadTodayStatuses(businessId, today, now)).map(({ employee: e, department, record, status, lateMinutes }) => ({
    employee: { _id: e._id, name: e.name, employeeCode: e.employeeCode, roleTitle: e.roleTitle },
    department,
    status,
    lateMinutes,
    checkIn: record?.punchIn ?? null,
    checkOut: record?.punchOut ?? null,
    shift: shiftOf(record, e),
  }))
  const todaySummary = summarizeToday(todayRows.map((r) => r.status))

  // Donut: employee-days in the period, from each employee's join date
  const periodStatuses = []
  for (const e of employees) {
    for (const date of datesBetween(e.joinDate > range.from ? e.joinDate : range.from, range.to)) {
      periodStatuses.push(statusOf(e, date).status)
    }
  }

  // Staff table: who came in first (by check-in), then everyone else by name
  const staffRows = [...todayRows].sort((a, b) => {
    if (a.checkIn && b.checkIn) return new Date(a.checkIn) - new Date(b.checkIn)
    if (a.checkIn || b.checkIn) return a.checkIn ? -1 : 1
    return 0
  })

  res.json({
    today,
    generatedAt: now,
    kpis: {
      totalStaff: todaySummary.total,
      presentToday: todaySummary.cameIn,
      presentPercent: todaySummary.cameInPercent,
      lateToday: todaySummary.counts.late,
      absentToday: todaySummary.counts.absent,
      onLeaveToday: todaySummary.counts.on_leave,
      pendingLeaveRequests,
    },
    todayBreakdown: { counts: todaySummary.counts, total: todaySummary.total },
    attendanceOverview: { period, ...range, ...summarizePeriod(periodStatuses) },
    departments: departmentAttendance(todayRows),
    staff: { total: todayRows.length, rows: staffRows.slice(0, STAFF_TABLE_SIZE) },
    // null for managers (salary hidden at the API level)
    salary: role === 'owner' ? await salaryWidgets(businessId, employees, today, now) : null,
    showUpsell: (business?.plan ?? 'free') === 'free',
  })
}
