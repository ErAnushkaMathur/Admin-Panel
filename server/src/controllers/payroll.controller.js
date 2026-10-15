import Payroll from '../models/Payroll.js'
import Employee from '../models/Employee.js'
import Attendance from '../models/Attendance.js'
import Leave from '../models/Leave.js'
import Business from '../models/Business.js'
import { HttpError } from '../utils/httpError.js'
import { now as serverNow } from '../utils/clock.js'
import { todayIST, addDays } from '../utils/time.js'
import { DEFAULT_HALF_DAY_THRESHOLD_MINUTES } from '../services/attendance.service.js'
import { calculatePayroll, daysOfMonth, DEFAULT_PAYROLL_SETTINGS, PAYROLL_STATUSES } from '../services/payroll.service.js'
import { inTransaction, recordAudit } from '../services/auditTrail.service.js'

const MONEY_KEYS = ['basePaise', 'overtimePaise', 'deductionsPaise', 'bonusPaise', 'advancePaise', 'netPaise']

const monthBounds = (month) => {
  const days = daysOfMonth(month)
  return { first: days[0], last: days.at(-1) }
}
// The month has fully ended in IST (finalizing earlier would lock in a partial month)
const monthIsOver = (month, today) => monthBounds(month).last < today

function assertNotFuture(month, today) {
  if (monthBounds(month).first > today) {
    throw new HttpError(400, 'Validation failed', undefined, [{ field: 'month', message: "Payroll can't be calculated for a future month" }])
  }
}

export async function loadSettings(businessId, month, now) {
  const business = await Business.findById(businessId).select('attendanceSettings payrollSettings').lean()
  const p = business?.payrollSettings ?? {}
  return {
    month,
    now,
    halfDayThresholdMinutes: business?.attendanceSettings?.halfDayThresholdMinutes ?? DEFAULT_HALF_DAY_THRESHOLD_MINUTES,
    workingDaysPolicy: p.workingDaysPolicy ?? DEFAULT_PAYROLL_SETTINGS.workingDaysPolicy,
    overtimeEnabled: p.overtimeEnabled ?? DEFAULT_PAYROLL_SETTINGS.overtimeEnabled,
    lateRule: p.lateRuleEnabled ? { every: p.lateRuleEvery ?? 3 } : null,
  }
}

export const employeeQuery = (filter) =>
  Employee.find(filter)
    .populate({ path: 'departmentId', select: 'name', match: { businessId: filter.businessId } })
    .populate({ path: 'shiftId', select: 'startTime endTime graceMinutes crossesMidnight', match: { businessId: filter.businessId } })
    .lean()

/**
 * Runs calculatePayroll for `employees` from this month's attendance and approved leaves.
 * -> Map(employeeId -> { snapshot, employee }) where `employee` is the payslip header.
 */
export async function calculateFor(businessId, employees, settings, adjustmentsByEmployee) {
  const { first, last } = monthBounds(settings.month)
  const ids = employees.map((e) => e._id)
  const [records, leaves] = await Promise.all([
    Attendance.find({ businessId, employeeId: { $in: ids }, date: { $gte: first, $lte: last } }).lean(),
    Leave.find({ businessId, employeeId: { $in: ids }, status: 'approved', fromDate: { $lte: last }, toDate: { $gte: first } }).lean(),
  ])
  const group = (list) => {
    const map = new Map()
    for (const item of list) {
      const key = String(item.employeeId)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(item)
    }
    return map
  }
  const recordsBy = group(records)
  const leavesBy = group(leaves)

  const results = new Map()
  for (const e of employees) {
    const key = String(e._id)
    const { snapshot } = calculatePayroll(
      { joinDate: e.joinDate, shift: e.shiftId, salary: e.salary },
      recordsBy.get(key) ?? [],
      leavesBy.get(key) ?? [],
      settings,
      adjustmentsByEmployee.get(key) ?? {},
    )
    results.set(key, {
      snapshot,
      employee: { name: e.name, employeeCode: e.employeeCode, roleTitle: e.roleTitle, departmentName: e.departmentId?.name ?? null },
    })
  }
  return results
}

/**
 * Recalculates every DRAFT row of the month and creates rows for employees who don't have one yet.
 * Finalized and paid rows are never touched (golden rule 5).
 * Who is paid: employees who joined by month end and are active, worked that month, or already have a row.
 */
