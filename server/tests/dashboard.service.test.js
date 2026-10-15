import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  summarizeToday,
  summarizePeriod,
  departmentAttendance,
  periodRange,
  projectMonthlyPayPaise,
  salaryOverview,
  percent,
  datesBetween,
  TODAY_BUCKETS,
} from '../src/services/dashboard.service.js'

describe('summarizeToday', () => {
  test('mockup bug 1: buckets add up to total staff; late and half day count as came in', () => {
    // The mockup's 12 staff: 8 on time, 2 late, 1 absent, 1 on leave
    const statuses = [...Array(8).fill('present'), 'late', 'late', 'absent', 'on_leave']
    const r = summarizeToday(statuses)
    assert.equal(r.total, 12)
    assert.equal(Object.values(r.counts).reduce((a, b) => a + b, 0), 12)
    assert.equal(r.cameIn, 10)
    assert.equal(r.cameInPercent, 83.3)
  })
  test('every status has a bucket; a missing status counts as not yet in', () => {
    const r = summarizeToday([...TODAY_BUCKETS, null])
    assert.equal(r.total, 8)
    assert.equal(r.counts.not_yet_in, 2)
    assert.equal(r.cameIn, 3)
  })
  test('no staff', () => {
    assert.deepEqual(summarizeToday([]).cameInPercent, 0)
  })
})

describe('departmentAttendance', () => {
  test('mockup bug 2: department totals add up to the staff total and came-in to Present Today', () => {
    const kitchen = { _id: 'k', name: 'Kitchen', color: '#f00' }
    const counter = { _id: 'c', name: 'Counter', color: '#0f0' }
    const rows = [
      { department: kitchen, status: 'present' },
      { department: kitchen, status: 'late' },
      { department: kitchen, status: 'absent' },
      { department: counter, status: 'half_day' },
      { department: counter, status: 'on_leave' },
      { department: null, status: 'present' },
    ]
    const result = departmentAttendance(rows)
    assert.deepEqual(result.map((d) => [d.name, d.cameIn, d.total, d.percent]), [
      ['Counter', 1, 2, 50],
      ['Kitchen', 2, 3, 66.7],
      ['No department', 1, 1, 100],
    ])
    assert.equal(result.reduce((s, d) => s + d.total, 0), rows.length)
    assert.equal(result.reduce((s, d) => s + d.cameIn, 0), summarizeToday(rows.map((r) => r.status)).cameIn)
  })
})

describe('summarizePeriod', () => {
  test('segments add up to the total; weekly offs and not-yet-in are outside the donut', () => {
    const r = summarizePeriod(['present', 'present', 'late', 'half_day', 'absent', 'on_leave', 'weekly_off', 'weekly_off', 'not_yet_in'])
    assert.equal(r.total, 6)
    assert.equal(r.segments.reduce((s, x) => s + x.count, 0), r.total)
    assert.equal(r.weeklyOff, 2)
    assert.equal(r.cameIn, 4)
    assert.equal(r.cameInPercent, 66.7)
    assert.deepEqual(r.segments[0], { status: 'present', count: 2, percent: 33.3, offsetPercent: 0 })
    assert.deepEqual(r.segments[2], { status: 'half_day', count: 1, percent: 16.7, offsetPercent: 50 })
  })
})

describe('periodRange', () => {
  test('week starts Monday, month on the 1st, year on 1 Jan; all end today', () => {
    assert.deepEqual(periodRange('week', '2026-09-25'), { from: '2026-09-21', to: '2026-09-25' }) // Friday
    assert.deepEqual(periodRange('week', '2026-09-27'), { from: '2026-09-21', to: '2026-09-27' }) // Sunday
    assert.deepEqual(periodRange('week', '2026-09-21'), { from: '2026-09-21', to: '2026-09-21' }) // Monday
    assert.deepEqual(periodRange('month', '2026-09-25'), { from: '2026-09-01', to: '2026-09-25' })
    assert.deepEqual(periodRange('year', '2026-09-25'), { from: '2026-01-01', to: '2026-09-25' })
  })
  test('datesBetween is inclusive and crosses months', () => {
    assert.deepEqual(datesBetween('2026-09-29', '2026-10-02'), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'])
  })
})

describe('projectMonthlyPayPaise (Est. Monthly Payment: full month, ignores attendance)', () => {
  const shift = { startTime: '09:00', endTime: '17:00' }
  test('monthly = the salary', () => {
    assert.equal(projectMonthlyPayPaise({ type: 'monthly', amountPaise: 2_600_000, weeklyOff: [0] }, shift, '2026-09'), 2_600_000)
  })
  test('daily = rate × working days (Sept 2026, Sundays off = 26)', () => {
    assert.equal(projectMonthlyPayPaise({ type: 'daily', amountPaise: 70_000, weeklyOff: [0] }, shift, '2026-09'), 1_820_000)
  })
  test('hourly = rate × shift hours × working days', () => {
    assert.equal(projectMonthlyPayPaise({ type: 'hourly', amountPaise: 12_000, weeklyOff: [0] }, shift, '2026-09'), 12_000 * 8 * 26)
  })
})

describe('salaryOverview', () => {
  test('mockup bug 3: total = basic + overtime − deductions', () => {
    const r = salaryOverview([
      { basePaise: 10_000_000, overtimePaise: 500_000, deductionsPaise: 400_000 },
      { basePaise: 3_200_000, overtimePaise: 350_000, deductionsPaise: 250_000 },
    ])
    assert.deepEqual(r, { basicPaise: 13_200_000, overtimePaise: 850_000, deductionsPaise: 650_000, totalPaise: 13_400_000 })
  })
})

test('percent', () => {
  assert.equal(percent(1, 3), 33.3)
  assert.equal(percent(0, 0), 0)
})
