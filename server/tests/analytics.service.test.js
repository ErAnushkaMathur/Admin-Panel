import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  analyticsRange,
  bucketsFor,
  attendanceTrend,
  lateRanking,
  overtimeByDepartment,
  absenteePatterns,
  payrollMonths,
  payrollTrend,
} from '../src/services/analytics.service.js'

const kitchen = { _id: 'k', name: 'Kitchen', color: '#f2727f' }
const counter = { _id: 'c', name: 'Counter', color: '#4a90d9' }
const person = (name, department, days) => ({ employee: { _id: name, name, employeeCode: name.slice(0, 3), roleTitle: 'Helper' }, department, days })
const day = (date, status, extra = {}) => ({ date, status, lateMinutes: 0, overtimeMinutes: 0, workedMinutes: 0, ...extra })

describe('analyticsRange / bucketsFor', () => {
  test('30d = 30 daily points ending today, previous window right before it', () => {
    const r = analyticsRange('30d', '2026-09-30')
    assert.deepEqual(r, { range: '30d', from: '2026-09-01', to: '2026-09-30', bucket: 'day', previousFrom: '2026-08-02', previousTo: '2026-08-31' })
    assert.equal(bucketsFor(r.from, r.to, r.bucket).length, 30)
  })
  test('90d = weekly buckets starting Monday, first and last clipped to the window', () => {
    const r = analyticsRange('90d', '2026-09-30') // Wednesday
    assert.equal(r.from, '2026-07-03') // Friday
    const b = bucketsFor(r.from, r.to, 'week')
    assert.deepEqual(b[0], { key: '2026-07-03', from: '2026-07-03', to: '2026-07-05' })
    assert.deepEqual(b[1], { key: '2026-07-06', from: '2026-07-06', to: '2026-07-12' })
    assert.deepEqual(b.at(-1), { key: '2026-09-28', from: '2026-09-28', to: '2026-09-30' })
  })
  test('12m = 12 monthly buckets from the 1st, the current month up to today', () => {
    const r = analyticsRange('12m', '2026-09-15')
    assert.equal(r.from, '2025-10-01')
    const b = bucketsFor(r.from, r.to, 'month')
    assert.equal(b.length, 12)
    assert.deepEqual(b[0], { key: '2025-10', from: '2025-10-01', to: '2025-10-31' })
    assert.deepEqual(b.at(-1), { key: '2026-09', from: '2026-09-01', to: '2026-09-15' })
  })
})

describe('attendanceTrend', () => {
  test('per bucket: counts add up to total; weekly off and not-yet-in are not counted', () => {
    const employees = [
      person('Amit', kitchen, [day('2026-09-01', 'present'), day('2026-09-02', 'late'), day('2026-09-03', 'weekly_off')]),
      person('Bina', kitchen, [day('2026-09-01', 'absent'), day('2026-09-02', 'half_day'), day('2026-09-03', 'not_yet_in')]),
    ]
    const trend = attendanceTrend(employees, { from: '2026-09-01', to: '2026-09-03', bucket: 'day' })
    assert.deepEqual(trend.map((p) => [p.key, p.total, p.cameIn, p.cameInPercent]), [
      ['2026-09-01', 2, 1, 50],
      ['2026-09-02', 2, 2, 100],
      ['2026-09-03', 0, 0, null], // nothing counted -> no % (a gap, not 0%)
    ])
    for (const p of trend) assert.equal(Object.values(p.counts).reduce((a, b) => a + b, 0), p.total)
  })
})

describe('lateRanking', () => {
  test('most late days first, ties by minutes; half day is not a late; window respected', () => {
    const employees = [
      person('Amit', kitchen, [day('2026-09-01', 'late', { lateMinutes: 20 }), day('2026-09-02', 'late', { lateMinutes: 10 }), day('2026-09-03', 'present')]),
      person('Bina', kitchen, [day('2026-09-01', 'late', { lateMinutes: 50 }), day('2026-09-02', 'late', { lateMinutes: 40 }), day('2026-09-03', 'half_day', { lateMinutes: 90 })]),
      person('Chetan', counter, [day('2026-09-01', 'present'), day('2026-08-31', 'late', { lateMinutes: 5 })]),
    ]
    const ranking = lateRanking(employees, { from: '2026-09-01', to: '2026-09-03' })
    assert.deepEqual(ranking.map((r) => [r.employee.name, r.lateDays, r.lateMinutes, r.averageLateMinutes, r.cameInDays, r.latePercent]), [
      ['Bina', 2, 90, 45, 3, 66.7],
      ['Amit', 2, 30, 15, 3, 66.7],
    ])
  })
})

