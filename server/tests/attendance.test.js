import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { startTestServer } from './helpers/testServer.js'
import { setNowForTests } from '../src/utils/clock.js'
import { istToUtc } from '../src/utils/time.js'
import { flagMissingCheckouts } from '../src/jobs/missingCheckout.job.js'

let t, owner, ownerB, manager, punchToken
const staff = {}
const depts = {}

const at = (ymd, hhmm) => istToUtc(ymd, hhmm)
const setNow = (ymd, hhmm) => setNowForTests(at(ymd, hhmm))
const UA_A = 'Mozilla/5.0 (Linux; Android 10) PhoneA'
const UA_B = 'Mozilla/5.0 (Linux; Android 12) PhoneB'

const api = (method, path, body, token = owner.token) => t.request(method, path, { token, body })
function punchAt(name, ymd, hhmm, ua = UA_A) {
  setNow(ymd, hhmm)
  return t.request('POST', '/punch', {
    headers: { 'user-agent': ua },
    body: { businessToken: punchToken, employeeCode: staff[name].code, pin: staff[name].pin },
  })
}
const rowFor = (rows, name) => rows.find((r) => r.employee._id === staff[name].id)
const auditLogs = (entityId) =>
  t.db().collection('auditlogs').find({ entityId: new t.mongoose.Types.ObjectId(entityId) }).sort({ at: 1 }).toArray()

before(async () => {
  t = await startTestServer()
  owner = await t.registerOwner('Alpha')
  ownerB = await t.registerOwner('Beta')
  depts.kitchen = (await api('POST', '/departments', { name: 'Kitchen', color: '#f2727f', icon: 'chef-hat' })).body.department._id
  depts.counter = (await api('POST', '/departments', { name: 'Counter', color: '#4a90d9', icon: 'store' })).body.department._id
  const morning = (await api('POST', '/shifts', { name: 'Morning', startTime: '08:00', endTime: '16:00', graceMinutes: 10 })).body.shift._id
  const night = (await api('POST', '/shifts', { name: 'Night', startTime: '22:00', endTime: '06:00', graceMinutes: 10 })).body.shift._id

  const people = [
    ['ramesh', depts.kitchen, morning, '2026-01-01', [0]], // Sundays off
    ['suresh', depts.counter, morning, '2026-01-01', []],
    ['nisha', depts.kitchen, night, '2026-01-01', []],
    ['amit', depts.kitchen, morning, '2026-09-20', []], // joined mid-month
  ]
  for (const [i, [name, departmentId, shiftId, joinDate, weeklyOff]] of people.entries()) {
    const res = await api('POST', '/employees', {
      name: name[0].toUpperCase() + name.slice(1),
      phone: `900000000${i}`,
      departmentId,
      roleTitle: 'Helper',
      shiftId,
      joinDate,
      salary: { type: 'monthly', amountPaise: 1500000, weeklyOff },
    })
    staff[name] = { id: res.body.employee._id, code: res.body.employee.employeeCode, pin: res.body.pin }
  }
  punchToken = (await api('GET', '/settings/punch-link')).body.punchToken

  await t.mongoose.model('User').create({
    businessId: owner.businessId,
    name: 'Mona Manager',
    email: 'mona@alpha.test',
    passwordHash: await bcrypt.hash('secret123', 4),
    role: 'manager',
  })
  manager = { token: (await t.request('POST', '/auth/login', { body: { email: 'mona@alpha.test', password: 'secret123' } })).body.token }

  // Friday 25 Sept 2026
  await punchAt('ramesh', '2026-09-25', '07:55')
  await punchAt('ramesh', '2026-09-25', '16:05')
  await punchAt('suresh', '2026-09-25', '08:30')
  await punchAt('suresh', '2026-09-25', '11:00') // 150 min -> half day
})
after(async () => {
  setNowForTests(null)
  await t?.stop()
})

describe('punch-out stores the derived status', () => {
  test('short day is stored as half_day', async () => {
    const rec = await t.db().collection('attendances').findOne({ employeeId: new t.mongoose.Types.ObjectId(staff.suresh.id) })
    assert.equal(rec.status, 'half_day')
    assert.equal(rec.lateMinutes, 30)
    assert.equal(rec.workedMinutes, 150)
  })
})

