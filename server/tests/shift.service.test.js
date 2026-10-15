import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toMinutes, crossesMidnight, shiftDurationMinutes } from '../src/services/shift.service.js'

test('toMinutes parses HH:mm', () => {
  assert.equal(toMinutes('00:00'), 0)
  assert.equal(toMinutes('08:30'), 510)
  assert.equal(toMinutes('23:59'), 1439)
})

test('crossesMidnight is true only when end < start', () => {
  assert.equal(crossesMidnight('09:00', '17:00'), false)
  assert.equal(crossesMidnight('22:00', '06:00'), true)
  assert.equal(crossesMidnight('18:00', '00:00'), true)
  assert.equal(crossesMidnight('00:00', '08:00'), false)
})

test('shiftDurationMinutes handles normal and overnight shifts', () => {
  assert.equal(shiftDurationMinutes('09:00', '17:00'), 480)
  assert.equal(shiftDurationMinutes('22:00', '06:00'), 480)
  assert.equal(shiftDurationMinutes('18:00', '00:00'), 360)
  assert.equal(shiftDurationMinutes('23:30', '00:15'), 45)
})
