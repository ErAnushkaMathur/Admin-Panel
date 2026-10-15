import mongoose from 'mongoose'
import Leave from '../models/Leave.js'
import Employee from '../models/Employee.js'
import Counter from '../models/Counter.js'
import AuditLog from '../models/AuditLog.js'
import { HttpError } from '../utils/httpError.js'
import { now as serverNow } from '../utils/clock.js'
import { BLOCKING_STATUSES, LEAVE_STATUSES, leaveDays } from '../services/leave.service.js'

const leaveSnapshot = (l) => ({ fromDate: l.fromDate, toDate: l.toDate, type: l.type, status: l.status, reason: l.reason || null })

function rangeText(l) {
  return l.fromDate === l.toDate ? l.fromDate : `${l.fromDate} to ${l.toDate}`
}

async function loadEmployee(businessId, employeeId, fromDate) {
  const employee = await Employee.findOne({ _id: employeeId, businessId }).select('name isActive joinDate').lean()
  if (!employee) throw new HttpError(404, 'Employee not found')
  if (!employee.isActive) {
    throw new HttpError(400, 'Validation failed', undefined, [{ field: 'employeeId', message: 'This employee is inactive' }])
  }
  if (fromDate < employee.joinDate) {
    throw new HttpError(400, 'Validation failed', undefined, [
      { field: 'fromDate', message: `Start date is before ${employee.name} joined (${employee.joinDate})` },
    ])
  }
  return employee
}

/**
 * Serialises leave writes per employee: every leave transaction bumps the same counter document,
 * so two simultaneous overlapping requests conflict and MongoDB retries one of them, which then
 * sees the other and is rejected by the overlap check.
 */
async function lockEmployeeLeaves(businessId, employeeId, session) {
  await Counter.findOneAndUpdate({ businessId, key: `leave-lock:${employeeId}` }, { $inc: { seq: 1 } }, { session })
}
async function ensureLockDoc(businessId, employeeId) {
  try {
    await Counter.updateOne(
      { businessId, key: `leave-lock:${employeeId}` },
      { $setOnInsert: { seq: 0 } },
      { upsert: true },
    )
  } catch (err) {
    if (err.code !== 11000) throw err // created by a parallel request: fine
  }
}

// SPEC 4.8: overlapping leaves for the same employee are rejected (pending or approved ones block)
async function assertNoOverlap(businessId, employee, fromDate, toDate, session, excludeId = null) {
  const clash = await Leave.findOne({
    businessId,
    employeeId: employee._id,
    status: { $in: BLOCKING_STATUSES },
    fromDate: { $lte: toDate },
    toDate: { $gte: fromDate },
    ...(excludeId && { _id: { $ne: excludeId } }),
  })
    .session(session)
    .lean()
  if (clash) {
    const message = `${employee.name} already has ${clash.status} leave for ${rangeText(clash)} that overlaps these dates`
    throw new HttpError(409, message, 'LEAVE_OVERLAP', [{ field: 'fromDate', message }])
  }
}

async function inTransaction(fn) {
  const session = await mongoose.startSession()
  try {
    let result
    await session.withTransaction(async () => {
      result = await fn(session)
    })
    return result
  } finally {
    await session.endSession()
  }
}

function serialize(leave) {
  const emp = leave.employeeId
  return {
    _id: leave._id,
    employee: emp?._id
      ? {
          _id: emp._id,
          name: emp.name,
          employeeCode: emp.employeeCode,
          isActive: emp.isActive,
          department: emp.departmentId ? { name: emp.departmentId.name, color: emp.departmentId.color } : null,
        }
      : null,
    fromDate: leave.fromDate,
    toDate: leave.toDate,
    days: leaveDays(leave.fromDate, leave.toDate),
    type: leave.type,
    status: leave.status,
    reason: leave.reason || null,
    addedByOwner: leave.addedByOwner,
    requestedBy: leave.requestedBy?.name ? { name: leave.requestedBy.name } : null,
    decidedBy: leave.decidedBy?.name ? { name: leave.decidedBy.name } : null,
    decidedAt: leave.decidedAt,
    decisionNote: leave.decisionNote,
    createdAt: leave.createdAt,
  }
}

function populateLeave(query, businessId) {
  return query
    .populate({
      path: 'employeeId',
      select: 'name employeeCode isActive departmentId',
      match: { businessId },
      populate: { path: 'departmentId', select: 'name color', match: { businessId } },
    })
    .populate({ path: 'requestedBy', select: 'name' })
    .populate({ path: 'decidedBy', select: 'name' })
}

async function loadLeave(businessId, id) {
  return serialize(await populateLeave(Leave.findOne({ _id: id, businessId }), businessId).lean())
}

