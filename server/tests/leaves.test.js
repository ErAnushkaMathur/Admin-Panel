import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { startTestServer } from './helpers/testServer.js'
import { setNowForTests } from '../src/utils/clock.js'
import { istToUtc } from '../src/utils/time.js'

// Oct 2026: 1 Thu, 2 Fri, 3 Sat, 4 Sun, 5 Mon
let t, owner, ownerB, manager, punchToken
const staff = {}
const leaves = {}

const req = (method, path, body, token = owner.token) => t.request(method, path, { token, body })
const setNow = (ymd, hhmm) => setNowForTests(istToUtc(ymd, hhmm))
const auditFor = (leaveId) =>
  t.db().collection('auditlogs').find({ entity: 'Leave', entityId: new t.mongoose.Types.ObjectId(leaveId) }).sort({ at: 1 }).toArray()
const leave = (name, fromDate, toDate, type = 'paid', reason = '') => ({ employeeId: staff[name].id, fromDate, toDate, type, reason })
const rowFor = (rows, name) => rows.find((r) => r.employee._id === staff[name].id)

before(async () => {
  t = await startTestServer()
  owner = await t.registerOwner('Alpha')
  ownerB = await t.registerOwner('Beta')
  setNow('2026-10-05', '12:00')

  const dept = (await req('POST', '/departments', { name: 'Kitchen', color: '#f2727f', icon: 'chef-hat' })).body.department._id
  const shift = (await req('POST', '/shifts', { name: 'Morning', startTime: '08:00', endTime: '16:00', graceMinutes: 10 })).body.shift._id
  const people = [
    ['ramesh', '2026-01-01', [0]], // Sundays off
    ['suresh', '2026-01-01', []],
    ['amit', '2026-10-02', []], // joined 2 Oct
    ['kavita', '2026-01-01', []], // will be deactivated
  ]
  for (const [i, [name, joinDate, weeklyOff]] of people.entries()) {
    const res = await req('POST', '/employees', {
      name: name[0].toUpperCase() + name.slice(1),
      phone: `900000000${i}`,
      departmentId: dept,
      roleTitle: 'Helper',
      shiftId: shift,
      joinDate,
      salary: { type: 'monthly', amountPaise: 1500000, weeklyOff },
    })
    staff[name] = { id: res.body.employee._id, code: res.body.employee.employeeCode, pin: res.body.pin }
  }
  await req('PATCH', `/employees/${staff.kavita.id}`, { isActive: false })
  punchToken = (await req('GET', '/settings/punch-link')).body.punchToken

  await t.mongoose.model('User').create({
    businessId: owner.businessId,
    name: 'Mona Manager',
    email: 'mona@alpha.test',
    passwordHash: await bcrypt.hash('secret123', 4),
    role: 'manager',
  })
  manager = { token: (await t.request('POST', '/auth/login', { body: { email: 'mona@alpha.test', password: 'secret123' } })).body.token }
})
after(async () => {
  setNowForTests(null)
  await t?.stop()
})