async function recalculateMonth(businessId, month, now) {
  const { first, last } = monthBounds(month)
  const settings = await loadSettings(businessId, month, now)
  const existing = await Payroll.find({ businessId, month }).lean()
  const existingBy = new Map(existing.map((p) => [String(p.employeeId), p]))
  const workedIds = await Attendance.find({ businessId, date: { $gte: first, $lte: last } }).distinct('employeeId')

  const employees = await employeeQuery({
    businessId,
    joinDate: { $lte: last },
    $or: [{ isActive: true }, { _id: { $in: [...workedIds, ...existing.map((p) => p.employeeId)] } }],
  })
  const toCalculate = employees.filter((e) => (existingBy.get(String(e._id))?.status ?? 'draft') === 'draft')
  const adjustments = new Map(existing.map((p) => [String(p.employeeId), { bonusPaise: p.bonusPaise, advancePaise: p.advancePaise }]))
  const results = await calculateFor(businessId, toCalculate, settings, adjustments)

  for (const e of toCalculate) {
    const { snapshot, employee } = results.get(String(e._id))
    const row = existingBy.get(String(e._id))
    if (row) {
      // Only while still draft: a parallel finalize wins
      await Payroll.updateOne({ businessId, _id: row._id, status: 'draft' }, { $set: { snapshot, employee, calculatedAt: now } })
    } else {
      try {
        await Payroll.create({ businessId, employeeId: e._id, month, snapshot, employee, calculatedAt: now })
      } catch (err) {
        if (err.code !== 11000) throw err // created by a parallel recalculation: fine
      }
    }
  }
}

function rowOf(p) {
  return {
    _id: p._id,
    employeeId: p.employeeId,
    month: p.month,
    status: p.status,
    employee: p.employee,
    snapshot: p.snapshot,
    bonusPaise: p.bonusPaise,
    advancePaise: p.advancePaise,
    calculatedAt: p.calculatedAt,
    finalizedAt: p.finalizedAt,
    paidDate: p.paidDate,
    revisionCount: p.revisions?.length ?? 0,
  }
}

// The month's rows with totals; the backend computes every number (golden rule 1)
async function monthView(businessId, month, today) {
  const rows = await Payroll.find({ businessId, month }).lean()
  rows.sort((a, b) => (a.employee?.name ?? '').localeCompare(b.employee?.name ?? '', 'en', { sensitivity: 'base' }))

  const totals = Object.fromEntries(MONEY_KEYS.map((k) => [k, 0]))
  const statusCounts = Object.fromEntries(PAYROLL_STATUSES.map((s) => [s, 0]))
  for (const r of rows) {
    for (const k of MONEY_KEYS) totals[k] += r.snapshot[k] ?? 0
    statusCounts[r.status] += 1
  }
  const { first } = monthBounds(month)
  return {
    month,
    today,
    isFuture: first > today,
    isOver: monthIsOver(month, today),
    rows: rows.map(rowOf),
    totals,
    statusCounts,
  }
}

// GET /payroll?month=YYYY-MM
export async function listPayroll(req, res) {
  const today = todayIST(serverNow())
  const month = req.query.month ?? today.slice(0, 7)
  res.json(await monthView(req.user.businessId, month, today))
}

// POST /payroll/calculate { month } — (re)calculate the month's draft rows
export async function calculateMonth(req, res) {
  const { businessId } = req.user
  const now = serverNow()
  const today = todayIST(now)
  assertNotFuture(req.body.month, today)
  await recalculateMonth(businessId, req.body.month, now)
  res.json(await monthView(businessId, req.body.month, today))
}

async function loadRow(businessId, id) {
  const row = await Payroll.findOne({ _id: id, businessId })
  if (!row) throw new HttpError(404, 'Payroll entry not found')
  return row
}

// PATCH /payroll/:id/adjustments { bonusPaise?, advancePaise?, reason? } — draft only, recalculated at once
export async function updateAdjustments(req, res) {
  const { businessId, id: actorId } = req.user
  const now = serverNow()
  const row = await loadRow(businessId, req.params.id)
  if (row.status !== 'draft') throw new HttpError(409, 'This month is finalized. Reopen it to change bonus or advance.', 'PAYROLL_LOCKED')

  const before = { bonusPaise: row.bonusPaise, advancePaise: row.advancePaise }
  const after = {
    bonusPaise: req.body.bonusPaise ?? row.bonusPaise,
    advancePaise: req.body.advancePaise ?? row.advancePaise,
  }
  if (before.bonusPaise === after.bonusPaise && before.advancePaise === after.advancePaise) throw new HttpError(400, 'Nothing changed')

  const [employee] = await employeeQuery({ businessId, _id: row.employeeId })
  if (!employee) throw new HttpError(404, 'Employee not found')
  const settings = await loadSettings(businessId, row.month, now)
  const { snapshot, employee: header } = (await calculateFor(businessId, [employee], settings, new Map([[String(employee._id), after]]))).get(
    String(employee._id),
  )
  row.set({ ...after, snapshot, employee: header, calculatedAt: now })

  await inTransaction(async (session) => {
    await row.save({ session })
    await recordAudit(session, {
      businessId,
      actorId,
      action: 'payroll.adjust',
      entity: 'Payroll',
      entityId: row._id,
      before,
      after,
      reason: req.body.reason || undefined,
    })
  })
  res.json({ payroll: rowOf(row.toObject()) })
}

