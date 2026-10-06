import { getServerUrl } from '../config/server.js';

const BASE = `${getServerUrl()}/api/skills`;

async function request(url, options = {}) {
  const isJson = typeof options.body === 'string';
  const response = await fetch(url, {
    ...options,
    headers: { ...(isJson ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }
  return data;
}

const enc = encodeURIComponent;

// Adds the icon URL (cache-busted by the skill's version) to a stored skill.
export function withIconUrl(skill) {
  return {
    ...skill,
    iconUrl: skill.iconExt ? `${BASE}/${enc(skill.id)}/icon?v=${enc(skill.version || skill.updatedAt || '')}` : null
  };
}

export const skillApi = {
  list: async () => (await request(BASE)).skills.map(withIconUrl),
  create: async (skill) => withIconUrl((await request(BASE, { method: 'POST', body: JSON.stringify(skill) })).skill),
  update: async (id, skill) =>
    withIconUrl((await request(`${BASE}/${enc(id)}`, { method: 'PUT', body: JSON.stringify(skill) })).skill),
  remove: (id) => request(`${BASE}/${enc(id)}`, { method: 'DELETE' }),
  uploadIcon: async (id, file) =>
    withIconUrl(
      (
        await request(`${BASE}/${enc(id)}/icon`, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': 'application/octet-stream' }
        })
      ).skill
    )
};
