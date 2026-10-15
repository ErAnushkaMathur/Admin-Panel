import Counter from '../models/Counter.js'

// First employee in each business gets code "101", then "102", …
const FIRST_CODE = 101

export function formatEmployeeCode(seq) {
  return String(FIRST_CODE - 1 + seq)
}

// Atomically reserves the next code. A failed create just skips a number, which is fine.
export async function nextEmployeeCode(businessId) {
  const counter = await Counter.findOneAndUpdate(
    { businessId, key: 'employeeCode' },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  return formatEmployeeCode(counter.seq)
}
