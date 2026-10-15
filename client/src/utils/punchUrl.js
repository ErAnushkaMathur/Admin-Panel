// Public punch page URL for a business. The QR version is tagged so punches record source "qr".
export function punchUrl(punchToken, { qr = false } = {}) {
  return `${window.location.origin}/punch/${punchToken}${qr ? '?src=qr' : ''}`
}