describe('request, approve, reject', () => {
  test('recording a request creates pending leave, no audit entry', async () => {
    const res = await req('POST', '/leaves', leave('ramesh', '2026-10-01', '2026-10-03', 'paid', 'Village festival'))
    assert.equal(res.status, 201)
    const l = res.body.leave
    assert.equal(l.status, 'pending')
    assert.equal(l.days, 3)
    assert.equal(l.employee.name, 'Ramesh')
    assert.equal(l.requestedBy.name, 'Alpha Owner')
    assert.equal(l.addedByOwner, false)
    leaves.rameshFest = l._id
    assert.equal((await auditFor(l._id)).length, 0)
  })

  test('overlapping a pending leave is rejected; back-to-back is fine', async () => {
    const clash = await req('POST', '/leaves', leave('ramesh', '2026-10-03', '2026-10-04'))
    assert.equal(clash.status, 409)
    assert.equal(clash.body.error.code, 'LEAVE_OVERLAP')
    assert.equal(clash.body.error.details[0].field, 'fromDate')
    assert.match(clash.body.error.message, /Ramesh already has pending leave for 2026-10-01 to 2026-10-03/)

    const next = await req('POST', '/leaves', leave('ramesh', '2026-10-04', '2026-10-04', 'unpaid'))
    assert.equal(next.status, 201)
    leaves.rameshSunday = next.body.leave._id
  })

  test('manager approves; audit entry with before/after status and note', async () => {
    const res = await req('POST', `/leaves/${leaves.rameshFest}/approve`, { note: 'Enjoy the festival' }, manager.token)
    assert.equal(res.status, 200)
    assert.equal(res.body.leave.status, 'approved')
    assert.equal(res.body.leave.decidedBy.name, 'Mona Manager')
    assert.equal(res.body.leave.decisionNote, 'Enjoy the festival')
    assert.equal(res.body.leave.decidedAt, istToUtc('2026-10-05', '12:00').toISOString())

    const [log] = await auditFor(leaves.rameshFest)
    assert.equal(log.action, 'leave.approve')
    assert.equal(log.before.status, 'pending')
    assert.equal(log.after.status, 'approved')
    assert.equal(log.after.fromDate, '2026-10-01')
    assert.equal(log.reason, 'Enjoy the festival')

    const again = await req('POST', `/leaves/${leaves.rameshFest}/approve`, {})
    assert.equal(again.status, 409)
    assert.equal(again.body.error.code, 'LEAVE_NOT_PENDING')
  })

  test('overlapping an approved leave is rejected too', async () => {
    const res = await req('POST', '/leaves', leave('ramesh', '2026-09-30', '2026-10-01'))
    assert.equal(res.status, 409)
    assert.match(res.body.error.message, /approved leave/)
  })

  test('reject writes an audit entry; a rejected leave no longer blocks', async () => {
    const res = await req('POST', `/leaves/${leaves.rameshSunday}/reject`, { note: 'Short staffed that day' })
    assert.equal(res.body.leave.status, 'rejected')
    const [log] = await auditFor(leaves.rameshSunday)
    assert.equal(log.action, 'leave.reject')
    assert.equal(log.after.status, 'rejected')
    assert.equal(log.reason, 'Short staffed that day')

    const retry = await req('POST', '/leaves', leave('ramesh', '2026-10-04', '2026-10-04'))
    assert.equal(retry.status, 201)
    leaves.rameshSunday2 = retry.body.leave._id
    assert.equal((await req('POST', `/leaves/${retry.body.leave._id}/approve`, {})).status, 200)
  })

  test('cannot reject an approved leave', async () => {
    const res = await req('POST', `/leaves/${leaves.rameshFest}/reject`, {})
    assert.equal(res.status, 409)
  })
})

describe('owner adds leave on behalf', () => {
  test('owner-added leave is approved at once and audit-logged', async () => {
    const res = await req('POST', '/leaves/on-behalf', leave('suresh', '2026-10-05', '2026-10-05', 'sick', 'Fever, called in'))
    assert.equal(res.status, 201)
    const l = res.body.leave
    assert.equal(l.status, 'approved')
    assert.equal(l.addedByOwner, true)
    assert.equal(l.decidedBy.name, 'Alpha Owner')
    leaves.sureshSick = l._id

    const [log] = await auditFor(l._id)
    assert.equal(log.action, 'leave.owner_add')
    assert.equal(log.before, null)
    assert.deepEqual(log.after, { fromDate: '2026-10-05', toDate: '2026-10-05', type: 'sick', status: 'approved', reason: 'Fever, called in' })
    assert.equal(log.reason, 'Fever, called in')
  })

  test('managers cannot add leave on behalf', async () => {
    const res = await req('POST', '/leaves/on-behalf', leave('suresh', '2026-10-20', '2026-10-20'), manager.token)
    assert.equal(res.status, 403)
  })

  test('on-behalf leave follows the overlap rule', async () => {
    const res = await req('POST', '/leaves/on-behalf', leave('suresh', '2026-10-04', '2026-10-06'))
    assert.equal(res.status, 409)
    assert.equal((await t.db().collection('auditlogs').countDocuments({ action: 'leave.owner_add' })), 1)
  })

  test('two overlapping requests at the same moment: exactly one gets through', async () => {
    const [a, b] = await Promise.all([
      req('POST', '/leaves', leave('suresh', '2026-10-10', '2026-10-12')),
      req('POST', '/leaves', leave('suresh', '2026-10-11', '2026-10-13')),
    ])
    assert.deepEqual([a.status, b.status].sort(), [201, 409])
    const stored = await t.db().collection('leaves').countDocuments({
      employeeId: new t.mongoose.Types.ObjectId(staff.suresh.id),
      fromDate: { $gte: '2026-10-10' },
    })
    assert.equal(stored, 1)
    leaves.sureshTrip = (a.status === 201 ? a : b).body.leave._id
  })
})

