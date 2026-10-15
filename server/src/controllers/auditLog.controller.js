import AuditLog from '../models/AuditLog.js'
import Attendance from '../models/Attendance.js'
import Employee from '../models/Employee.js'
import Leave from '../models/Leave.js'
import Payroll from '../models/Payroll.js'
import Department from '../models/Department.js'
import Shift from '../models/Shift.js'
import Business from '../models/Business.js'
import User from '../models/User.js'
import { istToUtc, addDays } from '../utils/time.js'
import { AUDIT_ACTIONS, actionLabel, diffChanges } from '../services/auditLog.service.js'

const ids = (list) => [...new Set(list.filter(Boolean).map(String))]
const idsOfEntity = (entries, entity) => ids(entries.filter((e) => e.entity === entity).map((e) => e.entityId))

// GET /audit-logs?from=&to=&employeeId=&type=&page=&limit= — owner only, newest first
export async function listAuditLogs(req, res) {
  const { businessId } = req.user
  const { from, to, employeeId, type, page, limit } = req.query

  const filter = { businessId }
  if (type) filter.action = type
  // Date range is in IST calendar days, inclusive
  if (from || to) {
    filter.at = {}
    if (from) filter.at.$gte = istToUtc(from)
    if (to) filter.at.$lt = istToUtc(addDays(to, 1))
  }
  if (employeeId) {
    // Attendance and leave entries point at their own record; map the employee to those records
    const [attendanceIds, leaveIds, payrollIds] = await Promise.all([
      Attendance.find({ businessId, employeeId }).distinct('_id'),
      Leave.find({ businessId, employeeId }).distinct('_id'),
      Payroll.find({ businessId, employeeId }).distinct('_id'),
    ])
    filter.$or = [
      { entity: 'Employee', entityId: employeeId },
      { entity: 'Attendance', entityId: { $in: attendanceIds } },
      { entity: 'Leave', entityId: { $in: leaveIds } },
      { entity: 'Payroll', entityId: { $in: payrollIds } },
    ]
  }

  const [total, entries] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter)
      .sort({ at: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ])

  // Resolve who did it, which employee it concerns, and which day(s)
  const [attendance, leaves, payrolls, departments, shifts, business, accounts] = await Promise.all([
    Attendance.find({ businessId, _id: { $in: idsOfEntity(entries, 'Attendance') } })
      .select('employeeId date')
      .lean(),
    Leave.find({ businessId, _id: { $in: idsOfEntity(entries, 'Leave') } })
      .select('employeeId fromDate toDate type')
      .lean(),
    Payroll.find({ businessId, _id: { $in: idsOfEntity(entries, 'Payroll') } })
      .select('employeeId month')
      .lean(),
    Department.find({ businessId, _id: { $in: idsOfEntity(entries, 'Department') } })
      .select('name')
      .lean(),
    Shift.find({ businessId, _id: { $in: idsOfEntity(entries, 'Shift') } })
      .select('name')
      .lean(),
    entries.some((e) => e.entity === 'Business') ? Business.findById(businessId).select('name').lean() : null,
    User.find({ businessId, _id: { $in: idsOfEntity(entries, 'User') } })
      .select('name')
      .lean(),
  ])
  const attendanceById = new Map(attendance.map((a) => [String(a._id), a]))
  const leaveById = new Map(leaves.map((l) => [String(l._id), l]))
  const payrollById = new Map(payrolls.map((p) => [String(p._id), p]))
  const nameById = new Map([...departments, ...shifts].map((d) => [String(d._id), d.name]))

  // What a non-employee entry is about (department, shift, or the shop itself)
  const targetOf = (e) => {
    if (e.entity === 'Department' || e.entity === 'Shift') {
      const name = nameById.get(String(e.entityId))
      return name ? { kind: e.entity.toLowerCase(), name } : null
    }
    if (e.entity === 'User') {
      const account = accounts.find((u) => String(u._id) === String(e.entityId))
      return account ? { kind: 'user', name: account.name } : null
    }
    if (e.entity === 'Business' && business && String(e.entityId) === String(business._id)) {
      return { kind: 'business', name: business.name }
    }
    return null
  }

  const employeeIdOf = (e) => {
    if (e.entity === 'Employee') return e.entityId
    if (e.entity === 'Attendance') return attendanceById.get(String(e.entityId))?.employeeId
    if (e.entity === 'Leave') return leaveById.get(String(e.entityId))?.employeeId
    if (e.entity === 'Payroll') return payrollById.get(String(e.entityId))?.employeeId
    return null
  }
  const [employees, actors] = await Promise.all([
    Employee.find({ businessId, _id: { $in: ids(entries.map(employeeIdOf)) } })
      .select('name employeeCode')
      .lean(),
    // Only users of this business can appear, even if an id were somehow foreign
    User.find({ businessId, _id: { $in: ids(entries.map((e) => e.actorId)) } })
      .select('name role')
      .lean(),
  ])
  const employeeById = new Map(employees.map((e) => [String(e._id), e]))
  const actorById = new Map(actors.map((u) => [String(u._id), u]))

  const rows = entries.map((e) => {
    const emp = employeeById.get(String(employeeIdOf(e)))
    const actor = actorById.get(String(e.actorId))
    const leave = e.entity === 'Leave' ? leaveById.get(String(e.entityId)) : null
    return {
      _id: e._id,
      at: e.at,
      action: e.action,
      actionLabel: actionLabel(e.action),
      category: AUDIT_ACTIONS[e.action]?.category ?? 'other',
      entity: e.entity,
      entityId: e.entityId,
      actor: actor ? { _id: actor._id, name: actor.name, role: actor.role } : null,
      employee: emp ? { _id: emp._id, name: emp.name, employeeCode: emp.employeeCode } : null,
      target: targetOf(e),
      attendanceDate: e.entity === 'Attendance' ? (attendanceById.get(String(e.entityId))?.date ?? null) : null,
      leave: leave ? { fromDate: leave.fromDate, toDate: leave.toDate, type: leave.type } : null,
      payrollMonth: e.entity === 'Payroll' ? (payrollById.get(String(e.entityId))?.month ?? null) : null,
      reason: e.reason ?? null,
      changes: diffChanges(e.before, e.after),
    }
  })

  res.json({
    rows,
    total,
    page,
    limit,
    actionTypes: Object.entries(AUDIT_ACTIONS).map(([value, { label }]) => ({ value, label })),
  })
}
