import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { startTestServer } from './helpers/testServer.js'
import { setNowForTests } from '../src/utils/clock.js'
import { istToUtc } from '../src/utils/time.js'

// Golden rule 10: Departments, Attendance and Dashboard read today's status from deriveStatus,
// so they must agree. "Now" = Friday 25 Sept 2026, 12:00 IST.
const TODAY = '2026-09-25'
const CAME_IN = ['present', 'late', 'half_day']
let t, owner
const ids = {}
const req = (method, path, body) => t.request(method, path, { token: owner.token, body })

before(async () => {
  t = await startTestServer()
  owner = await t.registerOwner('Alpha')
  setNowForTests(istToUtc(TODAY, '12:00'))
  ids.kitchen = (await req('POST', '/departments', { name: 'Kitchen', color: '#f2727f', icon: 'chef-hat' })).body.department._id
  ids.counter = (await req('POST', '/departments', { name: 'Counter', color: '#4a90d9', icon: 'store' })).body.department._id
  const shift = async (name, startTime, endTime) => (await req('POST', '/shifts', { name, startTime, endTime, graceMinutes: 10 })).body.shift
  const morning = await shift('Morning', '09:00', '17:00')
  const early = await shift('Early', '05:00', '11:00')
  const evening = await shift('Evening', '14:00', '22:00')

  let phone = 9000000000
  const emp = async (name, departmentId, s, extra = {}) => {
    phone += 1
    const res = await req('POST', '/employees', {
      name, phone: String(phone), departmentId, roleTitle: 'Helper', shiftId: s._id, joinDate: '2026-01-01',
      salary: { type: 'monthly', amountPaise: 1_000_000, weeklyOff: [0] }, ...extra,
    })
    assert.equal(res.status, 201, JSON.stringify(res.body))
    return { id: res.body.employee._id, shift: s }
  }
  const punch = (e, inTime, outTime = null) =>
    t.mongoose.model('Attendance').create({
      businessId: owner.businessId, employeeId: e.id, date: TODAY, shiftId: e.shift._id,
      shiftSnapshot: { name: e.shift.name, startTime: e.shift.startTime, endTime: e.shift.endTime, graceMinutes: 10, crossesMidnight: false },
      punchIn: istToUtc(TODAY, inTime), punchOut: outTime && istToUtc(TODAY, outTime), source: 'qr',
    })

  // Kitchen
  const amit = await emp('Amit', ids.kitchen, morning) // on time
  const bina = await emp('Bina', ids.kitchen, morning) // late
  const chetan = await emp('Chetan', ids.kitchen, early) // half day
  const dev = await emp('Dev', ids.kitchen, morning) // punched in, then marked Absent by hand
  await punch(amit, '08:55')
  await punch(bina, '09:30')
  await punch(chetan, '05:00', '07:00')
  const devRecord = await punch(dev, '09:00')
  const edit = await req('PATCH', `/attendance/${devRecord._id}`, { status: 'absent', reason: 'Punched in for a friend, was not here' })
  assert.equal(edit.status, 200, JSON.stringify(edit.body))

  // Counter
  const esha = await emp('Esha', ids.counter, morning) // on approved leave but came in anyway
  const farah = await emp('Farah', ids.counter, morning) // marked On leave by hand
  await emp('Gita', ids.counter, morning, { salary: { type: 'monthly', amountPaise: 1_000_000, weeklyOff: [5] } }) // Friday off
  await emp('Hari', ids.counter, evening) // shift not started
  await req('POST', '/leaves/on-behalf', { employeeId: esha.id, fromDate: TODAY, toDate: TODAY, type: 'paid' })
  await punch(esha, '09:00')
  await req('POST', '/attendance/manual', { employeeId: farah.id, date: TODAY, status: 'on_leave', reason: 'Called in sick' })

  // Not staff today: deactivated after punching in, and joining next month
  const isha = await emp('Isha', ids.counter, morning)
  await punch(isha, '09:00')
  await req('PATCH', `/employees/${isha.id}`, { isActive: false })
  await emp('Jay', ids.counter, morning, { joinDate: '2026-10-01' })
})
after(async () => {
  setNowForTests(null)
  await t?.stop()
})

describe("today's counts agree across Departments, Attendance and Dashboard", () => {
  let departments, attendance, dashboard
  before(async () => {
    departments = (await req('GET', '/departments')).body.departments
    attendance = (await req('GET', `/attendance?date=${TODAY}`)).body
    dashboard = (await req('GET', '/dashboard/summary')).body
  })

  // The Attendance page also lists a deactivated employee who punched today; the staff
  // figures (Dashboard, Departments) cover active employees only.
  const activeAttendanceRows = () => attendance.rows.filter((r) => r.employee.isActive)

  test('per-employee status: Dashboard staff table = Attendance page', () => {
    assert.equal(dashboard.staff.total, 8)
    const byName = Object.fromEntries(activeAttendanceRows().map((r) => [r.employee.name, r.status]))
    assert.deepEqual(Object.fromEntries(dashboard.staff.rows.map((r) => [r.employee.name, r.status])), byName)
    assert.deepEqual(byName, {
      Amit: 'present',
      Bina: 'late',
      Chetan: 'half_day',
      Dev: 'absent',
      Esha: 'present',
      Farah: 'on_leave',
      Gita: 'weekly_off',
      Hari: 'not_yet_in',
    })
  })

  test('status totals: Dashboard = Attendance page, and they add up to total staff', () => {
    const fromAttendance = {}
    for (const r of activeAttendanceRows()) fromAttendance[r.status] = (fromAttendance[r.status] ?? 0) + 1
    for (const [status, count] of Object.entries(dashboard.todayBreakdown.counts)) {
      assert.equal(count, fromAttendance[status] ?? 0, status)
    }
    assert.equal(Object.values(dashboard.todayBreakdown.counts).reduce((a, b) => a + b, 0), dashboard.kpis.totalStaff)
    const cameIn = activeAttendanceRows().filter((r) => CAME_IN.includes(r.status)).length
    assert.equal(dashboard.kpis.presentToday, cameIn)
    assert.equal(cameIn, 4)
  })

  test('per department: Departments page = Dashboard bars = Attendance page', () => {
    for (const [name, id, expected] of [
      ['Kitchen', ids.kitchen, { staffToday: 4, presentToday: 3 }], // Dev was marked absent
      ['Counter', ids.counter, { staffToday: 4, presentToday: 1 }], // Esha worked on her leave day
    ]) {
      const dept = departments.find((d) => d._id === id)
      const bar = dashboard.departments.find((d) => d.name === name)
      const rows = activeAttendanceRows().filter((r) => r.employee.department?._id === id)

      assert.deepEqual({ staffToday: dept.staffToday, presentToday: dept.presentToday }, expected, name)
      assert.deepEqual({ staffToday: bar.total, presentToday: bar.cameIn }, expected, `${name} dashboard`)
      assert.deepEqual(
        { staffToday: rows.length, presentToday: rows.filter((r) => CAME_IN.includes(r.status)).length },
        expected,
        `${name} attendance`,
      )
    }
    // staffCount still means every active employee in the department, including Jay who joins later
    assert.equal(departments.find((d) => d._id === ids.counter).staffCount, 5)
  })

  test('department figures add up to the Dashboard KPIs', () => {
    assert.equal(departments.reduce((s, d) => s + d.staffToday, 0), dashboard.kpis.totalStaff)
    assert.equal(departments.reduce((s, d) => s + d.presentToday, 0), dashboard.kpis.presentToday)
  })
})