describe('GET /attendance (Today)', () => {
  test('one row per employee with live statuses and backend summary', async () => {
    setNow('2026-09-25', '17:00')
    const res = await api('GET', '/attendance?date=2026-09-25')
    assert.equal(res.status, 200)
    const { rows, summary } = res.body
    assert.equal(rows.length, 4)
    assert.equal(rowFor(rows, 'ramesh').status, 'present')
    assert.equal(rowFor(rows, 'ramesh').workedMinutes, 490)
    assert.equal(rowFor(rows, 'suresh').status, 'half_day')
    assert.equal(rowFor(rows, 'nisha').status, 'not_yet_in') // night shift hasn't ended
    assert.equal(rowFor(rows, 'amit').status, 'absent')
    assert.equal(rowFor(rows, 'amit').attendanceId, null)
    assert.equal(summary.total, 4)
    assert.deepEqual([summary.present, summary.half_day, summary.not_yet_in, summary.absent], [1, 1, 1, 1])
    assert.equal('salary' in rowFor(rows, 'ramesh').employee, false)
  })

  test('defaults to today (IST) and filters by department and status', async () => {
    setNow('2026-09-25', '17:00')
    const today = await api('GET', '/attendance')
    assert.equal(today.body.date, '2026-09-25')

    const counter = await api('GET', `/attendance?date=2026-09-25&departmentId=${depts.counter}`)
    assert.deepEqual(counter.body.rows.map((r) => r.employee.name), ['Suresh'])

    const absent = await api('GET', '/attendance?date=2026-09-25&status=absent')
    assert.deepEqual(absent.body.rows.map((r) => r.employee.name), ['Amit'])
    assert.equal(absent.body.summary.total, 4, 'summary covers everyone, not just the filtered rows')
  })

  test('weekly off is not absent; before joining there is no row', async () => {
    setNow('2026-09-28', '12:00')
    const sunday = await api('GET', '/attendance?date=2026-09-27')
    assert.equal(rowFor(sunday.body.rows, 'ramesh').status, 'weekly_off')
    assert.equal(rowFor(sunday.body.rows, 'suresh').status, 'absent')
    const early = await api('GET', '/attendance?date=2026-09-19')
    assert.equal(rowFor(early.body.rows, 'amit'), undefined)
  })

  test('managers can view attendance; other businesses see nothing', async () => {
    setNow('2026-09-25', '17:00')
    assert.equal((await api('GET', '/attendance?date=2026-09-25', undefined, manager.token)).body.rows.length, 4)
    assert.equal((await api('GET', '/attendance?date=2026-09-25', undefined, ownerB.token)).body.rows.length, 0)
  })

  test('validates query', async () => {
    assert.equal((await api('GET', '/attendance?date=2026-02-30')).status, 400)
    assert.equal((await api('GET', '/attendance?status=sleeping')).status, 400)
  })
})

describe('GET /attendance/monthly', () => {
  test('employee × day grid with totals', async () => {
    setNow('2026-09-28', '12:00')
    const res = await api('GET', '/attendance/monthly?month=2026-09')
    assert.equal(res.status, 200)
    assert.equal(res.body.days.length, 30)
    assert.equal(res.body.today, '2026-09-28')

    const ramesh = res.body.employees.find((e) => e.employee.name === 'Ramesh')
    const cell = (d) => ramesh.days[d - 1]
    assert.equal(cell(25).status, 'present')
    assert.ok(cell(25).attendanceId)
    assert.equal(cell(27).status, 'weekly_off')
    assert.equal(cell(24).status, 'absent')
    assert.equal(cell(28).status, 'not_yet_in') // today, shift not over
    assert.equal(cell(29), null) // future
    // 1–27 Sept: 1 present, 4 Sundays off, the other 22 days absent
    assert.deepEqual(ramesh.totals, { present: 1, late: 0, half_day: 0, absent: 22, on_leave: 0, weekly_off: 4 })

    const amit = res.body.employees.find((e) => e.employee.name === 'Amit')
    assert.equal(amit.days[18], null) // 19 Sept, before joining
    assert.equal(amit.days[19].status, 'absent') // 20 Sept
  })

  test('department filter and month validation', async () => {
    const res = await api('GET', `/attendance/monthly?month=2026-09&departmentId=${depts.counter}`)
    assert.deepEqual(res.body.employees.map((e) => e.employee.name), ['Suresh'])
    assert.equal((await api('GET', '/attendance/monthly?month=2026-13')).status, 400)
  })
})

