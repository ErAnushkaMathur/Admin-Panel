import { env } from '../config/env.js'

export function notFound(req, res) {
  res.status(404).json({ error: { message: `Not found: ${req.method} ${req.originalUrl}` } })
}

// Central error handler. Throw errors with `status` set to control the HTTP code.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let status = err.status || err.statusCode || 500
  let message = err.message || 'Internal server error'

  if (err.name === 'ValidationError' || err.name === 'CastError') {
    status = 400
  } else if (err.code === 11000) {
    status = 409
    message = 'Duplicate value'
  }

  if (status >= 500) {
    console.error(err)
    if (env.nodeEnv === 'production') message = 'Internal server error'
  }

  res.status(status).json({
    error: {
      message,
      // Machine-readable code from HttpError (e.g. TOKEN_EXPIRED) for the client to act on
      ...(typeof err.code === 'string' && { code: err.code }),
      ...(Array.isArray(err.details) && { details: err.details }),
      ...(env.nodeEnv !== 'production' && status >= 500 && { stack: err.stack }),
    },
  })
}
