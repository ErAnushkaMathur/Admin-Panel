import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { startTestServer } from './helpers/testServer.js'
import { setNowForTests } from '../src/utils/clock.js'
import { istToUtc } from '../src/utils/time.js'
import { diffChanges, AUDIT_ACTIONS } from '../src/services/auditLog.service.js'

describe('diffChanges (pure)', () => {
  test('lists only changed fields, with raw values', () => {
    assert.deepEqual(
      diffChanges(
        { type: 'monthly', amountPaise: 1500000, overtimeMultiplier: 1.5, weeklyOff: [0] },
        { type: 'monthly', amountPaise: 2000000, overtimeMultiplier: 1.5, weeklyOff: [0, 6] },
      ),
      [
        { field: 'amountPaise', before: 1500000, after: 2000000 },
        { field: 'weeklyOff', before: [0], after: [0, 6] },
      ],
    )
  })
  test('a create (no before) shows every field set; nulls on both sides are not changes', () => {
    assert.deepEqual(diffChanges(null, { punchIn: '2026-09-24T02:30:00.000Z', punchOut: null, status: 'present' }), [
      { field: 'punchIn', before: null, after: '2026-09-24T02:30:00.000Z' },
      { field: 'status', before: null, after: 'present' },
    ])
  })
  test('Dates are normalized to ISO strings', () => {
    const d = new Date('2026-09-25T10:00:00Z')
    assert.deepEqual(diffChanges({ punchOut: null }, { punchOut: d }), [{ field: 'punchOut', before: null, after: d.toISOString() }])
    assert.deepEqual(diffChanges({ x: d }, { x: new Date(d) }), [])
  })
})

