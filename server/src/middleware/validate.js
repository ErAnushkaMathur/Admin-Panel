// Validates req[source] against a zod schema and replaces it with the parsed (cleaned) value.
export const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source] ?? {})
  if (!result.success) {
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        details: result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      },
    })
  }
  req[source] = result.data
  next()
}
