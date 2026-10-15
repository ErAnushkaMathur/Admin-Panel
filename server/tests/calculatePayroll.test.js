import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { istToUtc } from '../src/utils/time.js'
import { calculatePayroll } from '../src/services/payroll.service.js'

// Written BEFORE calculatePayroll existed (SPEC 4.9). Expected values are hand-calculated.

// ---- Shared setup -------------------------------------------------------------------------
// September 2026: 30 days, Sundays 6, 13, 20, 27 -> 26 working days. 1 Sept is a Tuesday.
// Shift 09:00–17:00 (480 min), grace 10. Monthly ₹26,000 -> one day = ₹1,000 = 100,000 paise.
const MONTH = '2026-09'
const at = (ymd, hhmm) => istToUtc(ymd, hhmm)
const ymd = (d) => `${MONTH}-${String(d).padStart(2, '0')}`
const SUNDAYS = [6, 13, 20, 27]
const ALL_DAYS = Array.from({ length: 30 }, (_, i) => i + 1)
const WORKING_DAYS = ALL_DAYS.filter((d) => !SUNDAYS.includes(d))
const shift = { startTime: '09:00', endTime: '17:00', graceMinutes: 10, crossesMidnight: false }

const employee = (salary) => ({
  joinDate: '2026-01-01',
  shift,
  salary: { type: 'monthly', amountPaise: 2_600_000, overtimeMultiplier: 1.5, weeklyOff: [0], ...salary },
})
// Business settings. halfDayThresholdMinutes is the existing Business.attendanceSettings field.
const settings = (extra = {}) => ({
  month: MONTH,
  halfDayThresholdMinutes: 240,
  workingDaysPolicy: 'actual', // 'actual' = days in month minus weekly offs | 'fixed26'
  overtimeEnabled: true,
  lateRule: null, // e.g. { every: 3 } -> every 3 lates = half-day cut
  now: at('2026-10-05', '12:00'), // month already over
  ...extra,
})
const punch = (d, inTime = '09:00', outTime = '17:00') => ({ date: ymd(d), punchIn: at(ymd(d), inTime), punchOut: outTime && at(ymd(d), outTime) })
const fullDays = (days) => days.map((d) => punch(d))
const except = (days, skip) => days.filter((d) => !skip.includes(d))
const leave = (from, to, type, status = 'approved') => ({ fromDate: ymd(from), toDate: ymd(to), type, status })

const pick = (snapshot, keys) => Object.fromEntries(keys.map((k) => [k, snapshot[k]]))
const COUNTS = ['presentDays', 'lateDays', 'halfDays', 'absentDays', 'paidLeaveDays', 'unpaidLeaveDays', 'weeklyOffDays']
const MONEY = ['basePaise', 'overtimePaise', 'deductionsPaise', 'bonusPaise', 'advancePaise', 'netPaise']

