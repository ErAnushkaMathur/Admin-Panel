import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { startTestServer } from './helpers/testServer.js'
import { setNowForTests } from '../src/utils/clock.js'
import { istToUtc } from '../src/utils/time.js'
import { AUDIT_ACTIONS } from '../src/services/auditLog.service.js'

// September 2026: Sundays 6, 13, 20, 27 -> 26 working days. "Now" is pinned to 5 Oct 2026.
let t, owner, ownerB, manager
const ids = {}
const req = (method, path, body, token = owner.token) => t.request(method, path, { token, body })
const logsFor = (action) => t.db().collection('auditlogs').find({ action }).sort({ _id: 1 }).toArray()
const rowOf = (view, name) => view.rows.find((r) => r.employee.name === name)
const ymd = (d) => `2026-09-${String(d).padStart(2, '0')}`
const SUNDAYS = [6, 13, 20, 27]
const shift = { name: 'Morning', startTime: '09:00', endTime: '17:00', graceMinutes: 10, crossesMidnight: false }

async function addPunches(employeeId, days) {
  await t.mongoose.model('Attendance').insertMany(
    days.map((d) => ({
      businessId: owner.businessId,
      employeeId,
      date: ymd(d),
      shiftId: ids.shift,
      shiftSnapshot: shift,
      punchIn: istToUtc(ymd(d), '09:00'),
      punchOut: istToUtc(ymd(d), '17:00'),
      source: 'qr',
    })),
  )
}

async function addEmployee(name, phone, salary, joinDate = '2026-01-01') {
  const res = await req('POST', '/employees', { name, phone, departmentId: ids.dept, roleTitle: 'Helper', shiftId: ids.shift, joinDate, salary })
  assert.equal(res.status, 201, JSON.stringify(res.body))
  return res.body.employee._id
}

