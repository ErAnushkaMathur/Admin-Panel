import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rangesOverlap, leaveDays, leaveCoversDate } from '../src/services/leave.service.js'

test('rangesOverlap: inclusive on both ends', () => {
  assert.equal(rangesOverlap('2026-10-01', '2026-10-03', '2026-10-03', '2026-10-05'), true) // share the 3rd
  assert.equal(rangesOverlap('2026-10-01', '2026-10-03', '2026-10-04', '2026-10-05'), false) // back to back
  assert.equal(rangesOverlap('2026-10-02', '2026-10-02', '2026-10-01', '2026-10-05'), true) // inside
  assert.equal(rangesOverlap('2026-09-30', '2026-10-10', '2026-10-02', '2026-10-03'), true) // covers
  assert.equal(rangesOverlap('2026-10-05', '2026-10-06', '2026-10-01', '2026-10-04'), false)
})

test('leaveDays counts calendar days inclusively, across months and years', () => {
  assert.equal(leaveDays('2026-10-01', '2026-10-01'), 1)
  assert.equal(leaveDays('2026-10-01', '2026-10-03'), 3)
  assert.equal(leaveDays('2026-02-27', '2026-03-02'), 4)
  assert.equal(leaveDays('2026-12-31', '2027-01-01'), 2)
})

test('leaveCoversDate: only approved leave, inclusive range', () => {
  const leaves = [
    { status: 'approved', fromDate: '2026-10-01', toDate: '2026-10-03' },
    { status: 'pending', fromDate: '2026-10-10', toDate: '2026-10-10' },
    { status: 'rejected', fromDate: '2026-10-20', toDate: '2026-10-20' },
  ]
  assert.equal(leaveCoversDate(leaves, '2026-10-01'), true)
  assert.equal(leaveCoversDate(leaves, '2026-10-03'), true)
  assert.equal(leaveCoversDate(leaves, '2026-10-04'), false)
  assert.equal(leaveCoversDate(leaves, '2026-10-10'), false, 'pending does not count')
  assert.equal(leaveCoversDate(leaves, '2026-10-20'), false, 'rejected does not count')
  assert.equal(leaveCoversDate([], '2026-10-01'), false)
})
