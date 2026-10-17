import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthContext } from '../hooks/authContext.js'
import { authApi } from '../api/auth.js'
import { clearAuthToken, setUnauthorizedHandler } from '../api/client.js'

// status: 'loading' (checking session) | 'authenticated' | 'unauthenticated' | 'error' (server unreachable)
export default function AuthProvider({ children }) {
  const [status, setStatus] = useState('loading')
  const [user, setUser] = useState(null)
  const [business, setBusiness] = useState(null)
  const [sessionExpired, setSessionExpired] = useState(false)

  const setSession = useCallback((data) => {
    setUser(data.user)
    setBusiness(data.business)
    setSessionExpired(false)
    setStatus('authenticated')
  }, [])

  const clearSession = useCallback(() => {
    setUser(null)
    setBusiness(null)
    setStatus('unauthenticated')
  }, [])

  const loadSession = useCallback(async () => {
    try {
      setSession(await authApi.me())
    } catch (err) {
      if (err.response?.status === 401) {
        if (err.response.data?.error?.code === 'TOKEN_EXPIRED') setSessionExpired(true)
        clearSession()
      } else {
        setStatus('error')
      }
    }
  }, [setSession, clearSession])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  const retry = useCallback(() => {
    setStatus('loading')
    loadSession()
  }, [loadSession])

  // Any protected API call that returns 401 ends the session; ProtectedRoute then redirects to /login
  useEffect(() => {
    setUnauthorizedHandler((code) => {
      if (code === 'TOKEN_EXPIRED') setSessionExpired(true)
      clearSession()
    })
    return () => setUnauthorizedHandler(null)
  }, [clearSession])

  const login = useCallback(async (credentials) => setSession(await authApi.login(credentials)), [setSession])
  const register = useCallback(async (data) => setSession(await authApi.register(data)), [setSession])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setSessionExpired(false)
      clearSession()
      clearAuthToken()
    }
  }, [clearSession])

  // After Settings saves, so the shop name and defaults update everywhere without a reload
  const updateBusiness = useCallback((next) => setBusiness(next), [])

  const value = useMemo(
    () => ({ status, user, business, sessionExpired, login, register, logout, retry, updateBusiness }),
    [status, user, business, sessionExpired, login, register, logout, retry, updateBusiness],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