describe('calculatePayroll (SPEC 4.9, hand-calculated)', () => {
  test('1. monthly, perfect month: full salary, weekly offs are not deducted', () => {
    const { snapshot } = calculatePayroll(employee(), fullDays(WORKING_DAYS), [], settings())
    assert.equal(snapshot.workingDays, 26)
    assert.deepEqual(pick(snapshot, COUNTS), {
      presentDays: 26, lateDays: 0, halfDays: 0, absentDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0, weeklyOffDays: 4,
    })
    assert.deepEqual(pick(snapshot, MONEY), {
      basePaise: 2_600_000, overtimePaise: 0, deductionsPaise: 0, bonusPaise: 0, advancePaise: 0, netPaise: 2_600_000,
    })
  })

  test('2. monthly with absences and unpaid leave: 3 days × ₹1,000 deducted', () => {
    // 7 Sept paid leave, 8 Sept unpaid leave, 9 & 10 Sept no punch (absent), 22 days present
    const attendance = fullDays(except(WORKING_DAYS, [7, 8, 9, 10]))
    const leaves = [leave(7, 7, 'paid'), leave(8, 8, 'unpaid')]
    const { snapshot } = calculatePayroll(employee(), attendance, leaves, settings())
    assert.deepEqual(pick(snapshot, COUNTS), {
      presentDays: 22, lateDays: 0, halfDays: 0, absentDays: 2, paidLeaveDays: 1, unpaidLeaveDays: 1, weeklyOffDays: 4,
    })
    // (2 absent + 1 unpaid leave) × 100,000
    assert.equal(snapshot.deductionsPaise, 300_000)
    assert.equal(snapshot.netPaise, 2_300_000)
  })

  test('2b. "On leave" set by hand is paid only when an approved leave record backs it', () => {
    // 17 Sept: marked On leave by hand, no leave record (a pending request does not count) -> unpaid
    // 18 Sept: marked On leave by hand, covered by an approved SICK leave -> paid
    const attendance = [
      ...fullDays(except(WORKING_DAYS, [17, 18])),
      { date: ymd(17), manualStatus: 'on_leave' },
      { date: ymd(18), manualStatus: 'on_leave' },
    ]
    const leaves = [leave(17, 17, 'paid', 'pending'), leave(18, 18, 'sick')]
    const { snapshot } = calculatePayroll(employee(), attendance, leaves, settings())
    assert.deepEqual(pick(snapshot, COUNTS), {
      presentDays: 24, lateDays: 0, halfDays: 0, absentDays: 0, paidLeaveDays: 1, unpaidLeaveDays: 1, weeklyOffDays: 4,
    })
    assert.equal(snapshot.deductionsPaise, 100_000)
    assert.equal(snapshot.netPaise, 2_500_000)
  })

  test('3. overtime: 6 h × ₹125/h × 1.5 = ₹1,125; switched off -> minutes kept, no pay', () => {
    // 1–3 Sept worked 09:00–19:00 = 120 min overtime each = 360 min.
    // Hourly rate = ₹1,000 per day ÷ 8 h = ₹125 = 12,500 paise. 6 × 12,500 × 1.5 = 112,500
    const attendance = [punch(1, '09:00', '19:00'), punch(2, '09:00', '19:00'), punch(3, '09:00', '19:00'), ...fullDays(except(WORKING_DAYS, [1, 2, 3]))]
    const on = calculatePayroll(employee(), attendance, [], settings()).snapshot
    assert.equal(on.overtimeMinutes, 360)
    assert.equal(on.overtimePaise, 112_500)
    assert.equal(on.netPaise, 2_712_500)

    const off = calculatePayroll(employee(), attendance, [], settings({ overtimeEnabled: false })).snapshot
    assert.equal(off.overtimeMinutes, 360)
    assert.equal(off.overtimePaise, 0)
    assert.equal(off.netPaise, 2_600_000)
  })

  test('4. daily ₹700: 20 present + half day (0.5) + paid leave = 21.5 days', () => {
    // No weekly off. 1–20 present, 21 worked 09:00–12:00 (180 < 240 -> half day), 22 paid leave, 23–30 absent
    const emp = employee({ type: 'daily', amountPaise: 70_000, weeklyOff: [] })
    const attendance = [...fullDays(ALL_DAYS.slice(0, 20)), punch(21, '09:00', '12:00')]
    const { snapshot } = calculatePayroll(emp, attendance, [leave(22, 22, 'paid')], settings())
    assert.equal(snapshot.workingDays, 30)
    assert.deepEqual(pick(snapshot, COUNTS), {
      presentDays: 20, lateDays: 0, halfDays: 1, absentDays: 8, paidLeaveDays: 1, unpaidLeaveDays: 0, weeklyOffDays: 0,
    })
    // 21.5 × 70,000; absent days are simply not paid (not a deduction)
    assert.equal(snapshot.basePaise, 1_505_000)
    assert.equal(snapshot.deductionsPaise, 0)
    assert.equal(snapshot.netPaise, 1_505_000)
  })

  test('5. hourly ₹120/h, 2× overtime: 96 h base + 4 h overtime', () => {
    // 1–5, 7–11 Sept 09:00–17:00 (10 × 8 h); 12 & 14 Sept 09:00–19:00 (2 × 10 h)
    // Worked 100 h, of which 4 h beyond the shift. Base 96 × 12,000 = 1,152,000. Overtime 4 × 12,000 × 2 = 96,000
    const emp = employee({ type: 'hourly', amountPaise: 12_000, overtimeMultiplier: 2 })
    const attendance = [...fullDays([1, 2, 3, 4, 5, 7, 8, 9, 10, 11]), punch(12, '09:00', '19:00'), punch(14, '09:00', '19:00')]
    const { snapshot } = calculatePayroll(emp, attendance, [], settings())
    assert.equal(snapshot.workedMinutes, 6000)
    assert.equal(snapshot.overtimeMinutes, 240)
    assert.equal(snapshot.presentDays, 12)
    assert.equal(snapshot.absentDays, 14)
    assert.equal(snapshot.basePaise, 1_152_000)
    assert.equal(snapshot.overtimePaise, 96_000)
    assert.equal(snapshot.netPaise, 1_248_000)
  })

  test('6. advance and bonus; net never goes below 0', () => {
    const attendance = fullDays(WORKING_DAYS)
    const a = calculatePayroll(employee(), attendance, [], settings(), { bonusPaise: 50_000, advancePaise: 500_000 }).snapshot
    // 2,600,000 + 50,000 − 500,000
    assert.deepEqual(pick(a, MONEY), {
      basePaise: 2_600_000, overtimePaise: 0, deductionsPaise: 0, bonusPaise: 50_000, advancePaise: 500_000, netPaise: 2_150_000,
    })
    assert.equal(a.unrecoveredAdvancePaise, 0)

    const b = calculatePayroll(employee(), attendance, [], settings(), { bonusPaise: 50_000, advancePaise: 3_000_000 }).snapshot
    // 2,650,000 − 3,000,000 = −350,000 -> net 0, 350,000 not recovered this month
    assert.equal(b.netPaise, 0)
    assert.equal(b.unrecoveredAdvancePaise, 350_000)
  })

  test('7. half day overrides late: late + short day counts as half day, not as a late', () => {
    // 1 Sept in 09:20, 2 Sept in 09:30 (late, full day). 3 Sept 11:00–14:00: late AND 180 min -> half day.
    // Late rule on (3 lates = half-day cut) but only 2 lates -> no cut. Only the half day: 0.5 × 100,000
    const attendance = [punch(1, '09:20'), punch(2, '09:30'), punch(3, '11:00', '14:00'), ...fullDays(except(WORKING_DAYS, [1, 2, 3]))]
    const { snapshot } = calculatePayroll(employee(), attendance, [], settings({ lateRule: { every: 3 } }))
    assert.deepEqual(pick(snapshot, COUNTS), {
      presentDays: 23, lateDays: 2, halfDays: 1, absentDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0, weeklyOffDays: 4,
    })
    assert.equal(snapshot.lateCount, 2)
    assert.equal(snapshot.deductionsPaise, 50_000)
    assert.equal(snapshot.netPaise, 2_550_000)
  })

  test('8. late deduction rule: 7 lates, every 3 = half day -> 2 half-day cuts = ₹1,000', () => {
    const lateDays = [1, 2, 3, 4, 5, 7, 8]
    const attendance = [...lateDays.map((d) => punch(d, '09:30')), ...fullDays(except(WORKING_DAYS, lateDays))]
    const { snapshot } = calculatePayroll(employee(), attendance, [], settings({ lateRule: { every: 3 } }))
    assert.equal(snapshot.presentDays, 19)
    assert.equal(snapshot.lateCount, 7)
    assert.equal(snapshot.deductionsPaise, 100_000)
    assert.equal(snapshot.netPaise, 2_500_000)

    // Rule off (default): lates cost nothing
    assert.equal(calculatePayroll(employee(), attendance, [], settings()).snapshot.netPaise, 2_600_000)
  })

  test('9. leave covering a weekly off: Sunday counted once, as leave', () => {
    // Paid leave Sat 26 – Mon 28 Sept (includes Sunday 27). 24 present + 3 leave + 3 weekly off (6, 13, 20) = 30
    const attendance = fullDays(except(WORKING_DAYS, [26, 28]))
    const paid = calculatePayroll(employee(), attendance, [leave(26, 28, 'paid')], settings()).snapshot
    assert.deepEqual(pick(paid, COUNTS), {
      presentDays: 24, lateDays: 0, halfDays: 0, absentDays: 0, paidLeaveDays: 3, unpaidLeaveDays: 0, weeklyOffDays: 3,
    })
    assert.equal(paid.netPaise, 2_600_000)

    // Same dates as UNPAID leave: only the 2 working days are deducted (no sandwich rule)
    const unpaid = calculatePayroll(employee(), attendance, [leave(26, 28, 'unpaid')], settings()).snapshot
    assert.equal(unpaid.unpaidLeaveDays, 3)
    assert.equal(unpaid.deductionsPaise, 200_000)
    assert.equal(unpaid.netPaise, 2_400_000)
  })

  test('10. a punch on a leave day counts as work: no deduction, no double pay', () => {
    // Approved unpaid leave on 15 Sept and sick leave on 16 Sept, but the employee punched both days
    const leaves = [leave(15, 15, 'unpaid'), leave(16, 16, 'sick')]
    const { snapshot } = calculatePayroll(employee(), fullDays(WORKING_DAYS), leaves, settings())
    assert.deepEqual(pick(snapshot, COUNTS), {
      presentDays: 26, lateDays: 0, halfDays: 0, absentDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0, weeklyOffDays: 4,
    })
    assert.equal(snapshot.deductionsPaise, 0)
    assert.equal(snapshot.netPaise, 2_600_000)
  })
})