describe('PATCH /attendance/:id (manual edit)', () => {
  let sureshRecord
  before(async () => {
    setNow('2026-09-25', '17:00')
    sureshRecord = rowFor((await api('GET', '/attendance?date=2026-09-25')).body.rows, 'suresh').attendanceId
  })

  test('reason is mandatory', async () => {
    const none = await api('PATCH', `/attendance/${sureshRecord}`, { punchOut: '16:00' })
    assert.equal(none.status, 400)
    assert.equal(none.body.error.details[0].field, 'reason')
    const short = await api('PATCH', `/attendance/${sureshRecord}`, { punchOut: '16:00', reason: 'ok' })
    assert.equal(short.status, 400)
    assert.match(short.body.error.details[0].message, /at least 5 characters/)
    assert.equal((await auditLogs(sureshRecord)).length, 0)
  })

  test('fixing punch-out recomputes status and writes an AuditLog entry', async () => {
    const res = await api('PATCH', `/attendance/${sureshRecord}`, { punchOut: '16:00', reason: 'Phone died, left at 4 PM' })
    assert.equal(res.status, 200)
    const a = res.body.attendance
    assert.equal(a.status, 'late')
    assert.equal(a.workedMinutes, 450)
    assert.equal(a.lateMinutes, 30)
    assert.ok(a.flags.includes('manual_edit'))
    assert.equal(a.editReason, 'Phone died, left at 4 PM')
    assert.equal(a.editedBy, owner.userId)

    const [log] = await auditLogs(sureshRecord)
    assert.equal(log.action, 'attendance.manual_edit')
    assert.equal(log.entity, 'Attendance')
    assert.equal(log.reason, 'Phone died, left at 4 PM')
    assert.equal(log.before.punchOut, at('2026-09-25', '11:00').toISOString())
    assert.equal(log.after.punchOut, at('2026-09-25', '16:00').toISOString())
    assert.equal(log.before.status, 'half_day')
    assert.equal(log.after.status, 'late')
  })

  test('marking a status overrides; clearing it returns to the punch-based status', async () => {
    const marked = await api('PATCH', `/attendance/${sureshRecord}`, { status: 'present', reason: 'Late was approved by owner' })
    assert.equal(marked.body.attendance.status, 'present')
    assert.equal(marked.body.attendance.manualStatus, 'present')
    const cleared = await api('PATCH', `/attendance/${sureshRecord}`, { status: null, reason: 'Undo approval, keep it late' })
    assert.equal(cleared.body.attendance.status, 'late')
    assert.equal(cleared.body.attendance.manualStatus, null)
    assert.equal((await auditLogs(sureshRecord)).length, 3)
  })

  test('no-op edit and bad input are rejected', async () => {
    const same = await api('PATCH', `/attendance/${sureshRecord}`, { punchOut: '16:00', reason: 'Saving the same thing' })
    assert.equal(same.status, 400)
    const onlyReason = await api('PATCH', `/attendance/${sureshRecord}`, { reason: 'Nothing else here' })
    assert.equal(onlyReason.status, 400)
    const badStatus = await api('PATCH', `/attendance/${sureshRecord}`, { status: 'not_yet_in', reason: 'Trying a display status' })
    assert.equal(badStatus.status, 400)
    const noIn = await api('PATCH', `/attendance/${sureshRecord}`, { punchIn: null, reason: 'Remove the punch in' })
    assert.equal(noIn.status, 400)
  })

  test('managers can edit; other businesses cannot', async () => {
    const byManager = await api('PATCH', `/attendance/${sureshRecord}`, { punchIn: '08:05', reason: 'Gate clock was slow' }, manager.token)
    assert.equal(byManager.status, 200)
    assert.equal(byManager.body.attendance.status, 'present')
    const other = await api('PATCH', `/attendance/${sureshRecord}`, { punchIn: '08:00', reason: 'Not my business' }, ownerB.token)
    assert.equal(other.status, 404)
  })
})

describe('POST /attendance/manual', () => {
  test('creates a record with a reason and an audit entry', async () => {
    setNow('2026-09-25', '17:00')
    const res = await api('POST', '/attendance/manual', {
      employeeId: staff.amit.id,
      date: '2026-09-24',
      punchIn: '08:00',
      punchOut: '16:00',
      reason: 'Forgot phone at home',
    })
    assert.equal(res.status, 201)
    const a = res.body.attendance
    assert.equal(a.status, 'present')
    assert.equal(a.source, 'manual')
    assert.deepEqual(a.flags, ['manual_edit'])
    const [log] = await auditLogs(a._id)
    assert.equal(log.action, 'attendance.manual_create')
    assert.equal(log.before, null)
  })

  test('status-only record (e.g. on leave)', async () => {
    const res = await api('POST', '/attendance/manual', { employeeId: staff.amit.id, date: '2026-09-23', status: 'on_leave', reason: 'Family function, informed' })
    assert.equal(res.body.attendance.status, 'on_leave')
  })

  test('duplicate day, future date, missing data, no reason, other business', async () => {
    const dup = await api('POST', '/attendance/manual', { employeeId: staff.amit.id, date: '2026-09-24', punchIn: '09:00', reason: 'Second record attempt' })
    assert.equal(dup.status, 409)
    assert.equal(dup.body.error.code, 'ATTENDANCE_EXISTS')
    const future = await api('POST', '/attendance/manual', { employeeId: staff.amit.id, date: '2026-09-30', punchIn: '08:00', reason: 'Too early for this' })
    assert.equal(future.status, 400)
    const empty = await api('POST', '/attendance/manual', { employeeId: staff.amit.id, date: '2026-09-22', reason: 'Nothing to record' })
    assert.equal(empty.status, 400)
    const noReason = await api('POST', '/attendance/manual', { employeeId: staff.amit.id, date: '2026-09-22', punchIn: '08:00' })
    assert.equal(noReason.status, 400)
    const other = await api('POST', '/attendance/manual', { employeeId: staff.amit.id, date: '2026-09-22', punchIn: '08:00', reason: 'Other business try' }, ownerB.token)
    assert.equal(other.status, 404)
  })
})

