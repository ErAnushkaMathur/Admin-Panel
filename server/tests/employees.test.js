import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { startTestServer } from './helpers/testServer.js'

let t, ownerA, ownerB, managerA
let kitchenId, counterId, morningId, nightId, deptB, shiftB

async function setupBusiness(owner) {
  const dept = await t.request('POST', '/departments', { token: owner.token, body: { name: 'Kitchen', color: '#f2727f', icon: 'chef-hat' } })
  const dept2 = await t.request('POST', '/departments', { token: owner.token, body: { name: 'Counter', color: '#4a90d9', icon: 'store' } })
  const shift = await t.request('POST', '/shifts', { token: owner.token, body: { name: 'Morning', startTime: '08:00', endTime: '16:00', graceMinutes: 10 } })
  const shift2 = await t.request('POST', '/shifts', { token: owner.token, body: { name: 'Night', startTime: '22:00', endTime: '06:00', graceMinutes: 10 } })
  return [dept.body.department._id, dept2.body.department._id, shift.body.shift._id, shift2.body.shift._id]
}

const employee = (overrides = {}) => ({
  name: 'Ramesh Kumar',
  phone: '+91 98765 43210',
  departmentId: kitchenId,
  roleTitle: 'Chef',
  shiftId: morningId,
  joinDate: '2026-04-01',
  salary: { type: 'monthly', amountPaise: 1800000, weeklyOff: [0] },
  ...overrides,
})

before(async () => {
  t = await startTestServer()
  ownerA = await t.registerOwner('Alpha')
  ownerB = await t.registerOwner('Beta')
  ;[kitchenId, counterId, morningId, nightId] = await setupBusiness(ownerA)
  ;[deptB, , shiftB] = await setupBusiness(ownerB)

  // No API for inviting managers yet: insert one directly for business A
  const User = t.mongoose.model('User')
  await User.create({
    businessId: ownerA.businessId,
    name: 'Mona Manager',
    email: 'manager@alpha.test',
    passwordHash: await bcrypt.hash('secret123', 4),
    role: 'manager',
  })
  const login = await t.request('POST', '/auth/login', { body: { email: 'manager@alpha.test', password: 'secret123' } })
  managerA = { token: login.body.token }
})
after(async () => t?.stop())

describe('create', () => {
  let created

  test('creates employee with code 101, returns PIN once, stores only the hash', async () => {
    const res = await t.request('POST', '/employees', { token: ownerA.token, body: employee() })
    assert.equal(res.status, 201)
    created = res.body
    assert.match(res.body.pin, /^\d{4}$/)
    const e = res.body.employee
    assert.equal(e.employeeCode, '101')
    assert.equal(e.phone, '9876543210')
    assert.equal(e.isActive, true)
    assert.equal(e.department.name, 'Kitchen')
    assert.equal(e.shift.name, 'Morning')
    assert.deepEqual(e.salary, { type: 'monthly', amountPaise: 1800000, overtimeMultiplier: 1.5, weeklyOff: [0] })
    assert.equal('pinHash' in e, false)
    assert.equal('pin' in e, false)

    const raw = await t.db().collection('employees').findOne({ employeeCode: '101' })
    assert.notEqual(raw.pinHash, res.body.pin)
    assert.equal(await bcrypt.compare(res.body.pin, raw.pinHash), true)
    assert.equal(Object.values(raw).includes(res.body.pin), false)
  })

  test('PIN is never returned again', async () => {
    const one = await t.request('GET', `/employees/${created.employee._id}`, { token: ownerA.token })
    assert.equal(one.status, 200)
    assert.equal('pin' in one.body, false)
    assert.equal('pinHash' in one.body.employee, false)
    const list = await t.request('GET', '/employees', { token: ownerA.token })
    assert.ok(!JSON.stringify(list.body).includes('pinHash'))
  })

  test('codes are sequential and per business', async () => {
    const second = await t.request('POST', '/employees', {
      token: ownerA.token,
      body: employee({ name: 'Suresh', phone: '9123456780', departmentId: counterId, shiftId: nightId, roleTitle: 'Helper' }),
    })
    assert.equal(second.body.employee.employeeCode, '102')
    const inB = await t.request('POST', '/employees', {
      token: ownerB.token,
      body: employee({ departmentId: deptB, shiftId: shiftB }),
    })
    assert.equal(inB.status, 201, JSON.stringify(inB.body))
    assert.equal(inB.body.employee.employeeCode, '101')
    // Same phone is fine in a different business
    assert.equal(inB.body.employee.phone, '9876543210')
  })

  const codeCounterA = async () =>
    (await t.db().collection('counters').findOne({ businessId: new t.mongoose.Types.ObjectId(ownerA.businessId), key: 'employeeCode' })).seq

  test('phone unique per business; rejected request does not use up a code', async () => {
    const seqBefore = await codeCounterA()
    const dup = await t.request('POST', '/employees', { token: ownerA.token, body: employee({ name: 'Copy', phone: '09876543210' }) })
    assert.equal(dup.status, 409)
    assert.equal(dup.body.error.details[0].field, 'phone')
    assert.equal(await codeCounterA(), seqBefore, 'code counter must not move on a duplicate phone')
  })

  test('validation errors', async () => {
    const res = await t.request('POST', '/employees', {
      token: ownerA.token,
      body: {
        name: 'R',
        phone: '12345',
        departmentId: 'x',
        roleTitle: '',
        shiftId: morningId,
        joinDate: '2026-02-30',
        salary: { type: 'weekly', amountPaise: 100.5, weeklyOff: [0, 0] },
        pinHash: 'nope',
      },
    })
    assert.equal(res.status, 400)
    const fields = res.body.error.details.map((d) => d.field)
    for (const f of ['name', 'phone', 'departmentId', 'roleTitle', 'joinDate', 'salary.type', 'salary.amountPaise', 'salary.weeklyOff']) {
      assert.ok(fields.includes(f), `expected error for ${f}, got ${fields}`)
    }
  })

  test('department/shift from another business is rejected', async () => {
    const res = await t.request('POST', '/employees', {
      token: ownerA.token,
      body: employee({ phone: '9000000001', departmentId: deptB, shiftId: shiftB }),
    })
    assert.equal(res.status, 400)
    assert.deepEqual(res.body.error.details.map((d) => d.field).sort(), ['departmentId', 'shiftId'])
  })

  test('manager cannot create', async () => {
    const res = await t.request('POST', '/employees', { token: managerA.token, body: employee({ phone: '9000000002' }) })
    assert.equal(res.status, 403)
  })

  test('after rejected creates, codes stay gap-free (only 101 and 102 used)', async () => {
    assert.equal(await codeCounterA(), 2)
  })
})

