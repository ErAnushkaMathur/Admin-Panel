import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://admin-panel-backend-dxj5.onrender.com',
  // Auth lives in an httpOnly cookie set by the server
  withCredentials: true,
})

// Called when an authenticated request comes back 401 (expired/invalid session).
let onUnauthorized = null
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

api.interceptors.response.use(
  (res) => res,
  (error) => {
    // Auth endpoints (login, me, ...) opt out: a 401 there is an expected answer, not a lost session
    if (error.response?.status === 401 && !error.config?.skipAuthRedirect && onUnauthorized) {
      onUnauthorized(error.response.data?.error?.code)
    }
    return Promise.reject(error)
  },
)

// Pulls a readable message out of an API error
export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error.response) return 'Cannot reach the server. Check your connection.'
  return error.response.data?.error?.message || fallback
}

// Maps the backend's zod `details` array to { field: message }
export function getFieldErrors(error) {
  const details = error.response?.data?.error?.details
  if (!Array.isArray(details)) return {}
  return Object.fromEntries(details.map((d) => [d.field, d.message]))
}

export default api
