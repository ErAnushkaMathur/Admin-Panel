import api from './client.js'

export const shiftsApi = {
  list: () => api.get('/shifts').then((r) => r.data.shifts),
  create: (data) => api.post('/shifts', data).then((r) => r.data.shift),
  update: (id, data) => api.patch(`/shifts/${id}`, data).then((r) => r.data.shift),
}