describe('list + get', () => {
  test('search, filter and status', async () => {
    const all = await t.request('GET', '/employees', { token: ownerA.token })
    assert.equal(all.body.total, 2)
    assert.deepEqual(all.body.employees.map((e) => e.name), ['Ramesh Kumar', 'Suresh'])

    const byName = await t.request('GET', '/employees?search=sure', { token: ownerA.token })
    assert.deepEqual(byName.body.employees.map((e) => e.name), ['Suresh'])
    const byCode = await t.request('GET', '/employees?search=101', { token: ownerA.token })
    assert.deepEqual(byCode.body.employees.map((e) => e.employeeCode), ['101'])
    const byPhone = await t.request('GET', '/employees?search=91234', { token: ownerA.token })
    assert.deepEqual(byPhone.body.employees.map((e) => e.name), ['Suresh'])
    const regexSafe = await t.request('GET', `/employees?search=${encodeURIComponent('.*')}`, { token: ownerA.token })
    assert.equal(regexSafe.body.total, 0)

    const byDept = await t.request('GET', `/employees?departmentId=${counterId}`, { token: ownerA.token })
    assert.deepEqual(byDept.body.employees.map((e) => e.name), ['Suresh'])

    const paged = await t.request('GET', '/employees?limit=1&page=2', { token: ownerA.token })
    assert.equal(paged.body.employees.length, 1)
    assert.equal(paged.body.total, 2)
  })

  test('manager sees employees but never salary', async () => {
    const list = await t.request('GET', '/employees', { token: managerA.token })
    assert.equal(list.status, 200)
    assert.equal(list.body.employees.length, 2)
    assert.ok(list.body.employees.every((e) => !('salary' in e)))
    const one = await t.request('GET', `/employees/${list.body.employees[0]._id}`, { token: managerA.token })
    assert.equal('salary' in one.body.employee, false)
  })

  test('tenant isolation', async () => {
    const listA = await t.request('GET', '/employees', { token: ownerA.token })
    const idA = listA.body.employees[0]._id
    const listB = await t.request('GET', '/employees', { token: ownerB.token })
    assert.equal(listB.body.total, 1)
    assert.ok(listB.body.employees.every((e) => e.businessId === ownerB.businessId))

    assert.equal((await t.request('GET', `/employees/${idA}`, { token: ownerB.token })).status, 404)
    assert.equal((await t.request('PATCH', `/employees/${idA}`, { token: ownerB.token, body: { name: 'Hacked' } })).status, 404)
    assert.equal((await t.request('POST', `/employees/${idA}/reset-pin`, { token: ownerB.token })).status, 404)
  })
})