const moneyOf = (snapshot) => Object.fromEntries(MONEY_KEYS.map((k) => [k, snapshot[k]]))

// POST /payroll/finalize { month } — recalculates drafts one last time, then locks them
export async function finalizeMonth(req, res) {
  const { businessId, id: actorId } = req.user
  const { month } = req.body
  const now = serverNow()
  const today = todayIST(now)
  assertNotFuture(month, today)
  if (!monthIsOver(month, today)) {
    throw new HttpError(409, `${month} isn't over yet. Finalize it from ${addDays(monthBounds(month).last, 1)}.`, 'MONTH_NOT_OVER')
  }

  await recalculateMonth(businessId, month, now)
  await inTransaction(async (session) => {
    const drafts = await Payroll.find({ businessId, month, status: 'draft' }).session(session)
    if (drafts.length === 0) throw new HttpError(409, 'Nothing to finalize: every row is already finalized or paid', 'NOTHING_TO_FINALIZE')
    for (const row of drafts) {
      row.set({ status: 'finalized', finalizedAt: now, finalizedBy: actorId })
      await row.save({ session })
    }
    await recordAudit(
      session,
      drafts.map((row) => ({
        businessId,
        actorId,
        action: 'payroll.finalize',
        entity: 'Payroll',
        entityId: row._id,
        before: { status: 'draft' },
        after: { status: 'finalized', ...moneyOf(row.snapshot) },
      })),
    )
  })
  res.json(await monthView(businessId, month, today))
}

// POST /payroll/reopen { month, reason } — owner only. Finalized rows go back to draft; the finalized
// snapshot is kept in `revisions`. Paid rows stay paid (the money has been handed over).
export async function reopenMonth(req, res) {
  const { businessId, id: actorId } = req.user
  const { month, reason } = req.body
  const now = serverNow()

  await inTransaction(async (session) => {
    const finalized = await Payroll.find({ businessId, month, status: 'finalized' }).session(session)
    if (finalized.length === 0) throw new HttpError(409, 'Nothing to reopen: no finalized, unpaid rows this month', 'NOTHING_TO_REOPEN')
    for (const row of finalized) {
      row.revisions.push({
        snapshot: row.snapshot,
        finalizedAt: row.finalizedAt,
        finalizedBy: row.finalizedBy,
        reopenedAt: now,
        reopenedBy: actorId,
        reopenReason: reason,
      })
      row.set({ status: 'draft', finalizedAt: null, finalizedBy: null })
      await row.save({ session })
    }
    await recordAudit(
      session,
      finalized.map((row) => ({
        businessId,
        actorId,
        action: 'payroll.reopen',
        entity: 'Payroll',
        entityId: row._id,
        before: { status: 'finalized', netPaise: row.snapshot.netPaise },
        after: { status: 'draft', netPaise: row.snapshot.netPaise },
        reason,
      })),
    )
  })
  res.json(await monthView(businessId, month, todayIST(now)))
}

// PATCH /payroll/:id/paid { paidDate? } — finalized rows only; paidDate defaults to today (IST)
export async function markPaid(req, res) {
  const { businessId, id: actorId } = req.user
  const today = todayIST(serverNow())
  const paidDate = req.body.paidDate ?? today
  if (paidDate > today) {
    throw new HttpError(400, 'Validation failed', undefined, [{ field: 'paidDate', message: "Paid date can't be in the future" }])
  }
  const row = await loadRow(businessId, req.params.id)
  if (row.status === 'draft') throw new HttpError(409, 'Finalize the month before marking salary as paid', 'NOT_FINALIZED')
  if (row.status === 'paid') throw new HttpError(409, 'Already marked as paid', 'ALREADY_PAID')

  row.set({ status: 'paid', paidDate, paidBy: actorId })
  await inTransaction(async (session) => {
    await row.save({ session })
    await recordAudit(session, {
      businessId,
      actorId,
      action: 'payroll.mark_paid',
      entity: 'Payroll',
      entityId: row._id,
      before: { status: 'finalized', paidDate: null },
      after: { status: 'paid', paidDate, netPaise: row.snapshot.netPaise },
    })
  })
  res.json({ payroll: rowOf(row.toObject()) })
}

// GET /payroll/:id/payslip — everything the printable payslip shows, from the stored snapshot
export async function getPayslip(req, res) {
  const { businessId } = req.user
  const row = await Payroll.findOne({ _id: req.params.id, businessId }).lean()
  if (!row) throw new HttpError(404, 'Payroll entry not found')
  const business = await Business.findById(businessId).select('name').lean()
  res.json({ business: { name: business?.name ?? '' }, payroll: rowOf(row) })
}
