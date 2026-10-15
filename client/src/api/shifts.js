import api from './client.js'

export const shiftsApi = {
  list: () => api.get('api/shifts').then((r) => r.data.shifts),
  create: (data) => api.post('api/shifts', data).then((r) => r.data.shift),
  update: (id, data) => api.patch(`api/shifts/${id}`, data).then((r) => r.data.shift),
}
