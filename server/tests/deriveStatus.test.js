import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { deriveStatus, resolveEditedPunches, shiftEndInstant, weekdayOf } from '../src/services/attendance.service.js'
import { istToUtc } from '../src/utils/time.js'

const at = (ymd, hhmm) => istToUtc(ymd, hhmm)
const day = { startTime: '08:00', endTime: '16:00', graceMinutes: 10, crossesMidnight: false }
const night = { startTime: '22:00', endTime: '06:00', graceMinutes: 10, crossesMidnight: true }
const D = '2026-09-25' // a Friday
const base = { date: D, shift: day, halfDayThresholdMinutes: 240, now: at('2026-09-26', '12:00') }

describe('deriveStatus: Present', () => {
  test('punched in before shift start', () => {
    const r = deriveStatus({ ...base, punchIn: at(D, '07:50'), punchOut: at(D, '16:05') })
    assert.equal(r.status, 'present')
    assert.equal(r.lateMinutes, 0)
    assert.equal(r.workedMinutes, 495)
  })
  test('punched in exactly at shiftStart + grace is still present', () => {
    const r = deriveStatus({ ...base, punchIn: at(D, '08:10'), punchOut: at(D, '16:00') })
    assert.equal(r.status, 'present')
    assert.equal(r.lateMinutes, 0)
  })
  test('still working (no punch out yet) is present, not half day', () => {
    const r = deriveStatus({ ...base, punchIn: at(D, '08:00'), now: at(D, '09:00') })
    assert.equal(r.status, 'present')
    assert.equal(r.workedMinutes, 0)
  })
})

describe('deriveStatus: Late', () => {
  test('one minute past grace is late; lateMinutes counts from shift start', () => {
    const r = deriveStatus({ ...base, punchIn: at(D, '08:11'), punchOut: at(D, '16:00') })
    assert.equal(r.status, 'late')
    assert.equal(r.lateMinutes, 11)
  })
  test('night shift late arrival after midnight', () => {
    const r = deriveStatus({ ...base, shift: night, punchIn: at('2026-09-26', '00:30'), punchOut: at('2026-09-26', '06:00') })
    assert.equal(r.status, 'late')
    assert.equal(r.lateMinutes, 150)
  })
  test('late while still working (no punch out)', () => {
    const r = deriveStatus({ ...base, punchIn: at(D, '09:00'), now: at(D, '10:00') })
    assert.equal(r.status, 'late')
    assert.equal(r.lateMinutes, 60)
  })
})

describe('deriveStatus: Half Day', () => {
  test('worked less than the threshold', () => {
    const r = deriveStatus({ ...base, punchIn: at(D, '08:00'), punchOut: at(D, '11:59') })
    assert.equal(r.status, 'half_day')
    assert.equal(r.workedMinutes, 239)
  })
  test('worked exactly the threshold is not a half day', () => {
    const r = deriveStatus({ ...base, punchIn: at(D, '08:00'), punchOut: at(D, '12:00') })
    assert.equal(r.status, 'present')
  })
  test('half day wins over late but keeps lateMinutes', () => {
    const r = deriveStatus({ ...base, punchIn: at(D, '10:00'), punchOut: at(D, '12:00') })
    assert.equal(r.status, 'half_day')
    assert.equal(r.lateMinutes, 120)
  })
  test('threshold comes from the setting', () => {
    const r = deriveStatus({ ...base, halfDayThresholdMinutes: 300, punchIn: at(D, '08:00'), punchOut: at(D, '12:30') })
    assert.equal(r.status, 'half_day')
  })
})

describe('deriveStatus: On Leave', () => {
  test('approved leave covering the date, no punch', () => {
    const r = deriveStatus({ ...base, onApprovedLeave: true })
    assert.equal(r.status, 'on_leave')
  })
  test('leave wins over weekly off and absent', () => {
    assert.equal(deriveStatus({ ...base, onApprovedLeave: true, isWeeklyOff: true }).status, 'on_leave')
  })
  test('if they punched in anyway, the punch counts', () => {
    const r = deriveStatus({ ...base, onApprovedLeave: true, punchIn: at(D, '08:00'), punchOut: at(D, '16:00') })
    assert.equal(r.status, 'present')
  })
  test('a late punch on a leave day counts as late work, not leave', () => {
    const r = deriveStatus({ ...base, onApprovedLeave: true, punchIn: at(D, '09:00'), punchOut: at(D, '16:00') })
    assert.equal(r.status, 'late')
    assert.equal(r.lateMinutes, 60)
  })
  test('a short punch on a leave day is a half day', () => {
    const r = deriveStatus({ ...base, onApprovedLeave: true, punchIn: at(D, '08:00'), punchOut: at(D, '10:00') })
    assert.equal(r.status, 'half_day')
  })
  test('still working on a leave day (no punch out) counts as work', () => {
    const r = deriveStatus({ ...base, onApprovedLeave: true, punchIn: at(D, '08:00'), now: at(D, '10:00') })
    assert.equal(r.status, 'present')
  })
  test('leave wins over weekly off even when both apply and the shift has ended', () => {
    const r = deriveStatus({ ...base, onApprovedLeave: true, isWeeklyOff: true, now: at('2026-09-30', '00:00') })
    assert.equal(r.status, 'on_leave')
  })
  test('leave is never absent: shift over, no punch', () => {
    assert.equal(deriveStatus({ ...base, onApprovedLeave: true, now: at(D, '16:00') }).status, 'on_leave')
  })
  test('leave shows before the shift ends and on future dates (not "not yet in")', () => {
    assert.equal(deriveStatus({ ...base, onApprovedLeave: true, now: at(D, '07:00') }).status, 'on_leave')
    assert.equal(deriveStatus({ ...base, onApprovedLeave: true, date: '2026-10-10', now: at(D, '12:00') }).status, 'on_leave')
  })
  test('night shift on leave: on_leave through the next morning', () => {
    const r = deriveStatus({ ...base, shift: night, onApprovedLeave: true, now: at('2026-09-26', '07:00') })
    assert.equal(r.status, 'on_leave')
  })
  test('no leave metrics: late/worked/overtime are zero', () => {
    const r = deriveStatus({ ...base, onApprovedLeave: true })
    assert.deepEqual([r.lateMinutes, r.workedMinutes, r.overtimeMinutes], [0, 0, 0])
  })
  test('a manual status set by the owner beats leave', () => {
    assert.equal(deriveStatus({ ...base, onApprovedLeave: true, manualStatus: 'absent' }).status, 'absent')
  })
})