describe('validation and isolation', () => {
  test('bad input is rejected', async () => {
    const cases = [
      [leave('ramesh', '2026-10-20', '2026-10-19'), 'toDate'],
      [leave('ramesh', '2026-10-01', '2027-01-15'), 'toDate'], // > 90 days
      [{ ...leave('ramesh', '2026-10-20', '2026-10-20'), type: 'holiday' }, 'type'],
      [{ ...leave('ramesh', '2026-10-20', '2026-10-20'), status: 'approved' }, ''], // can't self-approve via body
      [leave('ramesh', '2026-02-30', '2026-03-01'), 'fromDate'],
    ]
    for (const [body, field] of cases) {
      const res = await req('POST', '/leaves', body)
      assert.equal(res.status, 400, JSON.stringify(body))
      assert.ok(res.body.error.details.some((d) => d.field === field), `${field}: ${JSON.stringify(res.body.error.details)}`)
    }
  })

  test('inactive employee and dates before joining', async () => {
    const inactive = await req('POST', '/leaves', leave('kavita', '2026-10-20', '2026-10-20'))
    assert.equal(inactive.status, 400)
    assert.equal(inactive.body.error.details[0].field, 'employeeId')
    const early = await req('POST', '/leaves', leave('amit', '2026-10-01', '2026-10-02'))
    assert.equal(early.status, 400)
    assert.match(early.body.error.details[0].message, /before Amit joined/)
  })

  test('another business cannot see, create for, or decide these leaves', async () => {
    assert.equal((await req('GET', '/leaves', undefined, ownerB.token)).body.total, 0)
    assert.equal((await req('POST', '/leaves', leave('ramesh', '2026-10-25', '2026-10-25'), ownerB.token)).status, 404)
    assert.equal((await req('POST', `/leaves/${leaves.sureshTrip}/approve`, {}, ownerB.token)).status, 404)
    assert.equal((await req('POST', '/leaves/not-an-id/approve', {})).status, 400)
    assert.equal((await t.request('GET', '/leaves')).status, 401)
  })
})

describe('GET /leaves', () => {
  test('counts per status and status filter', async () => {
    const all = await req('GET', '/leaves')
    assert.deepEqual(all.body.counts, { pending: 1, approved: 3, rejected: 1, all: 5 })
    assert.equal(all.body.total, 5)
    const pending = await req('GET', '/leaves?status=pending')
    assert.deepEqual(pending.body.rows.map((l) => l.employee.name), ['Suresh'])
    assert.equal(pending.body.rows[0].days, 3)
  })

  test('filter by employee and by overlapping date range', async () => {
    const ramesh = await req('GET', `/leaves?employeeId=${staff.ramesh.id}`)
    assert.equal(ramesh.body.total, 3)
    assert.deepEqual(ramesh.body.counts, { pending: 0, approved: 2, rejected: 1, all: 3 })
    const range = await req('GET', '/leaves?from=2026-10-03&to=2026-10-05&status=approved')
    assert.deepEqual(range.body.rows.map((l) => l.fromDate).sort(), ['2026-10-01', '2026-10-04', '2026-10-05'])
  })
})

