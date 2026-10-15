import PunchAttempt from '../models/PunchAttempt.js'

// SPEC 4.6: 5 wrong PINs -> 15 minute lock (per employee code)
export const MAX_FAILED_PINS = 5
export const LOCK_MINUTES = 15
const LOCK_MS = LOCK_MINUTES * 60 * 1000

// Returns the lock expiry if the code is currently locked, else null
export async function getActiveLock(businessId, employeeCode, now) {
  const attempt = await PunchAttempt.findOne({ businessId, employeeCode }).lean()
  return attempt?.lockedUntil && attempt.lockedUntil > now ? attempt.lockedUntil : null
}

// Counts a wrong PIN. Failures older than the lock window don't count.
// Returns { lockedUntil } when this failure triggers the lock, else { attemptsLeft }.
export async function recordFailedPin(businessId, employeeCode, now) {
  await PunchAttempt.updateOne(
    { businessId, employeeCode, lastFailedAt: { $lt: new Date(now - LOCK_MS) } },
    { $set: { failedCount: 0 } },
  )
  const attempt = await PunchAttempt.findOneAndUpdate(
    { businessId, employeeCode },
    { $inc: { failedCount: 1 }, $set: { lastFailedAt: now } },
    { upsert: true, new: true },
  )
  if (attempt.failedCount >= MAX_FAILED_PINS) {
    const lockedUntil = new Date(now.getTime() + LOCK_MS)
    await PunchAttempt.updateOne({ businessId, employeeCode }, { $set: { lockedUntil, failedCount: 0 } })
    return { lockedUntil }
  }
  return { attemptsLeft: MAX_FAILED_PINS - attempt.failedCount }
}

export async function clearFailedPins(businessId, employeeCode) {
  await PunchAttempt.deleteOne({ businessId, employeeCode })
}
