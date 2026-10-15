import api from './client.js'

const opts = { skipAuthRedirect: true }

export const authApi = {
 register: (data) => api.post('/api/auth/register', data, opts).then((r) => r.data),
  login: (data) => api.post('/api/auth/login', data, opts).then((r) => r.data),
  logout: () => api.post('/api/auth/logout', null, opts),
  me: () => api.get('/api/auth/me', opts).then((r) => r.data),
  changePassword: (data) => api.post('/api/auth/change-password', data).then((r) => r.data),
}