describe('deriveStatus: Absent / Not yet in', () => {
  test('no punch, no leave, shift ended -> absent', () => {
    assert.equal(deriveStatus({ ...base, now: at(D, '16:00') }).status, 'absent')
  })
  test('no punch before the shift ends -> not yet in', () => {
    assert.equal(deriveStatus({ ...base, now: at(D, '15:59') }).status, 'not_yet_in')
    assert.equal(deriveStatus({ ...base, now: at(D, '07:00') }).status, 'not_yet_in')
  })
  test('night shift is not absent until it ends the next morning', () => {
    const n = { ...base, shift: night }
    assert.equal(deriveStatus({ ...n, now: at('2026-09-26', '05:59') }).status, 'not_yet_in')
    assert.equal(deriveStatus({ ...n, now: at('2026-09-26', '06:00') }).status, 'absent')
  })
  test('future dates are not absent', () => {
    assert.equal(deriveStatus({ ...base, date: '2026-10-10', now: at(D, '12:00') }).status, 'not_yet_in')
  })
})

describe('deriveStatus: Weekly off', () => {
  test('weekly off with no punch is weekly_off, never absent', () => {
    assert.equal(deriveStatus({ ...base, isWeeklyOff: true, now: at('2026-09-30', '00:00') }).status, 'weekly_off')
  })
  test('working on a weekly off counts as present', () => {
    const r = deriveStatus({ ...base, isWeeklyOff: true, punchIn: at(D, '08:00'), punchOut: at(D, '16:00') })
    assert.equal(r.status, 'present')
  })
})

describe('deriveStatus: manual status', () => {
  test('manual status overrides everything', () => {
    const r = deriveStatus({ ...base, manualStatus: 'absent', punchIn: at(D, '09:00'), punchOut: at(D, '16:00') })
    assert.equal(r.status, 'absent')
    assert.equal(r.lateMinutes, 0)
    assert.equal(r.workedMinutes, 420)
  })
  test('manual present clears lateness', () => {
    const r = deriveStatus({ ...base, manualStatus: 'present', punchIn: at(D, '09:00'), punchOut: at(D, '16:00') })
    assert.equal(r.status, 'present')
    assert.equal(r.lateMinutes, 0)
  })
})

describe('deriveStatus: overtime', () => {
  test('minutes beyond the shift length', () => {
    const r = deriveStatus({ ...base, punchIn: at(D, '08:00'), punchOut: at(D, '17:30') })
    assert.equal(r.overtimeMinutes, 90)
  })
})

describe('helpers', () => {
  test('shiftEndInstant and weekdayOf', () => {
    assert.equal(shiftEndInstant(D, day).toISOString(), at(D, '16:00').toISOString())
    assert.equal(shiftEndInstant(D, night).toISOString(), at('2026-09-26', '06:00').toISOString())
    assert.equal(weekdayOf('2026-09-25'), 5)
    assert.equal(weekdayOf('2026-09-27'), 0)
  })

  test('resolveEditedPunches: day shift, out before in means next day', () => {
    const r = resolveEditedPunches(D, day, { punchInTime: '08:05', punchOutTime: '16:10' })
    assert.equal(r.punchIn.toISOString(), at(D, '08:05').toISOString())
    assert.equal(r.punchOut.toISOString(), at(D, '16:10').toISOString())
    const late = resolveEditedPunches(D, day, { punchInTime: '15:00', punchOutTime: '00:30' })
    assert.equal(late.punchOut.toISOString(), at('2026-09-26', '00:30').toISOString())
  })

  test('resolveEditedPunches: night shift times after midnight are next day', () => {
    const r = resolveEditedPunches(D, night, { punchInTime: '00:10', punchOutTime: '06:00' })
    assert.equal(r.punchIn.toISOString(), at('2026-09-26', '00:10').toISOString())
    assert.equal(r.punchOut.toISOString(), at('2026-09-26', '06:00').toISOString())
    const onTime = resolveEditedPunches(D, night, { punchInTime: '21:55', punchOutTime: '06:05' })
    assert.equal(onTime.punchIn.toISOString(), at(D, '21:55').toISOString())
  })

  test('resolveEditedPunches: only punch out given keeps current punch in', () => {
    const r = resolveEditedPunches(D, day, { punchOutTime: '16:00', currentPunchIn: at(D, '08:00') })
    assert.equal(r.punchIn.toISOString(), at(D, '08:00').toISOString())
    assert.equal(r.punchOut.toISOString(), at(D, '16:00').toISOString())
    const cleared = resolveEditedPunches(D, day, { punchOutTime: null, currentPunchIn: at(D, '08:00'), currentPunchOut: at(D, '16:00') })
    assert.equal(cleared.punchOut, null)
  })
})
