import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { startTestServer } from './helpers/testServer.js'

let t, ownerA, ownerB

before(async () => {
  t = await startTestServer()
  ownerA = await t.registerOwner('Alpha')
  ownerB = await t.registerOwner('Beta')
})
after(async () => t?.stop())

const oid = (id) => new t.mongoose.Types.ObjectId(String(id))
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
const kitchen = { name: 'Kitchen', color: '#f2727f', icon: 'chef-hat' }
// Minimal raw employee row; unique code/phone so it satisfies the Employee indexes
let rawSeq = 0
const rawEmployee = (fields) => {
  rawSeq += 1
  return { employeeCode: `T${rawSeq}`, phone: `90000${String(rawSeq).padStart(5, '0')}`, ...fields }
}

describe('departments', () => {
  test('requires auth', async () => {
    const res = await t.request('GET', '/departments')
    assert.equal(res.status, 401)
  })

  test('create, list with stats, duplicate name (case-insensitive)', async () => {
    const created = await t.request('POST', '/departments', { token: ownerA.token, body: kitchen })
    assert.equal(created.status, 201)
    assert.equal(created.body.department.name, 'Kitchen')
    assert.equal(created.body.department.staffCount, 0)
    assert.equal(created.body.department.businessId, ownerA.businessId)

    const dup = await t.request('POST', '/departments', { token: ownerA.token, body: { ...kitchen, name: 'kitchen' } })
    assert.equal(dup.status, 409)

    const list = await t.request('GET', '/departments', { token: ownerA.token })
    assert.equal(list.status, 200)
    assert.equal(list.body.departments.length, 1)
  })

  test('validation rejects bad input', async () => {
    const res = await t.request('POST', '/departments', {
      token: ownerA.token,
      body: { name: 'X', color: 'red', icon: 'rocket', businessId: ownerB.businessId },
    })
    assert.equal(res.status, 400)
    const fields = res.body.error.details.map((d) => d.field)
    assert.ok(fields.includes('name') && fields.includes('color') && fields.includes('icon'))
  })

  test('tenant isolation: B cannot see or edit A’s department', async () => {
    const created = await t.request('POST', '/departments', {
      token: ownerA.token,
      body: { name: 'Counter', color: '#4a90d9', icon: 'store' },
    })
    const id = created.body.department._id

    const listB = await t.request('GET', '/departments?includeArchived=true', { token: ownerB.token })
    assert.equal(listB.body.departments.length, 0)

    const patchB = await t.request('PATCH', `/departments/${id}`, { token: ownerB.token, body: { name: 'Hacked' } })
    assert.equal(patchB.status, 404)

    const bad = await t.request('PATCH', '/departments/not-an-id', { token: ownerA.token, body: { name: 'Nope' } })
    assert.equal(bad.status, 400)
  })

  test('staff count + present today come from employees/attendance', async () => {
    const created = await t.request('POST', '/departments', {
      token: ownerA.token,
      body: { name: 'Delivery', color: '#7bb662', icon: 'bike' },
    })
    const deptId = created.body.department._id
    const businessId = oid(ownerA.businessId)
    const joined = { joinDate: '2026-01-01', salary: { type: 'monthly', amountPaise: 1_000_000, weeklyOff: [] } }
    const { insertedIds } = await t.db().collection('employees').insertMany([
      rawEmployee({ businessId, departmentId: oid(deptId), isActive: true, ...joined }),
      rawEmployee({ businessId, departmentId: oid(deptId), isActive: true, ...joined }),
      rawEmployee({ businessId, departmentId: oid(deptId), isActive: false, ...joined }),
      // Joins next year: counted as staff, but not employed today
      rawEmployee({ businessId, departmentId: oid(deptId), isActive: true, ...joined, joinDate: '2099-01-01' }),
    ])
    // Punched in today; status comes from deriveStatus using the record's shift snapshot
    await t.db().collection('attendances').insertOne({
      businessId, employeeId: insertedIds[0], date: today(), punchIn: new Date(), punchOut: null,
      shiftSnapshot: { name: 'All day', startTime: '00:00', endTime: '23:59', graceMinutes: 1440, crossesMidnight: false },
    })

    const list = await t.request('GET', '/departments', { token: ownerA.token })
    const delivery = list.body.departments.find((d) => d._id === deptId)
    assert.equal(delivery.staffCount, 3)
    assert.equal(delivery.staffToday, 2)
    assert.equal(delivery.presentToday, 1)

    // Rule: cannot archive with active employees
    const blocked = await t.request('PATCH', `/departments/${deptId}`, { token: ownerA.token, body: { isActive: false } })
    assert.equal(blocked.status, 409)
    assert.equal(blocked.body.error.code, 'DEPARTMENT_HAS_EMPLOYEES')
    assert.match(blocked.body.error.message, /3 active employees/)

    // After employees leave, archive works and it disappears from the default list
    await t.db().collection('employees').updateMany({ departmentId: oid(deptId) }, { $set: { isActive: false } })
    const archived = await t.request('PATCH', `/departments/${deptId}`, { token: ownerA.token, body: { isActive: false } })
    assert.equal(archived.status, 200)
    assert.equal(archived.body.department.isActive, false)

    const active = await t.request('GET', '/departments', { token: ownerA.token })
    assert.ok(!active.body.departments.some((d) => d._id === deptId))
    const all = await t.request('GET', '/departments?includeArchived=true', { token: ownerA.token })
    assert.ok(all.body.departments.some((d) => d._id === deptId))

    // Restore
    const restored = await t.request('PATCH', `/departments/${deptId}`, { token: ownerA.token, body: { isActive: true } })
    assert.equal(restored.body.department.isActive, true)
  })
})

