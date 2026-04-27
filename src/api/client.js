import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// Attach stored token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mm_token');
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

// Handle 401 — only redirect if we actually have a token (i.e. session expired)
// Skip /auth/me — used at startup to check if already logged in
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url  = err.config?.url || '';
    const code = err.response?.status;
    if (code === 401 && !url.includes('/auth/me')) {
      const hasToken = !!localStorage.getItem('mm_token');
      if (hasToken) {
        localStorage.removeItem('mm_token');
        window.location.href = '/';
      }
    }
    return Promise.reject(err);
  }
);

export default api;

// ── Safe error message extractor ───────────────────────────────────────────────
// FastAPI validation errors return detail as array [{type,loc,msg,input,ctx}]
// React can't render objects/arrays — always extract a string
export function errMsg(e, fallback = 'Something went wrong') {
  const detail = e?.response?.data?.detail;
  if (!detail) return e?.message || fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map(d => {
      const loc = d.loc?.slice(1).join(' → ') || '';
      return loc ? `${loc}: ${d.msg}` : d.msg;
    }).join(' | ');
  }
  try { return JSON.stringify(detail); } catch { return fallback; }
}

// ── Auth ────────────────────────────────────────────────────────────
export const authApi = {
  login:  (data) => api.post('/auth/login', data),
  me:     ()     => api.get('/auth/me'),
  logout: ()     => api.post('/auth/logout'),
};

// ── Users / Staff ───────────────────────────────────────────────────
export const usersApi = {
  list:           (params) => api.get('/users', { params }),
  get:            (id)     => api.get(`/users/${id}`),
  create:         (data)   => api.post('/users', data),
  update:         (id, d)  => api.put(`/users/${id}`, d),
  changePassword: (id, d)  => api.post(`/users/${id}/password`, d),
  delete:         (id)     => api.delete(`/users/${id}`),
};

// ── Customers ───────────────────────────────────────────────────────
export const customersApi = {
  list:     (params) => api.get('/customers', { params }),
  get:      (id)     => api.get(`/customers/${id}`),
  create:   (data)   => api.post('/customers', data),
  update:   (id, d)  => api.put(`/customers/${id}`, d),
  delete:   (id)     => api.delete(`/customers/${id}`),
  timeline: (id)     => api.get(`/customers/${id}/timeline`),
};

// ── Vehicles ────────────────────────────────────────────────────────
export const vehiclesApi = {
  list:   (params) => api.get('/vehicles', { params }),
  get:    (id)     => api.get(`/vehicles/${id}`),
  create: (data)   => api.post('/vehicles', data),
  update: (id, d)  => api.put(`/vehicles/${id}`, d),
  delete: (id)     => api.delete(`/vehicles/${id}`),
  stats:  ()       => api.get('/vehicles/stats/summary'),
};

// ── Sales ───────────────────────────────────────────────────────────
export const salesApi = {
  list:   (params) => api.get('/sales', { params }),
  get:    (id)     => api.get(`/sales/${id}`),
  create: (data)   => api.post('/sales', data),
  update: (id, d)  => api.put(`/sales/${id}`, d),
  delete: (id)     => api.delete(`/sales/${id}`),
  stats:  ()       => api.get('/sales/stats/summary'),
};

// ── Service ─────────────────────────────────────────────────────────
export const serviceApi = {
  list:           (params) => api.get('/service', { params }),
  get:            (id)     => api.get(`/service/${id}`),
  create:         (data)   => api.post('/service', data),
  update:         (id, d)  => api.put(`/service/${id}`, d),
  delete:         (id)     => api.delete(`/service/${id}`),
  stats:          ()       => api.get('/service/stats/summary'),
  due:            (days)   => api.get('/service/due', { params: { days } }),
  markNotified:   (veh)    => api.post(`/service/due/${encodeURIComponent(veh)}/notified`),
  notifications:  ()       => api.get('/service/due/notifications'),
  getBillByJobId: (jobId)  => api.get('/service-bills', { params: { job_id: jobId } }),
  createBill:     (data)   => api.post('/service-bills', data),
  updateBill:     (id, d)  => api.put(`/service-bills/${id}`, d),
};

