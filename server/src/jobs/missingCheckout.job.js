import Attendance from '../models/Attendance.js'
import { now as serverNow } from '../utils/clock.js'
import { istToUtc, todayIST, addDays } from '../utils/time.js'
import { MAX_OPEN_SHIFT_HOURS } from '../services/attendance.service.js'

// SPEC 4.7: records with a punch-in but no punch-out get the `missing_checkout` flag.
// Hours are never auto-filled. "Missing" = still open MAX_OPEN_SHIFT_HOURS after punch-in,
// the same point after which the punch page stops treating the record as open.
export async function flagMissingCheckouts(now = serverNow()) {
  const cutoff = new Date(now.getTime() - MAX_OPEN_SHIFT_HOURS * 3600 * 1000)
  const result = await Attendance.updateMany(
    { punchIn: { $ne: null, $lt: cutoff }, punchOut: null, flags: { $ne: 'missing_checkout' } },
    { $addToSet: { flags: 'missing_checkout' } },
  ).setOptions({ skipTenant: true }) // deliberate cross-business maintenance job
  return result.modifiedCount
}

const RUN_AT_IST = '02:00'

function msUntilNextRun(now) {
  let next = istToUtc(todayIST(now), RUN_AT_IST)
  if (next <= now) next = istToUtc(addDays(todayIST(now), 1), RUN_AT_IST)
  return next - now
}

async function runSafely() {
  try {
    const count = await flagMissingCheckouts()
    if (count) console.log(`[missing-checkout] flagged ${count} record(s)`)
  } catch (err) {
    console.error('[missing-checkout] failed:', err.message)
  }
}

// Runs once at startup (catch up after downtime), then every night at 02:00 IST.
// Idempotent, so running on several server instances is harmless.
export function scheduleMissingCheckoutJob() {
  runSafely()
  const scheduleNext = () => {
    const timer = setTimeout(async () => {
      await runSafely()
      scheduleNext()
    }, msUntilNextRun(new Date()))
    timer.unref()
  }
  scheduleNext()
}