describe('shifts', () => {
  test('create derives crossesMidnight and duration; client value is rejected', async () => {
    const night = await t.request('POST', '/shifts', {
      token: ownerA.token,
      body: { name: 'Night', startTime: '22:00', endTime: '06:00', graceMinutes: 15 },
    })
    assert.equal(night.status, 201)
    assert.equal(night.body.shift.crossesMidnight, true)
    assert.equal(night.body.shift.durationMinutes, 480)
    assert.equal(night.body.shift.employeeCount, 0)

    const sneaky = await t.request('POST', '/shifts', {
      token: ownerA.token,
      body: { name: 'Morning', startTime: '08:00', endTime: '16:00', graceMinutes: 10, crossesMidnight: true },
    })
    assert.equal(sneaky.status, 400)
  })

  test('update recomputes crossesMidnight; same start/end rejected', async () => {
    const created = await t.request('POST', '/shifts', {
      token: ownerA.token,
      body: { name: 'Evening', startTime: '16:00', endTime: '23:00', graceMinutes: 10 },
    })
    const id = created.body.shift._id
    assert.equal(created.body.shift.crossesMidnight, false)

    const later = await t.request('PATCH', `/shifts/${id}`, { token: ownerA.token, body: { endTime: '01:00' } })
    assert.equal(later.status, 200)
    assert.equal(later.body.shift.crossesMidnight, true)
    assert.equal(later.body.shift.durationMinutes, 540)

    const same = await t.request('PATCH', `/shifts/${id}`, { token: ownerA.token, body: { startTime: '01:00' } })
    assert.equal(same.status, 400)
  })

  test('employee count and tenant isolation', async () => {
    const created = await t.request('POST', '/shifts', {
      token: ownerA.token,
      body: { name: 'Full Day', startTime: '09:00', endTime: '21:00', graceMinutes: 10 },
    })
    const id = created.body.shift._id
    await t.db().collection('employees').insertOne(rawEmployee({ businessId: oid(ownerA.businessId), shiftId: oid(id), isActive: true }))

    const listA = await t.request('GET', '/shifts', { token: ownerA.token })
    assert.equal(listA.body.shifts.find((s) => s._id === id).employeeCount, 1)

    const listB = await t.request('GET', '/shifts', { token: ownerB.token })
    assert.equal(listB.body.shifts.length, 0)
    const patchB = await t.request('PATCH', `/shifts/${id}`, { token: ownerB.token, body: { graceMinutes: 0 } })
    assert.equal(patchB.status, 404)
  })
})

describe('tenant plugin', () => {
  test('queries without businessId throw', async () => {
    const Department = t.mongoose.model('Department')
    await assert.rejects(() => Department.find({}), /Tenant scope missing/)
    await assert.rejects(() => Department.findById(new t.mongoose.Types.ObjectId()), /Tenant scope missing/)
    await assert.rejects(() => Department.aggregate([{ $match: {} }]), /Tenant scope missing/)
    const scoped = await Department.find({ businessId: ownerA.businessId })
    assert.ok(scoped.length > 0)
  })
})
