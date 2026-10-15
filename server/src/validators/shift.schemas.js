import { z } from 'zod'

const time = (label) =>
  z.string(`${label} is required`).regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${label} must be in HH:mm format`)

const fields = {
  name: z.string('Name is required').trim().min(2, 'Name is too short').max(60, 'Name is too long'),
  startTime: time('Start time'),
  endTime: time('End time'),
  graceMinutes: z
    .number('Grace minutes is required')
    .int('Grace minutes must be a whole number')
    .min(0, 'Grace minutes cannot be negative')
    .max(180, 'Grace can be at most 180 minutes'),
}

const sameTimes = (b) => !(b.startTime && b.endTime && b.startTime === b.endTime)
const sameTimesError = { message: 'End time must be different from start time', path: ['endTime'] }

// crossesMidnight is derived on the server, so it is not accepted from the client.
// graceMinutes may be left out on create: the shop's default grace (Settings) is used.
export const createShiftSchema = z
  .object({ ...fields, graceMinutes: fields.graceMinutes.optional() })
  .strict()
  .refine(sameTimes, sameTimesError)

export const updateShiftSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update')
  .refine(sameTimes, sameTimesError)
