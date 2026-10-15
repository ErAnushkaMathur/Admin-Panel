import Payroll from '../models/Payroll.js'
import { now as serverNow } from '../utils/clock.js'
import { todayIST } from '../utils/time.js'
import { loadStatusesForRange } from '../services/staffStats.service.js'
import { summarizePeriod } from '../services/dashboard.service.js'
import {
  analyticsRange,
  attendanceTrend,
  lateRanking,
  overtimeByDepartment,
  absenteePatterns,
  payrollMonths,
  payrollTrend,
} from '../services/analytics.service.js'

// GET /analytics/attendance?range=30d|90d|12m — owners and managers (no money in here)
export async function attendanceAnalytics(req, res) {
  const { businessId } = req.user
  const now = serverNow()
  const window = analyticsRange(req.query.range, todayIST(now))
  // Load the previous window too, for "overtime vs previous period"
  const employees = await loadStatusesForRange(businessId, window.previousFrom, window.to, now)

  const statusesInWindow = employees.flatMap((e) => e.days.filter((d) => d.date >= window.from).map((d) => d.status))
  res.json({
    ...window,
    staff: employees.length,
    summary: summarizePeriod(statusesInWindow),
    trend: attendanceTrend(employees, window),
    lateRanking: lateRanking(employees, window),
    overtime: overtimeByDepartment(employees, window),
    absentees: absenteePatterns(employees, window),
  })
}

// GET /analytics/payroll?range=6m|12m — owner only (salary numbers)
export async function payrollAnalytics(req, res) {
  const { businessId } = req.user
  const months = payrollMonths(req.query.range, todayIST(serverNow()))
  const rows = await Payroll.find({ businessId, month: { $in: months } }).select('month status snapshot').lean()
  res.json({ range: req.query.range, ...payrollTrend(rows, months) })
}
