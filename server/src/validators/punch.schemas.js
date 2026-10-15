import { z } from 'zod'

const businessToken = z.string('Invalid punch link').regex(/^[A-Za-z0-9_-]{16,64}$/, 'Invalid punch link')

export const punchTokenParamSchema = z.object({ businessToken })

export const punchSchema = z
  .object({
    businessToken,
    employeeCode: z
      .string('Enter your employee code')
      .trim()
      .min(1, 'Enter your employee code')
      .max(12, 'Enter your employee code')
      .regex(/^[A-Za-z0-9]+$/, 'Enter your employee code'),
    pin: z.string('Enter your 4-digit PIN').regex(/^\d{4}$/, 'Enter your 4-digit PIN'),
    // How the page was opened: scanned QR or shared link
    source: z.enum(['qr', 'link']).default('link'),
  })
  .strict()
