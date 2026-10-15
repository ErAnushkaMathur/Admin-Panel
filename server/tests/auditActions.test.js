import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { startTestServer } from './helpers/testServer.js'
import { AUDIT_ACTIONS } from '../src/services/auditLog.service.js'
import { recordAudit } from '../src/services/auditTrail.service.js'

// Golden rule 9: every sensitive change writes an AuditLog entry registered in AUDIT_ACTIONS
let t, owner, ownerB
const ids = {}

const req = (method, path, body, token = owner.token) => t.request(method, path, { token, body })
const logs = (filter = {}) => t.db().collection('auditlogs').find(filter).sort({ at: 1, _id: 1 }).toArray()
const logsFor = (action) => logs({ action })
const auditRows = async (type) => (await req('GET', `/audit-logs?type=${type}`)).body.rows

before(async () => {
  t = await startTestServer()
  owner = await t.registerOwner('Alpha')
  ownerB = await t.registerOwner('Beta')
  ids.kitchen = (await req('POST', '/departments', { name: 'Kitchen', color: '#f2727f', icon: 'chef-hat' })).body.department._id
  ids.counter = (await req('POST', '/departments', { name: 'Counter', color: '#4a90d9', icon: 'store' })).body.department._id
  ids.shift = (await req('POST', '/shifts', { name: 'Morning', startTime: '08:00', endTime: '16:00', graceMinutes: 10 })).body.shift._id
  const emp = await req('POST', '/employees', {
    name: 'Ramesh',
    phone: '9000000001',
    departmentId: ids.kitchen,
    roleTitle: 'Chef',
    shiftId: ids.shift,
    joinDate: '2026-01-01',
    salary: { type: 'monthly', amountPaise: 1500000 },
  })
  ids.ramesh = emp.body.employee._id
})
after(async () => t?.stop())

describe('employee.pin_reset', () => {
  test('logs who reset whose PIN — never the PIN or its hash', async () => {
    const res = await req('POST', `/employees/${ids.ramesh}/reset-pin`)
    assert.equal(res.status, 200)
    const [entry] = await logsFor('employee.pin_reset')
    assert.equal(entry.entity, 'Employee')
    assert.equal(String(entry.entityId), ids.ramesh)
    assert.equal(String(entry.actorId), owner.userId)
    assert.equal(entry.before, null)
    assert.equal(entry.after, null)

    const stored = await t.db().collection('employees').findOne({ _id: new t.mongoose.Types.ObjectId(ids.ramesh) })
    const serialized = JSON.stringify(entry)
    assert.ok(!serialized.includes(res.body.pin), 'PIN not in audit entry')
    assert.ok(!serialized.includes(stored.pinHash), 'hash not in audit entry')

    const [row] = await auditRows('employee.pin_reset')
    assert.equal(row.actionLabel, 'PIN reset')
    assert.equal(row.employee.name, 'Ramesh')
    assert.deepEqual(row.changes, [])
  })

  test('a refused reset (other business) writes nothing', async () => {
    assert.equal((await req('POST', `/employees/${ids.ramesh}/reset-pin`, undefined, ownerB.token)).status, 404)
    assert.equal((await logsFor('employee.pin_reset')).length, 1)
  })
})

describe('employee.deactivate', () => {
  test('logs isActive true -> false; repeating it adds nothing', async () => {
    await req('PATCH', `/employees/${ids.ramesh}`, { isActive: false })
    const [entry] = await logsFor('employee.deactivate')
    assert.deepEqual(entry.before, { isActive: true })
    assert.deepEqual(entry.after, { isActive: false })
    assert.equal(String(entry.entityId), ids.ramesh)

    await req('PATCH', `/employees/${ids.ramesh}`, { isActive: false })
    assert.equal((await logsFor('employee.deactivate')).length, 1, 'no-op is not logged')

    const [row] = await auditRows('employee.deactivate')
    assert.equal(row.actionLabel, 'Employee deactivated')
    assert.deepEqual(row.changes, [{ field: 'isActive', before: true, after: false }])
  })
})

describe('employee.reactivate', () => {
  test('logs isActive false -> true', async () => {
    await req('PATCH', `/employees/${ids.ramesh}`, { isActive: true })
    const [entry] = await logsFor('employee.reactivate')
    assert.deepEqual(entry.before, { isActive: false })
    assert.deepEqual(entry.after, { isActive: true })
    assert.equal((await auditRows('employee.reactivate'))[0].actionLabel, 'Employee reactivated')
  })

  test('status and salary changed in one edit write both entries', async () => {
    await req('PATCH', `/employees/${ids.ramesh}`, { isActive: false, salary: { amountPaise: 1600000 } })
    assert.equal((await logsFor('employee.deactivate')).length, 2)
    assert.equal((await logsFor('employee.salary_update')).length, 1)
    await req('PATCH', `/employees/${ids.ramesh}`, { isActive: true })
  })
})

