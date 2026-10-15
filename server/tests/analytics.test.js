import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { startTestServer } from './helpers/testServer.js'
import { setNowForTests } from '../src/utils/clock.js'
import { istToUtc } from '../src/utils/time.js'

// "Now" = Wednesday 30 Sept 2026, 18:00 IST (every shift that day is over).
// 30d window = 1–30 Sept; previous window = 2–31 Aug. Sundays are weekly offs.
let t, owner, ownerB, manager
const ids = {}
const req = (method, path, body, token = owner.token) => t.request(method, path, { token, body })
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0)
const sept = (d) => `2026-09-${String(d).padStart(2, '0')}`
const aug = (d) => `2026-08-${String(d).padStart(2, '0')}`
const SEPT_WORKDAYS = Array.from({ length: 30 }, (_, i) => i + 1).filter((d) => ![6, 13, 20, 27].includes(d))
const SEPT_MONDAYS = [7, 14, 21, 28]

before(async () => {
  t = await startTestServer()
  owner = await t.registerOwner('Alpha')
  ownerB = await t.registerOwner('Beta')
  setNowForTests(istToUtc('2026-09-30', '18:00'))
  ids.kitchen = (await req('POST', '/departments', { name: 'Kitchen', color: '#f2727f', icon: 'chef-hat' })).body.department._id
  ids.counter = (await req('POST', '/departments', { name: 'Counter', color: '#4a90d9', icon: 'store' })).body.department._id
  const shift = (await req('POST', '/shifts', { name: 'Morning', startTime: '09:00', endTime: '17:00', graceMinutes: 10 })).body.shift

  const emp = async (name, phone, departmentId) => {
    const res = await req('POST', '/employees', {
      name, phone, departmentId, roleTitle: 'Helper', shiftId: shift._id, joinDate: '2026-08-01',
      salary: { type: 'monthly', amountPaise: 1_300_000, weeklyOff: [0] },
    })
    return res.body.employee._id
  }
  ids.amit = await emp('Amit', '9000000001', ids.kitchen)
  ids.bina = await emp('Bina', '9000000002', ids.kitchen)
  ids.chetan = await emp('Chetan', '9000000003', ids.counter)

  const rec = (employeeId, date, inTime, outTime) => ({
    businessId: owner.businessId, employeeId, date, shiftId: shift._id,
    shiftSnapshot: { name: 'Morning', startTime: '09:00', endTime: '17:00', graceMinutes: 10, crossesMidnight: false },
    punchIn: istToUtc(date, inTime), punchOut: istToUtc(date, outTime), source: 'qr',
  })
  const records = []
  for (const d of SEPT_WORKDAYS) {
    records.push(rec(ids.amit, sept(d), '09:00', '19:00')) // 2 h overtime every day
    records.push(rec(ids.bina, sept(d), d <= 5 ? '09:30' : '09:00', '17:00')) // late 1–5 Sept
    if (!SEPT_MONDAYS.includes(d)) records.push(rec(ids.chetan, sept(d), '09:00', '17:00')) // never on Mondays
  }
  for (const d of [3, 4, 5]) records.push(rec(ids.amit, aug(d), '09:00', '18:00')) // 1 h overtime, previous window
  await t.mongoose.model('Attendance').insertMany(records)

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

describe('GET /analytics/attendance', () => {
  let a
  before(async () => {
    const res = await req('GET', '/analytics/attendance?range=30d')
    assert.equal(res.status, 200)
    a = res.body
  })

  test('window and daily trend; every point adds up', () => {
    assert.equal(a.from, '2026-09-01')
    assert.equal(a.to, '2026-09-30')
    assert.equal(a.bucket, 'day')
    assert.equal(a.trend.length, 30)
    for (const p of a.trend) assert.equal(sum(p.counts), p.total)
    const monday = a.trend.find((p) => p.key === sept(7))
    assert.deepEqual([monday.total, monday.cameIn, monday.cameInPercent], [3, 2, 66.7])
    const sunday = a.trend.find((p) => p.key === sept(6))
    assert.deepEqual([sunday.total, sunday.cameInPercent], [0, null])
    assert.equal(a.trend.reduce((s, p) => s + p.total, 0), a.summary.total)
  })

  test('same counts as the Attendance monthly view (one deriveStatus path)', async () => {
    const monthly = (await req('GET', '/attendance/monthly?month=2026-09')).body.employees
    const fromMonthly = { present: 0, late: 0, half_day: 0, absent: 0, on_leave: 0 }
    for (const e of monthly) for (const k of Object.keys(fromMonthly)) fromMonthly[k] += e.totals[k]
    assert.deepEqual(a.summary.counts, fromMonthly)
    assert.equal(a.summary.weeklyOff, monthly.reduce((s, e) => s + e.totals.weekly_off, 0))
  })

  test('late ranking', () => {
    assert.equal(a.lateRanking.length, 1)
    const [bina] = a.lateRanking
    assert.equal(bina.employee.name, 'Bina')
    assert.deepEqual([bina.lateDays, bina.lateMinutes, bina.averageLateMinutes, bina.cameInDays], [5, 150, 30, 26])
    assert.equal(bina.employee.department.name, 'Kitchen')
  })

  test('overtime by department vs previous 30 days', () => {
    const kitchen = a.overtime.departments.find((d) => d.name === 'Kitchen')
    assert.equal(kitchen.minutes, 26 * 120)
    assert.equal(kitchen.previousMinutes, 3 * 60)
    assert.equal(kitchen.changePercent, 1633.3)
    assert.equal(kitchen.employeesWithOvertime, 1)
    assert.equal(a.overtime.departments.find((d) => d.name === 'Counter').minutes, 0)
    assert.equal(a.overtime.totalMinutes, 3120)
  })

  test('absentee patterns: Chetan misses every Monday', () => {
    const monday = a.absentees.byWeekday[0]
    assert.deepEqual(monday, { weekday: 1, absentDays: 4, dueDays: 12, absentPercent: 33.3 })
    assert.deepEqual(
      a.absentees.patterns.map((p) => [p.employee.name, p.weekday, p.absentDays, p.dueDays, p.absentPercent]),
      [['Chetan', 1, 4, 4, 100]],
    )
  })

  test('90d (weekly) and 12m (monthly) ranges', async () => {
    const q = (await req('GET', '/analytics/attendance?range=90d')).body
    assert.equal(q.bucket, 'week')
    const y = (await req('GET', '/analytics/attendance?range=12m')).body
    assert.equal(y.bucket, 'month')
    assert.equal(y.trend.length, 12)
    // Before anyone joined (Aug 2026) there is nothing to count
    assert.equal(y.trend[0].total, 0)
    assert.equal(y.trend.at(-1).total, a.summary.total)
    assert.equal((await req('GET', '/analytics/attendance?range=5y')).status, 400)
  })

  test('managers can see attendance analytics; other shops see nothing', async () => {
    assert.equal((await req('GET', '/analytics/attendance', undefined, manager.token)).status, 200)
    const b = (await req('GET', '/analytics/attendance', undefined, ownerB.token)).body
    assert.equal(b.staff, 0)
    assert.equal(b.summary.total, 0)
    assert.deepEqual(b.lateRanking, [])
    assert.equal((await t.request('GET', '/analytics/attendance')).status, 401)
  })
})

describe('GET /analytics/payroll', () => {
  test('monthly cost from stored snapshots; finalized vs draft', async () => {
    await req('POST', '/payroll/calculate', { month: '2026-08' })
    await req('POST', '/payroll/finalize', { month: '2026-08' })
    await req('POST', '/payroll/calculate', { month: '2026-09' })
    const august = (await req('GET', '/payroll?month=2026-08')).body.totals
    const september = (await req('GET', '/payroll?month=2026-09')).body.totals

    const res = await req('GET', '/analytics/payroll?range=6m')
    assert.equal(res.status, 200)
    const byMonth = Object.fromEntries(res.body.months.map((m) => [m.month, m]))
    assert.deepEqual(Object.keys(byMonth), ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'])
    assert.equal(byMonth['2026-07'].hasData, false)
    assert.equal(byMonth['2026-08'].status, 'final')
    assert.equal(byMonth['2026-08'].netPaise, august.netPaise)
    assert.equal(byMonth['2026-08'].overtimePaise, august.overtimePaise)
    assert.equal(byMonth['2026-09'].status, 'draft')
    assert.equal(byMonth['2026-09'].netPaise, september.netPaise)
    assert.equal(res.body.finalMonths, 1)
    assert.equal(res.body.finalTotalNetPaise, august.netPaise)
  })

  test('owner only, validated', async () => {
    assert.equal((await req('GET', '/analytics/payroll', undefined, manager.token)).status, 403)
    assert.equal((await req('GET', '/analytics/payroll?range=30d')).status, 400)
    const b = (await req('GET', '/analytics/payroll', undefined, ownerB.token)).body
    assert.ok(b.months.every((m) => !m.hasData))
  })
})
