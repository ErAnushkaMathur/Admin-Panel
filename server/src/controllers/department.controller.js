import Department from '../models/Department.js'
import { HttpError } from '../utils/httpError.js'
import { todayIST } from '../utils/time.js'
import { now as serverNow } from '../utils/clock.js'
import { getDepartmentStaffStats, countActiveEmployeesInDepartment } from '../services/staffStats.service.js'
import { inTransaction, recordAudit } from '../services/auditTrail.service.js'

const EMPTY_STATS = { staffCount: 0, staffToday: 0, presentToday: 0 }

// Server time, so the IST day and "not yet in" match the Attendance page and Dashboard
function todayStats(businessId) {
  const now = serverNow()
  return getDepartmentStaffStats(businessId, todayIST(now), now)
}

function withStats(dept, stats) {
  const json = typeof dept.toJSON === 'function' ? dept.toJSON() : dept
  return { ...json, ...(stats[String(json._id)] || EMPTY_STATS) }
}

function duplicateNameError(err, name) {
  if (err.code === 11000) return new HttpError(409, `A department named "${name}" already exists`)
  return err
}

async function findOwnDepartment(req) {
  const dept = await Department.findOne({ _id: req.params.id, businessId: req.user.businessId })
  if (!dept) throw new HttpError(404, 'Department not found')
  return dept
}

export async function listDepartments(req, res) {
  const { businessId } = req.user
  const filter = { businessId }
  if (!req.query.includeArchived) filter.isActive = true

  const [departments, stats] = await Promise.all([
    Department.find(filter).sort({ isActive: -1, name: 1 }).collation({ locale: 'en', strength: 2 }).select('-__v').lean(),
    todayStats(businessId),
  ])
  res.json({ departments: departments.map((d) => withStats(d, stats)) })
}

export async function createDepartment(req, res) {
  const { businessId } = req.user
  try {
    const dept = await Department.create({ ...req.body, businessId })
    res.status(201).json({ department: withStats(dept, {}) })
  } catch (err) {
    throw duplicateNameError(err, req.body.name)
  }
}

export async function updateDepartment(req, res) {
  const { businessId, id: actorId } = req.user
  const dept = await findOwnDepartment(req)
  const wasActive = dept.isActive

  // SPEC 4.3: cannot archive a department that still has active employees
  if (req.body.isActive === false && dept.isActive) {
    const active = await countActiveEmployeesInDepartment(businessId, dept._id)
    if (active > 0) {
      throw new HttpError(
        409,
        `Can't archive "${dept.name}": ${active} active employee${active === 1 ? ' is' : 's are'} still in this department. Move them to another department first.`,
        'DEPARTMENT_HAS_EMPLOYEES',
      )
    }
  }

  dept.set(req.body)
  // Archive / restore is audit-logged together with the save (name/colour/icon edits are not)
  const activeChanged = dept.isActive !== wasActive
  try {
    await inTransaction(async (session) => {
      await dept.save({ session })
      if (activeChanged) {
        await recordAudit(session, {
          businessId,
          actorId,
          action: dept.isActive ? 'department.restore' : 'department.archive',
          entity: 'Department',
          entityId: dept._id,
          before: { isActive: wasActive },
          after: { isActive: dept.isActive },
        })
      }
    })
  } catch (err) {
    throw duplicateNameError(err, req.body.name)
  }
  const stats = await todayStats(businessId)
  res.json({ department: withStats(dept, stats) })
}
