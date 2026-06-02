// api.js — the single place the front-end talks to the backend.
// Stores the JWT in localStorage and attaches it to every request.
//
// In local dev, requests go to "/api" (Vite proxies that to the backend on :4000).
// In production, set VITE_API_BASE to your deployed backend URL, e.g.
//   VITE_API_BASE=https://afya-api.onrender.com/api
const BASE = import.meta.env.VITE_API_BASE || "/api";
let token = localStorage.getItem("afya_token") || null;

export const getToken = () => token;
export function setToken(t) {
  token = t;
  if (t) localStorage.setItem("afya_token", t);
  else localStorage.removeItem("afya_token");
}

async function req(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && token) headers.Authorization = "Bearer " + token;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) throw new Error(data?.error || ("Request failed (" + res.status + ")"));
  return data;
}

export const api = {
  // auth
  signup: (b) => req("/auth/signup", { method: "POST", body: b, auth: false }),
  login: (b) => req("/auth/login", { method: "POST", body: b, auth: false }),
  me: () => req("/auth/me"),

  // providers
  providers: () => req("/providers"),
  provider: (id) => req("/providers/" + id),
  updateMyProvider: (b) => req("/providers/me", { method: "PATCH", body: b }),

  // appointments
  appointments: () => req("/appointments"),
  book: (b) => req("/appointments", { method: "POST", body: b }),
  completeAppt: (id) => req(`/appointments/${id}/complete`, { method: "POST" }),
  noShow: (id) => req(`/appointments/${id}/noshow`, { method: "POST" }),
  cancelAppt: (id) => req(`/appointments/${id}/cancel`, { method: "POST" }),
  rateAppt: (id, stars) => req(`/appointments/${id}/rate`, { method: "POST", body: { stars } }),

  // prescriptions
  prescriptions: () => req("/prescriptions"),
  prescribe: (b) => req("/prescriptions", { method: "POST", body: b }),
  setRxStatus: (id, status) => req(`/prescriptions/${id}/status`, { method: "PATCH", body: { status } }),

  // labs
  labs: () => req("/labs"),
  orderLab: (b) => req("/labs", { method: "POST", body: b }),
  setLabStatus: (id, status, results) => req(`/labs/${id}/status`, { method: "PATCH", body: { status, results } }),

  // messages
  messages: (providerId, patientId) => req(`/messages?providerId=${providerId}&patientId=${patientId}`),
  sendMessage: (b) => req("/messages", { method: "POST", body: b }),

  // notifications
  notifications: () => req("/notifications"),
  readNotifications: () => req("/notifications/read", { method: "POST" }),

  // admin
  adminProviders: () => req("/admin/providers"),
  verifyProvider: (id) => req(`/admin/providers/${id}/verify`, { method: "POST" }),
  rejectProvider: (id) => req(`/admin/providers/${id}/reject`, { method: "POST" }),
  controlled: () => req("/admin/controlled"),
};
