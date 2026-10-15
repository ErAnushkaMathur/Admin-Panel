// Converts what the owner types in ₹ to integer paise without floating-point maths.
// "18,000" -> 1800000, "18000.5" -> 1800050. Returns null if it isn't a valid amount.
export function rupeesToPaise(input) {
  const s = String(input).trim().replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const [rupees, fraction = ''] = s.split('.')
  return Number(rupees) * 100 + Number(fraction.padEnd(2, '0'))
}

// 1800050 -> "18000.50", for prefilling the edit form
export function paiseToRupeesInput(paise) {
  if (paise == null) return ''
  const rupees = Math.floor(paise / 100)
  const rest = paise % 100
  return rest ? `${rupees}.${String(rest).padStart(2, '0')}` : String(rupees)
}
