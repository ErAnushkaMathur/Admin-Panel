import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { startTestServer } from './helpers/testServer.js'
import { setNowForTests } from '../src/utils/clock.js'
import { istToUtc } from '../src/utils/time.js'

// "Now" = Friday 25 Sept 2026, 12:00 IST
const TODAY = '2026-09-25'
let t, owner, ownerB, manager
const ids = {}
const req = (method, path, body, token = owner.token) => t.request(method, path, { token, body })
const summary = (query = '', token = owner.token) => req('GET', `/dashboard/summary${query}`, undefined, token)
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0)

async function addEmployee(name, phone, departmentId, shiftId, salary, extra = {}) {
  const res = await req('POST', '/employees', {
    name, phone, departmentId, roleTitle: 'Helper', shiftId, joinDate: '2026-01-01',
    salary: { type: 'monthly', amountPaise: 1_000_000, weeklyOff: [0], ...salary }, ...extra,
  })
  assert.equal(res.status, 201, JSON.stringify(res.body))
  return res.body.employee._id
}

async function addRecord(employeeId, shift, inTime, outTime = null) {
  await t.mongoose.model('Attendance').create({
    businessId: owner.businessId, employeeId, date: TODAY, shiftId: shift._id,
    shiftSnapshot: { name: shift.name, startTime: shift.startTime, endTime: shift.endTime, graceMinutes: shift.graceMinutes, crossesMidnight: false },
    punchIn: istToUtc(TODAY, inTime), punchOut: outTime && istToUtc(TODAY, outTime), source: 'qr',
  })
}

before(async () => {
  t = await startTestServer()
  owner = await t.registerOwner('Alpha')
  ownerB = await t.registerOwner('Beta')
  setNowForTests(istToUtc(TODAY, '12:00'))
  const dept = async (name, color) => (await req('POST', '/departments', { name, color, icon: 'store' })).body.department._id
  const shift = async (name, startTime, endTime) => (await req('POST', '/shifts', { name, startTime, endTime, graceMinutes: 10 })).body.shift
  ids.kitchen = await dept('Kitchen', '#f2727f')
  ids.counter = await dept('Counter', '#4a90d9')
  ids.packing = await dept('Packing', '#6bbf59')
  const morning = await shift('Morning', '09:00', '17:00')
  const early = await shift('Early', '05:00', '11:00')
  const evening = await shift('Evening', '14:00', '22:00')

  // Kitchen: on time, late, half day. Counter: on leave, absent (Early shift over), not yet in (Evening).
  // Packing: weekly off on Fridays. Plus one inactive and one joining in October (both excluded).
  ids.amit = await addEmployee('Amit', '9000000001', ids.kitchen, morning._id, { type: 'daily', amountPaise: 50_000 })
  ids.bina = await addEmployee('Bina', '9000000002', ids.kitchen, morning._id, { type: 'hourly', amountPaise: 10_000 })
  ids.chetan = await addEmployee('Chetan', '9000000003', ids.kitchen, early._id, {})
  ids.dev = await addEmployee('Dev', '9000000004', ids.counter, morning._id, {})
  ids.esha = await addEmployee('Esha', '9000000005', ids.counter, early._id, {})
  ids.priya = await addEmployee('Priya', '9000000006', ids.counter, evening._id, {})
  ids.gita = await addEmployee('Gita', '9000000007', ids.packing, morning._id, { weeklyOff: [5] })
  const gone = await addEmployee('Hari', '9000000008', ids.packing, morning._id, {})
  await req('PATCH', `/employees/${gone}`, { isActive: false })
  await addEmployee('Isha', '9000000009', ids.packing, morning._id, {}, { joinDate: '2026-10-01' })

  await addRecord(ids.amit, morning, '08:55')
  await addRecord(ids.bina, morning, '09:30')
  await addRecord(ids.chetan, early, '05:00', '07:00') // 120 min < 240 -> half day
  // Mockup bug 4: Amit punched on Morning; moving him to Evening afterwards must not change today's row
  await req('PATCH', `/employees/${ids.amit}`, { shiftId: evening._id })

  await req('POST', '/leaves/on-behalf', { employeeId: ids.dev, fromDate: TODAY, toDate: TODAY, type: 'paid' })
  await req('POST', '/leaves', { employeeId: ids.esha, fromDate: '2026-10-05', toDate: '2026-10-05', type: 'unpaid' })

  await t.mongoose.model('User').create({
    businessId: owner.businessId, name: 'Mona Manager', email: 'mona@alpha.test',
    passwordHash: await bcrypt.hash('secret123', 4), role: 'manager',
  })
  manager = { token: (await t.request('POST', '/auth/login', { body: { email: 'mona@alpha.test', password: 'secret123' } })).body.token }
})
after(async () => {
  setNowForTests(null)
  await t?.stop()
})

