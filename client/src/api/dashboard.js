import api from './client.js'

export const dashboardApi = {
  // period: 'week' | 'month' | 'year' (donut). Every number on the dashboard comes from here.
  summary: (period) => api.get('/dashboard/summary', { params: { period } }).then((r) => r.data),
}
