import mongoose from 'mongoose'
import Employee from '../models/Employee.js'
import Department from '../models/Department.js'
import Shift from '../models/Shift.js'
import AuditLog from '../models/AuditLog.js'
import { HttpError } from '../utils/httpError.js'
import { generatePin, hashPin } from '../services/pin.service.js'
import { nextEmployeeCode } from '../services/employeeCode.service.js'
import { inTransaction, recordAudit } from '../services/auditTrail.service.js'

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function populateRefs(query, businessId) {
  return query
    .populate({ path: 'departmentId', select: 'name color icon isActive', match: { businessId } })
    .populate({ path: 'shiftId', select: 'name startTime endTime crossesMidnight', match: { businessId } })
}

// Flattens populated refs into `department` / `shift` and hides salary from non-owners
// (SPEC section 7: salary hidden at the API level, not just the UI).
function serialize(emp, role) {
  const { departmentId: dept, shiftId: shift, pinHash: _pin, __v: _v, ...rest } = emp
  const out = {
    ...rest,
    departmentId: dept?._id ?? null,
    department: dept ? { _id: dept._id, name: dept.name, color: dept.color, icon: dept.icon, isActive: dept.isActive } : null,
    shiftId: shift?._id ?? null,
    shift: shift
      ? { _id: shift._id, name: shift.name, startTime: shift.startTime, endTime: shift.endTime, crossesMidnight: shift.crossesMidnight }
      : null,
  }
  if (role !== 'owner') delete out.salary
  return out
}

async function loadEmployee(businessId, id, role) {
  const emp = await populateRefs(Employee.findOne({ _id: id, businessId }), businessId).lean()
  if (!emp) throw new HttpError(404, 'Employee not found')
  return serialize(emp, role)
}

// Department/shift must belong to this business (and the department must not be archived)
async function assertRefsExist(businessId, { departmentId, shiftId }) {
  const details = []
  if (departmentId && !(await Department.exists({ _id: departmentId, businessId, isActive: true }))) {
    details.push({ field: 'departmentId', message: 'Department not found' })
  }
  if (shiftId && !(await Shift.exists({ _id: shiftId, businessId }))) {
    details.push({ field: 'shiftId', message: 'Shift not found' })
  }
  if (details.length) throw new HttpError(400, 'Validation failed', undefined, details)
}

const DUPLICATE_PHONE_MESSAGE = 'This phone number is already used by another employee'

function duplicatePhoneError() {
  return new HttpError(409, DUPLICATE_PHONE_MESSAGE, 'DUPLICATE_PHONE', [{ field: 'phone', message: DUPLICATE_PHONE_MESSAGE }])
}

function mapDuplicateError(err) {
  if (err.code === 11000 && err.keyPattern?.phone) return duplicatePhoneError()
  return err
}

const plainSalary = (s) => ({
  type: s.type,
  amountPaise: s.amountPaise,
  overtimeMultiplier: s.overtimeMultiplier,
  weeklyOff: [...s.weeklyOff],
})

export async function listEmployees(req, res) {
  const { businessId, role } = req.user
  const { search, departmentId, shiftId, status, page, limit } = req.query

  const filter = { businessId }
  if (status !== 'all') filter.isActive = status === 'active'
  if (departmentId) filter.departmentId = departmentId
  if (shiftId) filter.shiftId = shiftId
  if (search) {
    const re = new RegExp(escapeRegex(search), 'i')
    const or = [{ name: re }, { employeeCode: re }, { roleTitle: re }]
    const digits = search.replace(/\D/g, '')
    if (digits.length >= 3) or.push({ phone: new RegExp(escapeRegex(digits)) })
    filter.$or = or
  }

  const [total, employees] = await Promise.all([
    Employee.countDocuments(filter),
    populateRefs(
      Employee.find(filter)
        .sort({ name: 1 })
        .collation({ locale: 'en', strength: 2 })
        .skip((page - 1) * limit)
        .limit(limit),
      businessId,
    ).lean(),
  ])

  res.json({ employees: employees.map((e) => serialize(e, role)), total, page, limit })
}

export async function getEmployee(req, res) {
  const { businessId, role } = req.user
  res.json({ employee: await loadEmployee(businessId, req.params.id, role) })
}

export async function createEmployee(req, res) {
  const { businessId, role } = req.user
  await assertRefsExist(businessId, req.body)
  // Check before reserving a code so a rejected request doesn't leave a gap in the sequence.
  // The unique index still catches the rare race between two simultaneous creates.
  if (await Employee.exists({ businessId, phone: req.body.phone })) throw duplicatePhoneError()

  const pin = generatePin()
  const [employeeCode, pinHash] = await Promise.all([nextEmployeeCode(businessId), hashPin(pin)])

  let created
  try {
    created = await Employee.create({ ...req.body, businessId, employeeCode, pinHash })
  } catch (err) {
    throw mapDuplicateError(err)
  }

  // The PIN is returned exactly once, here. Only its hash is stored.
  res.set('Cache-Control', 'no-store')
  res.status(201).json({ employee: await loadEmployee(businessId, created._id, role), pin })
}

export async function updateEmployee(req, res) {
  const { businessId, role, id: actorId } = req.user
  const { salary: salaryChanges, ...changes } = req.body

  const emp = await Employee.findOne({ _id: req.params.id, businessId })
  if (!emp) throw new HttpError(404, 'Employee not found')

  await assertRefsExist(businessId, changes)

  const salaryBefore = plainSalary(emp.salary)
  const wasActive = emp.isActive
  emp.set(changes)
  if (salaryChanges) emp.salary = { ...salaryBefore, ...salaryChanges }
  const salaryAfter = plainSalary(emp.salary)
  const salaryChanged = JSON.stringify(salaryBefore) !== JSON.stringify(salaryAfter)
  const activeChanged = emp.isActive !== wasActive

  // Save and audit together: a salary or active-status change is never stored without its log entry
  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      await emp.save({ session })
      if (activeChanged) {
        await recordAudit(session, {
          businessId,
          actorId,
          action: emp.isActive ? 'employee.reactivate' : 'employee.deactivate',
          entity: 'Employee',
          entityId: emp._id,
          before: { isActive: wasActive },
          after: { isActive: emp.isActive },
        })
      }
      if (salaryChanged) {
        await AuditLog.create(
          [
            {
              businessId,
              actorId,
              action: 'employee.salary_update',
              entity: 'Employee',
              entityId: emp._id,
              before: salaryBefore,
              after: salaryAfter,
            },
          ],
          { session },
        )
      }
    })
  } catch (err) {
    throw mapDuplicateError(err)
  } finally {
    await session.endSession()
  }

  res.json({ employee: await loadEmployee(businessId, emp._id, role) })
}

export async function resetEmployeePin(req, res) {
  const { businessId, id: actorId } = req.user
  const emp = await Employee.findOne({ _id: req.params.id, businessId })
  if (!emp) throw new HttpError(404, 'Employee not found')

  const pin = generatePin()
  emp.pinHash = await hashPin(pin)
  // The audit entry records only that the PIN was reset — never the PIN or its hash
  await inTransaction(async (session) => {
    await emp.save({ session })
    await recordAudit(session, {
      businessId,
      actorId,
      action: 'employee.pin_reset',
      entity: 'Employee',
      entityId: emp._id,
      before: null,
      after: null,
    })
  })

  res.set('Cache-Control', 'no-store')
  res.json({ employee: { _id: emp._id, name: emp.name, employeeCode: emp.employeeCode }, pin })
}