describe('GET /audit-logs', () => {
  let t, owner, ownerB, manager
  const staff = {}
  const api = (path, token = owner.token) => t.request('GET', path, { token })

  before(async () => {
    t = await startTestServer()
    owner = await t.registerOwner('Alpha')
    ownerB = await t.registerOwner('Beta')
    const call = (method, path, body) => t.request(method, path, { token: owner.token, body })
    const dept = (await call('POST', '/departments', { name: 'Kitchen', color: '#f2727f', icon: 'chef-hat' })).body.department._id
    const shift = (await call('POST', '/shifts', { name: 'Morning', startTime: '08:00', endTime: '16:00', graceMinutes: 10 })).body.shift._id
    for (const [i, name] of ['Ramesh', 'Suresh'].entries()) {
      const res = await call('POST', '/employees', {
        name,
        phone: `900000000${i}`,
        departmentId: dept,
        roleTitle: 'Helper',
        shiftId: shift,
        joinDate: '2026-01-01',
        salary: { type: 'monthly', amountPaise: 1500000 },
      })
      staff[name] = { id: res.body.employee._id, code: res.body.employee.employeeCode, pin: res.body.pin }
    }

    await t.mongoose.model('User').create({
      businessId: owner.businessId,
      name: 'Mona Manager',
      email: 'mona@alpha.test',
      passwordHash: await bcrypt.hash('secret123', 4),
      role: 'manager',
    })
    manager = { token: (await t.request('POST', '/auth/login', { body: { email: 'mona@alpha.test', password: 'secret123' } })).body.token }

    // 1. Salary change (Ramesh)
    await call('PATCH', `/employees/${staff.Ramesh.id}`, { salary: { amountPaise: 2000000 } })
    // 2. Attendance edit (Suresh): punch in/out, then fix the punch-out
    const punchToken = (await call('GET', '/settings/punch-link')).body.punchToken
    const punch = (ymd, hhmm) => {
      setNowForTests(istToUtc(ymd, hhmm))
      return t.request('POST', '/punch', { body: { businessToken: punchToken, employeeCode: staff.Suresh.code, pin: staff.Suresh.pin } })
    }
    await punch('2026-09-25', '08:00')
    await punch('2026-09-25', '11:00')
    setNowForTests(istToUtc('2026-09-26', '10:00'))
    const rec = (await call('GET', '/attendance?date=2026-09-25')).body.rows.find((r) => r.employee._id === staff.Suresh.id)
    await call('PATCH', `/attendance/${rec.attendanceId}`, { punchOut: '16:00', reason: 'Phone died, left at 4 PM' })
    // 3. Attendance added by hand (Ramesh)
    await call('POST', '/attendance/manual', { employeeId: staff.Ramesh.id, date: '2026-09-24', status: 'on_leave', reason: 'Family function' })
    setNowForTests(null)

    // Pin the times so date filtering is predictable
    const logs = t.db().collection('auditlogs')
    await logs.updateOne({ action: 'employee.salary_update' }, { $set: { at: istToUtc('2026-09-02', '00:30') } }) // UTC: 1 Sept 19:00
    await logs.updateOne({ action: 'attendance.manual_edit' }, { $set: { at: istToUtc('2026-09-26', '10:00') } })
    await logs.updateOne({ action: 'attendance.manual_create' }, { $set: { at: istToUtc('2026-09-26', '11:00') } })
  })
  after(async () => {
    setNowForTests(null)
    await t?.stop()
  })

  test('owner sees every entry, newest first, with who/what/when/why', async () => {
    const res = await api('/audit-logs')
    assert.equal(res.status, 200)
    assert.equal(res.body.total, 3)
    assert.deepEqual(res.body.rows.map((r) => r.action), ['attendance.manual_create', 'attendance.manual_edit', 'employee.salary_update'])
    // Every registered action is offered as a filter, in registry order
    const labels = res.body.actionTypes.map((a) => a.label)
    assert.deepEqual(labels.slice(0, 3), ['Salary change', 'Attendance edit', 'Attendance added'])
    assert.equal(labels.length, Object.keys(AUDIT_ACTIONS).length)

    const [created, edited, salary] = res.body.rows
    assert.equal(salary.actionLabel, 'Salary change')
    assert.equal(salary.category, 'salary')
    assert.deepEqual(salary.actor, { _id: owner.userId, name: 'Alpha Owner', role: 'owner' })
    assert.equal(salary.employee.name, 'Ramesh')
    assert.equal(salary.attendanceDate, null)
    assert.deepEqual(salary.changes, [{ field: 'amountPaise', before: 1500000, after: 2000000 }])

    assert.equal(edited.actionLabel, 'Attendance edit')
    assert.equal(edited.employee.name, 'Suresh')
    assert.equal(edited.attendanceDate, '2026-09-25')
    assert.equal(edited.reason, 'Phone died, left at 4 PM')
    assert.deepEqual(
      edited.changes.map((c) => c.field),
      ['punchOut', 'status'],
    )
    assert.equal(edited.changes[0].after, istToUtc('2026-09-25', '16:00').toISOString())
    assert.deepEqual(edited.changes[1], { field: 'status', before: 'half_day', after: 'present' })

    assert.equal(created.actionLabel, 'Attendance added')
    assert.equal(created.employee.name, 'Ramesh')
    assert.equal(created.attendanceDate, '2026-09-24')
    assert.ok(created.changes.some((c) => c.field === 'manualStatus' && c.before === null && c.after === 'on_leave'))
  })

  test('filter by type', async () => {
    const res = await api('/audit-logs?type=employee.salary_update')
    assert.deepEqual(res.body.rows.map((r) => r.action), ['employee.salary_update'])
    assert.equal(res.body.total, 1)
  })

  test('filter by employee covers salary and attendance entries', async () => {
    const ramesh = await api(`/audit-logs?employeeId=${staff.Ramesh.id}`)
    assert.deepEqual(ramesh.body.rows.map((r) => r.action), ['attendance.manual_create', 'employee.salary_update'])
    const suresh = await api(`/audit-logs?employeeId=${staff.Suresh.id}`)
    assert.deepEqual(suresh.body.rows.map((r) => r.action), ['attendance.manual_edit'])
  })

  test('date range uses IST calendar days, inclusive', async () => {
    // 00:30 IST on 2 Sept is still 1 Sept in UTC; it must count as 2 Sept
    assert.equal((await api('/audit-logs?from=2026-09-01&to=2026-09-01')).body.total, 0)
    assert.equal((await api('/audit-logs?from=2026-09-02&to=2026-09-02')).body.total, 1)
    assert.equal((await api('/audit-logs?from=2026-09-26')).body.total, 2)
    assert.equal((await api('/audit-logs?to=2026-09-25')).body.total, 1)
    const combined = await api(`/audit-logs?from=2026-09-26&to=2026-09-26&employeeId=${staff.Ramesh.id}&type=attendance.manual_create`)
    assert.equal(combined.body.total, 1)
  })

  test('pagination', async () => {
    const res = await api('/audit-logs?limit=2&page=2')
    assert.equal(res.body.total, 3)
    assert.deepEqual(res.body.rows.map((r) => r.action), ['employee.salary_update'])
  })

  test('owner only; other businesses see nothing', async () => {
    assert.equal((await api('/audit-logs', manager.token)).status, 403)
    assert.equal((await t.request('GET', '/audit-logs')).status, 401)
    const b = await api('/audit-logs', ownerB.token)
    assert.equal(b.status, 200)
    assert.equal(b.body.total, 0)
    // An employee id from another business matches nothing
    assert.equal((await api(`/audit-logs?employeeId=${staff.Ramesh.id}`, ownerB.token)).body.total, 0)
  })

  test('validates filters', async () => {
    assert.equal((await api('/audit-logs?type=delete_everything')).status, 400)
    assert.equal((await api('/audit-logs?from=2026-09-10&to=2026-09-01')).status, 400)
    assert.equal((await api('/audit-logs?from=2026-02-30')).status, 400)
    assert.equal((await api('/audit-logs?employeeId=nope')).status, 400)
  })
})
