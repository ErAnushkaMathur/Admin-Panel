// Single source of "now" for punches (golden rule 3: server time only).
// Tests can pin the clock; this is refused outside NODE_ENV=test.
let fixedNow = null

export function now() {
  return fixedNow ? new Date(fixedNow) : new Date()
}

export function setNowForTests(date) {
  if (process.env.NODE_ENV !== 'test') throw new Error('setNowForTests is only available in tests')
  fixedNow = date ? new Date(date) : null
}
