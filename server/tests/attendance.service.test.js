import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveShiftDate,
  computeLateMinutes,
  punchInStatus,
  computeWorkedMinutes,
  computeOvertimeMinutes,
  recentPunchDevices,
  isDeviceMismatch,
} from '../src/services/attendance.service.js'
import { istToUtc, toIST, addDays } from '../src/utils/time.js'

const day = { startTime: '08:00', endTime: '16:00', graceMinutes: 10, crossesMidnight: false }
const night = { startTime: '22:00', endTime: '06:00', graceMinutes: 10, crossesMidnight: true }
const at = (ymd, hhmm) => istToUtc(ymd, hhmm)

test('IST helpers', () => {
  assert.equal(at('2026-09-25', '00:00').toISOString(), '2026-09-24T18:30:00.000Z')
  assert.deepEqual(toIST(new Date('2026-09-24T18:30:00Z')), { date: '2026-09-25', minutes: 0 })
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
})

test('resolveShiftDate: day shift uses the IST calendar date, including at midnight', () => {
  assert.equal(resolveShiftDate(at('2026-09-25', '07:55'), day), '2026-09-25')
  assert.equal(resolveShiftDate(at('2026-09-25', '00:00'), day), '2026-09-25')
  assert.equal(resolveShiftDate(at('2026-09-24', '23:59'), day), '2026-09-24')
})

test('resolveShiftDate: night shift punches after midnight belong to the start date', () => {
  assert.equal(resolveShiftDate(at('2026-09-25', '21:50'), night), '2026-09-25')
  assert.equal(resolveShiftDate(at('2026-09-26', '00:00'), night), '2026-09-25') // exactly midnight
  assert.equal(resolveShiftDate(at('2026-09-26', '05:59'), night), '2026-09-25')
  assert.equal(resolveShiftDate(at('2026-09-26', '13:59'), night), '2026-09-25') // before gap midpoint (14:00)
  assert.equal(resolveShiftDate(at('2026-09-26', '14:00'), night), '2026-09-26') // early arrival for tonight
  // Month / year rollover
  assert.equal(resolveShiftDate(at('2027-01-01', '00:30'), night), '2026-12-31')
})

test('computeLateMinutes respects grace and counts from shift start', () => {
  assert.equal(computeLateMinutes(at('2026-09-25', '07:50'), '2026-09-25', day), 0)
  assert.equal(computeLateMinutes(at('2026-09-25', '08:10'), '2026-09-25', day), 0) // within grace
  assert.equal(computeLateMinutes(at('2026-09-25', '08:11'), '2026-09-25', day), 11)
  // Night shift punched in at midnight: 2h late for the 22:00 start on the previous date
  assert.equal(computeLateMinutes(at('2026-09-26', '00:00'), '2026-09-25', night), 120)
  assert.equal(punchInStatus(0), 'present')
  assert.equal(punchInStatus(11), 'late')
})

test('worked and overtime minutes across midnight', () => {
  const worked = computeWorkedMinutes(at('2026-09-25', '21:58'), at('2026-09-26', '06:30'))
  assert.equal(worked, 512)
  assert.equal(computeOvertimeMinutes(worked, night), 32)
  assert.equal(computeOvertimeMinutes(400, day), 0)
})

test('device mismatch: compares with the last 3 punch events only', () => {
  const A = { ip: '1.1.1.1', userAgent: 'PhoneA' }
  const B = { ip: '1.1.1.1', userAgent: 'PhoneB' }
  const records = [
    { punchIn: at('2026-09-25', '08:00'), punchInDevice: A, punchOut: null, punchOutDevice: null },
    { punchIn: at('2026-09-24', '08:00'), punchInDevice: A, punchOut: at('2026-09-24', '16:00'), punchOutDevice: A },
    { punchIn: at('2026-09-23', '08:00'), punchInDevice: B, punchOut: at('2026-09-23', '16:00'), punchOutDevice: B },
  ]
  const recent = recentPunchDevices(records)
  assert.equal(recent.length, 3)
  assert.deepEqual(recent.map((d) => d.userAgent), ['PhoneA', 'PhoneA', 'PhoneA'])
  assert.equal(isDeviceMismatch(A, recent), false)
  // B was used, but not within the last 3 punches
  assert.equal(isDeviceMismatch(B, recent), true)
  // Same UA from a different IP is a different combination
  assert.equal(isDeviceMismatch({ ip: '2.2.2.2', userAgent: 'PhoneA' }, recent), true)
  // No history: nothing to compare with
  assert.equal(isDeviceMismatch(A, []), false)
})