describe('update', () => {
  let id
  before(async () => {
    const list = await t.request('GET', '/employees?search=Ramesh', { token: ownerA.token })
    id = list.body.employees[0]._id
  })
  const auditLogs = () => t.db().collection('auditlogs').find({ entityId: new t.mongoose.Types.ObjectId(id) }).toArray()

  test('non-salary edit writes no audit log; code is immutable', async () => {
    const res = await t.request('PATCH', `/employees/${id}`, {
      token: ownerA.token,
      body: { roleTitle: 'Head Chef', departmentId: counterId },
    })
    assert.equal(res.status, 200)
    assert.equal(res.body.employee.roleTitle, 'Head Chef')
    assert.equal(res.body.employee.department.name, 'Counter')
    assert.equal((await auditLogs()).length, 0)

    const code = await t.request('PATCH', `/employees/${id}`, { token: ownerA.token, body: { employeeCode: '999' } })
    assert.equal(code.status, 400)
  })

  test('partial salary edit merges and is audit-logged with before/after', async () => {
    const res = await t.request('PATCH', `/employees/${id}`, { token: ownerA.token, body: { salary: { amountPaise: 2000000 } } })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body.employee.salary, { type: 'monthly', amountPaise: 2000000, overtimeMultiplier: 1.5, weeklyOff: [0] })

    const logs = await auditLogs()
    assert.equal(logs.length, 1)
    assert.equal(logs[0].action, 'employee.salary_update')
    assert.equal(logs[0].entity, 'Employee')
    assert.equal(String(logs[0].businessId), ownerA.businessId)
    assert.equal(String(logs[0].actorId), ownerA.userId)
    assert.equal(logs[0].before.amountPaise, 1800000)
    assert.equal(logs[0].after.amountPaise, 2000000)
    assert.ok(logs[0].at instanceof Date)
  })

  test('saving the same salary does not add a log', async () => {
    await t.request('PATCH', `/employees/${id}`, { token: ownerA.token, body: { salary: { amountPaise: 2000000, weeklyOff: [0] } } })
    assert.equal((await auditLogs()).length, 1)
  })

  test('weekly off order does not matter', async () => {
    await t.request('PATCH', `/employees/${id}`, { token: ownerA.token, body: { salary: { weeklyOff: [6, 0] } } })
    const logs = await auditLogs()
    assert.equal(logs.length, 2)
    assert.deepEqual(logs[1].after.weeklyOff, [0, 6])
    await t.request('PATCH', `/employees/${id}`, { token: ownerA.token, body: { salary: { weeklyOff: [0, 6] } } })
    assert.equal((await auditLogs()).length, 2)
  })

  test('duplicate phone on update', async () => {
    const res = await t.request('PATCH', `/employees/${id}`, { token: ownerA.token, body: { phone: '9123456780' } })
    assert.equal(res.status, 409)
    assert.equal(res.body.error.details[0].field, 'phone')
  })

  test('manager cannot edit', async () => {
    const res = await t.request('PATCH', `/employees/${id}`, { token: managerA.token, body: { roleTitle: 'X' } })
    assert.equal(res.status, 403)
  })

  test('deactivate (soft delete) and reactivate; no DELETE route', async () => {
    const off = await t.request('PATCH', `/employees/${id}`, { token: ownerA.token, body: { isActive: false } })
    assert.equal(off.body.employee.isActive, false)
    const active = await t.request('GET', '/employees?status=active', { token: ownerA.token })
    assert.ok(!active.body.employees.some((e) => e._id === id))
    const inactive = await t.request('GET', '/employees?status=inactive', { token: ownerA.token })
    assert.deepEqual(inactive.body.employees.map((e) => e._id), [id])

    const del = await t.request('DELETE', `/employees/${id}`, { token: ownerA.token })
    assert.equal(del.status, 404)
    assert.equal(await t.db().collection('employees').countDocuments({ _id: new t.mongoose.Types.ObjectId(id) }), 1)

    const on = await t.request('PATCH', `/employees/${id}`, { token: ownerA.token, body: { isActive: true } })
    assert.equal(on.body.employee.isActive, true)
  })

  test('department with active employees cannot be archived', async () => {
    const res = await t.request('PATCH', `/departments/${counterId}`, { token: ownerA.token, body: { isActive: false } })
    assert.equal(res.status, 409)
    const depts = await t.request('GET', '/departments', { token: ownerA.token })
    assert.equal(depts.body.departments.find((d) => d._id === counterId).staffCount, 2)
  })
})

describe('reset-pin', () => {
  test('issues a new PIN; old one stops working', async () => {
    const list = await t.request('GET', '/employees?search=Suresh', { token: ownerA.token })
    const id = list.body.employees[0]._id
    const before = await t.db().collection('employees').findOne({ _id: new t.mongoose.Types.ObjectId(id) })

    const res = await t.request('POST', `/employees/${id}/reset-pin`, { token: ownerA.token })
    assert.equal(res.status, 200)
    assert.match(res.body.pin, /^\d{4}$/)
    assert.equal(res.body.employee.employeeCode, '102')
    assert.equal('pinHash' in res.body.employee, false)

    const after = await t.db().collection('employees').findOne({ _id: new t.mongoose.Types.ObjectId(id) })
    assert.notEqual(after.pinHash, before.pinHash)
    assert.equal(await bcrypt.compare(res.body.pin, after.pinHash), true)

    const asManager = await t.request('POST', `/employees/${id}/reset-pin`, { token: managerA.token })
    assert.equal(asManager.status, 403)
  })
})