describe('missing checkout job + exceptions', () => {
  let nishaRecord

  test('open record is flagged only once 16h have passed (in-progress night shift is not)', async () => {
    await punchAt('nisha', '2026-09-25', '22:00')
    assert.equal(await flagMissingCheckouts(at('2026-09-26', '05:00')), 0)
    assert.equal(await flagMissingCheckouts(at('2026-09-26', '13:59')), 0)
    assert.equal(await flagMissingCheckouts(at('2026-09-26', '14:01')), 1)
    assert.equal(await flagMissingCheckouts(at('2026-09-26', '15:00')), 0, 'idempotent')
    const rec = await t.db().collection('attendances').findOne({ employeeId: new t.mongoose.Types.ObjectId(staff.nisha.id) })
    assert.deepEqual(rec.flags, ['missing_checkout'])
    assert.equal(rec.punchOut, null, 'hours are never auto-filled')
    nishaRecord = String(rec._id)
  })

  test('device mismatch punch shows up in exceptions', async () => {
    await punchAt('ramesh', '2026-09-26', '08:00', UA_B) // last 3 punches were all PhoneA
    setNow('2026-09-28', '12:00')
    const res = await api('GET', '/attendance/exceptions?type=device_mismatch')
    assert.equal(res.status, 200)
    assert.equal(res.body.rows.length, 1)
    const row = res.body.rows[0]
    assert.equal(row.employee.name, 'Ramesh')
    assert.equal(row.date, '2026-09-26')
    assert.equal(row.punchInDevice.userAgent, UA_B)

    const today = await api('GET', '/attendance?date=2026-09-26')
    assert.deepEqual(rowFor(today.body.rows, 'ramesh').flags, ['device_mismatch'])
  })

  test('exceptions list covers missing checkout and manual edits with who/why', async () => {
    setNow('2026-09-28', '12:00')
    const all = await api('GET', '/attendance/exceptions')
    assert.equal(all.body.to, '2026-09-28')
    assert.equal(all.body.from, '2026-08-29')
    const byFlag = (f) => all.body.rows.filter((r) => r.flags.includes(f)).map((r) => r.employee.name)
    assert.deepEqual(byFlag('missing_checkout'), ['Nisha'])
    assert.deepEqual(byFlag('device_mismatch'), ['Ramesh'])
    assert.deepEqual(byFlag('manual_edit').sort(), ['Amit', 'Amit', 'Suresh'])
    const edited = all.body.rows.find((r) => r.employee.name === 'Suresh')
    assert.equal(edited.editReason, 'Gate clock was slow')
    assert.equal(edited.editedBy.name, 'Mona Manager')

    const manual = await api('GET', '/attendance/exceptions?type=manual_edit&from=2026-09-24&to=2026-09-24')
    assert.deepEqual(manual.body.rows.map((r) => r.date), ['2026-09-24'])
  })

  test('adding the punch-out clears missing_checkout (manual_edit stays as the trail)', async () => {
    setNow('2026-09-28', '12:00')
    const res = await api('PATCH', `/attendance/${nishaRecord}`, { punchOut: '06:00', reason: 'Confirmed with Nisha, left at 6' })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body.attendance.flags, ['manual_edit'])
    assert.equal(res.body.attendance.workedMinutes, 480)
    assert.equal(res.body.attendance.punchOut, at('2026-09-26', '06:00').toISOString())
    const missing = await api('GET', '/attendance/exceptions?type=missing_checkout')
    assert.equal(missing.body.rows.length, 0)
  })
})
