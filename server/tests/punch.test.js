import { test, before, after, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { startTestServer } from './helpers/testServer.js'
import { setNowForTests } from '../src/utils/clock.js'
import { istToUtc } from '../src/utils/time.js'

let t, owner, punchToken, otherToken
const staff = {} // name -> { id, code, pin }

const at = (ymd, hhmm) => istToUtc(ymd, hhmm)
const setNow = (ymd, hhmm) => setNowForTests(at(ymd, hhmm))
const UA_A = 'Mozilla/5.0 (Linux; Android 10; Redmi 9A) Chrome/120'
const UA_B = 'Mozilla/5.0 (Linux; Android 12; Samsung A12) Chrome/121'

function punch(name, { pin, ua = UA_A, token = punchToken, code } = {}) {
  const s = staff[name]
  return t.request('POST', '/punch', {
    headers: { 'user-agent': ua },
    body: { businessToken: token, employeeCode: code ?? s.code, pin: pin ?? s.pin, source: 'qr' },
  })
}

const records = (name) =>
  t.db().collection('attendances').find({ employeeId: new t.mongoose.Types.ObjectId(staff[name].id) }).sort({ punchIn: 1 }).toArray()

before(async () => {
  t = await startTestServer()
  owner = await t.registerOwner('Alpha')
  const other = await t.registerOwner('Beta')
  const req = (method, path, body, tok = owner.token) => t.request(method, path, { token: tok, body })

  const dept = (await req('POST', '/departments', { name: 'Kitchen', color: '#f2727f', icon: 'chef-hat' })).body.department
  const dayShift = (await req('POST', '/shifts', { name: 'Morning', startTime: '08:00', endTime: '16:00', graceMinutes: 10 })).body.shift
  const nightShift = (await req('POST', '/shifts', { name: 'Night', startTime: '22:00', endTime: '06:00', graceMinutes: 10 })).body.shift

  const people = [
    ['ramesh', dayShift, '9000000001'],
    ['suresh', dayShift, '9000000002'],
    ['nisha', nightShift, '9000000003'],
    ['deepak', dayShift, '9000000004'],
    ['kavita', dayShift, '9000000005'],
  ]
  for (const [name, shift, phone] of people) {
    const res = await req('POST', '/employees', {
      name: name[0].toUpperCase() + name.slice(1),
      phone,
      departmentId: dept._id,
      roleTitle: 'Helper',
      shiftId: shift._id,
      joinDate: '2026-01-01',
      salary: { type: 'monthly', amountPaise: 1500000 },
    })
    staff[name] = { id: res.body.employee._id, code: res.body.employee.employeeCode, pin: res.body.pin }
  }

  punchToken = (await req('GET', '/settings/punch-link')).body.punchToken
  otherToken = (await req('GET', '/settings/punch-link', undefined, other.token)).body.punchToken
})
beforeEach(() => setNowForTests(null))
after(async () => {
  setNowForTests(null)
  await t?.stop()
})

const wrongPin = (pin) => String((Number(pin) + 1) % 10000).padStart(4, '0')

describe('punch link', () => {
  test('GET returns business name and server time; bad token is 404', async () => {
    setNow('2026-09-25', '07:00')
    const ok = await t.request('GET', `/punch/${punchToken}`)
    assert.equal(ok.status, 200)
    assert.equal(ok.body.businessName, 'Alpha Sweets')
    assert.equal(ok.body.serverTime, at('2026-09-25', '07:00').toISOString())

    const bad = await t.request('GET', '/punch/AAAAAAAAAAAAAAAAAAAAAA')
    assert.equal(bad.status, 404)
    assert.equal(bad.body.error.code, 'INVALID_PUNCH_LINK')
  })

  test('punch token is not leaked through /auth/me', async () => {
    const me = await t.request('GET', '/auth/me', { token: owner.token })
    assert.equal('punchToken' in me.body.business, false)
  })

  test("another business's link can't punch this business's staff", async () => {
    // Beta has no employees; Ramesh's code + PIN are meaningless there
    const res = await punch('ramesh', { token: otherToken })
    assert.equal(res.status, 401)
  })
})

describe('punch in / out', () => {
  test('first punch is IN with server time, IP, user agent; future fields null', async () => {
    setNow('2026-09-25', '08:25')
    const res = await punch('ramesh')
    assert.equal(res.status, 201)
    assert.equal(res.body.action, 'in')
    assert.equal(res.body.date, '2026-09-25')
    assert.equal(res.body.lateMinutes, 25)
    assert.equal(res.body.message, 'Ramesh, punched IN at 08:25 AM.')

    const [rec] = await records('ramesh')
    assert.equal(rec.punchIn.toISOString(), at('2026-09-25', '08:25').toISOString())
    assert.equal(rec.status, 'late')
    assert.equal(rec.source, 'qr')
    assert.ok(rec.punchInDevice.ip, 'ip stored')
    assert.equal(rec.punchInDevice.userAgent, UA_A)
    assert.equal(rec.punchOut, null)
    for (const f of ['method', 'gps', 'selfieUrl', 'faceConfidence', 'reviewStatus']) assert.equal(rec[f], null, f)
    assert.deepEqual(rec.flags, [])
    assert.equal(rec.shiftSnapshot.startTime, '08:00')
  })

  test('client-supplied time is impossible: body only accepts code/pin/source', async () => {
    const res = await t.request('POST', '/punch', {
      body: { businessToken: punchToken, employeeCode: staff.ramesh.code, pin: staff.ramesh.pin, punchIn: '2020-01-01T00:00:00Z' },
    })
    assert.equal(res.status, 400)
  })

  test('double punch: an immediate second punch does not punch out', async () => {
    setNow('2026-09-25', '08:27')
    const res = await punch('ramesh')
    assert.equal(res.status, 200)
    assert.equal(res.body.action, 'already_in')
    assert.match(res.body.message, /already punched IN at 08:25 AM/)
    const [rec] = await records('ramesh')
    assert.equal(rec.punchOut, null)
  })

  test('later punch is OUT with worked + overtime minutes', async () => {
    setNow('2026-09-25', '16:40')
    const res = await punch('ramesh')
    assert.equal(res.body.action, 'out')
    assert.equal(res.body.workedMinutes, 495)
    const [rec] = await records('ramesh')
    assert.equal(rec.punchOut.toISOString(), at('2026-09-25', '16:40').toISOString())
    assert.equal(rec.punchOutDevice.userAgent, UA_A)
    assert.equal(rec.overtimeMinutes, 15)
  })

  test('double punch after punching out: already done, no new record', async () => {
    setNow('2026-09-25', '16:45')
    const res = await punch('ramesh')
    assert.equal(res.body.action, 'already_done')
    assert.match(res.body.message, /already punched OUT at 04:40 PM/)
    assert.equal((await records('ramesh')).length, 1)
  })

  test('double punch sent simultaneously creates exactly one record', async () => {
    setNow('2026-09-25', '07:58')
    const [a, b] = await Promise.all([punch('suresh'), punch('suresh')])
    assert.deepEqual([a.body.action, b.body.action].sort(), ['already_in', 'in'])
    const recs = await records('suresh')
    assert.equal(recs.length, 1)
    assert.equal(recs[0].status, 'present')
  })

  test('inactive employee with correct PIN is told; with wrong PIN gets the generic error', async () => {
    await t.request('PATCH', `/employees/${staff.kavita.id}`, { token: owner.token, body: { isActive: false } })
    setNow('2026-09-25', '08:00')
    const right = await punch('kavita')
    assert.equal(right.status, 403)
    assert.equal(right.body.error.code, 'EMPLOYEE_INACTIVE')
    const wrong = await punch('kavita', { pin: wrongPin(staff.kavita.pin) })
    assert.equal(wrong.status, 401)
    assert.equal((await records('kavita')).length, 0)
  })
})

describe('wrong PIN lockout', () => {
  test('5 wrong PINs lock the code for 15 minutes, even for the right PIN', async () => {
    setNow('2026-09-26', '07:30')
    const bad = wrongPin(staff.deepak.pin)
    for (let i = 1; i <= 4; i++) {
      const res = await punch('deepak', { pin: bad })
      assert.equal(res.status, 401)
      assert.equal(res.body.error.message, `Wrong employee code or PIN. ${5 - i} attempt${5 - i === 1 ? '' : 's'} left.`)
    }
    const fifth = await punch('deepak', { pin: bad })
    assert.equal(fifth.status, 429)
    assert.equal(fifth.body.error.code, 'PUNCH_LOCKED')
    assert.match(fifth.body.error.message, /Try again in 15 minutes/)

    setNow('2026-09-26', '07:40')
    const correctWhileLocked = await punch('deepak')
    assert.equal(correctWhileLocked.status, 429)
    assert.match(correctWhileLocked.body.error.message, /Try again in 5 minutes/)
    assert.equal((await records('deepak')).length, 0)

    setNow('2026-09-26', '07:46')
    const afterLock = await punch('deepak')
    assert.equal(afterLock.status, 201)
    assert.equal(afterLock.body.action, 'in')
  })

  test('a successful punch resets the counter', async () => {
    setNow('2026-09-26', '07:50')
    const bad = wrongPin(staff.suresh.pin)
    for (let i = 0; i < 4; i++) await punch('suresh', { pin: bad })
    assert.equal((await punch('suresh')).status, 201)
    const next = await punch('suresh', { pin: bad })
    assert.match(next.body.error.message, /4 attempts left/)
  })

  test('unknown code behaves exactly like a real one (no existence leak)', async () => {
    setNow('2026-09-26', '09:00')
    const ghost = []
    for (let i = 0; i < 5; i++) {
      const res = await t.request('POST', '/punch', { body: { businessToken: punchToken, employeeCode: '999', pin: '1357' } })
      ghost.push([res.status, res.body.error.code, res.body.error.message])
    }
    assert.deepEqual(ghost.slice(0, 4).map((g) => g[0]), [401, 401, 401, 401])
    assert.equal(ghost[0][2], 'Wrong employee code or PIN. 4 attempts left.')
    assert.deepEqual(ghost[4].slice(0, 2), [429, 'PUNCH_LOCKED'])
  })

  test('old failures outside the 15-minute window do not count', async () => {
    const bad = wrongPin(staff.ramesh.pin)
    setNow('2026-09-27', '06:00')
    for (let i = 0; i < 4; i++) await punch('ramesh', { pin: bad })
    setNow('2026-09-27', '06:20')
    const res = await punch('ramesh', { pin: bad })
    assert.equal(res.status, 401)
    assert.match(res.body.error.message, /4 attempts left/)
  })
})

describe('midnight', () => {
  test('night shift: IN at 21:58, OUT at exactly midnight -> same record on the start date', async () => {
    setNow('2026-09-25', '21:58')
    const inRes = await punch('nisha')
    assert.equal(inRes.body.action, 'in')
    assert.equal(inRes.body.date, '2026-09-25')
    assert.equal(inRes.body.lateMinutes, 0)

    setNow('2026-09-26', '00:00')
    const outRes = await punch('nisha')
    assert.equal(outRes.body.action, 'out')
    assert.equal(outRes.body.date, '2026-09-25')
    assert.equal(outRes.body.workedMinutes, 122)
    assert.equal((await records('nisha')).length, 1)
  })

  test('night shift: first punch at exactly midnight is a late IN for the previous date', async () => {
    setNow('2026-09-28', '00:00')
    const res = await punch('nisha')
    assert.equal(res.body.action, 'in')
    assert.equal(res.body.date, '2026-09-27')
    assert.equal(res.body.lateMinutes, 120)
  })

  test('day shift worked past midnight: punch at 00:00 closes the open record, not a new IN', async () => {
    setNow('2026-09-29', '15:55')
    await punch('ramesh')
    setNow('2026-09-30', '00:00')
    const res = await punch('ramesh')
    assert.equal(res.body.action, 'out')
    assert.equal(res.body.date, '2026-09-29')
    assert.equal(res.body.workedMinutes, 485)
  })

  test('day shift: a fresh punch at 00:00 is an IN for the new date', async () => {
    setNow('2026-10-01', '00:00')
    const res = await punch('suresh')
    assert.equal(res.body.action, 'in')
    assert.equal(res.body.date, '2026-10-01')
  })
})

describe('device mismatch flag', () => {
  // A fresh employee, so the punch history in each step is easy to follow
  let name
  before(async () => {
    const dept = (await t.request('GET', '/departments', { token: owner.token })).body.departments[0]
    const shift = (await t.request('GET', '/shifts', { token: owner.token })).body.shifts.find((s) => s.name === 'Morning')
    const res = await t.request('POST', '/employees', {
      token: owner.token,
      body: {
        name: 'Farhan',
        phone: '9000000009',
        departmentId: dept._id,
        roleTitle: 'Helper',
        shiftId: shift._id,
        joinDate: '2026-01-01',
        salary: { type: 'monthly', amountPaise: 1500000 },
      },
    })
    name = 'farhan'
    staff.farhan = { id: res.body.employee._id, code: res.body.employee.employeeCode, pin: res.body.pin }
  })

  test('first punch ever is never flagged', async () => {
    setNow('2026-10-05', '08:00')
    await punch(name, { ua: UA_A })
    const [rec] = await records(name)
    assert.deepEqual(rec.flags, [])
  })

  test('punch from a different device than the last 3 punches is flagged but not blocked', async () => {
    setNow('2026-10-05', '16:00')
    await punch(name, { ua: UA_A }) // out, day 1
    setNow('2026-10-06', '08:00')
    await punch(name, { ua: UA_A }) // in, day 2 -> history: A, A, A

    setNow('2026-10-06', '16:00')
    const res = await punch(name, { ua: UA_B }) // out from another phone
    assert.equal(res.body.action, 'out', 'punch still goes through')
    assert.equal('flags' in res.body, false, 'employee is not told')

    const recs = await records(name)
    assert.deepEqual(recs[0].flags, [], 'day 1 untouched')
    assert.deepEqual(recs[1].flags, ['device_mismatch'])
    assert.equal(recs[1].punchOutDevice.userAgent, UA_B)
  })

  test('matching any of the last 3 punches is not flagged', async () => {
    // History now: B (out day 2), A (in day 2), A (out day 1)
    setNow('2026-10-07', '08:00')
    await punch(name, { ua: UA_A })
    const recs = await records(name)
    assert.deepEqual(recs[2].flags, [])
  })

  test('a new record is flagged when the device is new to the last 3 punches', async () => {
    setNow('2026-10-07', '16:00')
    await punch(name, { ua: UA_A }) // history: A, A, B
    setNow('2026-10-08', '08:00')
    const UA_C = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1'
    await punch(name, { ua: UA_C })
    const recs = await records(name)
    assert.deepEqual(recs[3].flags, ['device_mismatch'])
    assert.equal(recs[3].punchInDevice.userAgent, UA_C)
  })
})

describe('settings: regenerate punch link', () => {
  test('owner regenerates; old link stops working, new one works', async () => {
    const res = await t.request('POST', '/settings/punch-link/regenerate', { token: owner.token })
    assert.equal(res.status, 200)
    assert.notEqual(res.body.punchToken, punchToken)
    assert.equal((await t.request('GET', `/punch/${punchToken}`)).status, 404)
    assert.equal((await t.request('GET', `/punch/${res.body.punchToken}`)).status, 200)
    punchToken = res.body.punchToken
  })

  test('settings endpoints require login', async () => {
    assert.equal((await t.request('GET', '/settings/punch-link')).status, 401)
  })
})
