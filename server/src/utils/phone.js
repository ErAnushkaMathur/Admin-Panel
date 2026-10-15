// "+91 98765-43210", "098765 43210", "919876543210" -> "9876543210".
// Returns the input unchanged (minus separators) if it doesn't look like an Indian number,
// so validation can reject it.
export function normalizeIndianPhone(value) {
  const digits = String(value).replace(/[\s\-().]/g, '').replace(/^\+/, '')
  if (/^91\d{10}$/.test(digits)) return digits.slice(2)
  if (/^0\d{10}$/.test(digits)) return digits.slice(1)
  return digits
}