describe('calculatePayroll: edge cases', () => {
  test('joined mid-month: working days before joining are deducted', () => {
    // Joined Tue 15 Sept. Working days 1–14 Sept = 12 (Sundays 6 & 13 excluded) -> 12 × 100,000 deducted
    const emp = { ...employee(), joinDate: '2026-09-15' }
    const { snapshot, days } = calculatePayroll(emp, fullDays(WORKING_DAYS.filter((d) => d >= 15)), [], settings())
    assert.equal(snapshot.notJoinedDays, 12)
    assert.equal(snapshot.presentDays, 14)
    assert.equal(snapshot.weeklyOffDays, 2) // 20 and 27 only
    assert.equal(snapshot.deductionBreakdown.notJoinedPaise, 1_200_000)
    assert.equal(snapshot.netPaise, 1_400_000)
    assert.equal(days[0].status, 'not_joined')
  })

  test('current month: days not reached yet are neither counted nor deducted', () => {
    // Recalculated on 15 Sept at 18:00 (shift over). Present every working day so far (13 days), nothing after.
    const { snapshot } = calculatePayroll(employee(), fullDays(WORKING_DAYS.filter((d) => d <= 15)), [], settings({ now: at('2026-09-15', '18:00') }))
    assert.equal(snapshot.countedThrough, '2026-09-15')
    assert.equal(snapshot.presentDays, 13)
    assert.equal(snapshot.absentDays, 0)
    assert.equal(snapshot.netPaise, 2_600_000)
  })

  test('today before the shift ends is not counted as absent', () => {
    const { snapshot } = calculatePayroll(employee(), fullDays(WORKING_DAYS.filter((d) => d <= 14)), [], settings({ now: at('2026-09-15', '10:00') }))
    assert.equal(snapshot.absentDays, 0)
    assert.equal(snapshot.countedThrough, '2026-09-14')
  })

  test('working-days policy: actual (27 in Oct 2026) vs fixed 26; rounding to whole paise', () => {
    // October 2026: 31 days, Sundays 4, 11, 18, 25 -> 27 working days. 1 Oct absent.
    const october = (policy) => {
      const workdays = Array.from({ length: 31 }, (_, i) => i + 1).filter((d) => ![4, 11, 18, 25].includes(d) && d !== 1)
      const attendance = workdays.map((d) => {
        const date = `2026-10-${String(d).padStart(2, '0')}`
        return { date, punchIn: at(date, '09:00'), punchOut: at(date, '17:00') }
      })
      return calculatePayroll(employee(), attendance, [], settings({ month: '2026-10', workingDaysPolicy: policy, now: at('2026-11-02', '12:00') })).snapshot
    }
    const actual = october('actual')
    assert.equal(actual.workingDays, 27)
    assert.equal(actual.deductionsPaise, 96_296) // 2,600,000 ÷ 27 = 96,296.30
    assert.equal(actual.netPaise, 2_503_704)
    const fixed = october('fixed26')
    assert.equal(fixed.workingDays, 26)
    assert.equal(fixed.deductionsPaise, 100_000)
  })

  test('monthly: a half day worked on a weekly off is not deducted', () => {
    const attendance = [...fullDays(WORKING_DAYS), punch(6, '09:00', '12:00')]
    const { snapshot } = calculatePayroll(employee(), attendance, [], settings())
    assert.equal(snapshot.halfDays, 1)
    assert.equal(snapshot.deductionsPaise, 0)
  })
})