describe('approved leave drives deriveStatus in Attendance', () => {
  test('Today: approved leave shows as on_leave; pending/rejected do not', async () => {
    setNow('2026-10-05', '12:00')
    // Amit asks for 2 Oct and is refused -> still absent that day
    const amit = await req('POST', '/leaves', leave('amit', '2026-10-02', '2026-10-02'))
    await req('POST', `/leaves/${amit.body.leave._id}/reject`, {})

    const oct2 = await req('GET', '/attendance?date=2026-10-02')
    assert.equal(rowFor(oct2.body.rows, 'ramesh').status, 'on_leave')
    assert.equal(rowFor(oct2.body.rows, 'amit').status, 'absent')
    assert.equal(rowFor(oct2.body.rows, 'suresh').status, 'absent')
    assert.equal(oct2.body.summary.on_leave, 1)
  })

  test('leave beats weekly off', async () => {
    const sunday = await req('GET', '/attendance?date=2026-10-04')
    assert.equal(rowFor(sunday.body.rows, 'ramesh').status, 'on_leave')
  })

  test('leave shows today before the shift ends; an actual punch then counts as work', async () => {
    const before = await req('GET', '/attendance?date=2026-10-05')
    assert.equal(rowFor(before.body.rows, 'suresh').status, 'on_leave')

    const punch = await t.request('POST', '/punch', { body: { businessToken: punchToken, employeeCode: staff.suresh.code, pin: staff.suresh.pin } })
    assert.equal(punch.body.action, 'in')
    const afterPunch = await req('GET', '/attendance?date=2026-10-05')
    assert.equal(rowFor(afterPunch.body.rows, 'suresh').status, 'late')
    assert.equal(rowFor(afterPunch.body.rows, 'suresh').lateMinutes, 240)
  })

  test('Monthly: leave days (including planned future leave) show and count as on_leave', async () => {
    await req('POST', `/leaves/${leaves.sureshTrip}/approve`, {})
    const res = await req('GET', '/attendance/monthly?month=2026-10')
    const cells = (name) => res.body.employees.find((e) => e.employee.name === name).days
    const totals = (name) => res.body.employees.find((e) => e.employee.name === name).totals

    const ramesh = cells('Ramesh')
    assert.deepEqual(ramesh.slice(0, 5).map((c) => c?.status), ['on_leave', 'on_leave', 'on_leave', 'on_leave', 'not_yet_in'])
    assert.equal(totals('Ramesh').on_leave, 4)
    assert.equal(totals('Ramesh').weekly_off, 0, 'the Sunday on leave counts as leave, not weekly off')

    const suresh = cells('Suresh')
    const tripStart = suresh[9]?.status === 'on_leave' ? 9 : 10 // whichever overlapping request won
    assert.equal(suresh[tripStart].status, 'on_leave')
    assert.equal(suresh[tripStart + 2].status, 'on_leave')
    assert.equal(suresh[tripStart + 3], null, 'future day without leave stays empty')
    assert.equal(suresh[4].status, 'late', 'punched on a sick-leave day: counts as work')
    assert.equal(totals('Suresh').on_leave, 3)
  })
})

describe('Audit Log integration', () => {
  test('leave actions are registered, labelled and filterable', async () => {
    const res = await req('GET', '/audit-logs')
    const labels = res.body.actionTypes.map((a) => a.label)
    for (const l of ['Leave approved', 'Leave rejected', 'Leave added by owner']) assert.ok(labels.includes(l), l)

    const approvals = await req('GET', '/audit-logs?type=leave.approve')
    assert.equal(approvals.body.total, 3)
    const fest = approvals.body.rows.find((r) => r.leave?.fromDate === '2026-10-01')
    assert.equal(fest.actionLabel, 'Leave approved')
    assert.equal(fest.category, 'leave')
    assert.equal(fest.employee.name, 'Ramesh')
    assert.deepEqual(fest.leave, { fromDate: '2026-10-01', toDate: '2026-10-03', type: 'paid' })
    assert.deepEqual(fest.changes, [{ field: 'status', before: 'pending', after: 'approved' }])
    assert.equal(fest.actor.name, 'Mona Manager')
  })

  test('employee filter includes their leave entries', async () => {
    const ramesh = await req('GET', `/audit-logs?employeeId=${staff.ramesh.id}`)
    assert.deepEqual(ramesh.body.rows.map((r) => r.action).sort(), ['leave.approve', 'leave.approve', 'leave.reject'])
    const suresh = await req('GET', `/audit-logs?employeeId=${staff.suresh.id}&type=leave.owner_add`)
    assert.equal(suresh.body.total, 1)
  })
})
