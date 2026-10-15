import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { startTestServer } from './helpers/testServer.js'
import { setNowForTests } from '../src/utils/clock.js'
import { istToUtc } from '../src/utils/time.js'
import { AUDIT_ACTIONS } from '../src/services/auditLog.service.js'

let t, owner, ownerB, manager
const req = (method, path, body, token = owner.token) => t.request(method, path, { token, body })
const logsFor = (action) => t.db().collection('auditlogs').find({ action }).sort({ _id: 1 }).toArray()
const rawBusiness = () => t.db().collection('businesses').findOne({ _id: new t.mongoose.Types.ObjectId(owner.businessId) })

before(async () => {
  t = await startTestServer()
  owner = await t.registerOwner('Alpha')
  ownerB = await t.registerOwner('Beta')
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

describe('GET /settings', () => {
  test('defaults, including the existing 4-hour half-day threshold', async () => {
    const res = await req('GET', '/settings')
    assert.equal(res.status, 200)
    assert.deepEqual(res.body.settings, {
      name: 'Alpha Sweets',
      halfDayThresholdMinutes: 240,
      defaultGraceMinutes: 10,
      workingDaysPolicy: 'actual',
      overtimeEnabled: true,
      lateRuleEnabled: false,
      lateRuleEvery: 3,
    })
    assert.equal(res.body.timezone, 'Asia/Kolkata')
    assert.equal(res.body.plan, 'free')
    assert.ok(!JSON.stringify(res.body).includes('punchToken'))
  })

  test('managers can read; other shops see their own', async () => {
    assert.equal((await req('GET', '/settings', undefined, manager.token)).status, 200)
    assert.equal((await req('GET', '/settings', undefined, ownerB.token)).body.settings.name, 'Beta Sweets')
    assert.equal((await t.request('GET', '/settings')).status, 401)
  })
})

describe('PATCH /settings', () => {
  test('half-day threshold writes the existing attendanceSettings field (no new field)', async () => {
    const res = await req('PATCH', '/settings', { halfDayThresholdMinutes: 300 })
    assert.equal(res.status, 200)
    assert.equal(res.body.settings.halfDayThresholdMinutes, 300)
    const doc = await rawBusiness()
    assert.equal(doc.attendanceSettings.halfDayThresholdMinutes, 300)
    assert.deepEqual(Object.keys(doc.attendanceSettings).sort(), ['defaultGraceMinutes', 'halfDayThresholdMinutes'])
    assert.equal(doc.halfDayThresholdMinutes, undefined)
  })

  test('the new threshold changes how attendance is read (deriveStatus uses it)', async () => {
    const dept = (await req('POST', '/departments', { name: 'Kitchen', color: '#f2727f', icon: 'chef-hat' })).body.department._id
    const shift = (await req('POST', '/shifts', { name: 'Morning', startTime: '09:00', endTime: '17:00', graceMinutes: 10 })).body.shift
    const emp = (await req('POST', '/employees', {
      name: 'Amit', phone: '9000000001', departmentId: dept, roleTitle: 'Helper', shiftId: shift._id, joinDate: '2026-01-01',
      salary: { type: 'monthly', amountPaise: 1_000_000 },
    })).body.employee._id
    // Worked 4 h 30 m: a full day at 240, a half day at 300
    await t.mongoose.model('Attendance').create({
      businessId: owner.businessId, employeeId: emp, date: '2026-09-25', shiftId: shift._id,
      shiftSnapshot: { name: 'Morning', startTime: '09:00', endTime: '17:00', graceMinutes: 10, crossesMidnight: false },
      punchIn: istToUtc('2026-09-25', '09:00'), punchOut: istToUtc('2026-09-25', '13:30'), source: 'qr',
    })
    setNowForTests(istToUtc('2026-09-26', '10:00'))
    const statusOn = async () => (await req('GET', '/attendance?date=2026-09-25')).body.rows[0].status
    assert.equal(await statusOn(), 'half_day')
    await req('PATCH', '/settings', { halfDayThresholdMinutes: 240 })
    assert.equal(await statusOn(), 'present')
    setNowForTests(null)
  })

  test('every setting saves to its place and is audit-logged with only the changed fields', async () => {
    const before = (await logsFor('settings.update')).length
    const res = await req('PATCH', '/settings', {
      name: 'Alpha Sweets & Namkeen',
      defaultGraceMinutes: 15,
      workingDaysPolicy: 'fixed26',
      overtimeEnabled: false,
      lateRuleEnabled: true,
      lateRuleEvery: 4,
      halfDayThresholdMinutes: 240, // unchanged: not logged
    })
    assert.equal(res.status, 200)
    assert.equal(res.body.business.name, 'Alpha Sweets & Namkeen')
    const doc = await rawBusiness()
    assert.equal(doc.name, 'Alpha Sweets & Namkeen')
    assert.equal(doc.attendanceSettings.defaultGraceMinutes, 15)
    assert.deepEqual(doc.payrollSettings, { workingDaysPolicy: 'fixed26', overtimeEnabled: false, lateRuleEnabled: true, lateRuleEvery: 4 })

    const entries = await logsFor('settings.update')
    assert.equal(entries.length, before + 1)
    const entry = entries.at(-1)
    assert.equal(entry.entity, 'Business')
    assert.deepEqual(entry.before, { name: 'Alpha Sweets', defaultGraceMinutes: 10, workingDaysPolicy: 'actual', overtimeEnabled: true, lateRuleEnabled: false, lateRuleEvery: 3 })
    assert.deepEqual(entry.after, { name: 'Alpha Sweets & Namkeen', defaultGraceMinutes: 15, workingDaysPolicy: 'fixed26', overtimeEnabled: false, lateRuleEnabled: true, lateRuleEvery: 4 })

    const [row] = (await req('GET', '/audit-logs?type=settings.update')).body.rows
    assert.equal(row.actionLabel, 'Shop settings changed')
    assert.deepEqual(row.target, { kind: 'business', name: 'Alpha Sweets & Namkeen' })
  })

  test('saving the same values changes nothing and logs nothing', async () => {
    const count = (await logsFor('settings.update')).length
    const res = await req('PATCH', '/settings', { overtimeEnabled: false })
    assert.equal(res.status, 400)
    assert.equal((await logsFor('settings.update')).length, count)
  })

  test('default grace is used for new shifts that leave it out', async () => {
    const res = await req('POST', '/shifts', { name: 'Evening', startTime: '14:00', endTime: '22:00' })
    assert.equal(res.status, 201)
    assert.equal(res.body.shift.graceMinutes, 15)
    const explicit = await req('POST', '/shifts', { name: 'Night', startTime: '22:00', endTime: '06:00', graceMinutes: 5 })
    assert.equal(explicit.body.shift.graceMinutes, 5)
  })

  test('payroll uses the saved payroll settings', async () => {
    // fixed26 + overtime off (from the test above): one day's pay = ₹10,000 ÷ 26
    const res = await req('POST', '/payroll/calculate', { month: '2026-09' })
    const row = res.body.rows.find((r) => r.employee.name === 'Amit')
    assert.equal(row.snapshot.workingDays, 26)
    assert.equal(row.snapshot.overtimeEnabled, false)
    assert.equal(row.snapshot.lateRuleEvery, 4)
  })

  test('validation: ranges, unknown keys, timezone is not editable', async () => {
    const bad = async (body) => (await req('PATCH', '/settings', body)).status
    assert.equal(await bad({ halfDayThresholdMinutes: 10 }), 400)
    assert.equal(await bad({ halfDayThresholdMinutes: 241.5 }), 400)
    assert.equal(await bad({ defaultGraceMinutes: 500 }), 400)
    assert.equal(await bad({ workingDaysPolicy: '30' }), 400)
    assert.equal(await bad({ lateRuleEvery: 0 }), 400)
    assert.equal(await bad({ name: 'A' }), 400)
    assert.equal(await bad({ timezone: 'America/New_York' }), 400)
    assert.equal(await bad({ plan: 'pro' }), 400)
    assert.equal(await bad({}), 400)
    const res = await req('PATCH', '/settings', { halfDayThresholdMinutes: 10 })
    assert.deepEqual(res.body.error.details, [{ field: 'halfDayThresholdMinutes', message: 'Half-day threshold must be at least 30 minutes' }])
  })

  test('owner only; one shop never changes another', async () => {
    assert.equal((await req('PATCH', '/settings', { overtimeEnabled: true }, manager.token)).status, 403)
    await req('PATCH', '/settings', { halfDayThresholdMinutes: 360 }, ownerB.token)
    assert.equal((await rawBusiness()).attendanceSettings.halfDayThresholdMinutes, 240)
  })
})

describe('POST /auth/change-password', () => {
  test('wrong current password is a field error', async () => {
    const res = await req('POST', '/auth/change-password', { currentPassword: 'nope', newPassword: 'brandnew123' })
    assert.equal(res.status, 400)
    assert.deepEqual(res.body.error.details, [{ field: 'currentPassword', message: 'Current password is wrong' }])
    const same = await req('POST', '/auth/change-password', { currentPassword: 'secret123', newPassword: 'secret123' })
    assert.equal(same.body.error.details[0].field, 'newPassword')
    const short = await req('POST', '/auth/change-password', { currentPassword: 'secret123', newPassword: 'short' })
    assert.equal(short.status, 400)
  })

  test('changes the password, signs out other sessions, keeps this one, logs no secrets', async () => {
    const otherSession = (await t.request('POST', '/auth/login', { body: { email: 'alpha@test.com', password: 'secret123' } })).body.token
    // Tokens carry whole-second timestamps: make sure the change happens in a later second
    await new Promise((r) => setTimeout(r, 1100))
    const res = await req('POST', '/auth/change-password', { currentPassword: 'secret123', newPassword: 'brandnew123' })
    assert.equal(res.status, 200)
    const fresh = res.body.token

    assert.equal((await t.request('GET', '/auth/me', { token: otherSession })).status, 401)
    assert.equal((await t.request('GET', '/auth/me', { token: owner.token })).status, 401)
    assert.equal((await t.request('GET', '/auth/me', { token: fresh })).status, 200)
    assert.equal((await t.request('POST', '/auth/login', { body: { email: 'alpha@test.com', password: 'secret123' } })).status, 401)
    assert.equal((await t.request('POST', '/auth/login', { body: { email: 'alpha@test.com', password: 'brandnew123' } })).status, 200)
    owner.token = fresh

    const [entry] = await logsFor('account.password_change')
    assert.equal(entry.entity, 'User')
    assert.equal(String(entry.entityId), owner.userId)
    assert.equal(entry.before, null)
    assert.equal(entry.after, null)
    const stored = await t.db().collection('users').findOne({ email: 'alpha@test.com' })
    assert.ok(!JSON.stringify(entry).includes(stored.passwordHash))
    assert.ok(!JSON.stringify(entry).includes('brandnew123'))
    const [row] = (await req('GET', '/audit-logs?type=account.password_change')).body.rows
    assert.equal(row.actionLabel, 'Password changed')
    assert.deepEqual(row.target, { kind: 'user', name: 'Alpha Owner' })
  })

  test('managers can change their own password', async () => {
    const res = await req('POST', '/auth/change-password', { currentPassword: 'secret123', newPassword: 'manager456' }, manager.token)
    assert.equal(res.status, 200)
  })

  test('both new actions are registered', () => {
    assert.ok(AUDIT_ACTIONS['settings.update'])
    assert.ok(AUDIT_ACTIONS['account.password_change'])
  })
})
