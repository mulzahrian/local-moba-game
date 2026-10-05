import { getServerUrl } from '../config/server.js';

const BASE = `${getServerUrl()}/api/maps`;

async function request(url, options) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }
  return data;
}

export const mapApi = {
  list: async () => (await request(BASE)).maps,
  get: async (id) => (await request(`${BASE}/${encodeURIComponent(id)}`)).map,
  create: async (map) => (await request(BASE, { method: 'POST', body: JSON.stringify(map) })).map,
  update: async (id, map) =>
    (await request(`${BASE}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(map) })).map,
  remove: async (id) => request(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' })
};
