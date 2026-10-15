const MINUTES_PER_DAY = 24 * 60

// "HH:mm" -> minutes since midnight
export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

// SPEC 4.4: if end < start the shift runs past midnight
export function crossesMidnight(startTime, endTime) {
  return toMinutes(endTime) < toMinutes(startTime)
}

// Length of the shift in minutes, handling shifts that cross midnight
export function shiftDurationMinutes(startTime, endTime) {
  const diff = toMinutes(endTime) - toMinutes(startTime)
  return diff > 0 ? diff : diff + MINUTES_PER_DAY
}