// ── Service Bills ───────────────────────────────────────────────────
export const debtApi = {
  list:       (p)         => api.get('/debts', { params: p }),
  create:     (d)         => api.post('/debts', d),
  update:     (id, d)     => api.put(`/debts/${id}`, d),
  delete:     (id)        => api.delete(`/debts/${id}`),
  addPayment: (id, d)     => api.post(`/debts/${id}/payments`, d),
  summary:    ()          => api.get('/debts/summary'),
};

export const billsApi = {
  list:   (params) => api.get('/service-bills', { params }),
  get:    (id)     => api.get(`/service-bills/${id}`),
  create: (data)   => api.post('/service-bills', data),
  update: (id, d)  => api.put(`/service-bills/${id}`, d),
  delete: (id)     => api.delete(`/service-bills/${id}`),
};

// ── Parts ───────────────────────────────────────────────────────────
export const partsApi = {
  list:        (params) => api.get('/parts', { params }),
  get:         (id)     => api.get(`/parts/${id}`),
  create:      (data)   => api.post('/parts', data),
  update:      (id, d)  => api.put(`/parts/${id}`, d),
  delete:      (id)     => api.delete(`/parts/${id}`),
  adjustStock: (id, d)  => api.post(`/parts/${id}/adjust-stock`, d),
  stats:       ()       => api.get('/parts/stats/summary'),
  lowStock:    ()       => api.get('/parts/low-stock'),
  outOfStock:           ()           => api.get('/parts/out-of-stock'),
  adjustStockByNumber:  (partNum, d) => api.post(`/parts/${partNum}/adjust-stock-by-number`, d),
  createBill:           (data)       => api.post('/parts-bills', data),
  listBills:            (params)     => api.get('/parts-bills', { params }),
  deleteBill:           (id)         => api.delete(`/parts-bills/${id}`),
  updateBill:  (id, d)  => api.put(`/parts-bills/${id}`, d),
};

// ── Dashboard & Reports ─────────────────────────────────────────────
export const dashboardApi = {
  stats:          () => api.get('/dashboard/stats'),
  recentActivity: () => api.get('/dashboard/recent-activity'),
};

export const expensesApi = {
  list:   (params) => api.get('/expenses', { params }),
  create: (data)   => api.post('/expenses', data),
  update: (id, d)  => api.put(`/expenses/${id}`, d),
  delete: (id)     => api.delete(`/expenses/${id}`),
  stats:  (months) => api.get('/expenses/stats/summary', { params: { months } }),
  pnl:    (months) => api.get('/reports/pnl', { params: { months } }),
};

export const backupApi = {
  export: () => api.get('/backup/export', { responseType: 'blob' }),
};

export const reportsApi = {
  revenue:      (params) => api.get('/reports/revenue', { params }),
  brandSales:   (params) => api.get('/reports/brand-sales', { params }),
  topParts:     (params) => api.get('/reports/top-parts', { params }),
  dailyClosing: (date)   => api.get('/reports/daily-closing', { params: { date } }),
};

// ── Import ──────────────────────────────────────────────────────────
export const importApi = {
  template: (entity)       => api.get(`/import/template/${entity}`, { responseType: 'blob' }),
  preview:  (entity, file) => {
    const fd = new FormData(); fd.append('file', file);
    return api.post(`/import/preview/${entity}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  import: (entity, file, mode = 'skip') => {
    const fd = new FormData(); fd.append('file', file); fd.append('mode', mode);
    return api.post(`/import/${entity}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  clear:  (entity) => api.delete(`/import/clear/${entity}`),
  counts: ()       => api.get('/import/counts'),
};

// ── Files / Uploads ─────────────────────────────────────────────────
export const filesApi = {
  upload: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  getFileUrl: (fileId) => `${api.defaults.baseURL}/files/${fileId}`,
};

// ── Health ──────────────────────────────────────────────────────────
export const healthApi = {
  check: () => axios.get(`${BASE_URL}/health`),
};