describe('overtimeByDepartment', () => {
  test('minutes per department vs previous window; shares add up; no previous -> no %', () => {
    const w = { from: '2026-09-01', to: '2026-09-30', previousFrom: '2026-08-02', previousTo: '2026-08-31' }
    const employees = [
      person('Amit', kitchen, [day('2026-09-05', 'present', { overtimeMinutes: 120 }), day('2026-08-10', 'present', { overtimeMinutes: 100 })]),
      person('Bina', kitchen, [day('2026-09-06', 'late', { overtimeMinutes: 12 })]),
      person('Chetan', counter, [day('2026-09-07', 'present', { overtimeMinutes: 60 }), day('2026-09-08', 'absent', { overtimeMinutes: 999 })]),
    ]
    const r = overtimeByDepartment(employees, w)
    assert.deepEqual(r.departments.map((d) => [d.name, d.minutes, d.previousMinutes, d.changePercent, d.employeesWithOvertime, d.sharePercent]), [
      ['Kitchen', 132, 100, 32, 2, 68.8], // "Kitchen overtime up 32%"
      ['Counter', 60, 0, null, 1, 31.3],
    ])
    assert.equal(r.totalMinutes, 192)
    assert.equal(r.previousTotalMinutes, 100)
    assert.equal(r.changePercent, 92)
  })
})

describe('absenteePatterns', () => {
  test('weekday rates (Monday first) and "absent 4 of 6 Mondays" patterns', () => {
    // Six Mondays in Aug–Sept 2026: 3, 10, 17, 24, 31 Aug and 7 Sept
    const mondays = ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07']
    const amit = person('Amit', kitchen, [
      ...mondays.map((d, i) => day(d, i < 4 ? 'absent' : 'present')),
      day('2026-08-04', 'present'), // Tuesday
      day('2026-08-09', 'weekly_off'), // Sunday off: not "due"
    ])
    const bina = person('Bina', kitchen, [day('2026-08-03', 'absent'), day('2026-08-04', 'on_leave')])
    const { byWeekday, patterns } = absenteePatterns([amit, bina], { from: '2026-08-01', to: '2026-09-30' })

    assert.deepEqual(byWeekday.map((w) => w.weekday), [1, 2, 3, 4, 5, 6, 0])
    assert.deepEqual(byWeekday[0], { weekday: 1, absentDays: 5, dueDays: 7, absentPercent: 71.4 })
    assert.deepEqual(byWeekday[1], { weekday: 2, absentDays: 0, dueDays: 2, absentPercent: 0 })
    assert.deepEqual(byWeekday[6], { weekday: 0, absentDays: 0, dueDays: 0, absentPercent: 0 })
    assert.deepEqual(patterns.map((p) => [p.employee.name, p.weekday, p.absentDays, p.dueDays, p.absentPercent]), [['Amit', 1, 4, 6, 66.7]])
  })
})

describe('payrollTrend', () => {
  test('sums stored snapshots per month; status final/draft/mixed; empty months kept as gaps', () => {
    const months = payrollMonths('6m', '2026-09-20')
    assert.deepEqual(months, ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'])
    const snap = (net) => ({ basePaise: net, overtimePaise: 0, deductionsPaise: 0, bonusPaise: 0, advancePaise: 0, netPaise: net })
    const r = payrollTrend(
      [
        { month: '2026-07', status: 'paid', snapshot: snap(2_000_000) },
        { month: '2026-07', status: 'finalized', snapshot: snap(1_000_000) },
        { month: '2026-08', status: 'paid', snapshot: snap(2_500_000) },
        { month: '2026-08', status: 'draft', snapshot: snap(1_000_000) },
        { month: '2026-09', status: 'draft', snapshot: snap(3_000_000) },
        { month: '2025-01', status: 'paid', snapshot: snap(9) }, // outside the range
      ],
      months,
    )
    assert.deepEqual(r.months.map((m) => [m.month, m.hasData, m.status, m.employees, m.netPaise]), [
      ['2026-04', false, null, 0, 0],
      ['2026-05', false, null, 0, 0],
      ['2026-06', false, null, 0, 0],
      ['2026-07', true, 'final', 2, 3_000_000],
      ['2026-08', true, 'mixed', 2, 3_500_000],
      ['2026-09', true, 'draft', 1, 3_000_000],
    ])
    assert.equal(r.finalMonths, 1)
    assert.equal(r.finalTotalNetPaise, 3_000_000)
    assert.equal(r.averageFinalNetPaise, 3_000_000)
  })
})