describe('GET /dashboard/summary', () => {
  test('today: one bucket per active employee, buckets add up to total staff', async () => {
    const res = await summary()
    assert.equal(res.status, 200)
    const { kpis, todayBreakdown } = res.body
    assert.equal(res.body.today, TODAY)
    assert.deepEqual(todayBreakdown.counts, { present: 1, late: 1, half_day: 1, absent: 1, on_leave: 1, weekly_off: 1, not_yet_in: 1 })
    assert.equal(todayBreakdown.total, 7)
    assert.equal(sum(todayBreakdown.counts), kpis.totalStaff)
    // SPEC 5 rule: present + late + absent + on leave + half day (+ weekly off + not yet in) = total staff
    const c = todayBreakdown.counts
    assert.equal(c.present + c.late + c.absent + c.on_leave + c.half_day + c.weekly_off + c.not_yet_in, kpis.totalStaff)

    assert.deepEqual(kpis, {
      totalStaff: 7,
      presentToday: 3, // on time + late + half day
      presentPercent: 42.9,
      lateToday: 1,
      absentToday: 1,
      onLeaveToday: 1,
      pendingLeaveRequests: 1,
    })
  })

  test('department attendance adds up to the KPIs', async () => {
    const { departments, kpis } = (await summary()).body
    assert.deepEqual(departments.map((d) => [d.name, d.cameIn, d.total]), [
      ['Counter', 0, 3],
      ['Kitchen', 3, 3],
      ['Packing', 0, 1],
    ])
    assert.equal(departments.reduce((s, d) => s + d.total, 0), kpis.totalStaff)
    assert.equal(departments.reduce((s, d) => s + d.cameIn, 0), kpis.presentToday)
  })

  test('statuses match the Attendance page for the same day', async () => {
    const dash = (await summary()).body.staff.rows
    const attendance = (await req('GET', `/attendance?date=${TODAY}`)).body.rows
    for (const row of dash) {
      const a = attendance.find((r) => r.employee._id === String(row.employee._id))
      assert.equal(row.status, a.status, row.employee.name)
    }
  })

  test('staff table: earliest check-in first, shift is the one the punch was made on', async () => {
    const { staff } = (await summary()).body
    assert.equal(staff.total, 7)
    assert.deepEqual(staff.rows.slice(0, 3).map((r) => r.employee.name), ['Chetan', 'Amit', 'Bina'])
    const amit = staff.rows.find((r) => r.employee.name === 'Amit')
    assert.equal(amit.shift.name, 'Morning')
    assert.equal(amit.checkIn, istToUtc(TODAY, '08:55').toISOString())
    assert.equal(amit.status, 'present')
    const priya = staff.rows.find((r) => r.employee.name === 'Priya')
    assert.equal(priya.status, 'not_yet_in')
    assert.equal(priya.shift.name, 'Evening')
  })

  test('donut: employee-days in the period; segments add up to the total', async () => {
    const week = (await summary('?period=week')).body.attendanceOverview
    assert.equal(week.from, '2026-09-21')
    assert.equal(week.to, TODAY)
    assert.equal(sum(week.counts), week.total)
    assert.equal(week.segments.reduce((s, x) => s + x.count, 0), week.total)
    // 7 staff × 5 days = 35 employee-days = donut + weekly offs + Priya not yet in today
    assert.equal(week.total + week.weeklyOff + 1, 35)
    assert.equal(week.cameIn, 3)
    assert.equal(week.weeklyOff, 1)

    for (const period of ['month', 'year']) {
      const o = (await summary(`?period=${period}`)).body.attendanceOverview
      assert.equal(o.period, period)
      assert.equal(o.segments.reduce((s, x) => s + x.count, 0), o.total)
      assert.ok(o.total > week.total)
    }
    assert.equal((await summary('?period=decade')).status, 400)
  })

  test('salary: estimate is the full month, overview is so far and equals the payroll calculation', async () => {
    const { salary } = (await summary()).body
    // 5 monthly × ₹10,000 + daily ₹500 × 26 + hourly ₹100 × 8 h × 26 (Sept 2026, Sundays off)
    assert.equal(salary.estMonthlyPaymentPaise, 5 * 1_000_000 + 50_000 * 26 + 10_000 * 8 * 26)
    const o = salary.salaryOverview
    assert.equal(o.totalPaise, o.basicPaise + o.overtimePaise - o.deductionsPaise)
    assert.notEqual(o.totalPaise, salary.estMonthlyPaymentPaise)

    // Same numbers as the Payroll page's draft for this month
    const payroll = (await req('POST', '/payroll/calculate', { month: '2026-09' })).body.totals
    assert.equal(o.basicPaise, payroll.basePaise)
    assert.equal(o.overtimePaise, payroll.overtimePaise)
    assert.equal(o.deductionsPaise, payroll.deductionsPaise)
    assert.equal(salary.upcomingPayments, null)
  })

  test('upcoming payments come from the latest finalized month', async () => {
    await req('POST', '/payroll/calculate', { month: '2026-08' })
    await req('POST', '/payroll/finalize', { month: '2026-08' })
    const rows = (await req('GET', '/payroll?month=2026-08')).body.rows
    await req('PATCH', `/payroll/${rows.find((r) => r.employee.name === 'Amit')._id}/paid`, {})

    const p = (await summary()).body.salary.upcomingPayments
    assert.equal(p.month, '2026-08')
    // The 7 active staff (Hari is inactive with no August attendance, Isha joined in October)
    assert.equal(p.total, 7)
    assert.equal(p.pendingCount, 6)
    assert.equal(p.paidCount, 1)
    assert.equal(p.pendingPaise + p.paidPaise, rows.reduce((s, r) => s + r.snapshot.netPaise, 0))
    // At most 6 shown, pending first
    assert.equal(p.rows.length, 6)
    assert.ok(p.rows.every((r) => r.status === 'pending'))
  })

  test('managers get attendance but no salary numbers', async () => {
    const res = await summary('', manager.token)
    assert.equal(res.status, 200)
    assert.equal(res.body.salary, null)
    assert.ok(!JSON.stringify(res.body).includes('Paise'))
    assert.equal(res.body.kpis.totalStaff, 7)
  })

  test('upsell only on the free plan', async () => {
    assert.equal((await summary()).body.showUpsell, true)
    await t.db().collection('businesses').updateOne({ _id: new t.mongoose.Types.ObjectId(owner.businessId) }, { $set: { plan: 'pro' } })
    assert.equal((await summary()).body.showUpsell, false)
  })

  test('tenant isolation and auth', async () => {
    const b = (await summary('', ownerB.token)).body
    assert.equal(b.kpis.totalStaff, 0)
    assert.deepEqual(b.departments, [])
    assert.equal(b.attendanceOverview.total, 0)
    assert.equal(b.salary.estMonthlyPaymentPaise, 0)
    assert.equal(b.salary.upcomingPayments, null)
    assert.equal((await t.request('GET', '/dashboard/summary')).status, 401)
  })
})
