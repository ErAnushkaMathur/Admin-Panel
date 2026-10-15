import api from './client.js'

// Public endpoints: no login, and a 401 here means "wrong code/PIN", never "session expired"
const opts = { skipAuthRedirect: true, withCredentials: false }

export const punchApi = {
  // -> { businessName, serverTime }
  info: (businessToken) => api.get(`/punch/${encodeURIComponent(businessToken)}`, opts).then((r) => r.data),
  // -> { action: 'in' | 'out' | 'already_in' | 'already_done', employee, message, ... }
  punch: (data) => api.post('/punch', data, opts).then((r) => r.data),
}
