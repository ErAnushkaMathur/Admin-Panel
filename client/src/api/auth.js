import api from './client.js'

const opts = { skipAuthRedirect: true }

export const authApi = {
  register: (data) => api.post('/auth/register', data, opts).then((r) => r.data),
  login: (data) => api.post('/auth/login', data, opts).then((r) => r.data),
  logout: () => api.post('/auth/logout', null, opts),
  me: () => api.get('/auth/me', opts).then((r) => r.data),
  // Signs out other sessions; this one gets a fresh cookie. A wrong current password is a 400 field error.
  changePassword: (data) => api.post('/auth/change-password', data).then((r) => r.data),
}