// GET /leaves?status=&employeeId=&from=&to=&page=&limit=
export async function listLeaves(req, res) {
  const { businessId } = req.user
  const { status, employeeId, from, to, page, limit } = req.query

  const base = { businessId }
  if (employeeId) base.employeeId = employeeId
  // Leaves overlapping [from, to]
  if (to) base.fromDate = { $lte: to }
  if (from) base.toDate = { $gte: from }
  const filter = status === 'all' ? base : { ...base, status }

  // Pending: soonest first (what needs deciding next). Others: most recent first.
  const sort = status === 'pending' ? { fromDate: 1, createdAt: 1 } : { fromDate: -1, createdAt: -1 }
  const [total, leaves, grouped] = await Promise.all([
    Leave.countDocuments(filter),
    populateLeave(
      Leave.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit),
      businessId,
    ).lean(),
    Leave.aggregate([
      {
        $match: {
          ...base,
          businessId: new mongoose.Types.ObjectId(String(businessId)),
          ...(employeeId && { employeeId: new mongoose.Types.ObjectId(employeeId) }),
        },
      },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ])

  // Tab counts (backend computes every number)
  const counts = Object.fromEntries(LEAVE_STATUSES.map((s) => [s, 0]))
  for (const g of grouped) counts[g._id] = g.count
  counts.all = LEAVE_STATUSES.reduce((sum, s) => sum + counts[s], 0)

  res.json({ rows: leaves.filter((l) => l.employeeId).map(serialize), total, page, limit, counts })
}

async function createLeave(req, res, { approveNow }) {
  const { businessId, id: actorId } = req.user
  const { employeeId, fromDate, toDate, type, reason } = req.body
  const employee = await loadEmployee(businessId, employeeId, fromDate)
  await ensureLockDoc(businessId, employee._id)

  const leave = await inTransaction(async (session) => {
    await lockEmployeeLeaves(businessId, employee._id, session)
    await assertNoOverlap(businessId, employee, fromDate, toDate, session)
    const [created] = await Leave.create(
      [
        {
          businessId,
          employeeId: employee._id,
          fromDate,
          toDate,
          type,
          reason,
          requestedBy: actorId,
          ...(approveNow && {
            status: 'approved',
            addedByOwner: true,
            decidedBy: actorId,
            decidedAt: serverNow(),
          }),
        },
      ],
      { session },
    )
    if (approveNow) {
      await AuditLog.create(
        [
          {
            businessId,
            actorId,
            action: 'leave.owner_add',
            entity: 'Leave',
            entityId: created._id,
            before: null,
            after: leaveSnapshot(created),
            reason: reason || undefined,
          },
        ],
        { session },
      )
    }
    return created
  })

  res.status(201).json({ leave: await loadLeave(businessId, leave._id) })
}

// POST /leaves — record a request (pending). Owners and managers.
export const requestLeave = (req, res) => createLeave(req, res, { approveNow: false })

// POST /leaves/on-behalf — owner adds leave for an employee, approved immediately
export const addLeaveOnBehalf = (req, res) => createLeave(req, res, { approveNow: true })

async function decide(req, res, decision) {
  const { businessId, id: actorId } = req.user
  const note = req.body.note || null
  const existing = await Leave.findOne({ _id: req.params.id, businessId }).lean()
  if (!existing) throw new HttpError(404, 'Leave not found')
  if (existing.status !== 'pending') {
    throw new HttpError(409, `This leave is already ${existing.status}`, 'LEAVE_NOT_PENDING')
  }
  const employee = await Employee.findOne({ _id: existing.employeeId, businessId }).select('name').lean()
  if (decision === 'approved') await ensureLockDoc(businessId, existing.employeeId)

  await inTransaction(async (session) => {
    if (decision === 'approved') {
      await lockEmployeeLeaves(businessId, existing.employeeId, session)
      await assertNoOverlap(businessId, employee ?? { _id: existing.employeeId, name: 'This employee' }, existing.fromDate, existing.toDate, session, existing._id)
    }
    // Only a still-pending leave can be decided (guards against two people deciding at once)
    const updated = await Leave.findOneAndUpdate(
      { _id: existing._id, businessId, status: 'pending' },
      { $set: { status: decision, decidedBy: actorId, decidedAt: serverNow(), decisionNote: note } },
      { new: true, session },
    ).lean()
    if (!updated) throw new HttpError(409, 'This leave was already decided', 'LEAVE_NOT_PENDING')

    await AuditLog.create(
      [
        {
          businessId,
          actorId,
          action: decision === 'approved' ? 'leave.approve' : 'leave.reject',
          entity: 'Leave',
          entityId: existing._id,
          before: leaveSnapshot(existing),
          after: leaveSnapshot(updated),
          reason: note || undefined,
        },
      ],
      { session },
    )
  })

  res.json({ leave: await loadLeave(businessId, existing._id) })
}

// POST /leaves/:id/approve and /reject — pending only, optional note, audit-logged
export const approveLeave = (req, res) => decide(req, res, 'approved')
export const rejectLeave = (req, res) => decide(req, res, 'rejected')
