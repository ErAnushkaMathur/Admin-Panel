import { z } from 'zod'

export const idParamSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{24}$/i, 'Invalid id'),
})