describe('department.archive', () => {
  test('logs archiving; blocked archive and plain edits write nothing', async () => {
    const blocked = await req('PATCH', `/departments/${ids.kitchen}`, { isActive: false }) // Ramesh is active here
    assert.equal(blocked.status, 409)
    await req('PATCH', `/departments/${ids.counter}`, { name: 'Front Counter' })
    assert.equal((await logs({ entity: 'Department' })).length, 0)

    await req('PATCH', `/departments/${ids.counter}`, { isActive: false })
    const [entry] = await logsFor('department.archive')
    assert.equal(entry.entity, 'Department')
    assert.equal(String(entry.entityId), ids.counter)
    assert.deepEqual(entry.before, { isActive: true })
    assert.deepEqual(entry.after, { isActive: false })

    const [row] = await auditRows('department.archive')
    assert.equal(row.actionLabel, 'Department archived')
    assert.deepEqual(row.target, { kind: 'department', name: 'Front Counter' })
    assert.equal(row.employee, null)
  })
})

describe('department.restore', () => {
  test('logs restoring an archived department', async () => {
    await req('PATCH', `/departments/${ids.counter}`, { isActive: true })
    const [entry] = await logsFor('department.restore')
    assert.deepEqual(entry.before, { isActive: false })
    assert.deepEqual(entry.after, { isActive: true })
    assert.equal((await auditRows('department.restore'))[0].actionLabel, 'Department restored')
  })
})

describe('shift.update', () => {
  test('logs before/after of a real edit; saving the same values writes nothing', async () => {
    await req('PATCH', `/shifts/${ids.shift}`, { graceMinutes: 10 })
    assert.equal((await logsFor('shift.update')).length, 0)

    await req('PATCH', `/shifts/${ids.shift}`, { graceMinutes: 15, endTime: '01:00' })
    const [entry] = await logsFor('shift.update')
    assert.equal(entry.entity, 'Shift')
    assert.deepEqual(entry.before, { name: 'Morning', startTime: '08:00', endTime: '16:00', graceMinutes: 10, crossesMidnight: false })
    assert.deepEqual(entry.after, { name: 'Morning', startTime: '08:00', endTime: '01:00', graceMinutes: 15, crossesMidnight: true })

    const [row] = await auditRows('shift.update')
    assert.equal(row.actionLabel, 'Shift edited')
    assert.deepEqual(row.target, { kind: 'shift', name: 'Morning' })
    assert.deepEqual(
      row.changes.map((c) => c.field),
      ['endTime', 'graceMinutes', 'crossesMidnight'],
    )
  })

  test('an invalid edit (start = end) writes nothing', async () => {
    assert.equal((await req('PATCH', `/shifts/${ids.shift}`, { endTime: '08:00' })).status, 400)
    assert.equal((await logsFor('shift.update')).length, 1)
  })
})

describe('settings.punch_link_regenerate', () => {
  test('logs the regeneration without storing either token', async () => {
    const oldToken = (await req('GET', '/settings/punch-link')).body.punchToken
    const res = await req('POST', '/settings/punch-link/regenerate')
    const newToken = res.body.punchToken
    const [entry] = await logsFor('settings.punch_link_regenerate')
    assert.equal(entry.entity, 'Business')
    assert.equal(String(entry.entityId), owner.businessId)
    assert.equal(entry.before, null)
    assert.equal(entry.after, null)
    const serialized = JSON.stringify(entry)
    assert.ok(!serialized.includes(oldToken) && !serialized.includes(newToken), 'tokens not stored')

    const [row] = await auditRows('settings.punch_link_regenerate')
    assert.equal(row.actionLabel, 'Punch QR regenerated')
    assert.deepEqual(row.target, { kind: 'business', name: 'Alpha Sweets' })
  })
})

describe('registry', () => {
  test('every action written is registered in AUDIT_ACTIONS and filterable', async () => {
    const written = await t.db().collection('auditlogs').distinct('action')
    for (const action of written) assert.ok(AUDIT_ACTIONS[action], `${action} missing from AUDIT_ACTIONS`)
    const types = (await req('GET', '/audit-logs')).body.actionTypes.map((a) => a.value)
    for (const action of written) assert.ok(types.includes(action), `${action} missing from the type filter`)
  })

  test('recordAudit refuses unregistered actions', async () => {
    await assert.rejects(() => recordAudit(null, { action: 'employee.teleport' }), /not registered in AUDIT_ACTIONS/)
  })

  test("other businesses never see these entries", async () => {
    assert.equal((await req('GET', '/audit-logs', undefined, ownerB.token)).body.total, 0)
  })
})
