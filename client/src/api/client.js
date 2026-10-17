import axios from 'axios'

const AUTH_TOKEN_KEY = 'sweetops.authToken'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
  // Prefer the server's httpOnly cookie; send the session token as a fallback if cookies are blocked.
  withCredentials: true,
})

export function clearAuthToken() {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(AUTH_TOKEN_KEY)
}

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = window.sessionStorage.getItem(AUTH_TOKEN_KEY)
    if (token) config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

// Called when an authenticated request comes back 401 (expired/invalid session).
let onUnauthorized = null
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

api.interceptors.response.use(
  (res) => {
    const token = res.data?.token
    if (typeof window !== 'undefined' && typeof token === 'string' && token) {
      window.sessionStorage.setItem(AUTH_TOKEN_KEY, token)
    }
    return res
  },
  (error) => {
    if (error.response?.status === 401) clearAuthToken()
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
