import { z } from 'zod'

const email = z.string().trim().toLowerCase().pipe(z.email('Invalid email').max(254))

export const registerSchema = z
  .object({
    businessName: z.string().trim().min(2, 'Business name is too short').max(120),
    name: z.string().trim().min(2, 'Name is too short').max(100),
    email,
    // bcrypt only uses the first 72 bytes
    password: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password is too long'),
  })
  .strict()

export const loginSchema = z
  .object({
    email,
    password: z.string().min(1, 'Password is required').max(72),
  })
  .strict()

export const changePasswordSchema = z
  .object({
    currentPassword: z.string('Enter your current password').min(1, 'Enter your current password').max(72),
    newPassword: z.string('Enter a new password').min(8, 'Password must be at least 8 characters').max(72, 'Password is too long'),
  })
  .strict()
  .refine((b) => b.currentPassword !== b.newPassword, { message: 'New password must be different', path: ['newPassword'] })
