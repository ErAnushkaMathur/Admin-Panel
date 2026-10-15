// Error with an HTTP status, picked up by middleware/errorHandler.js.
// `details` uses the same shape as validation errors: [{ field, message }]
export class HttpError extends Error {
  constructor(status, message, code, details) {
    super(message)
    this.status = status
    if (code) this.code = code
    if (details) this.details = details
  }
}