before(async () => {
  t = await startTestServer()
  owner = await t.registerOwner('Alpha')
  ownerB = await t.registerOwner('Beta')
  setNowForTests(istToUtc('2026-10-05', '12:00'))
  ids.dept = (await req('POST', '/departments', { name: 'Kitchen', color: '#f2727f', icon: 'chef-hat' })).body.department._id
  ids.shift = (await req('POST', '/shifts', { name: 'Morning', startTime: '09:00', endTime: '17:00', graceMinutes: 10 })).body.shift._id

  // Ramesh: monthly ₹26,000, Sundays off. 7 Sept approved paid leave, 8 Sept marked "On leave" by hand
  // (no leave record -> unpaid), 9 & 10 Sept absent -> 3 days × ₹1,000 deducted = ₹23,000
  ids.ramesh = await addEmployee('Ramesh', '9000000001', { type: 'monthly', amountPaise: 2_600_000, weeklyOff: [0] })
  const days = Array.from({ length: 30 }, (_, i) => i + 1).filter((d) => !SUNDAYS.includes(d))
  await addPunches(ids.ramesh, days.filter((d) => ![7, 8, 9, 10].includes(d)))
  const paidLeave = await req('POST', '/leaves/on-behalf', { employeeId: ids.ramesh, fromDate: ymd(7), toDate: ymd(7), type: 'paid' })
  assert.equal(paidLeave.status, 201, JSON.stringify(paidLeave.body))
  const manual = await req('POST', '/attendance/manual', { employeeId: ids.ramesh, date: ymd(8), status: 'on_leave', reason: 'Said he was unwell' })
  assert.equal(manual.status, 201, JSON.stringify(manual.body))

  // Sita: daily ₹700, no weekly off, worked 1–10 Sept -> 10 × ₹700 = ₹7,000
  ids.sita = await addEmployee('Sita', '9000000002', { type: 'daily', amountPaise: 70_000, weeklyOff: [] })
  await addPunches(ids.sita, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

  // Not paid for September: deactivated without working, and joined in October
  ids.gone = await addEmployee('Gopal', '9000000003', { type: 'monthly', amountPaise: 1_000_000 })
  await req('PATCH', `/employees/${ids.gone}`, { isActive: false })
  await addEmployee('Nisha', '9000000004', { type: 'monthly', amountPaise: 1_000_000 }, '2026-10-01')

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

describe('calculate', () => {
  test('nothing until calculated', async () => {
    const res = await req('GET', '/payroll?month=2026-09')
    assert.equal(res.status, 200)
    assert.deepEqual(res.body.rows, [])
    assert.equal(res.body.isOver, true)
  })

  test('creates a draft row per employee paid that month, with backend totals', async () => {
    const res = await req('POST', '/payroll/calculate', { month: '2026-09' })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body.rows.map((r) => r.employee.name), ['Ramesh', 'Sita'])
    const ramesh = rowOf(res.body, 'Ramesh')
    assert.equal(ramesh.status, 'draft')
    assert.equal(ramesh.snapshot.paidLeaveDays, 1)
    assert.equal(ramesh.snapshot.unpaidLeaveDays, 1)
    assert.equal(ramesh.snapshot.absentDays, 2)
    assert.equal(ramesh.snapshot.deductionsPaise, 300_000)
    assert.equal(ramesh.snapshot.netPaise, 2_300_000)
    assert.equal(rowOf(res.body, 'Sita').snapshot.netPaise, 700_000)
    assert.equal(res.body.totals.netPaise, 3_000_000)
    assert.equal(res.body.totals.basePaise, 2_600_000 + 700_000)
    assert.deepEqual(res.body.statusCounts, { draft: 2, finalized: 0, paid: 0 })
  })

  test('day counts match the Attendance monthly view exactly (same deriveStatus path)', async () => {
    const payroll = rowOf((await req('GET', '/payroll?month=2026-09')).body, 'Ramesh').snapshot
    const monthly = (await req('GET', '/attendance/monthly?month=2026-09')).body.employees.find((e) => e.employee.name === 'Ramesh').totals
    assert.equal(payroll.presentDays, monthly.present)
    assert.equal(payroll.lateDays, monthly.late)
    assert.equal(payroll.halfDays, monthly.half_day)
    assert.equal(payroll.absentDays, monthly.absent)
    assert.equal(payroll.paidLeaveDays + payroll.unpaidLeaveDays, monthly.on_leave)
    assert.equal(payroll.weeklyOffDays, monthly.weekly_off)
  })

  test('half-day threshold comes from the business setting', async () => {
    // 10 Sept: Sita worked only 09:00–13:00 (240 min). Default threshold 240 -> full day; 300 -> half day
    await t.db().collection('attendances').updateOne(
      { employeeId: new t.mongoose.Types.ObjectId(ids.sita), date: ymd(10) },
      { $set: { punchOut: istToUtc(ymd(10), '13:00') } },
    )
    const businesses = t.db().collection('businesses')
    const _id = new t.mongoose.Types.ObjectId(owner.businessId)
    await businesses.updateOne({ _id }, { $set: { 'attendanceSettings.halfDayThresholdMinutes': 300 } })
    const sita = rowOf((await req('POST', '/payroll/calculate', { month: '2026-09' })).body, 'Sita').snapshot
    assert.equal(sita.halfDays, 1)
    assert.equal(sita.netPaise, 9 * 70_000 + 35_000)
    await businesses.updateOne({ _id }, { $set: { 'attendanceSettings.halfDayThresholdMinutes': 240 } })
    assert.equal(rowOf((await req('POST', '/payroll/calculate', { month: '2026-09' })).body, 'Sita').snapshot.netPaise, 700_000)
  })

  test('validation, future months, owner only, tenant isolation', async () => {
    assert.equal((await req('POST', '/payroll/calculate', { month: '2026-13' })).status, 400)
    assert.equal((await req('POST', '/payroll/calculate', { month: '2026-11' })).status, 400)
    assert.equal((await req('GET', '/payroll?month=2026-09', undefined, manager.token)).status, 403)
    assert.equal((await t.request('GET', '/payroll?month=2026-09')).status, 401)
    assert.deepEqual((await req('GET', '/payroll?month=2026-09', undefined, ownerB.token)).body.rows, [])
    const rowId = rowOf((await req('GET', '/payroll?month=2026-09')).body, 'Ramesh')._id
    assert.equal((await req('GET', `/payroll/${rowId}/payslip`, undefined, ownerB.token)).status, 404)
    assert.equal((await req('PATCH', `/payroll/${rowId}/paid`, {}, ownerB.token)).status, 404)
  })
})

describe('bonus and advance', () => {
  test('recalculates at once and writes payroll.adjust', async () => {
    const rowId = rowOf((await req('GET', '/payroll?month=2026-09')).body, 'Ramesh')._id
    const res = await req('PATCH', `/payroll/${rowId}/adjustments`, { bonusPaise: 50_000, advancePaise: 100_000, reason: 'Diwali bonus' })
    assert.equal(res.status, 200)
    assert.equal(res.body.payroll.snapshot.netPaise, 2_300_000 + 50_000 - 100_000)
    const [entry] = await logsFor('payroll.adjust')
    assert.deepEqual(entry.before, { bonusPaise: 0, advancePaise: 0 })
    assert.deepEqual(entry.after, { bonusPaise: 50_000, advancePaise: 100_000 })
    assert.equal(entry.reason, 'Diwali bonus')
    // Kept on recalculation
    assert.equal(rowOf((await req('POST', '/payroll/calculate', { month: '2026-09' })).body, 'Ramesh').snapshot.netPaise, 2_250_000)
    assert.equal((await req('PATCH', `/payroll/${rowId}/adjustments`, { bonusPaise: -1 })).status, 400)
    assert.equal((await req('PATCH', `/payroll/${rowId}/adjustments`, { bonusPaise: 50_000 })).status, 400) // nothing changed
  })
})

describe('finalize', () => {
  test('refuses a month that is not over yet', async () => {
    await req('POST', '/payroll/calculate', { month: '2026-10' })
    const res = await req('POST', '/payroll/finalize', { month: '2026-10' })
    assert.equal(res.status, 409)
    assert.equal(res.body.error.code, 'MONTH_NOT_OVER')
  })

  test('locks every draft and logs one payroll.finalize per employee', async () => {
    const res = await req('POST', '/payroll/finalize', { month: '2026-09' })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body.statusCounts, { draft: 0, finalized: 2, paid: 0 })
    const entries = await logsFor('payroll.finalize')
    assert.equal(entries.length, 2)
    const ramesh = rowOf(res.body, 'Ramesh')
    const entry = entries.find((e) => String(e.entityId) === ramesh._id)
    assert.equal(entry.entity, 'Payroll')
    assert.deepEqual(entry.before, { status: 'draft' })
    assert.equal(entry.after.status, 'finalized')
    assert.equal(entry.after.netPaise, 2_250_000)

    const [row] = (await req('GET', `/audit-logs?type=payroll.finalize&employeeId=${ids.ramesh}`)).body.rows
    assert.equal(row.actionLabel, 'Payroll finalized')
    assert.equal(row.category, 'payroll')
    assert.equal(row.employee.name, 'Ramesh')
    assert.equal(row.payrollMonth, '2026-09')
    assert.equal((await req('POST', '/payroll/finalize', { month: '2026-09' })).body.error.code, 'NOTHING_TO_FINALIZE')
  })

  test('finalized numbers never change: salary edits and recalculation leave them alone', async () => {
    const before = rowOf((await req('GET', '/payroll?month=2026-09')).body, 'Sita').snapshot
    await req('PATCH', `/employees/${ids.sita}`, { salary: { amountPaise: 80_000 } })
    const after = rowOf((await req('POST', '/payroll/calculate', { month: '2026-09' })).body, 'Sita').snapshot
    assert.deepEqual(after, before)
    const rowId = rowOf((await req('GET', '/payroll?month=2026-09')).body, 'Sita')._id
    assert.equal((await req('PATCH', `/payroll/${rowId}/adjustments`, { bonusPaise: 1 })).body.error.code, 'PAYROLL_LOCKED')
  })
})

describe('mark paid', () => {
  test('finalized -> paid with today as default date, logged once', async () => {
    const rowId = rowOf((await req('GET', '/payroll?month=2026-09')).body, 'Ramesh')._id
    assert.equal((await req('PATCH', `/payroll/${rowId}/paid`, { paidDate: '2026-10-06' })).status, 400) // future
    const res = await req('PATCH', `/payroll/${rowId}/paid`, {})
    assert.equal(res.status, 200)
    assert.equal(res.body.payroll.status, 'paid')
    assert.equal(res.body.payroll.paidDate, '2026-10-05')
    assert.equal((await req('PATCH', `/payroll/${rowId}/paid`, {})).body.error.code, 'ALREADY_PAID')

    const entries = await logsFor('payroll.mark_paid')
    assert.equal(entries.length, 1)
    assert.deepEqual(entries[0].before, { status: 'finalized', paidDate: null })
    assert.deepEqual(entries[0].after, { status: 'paid', paidDate: '2026-10-05', netPaise: 2_250_000 })
    assert.equal((await req('GET', '/audit-logs?type=payroll.mark_paid')).body.rows[0].actionLabel, 'Salary marked paid')
  })
})

describe('reopen', () => {
  test('needs a reason', async () => {
    assert.equal((await req('POST', '/payroll/reopen', { month: '2026-09' })).status, 400)
  })

  test('finalized rows go back to draft keeping the old snapshot; paid rows stay paid', async () => {
    const res = await req('POST', '/payroll/reopen', { month: '2026-09', reason: 'Sita salary was entered wrong' })
    assert.equal(res.status, 200)
    assert.equal(rowOf(res.body, 'Ramesh').status, 'paid')
    const sita = rowOf(res.body, 'Sita')
    assert.equal(sita.status, 'draft')
    assert.equal(sita.revisionCount, 1)

    const entries = await logsFor('payroll.reopen')
    assert.equal(entries.length, 1)
    assert.equal(String(entries[0].entityId), sita._id)
    assert.equal(entries[0].reason, 'Sita salary was entered wrong')
    assert.deepEqual(entries[0].before, { status: 'finalized', netPaise: 700_000 })

    // Now the new salary applies; the issued payslip is still in revisions
    const recalculated = rowOf((await req('POST', '/payroll/calculate', { month: '2026-09' })).body, 'Sita')
    assert.equal(recalculated.snapshot.netPaise, 800_000)
    const stored = await t.db().collection('payrolls').findOne({ _id: new t.mongoose.Types.ObjectId(sita._id) })
    assert.equal(stored.revisions[0].snapshot.netPaise, 700_000)
    assert.equal(stored.revisions[0].reopenReason, 'Sita salary was entered wrong')

    assert.equal((await req('PATCH', `/payroll/${sita._id}/paid`, {})).body.error.code, 'NOT_FINALIZED')
    assert.equal((await req('POST', '/payroll/reopen', { month: '2026-09', reason: 'again' })).body.error.code, 'NOTHING_TO_REOPEN')
  })

  test('managers cannot reopen', async () => {
    assert.equal((await req('POST', '/payroll/reopen', { month: '2026-09', reason: 'test' }, manager.token)).status, 403)
  })
})

describe('payslip', () => {
  test('returns the stored snapshot and shop name', async () => {
    const ramesh = rowOf((await req('GET', '/payroll?month=2026-09')).body, 'Ramesh')
    const res = await req('GET', `/payroll/${ramesh._id}/payslip`)
    assert.equal(res.status, 200)
    assert.equal(res.body.business.name, 'Alpha Sweets')
    assert.equal(res.body.payroll.status, 'paid')
    assert.equal(res.body.payroll.employee.name, 'Ramesh')
    assert.equal(res.body.payroll.snapshot.netPaise, 2_250_000)
    assert.ok(!JSON.stringify(res.body).includes('pinHash'))
  })
})

describe('registry', () => {
  test('every payroll action written is registered and offered as a filter', async () => {
    const written = await t.db().collection('auditlogs').distinct('action')
    for (const action of ['payroll.adjust', 'payroll.finalize', 'payroll.reopen', 'payroll.mark_paid']) {
      assert.ok(written.includes(action), `${action} was written`)
      assert.ok(AUDIT_ACTIONS[action], `${action} registered`)
    }
    const types = (await req('GET', '/audit-logs')).body.actionTypes.map((a) => a.value)
    for (const action of written) assert.ok(types.includes(action), `${action} in the type filter`)
  })
})
