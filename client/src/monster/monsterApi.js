import { getServerUrl } from '../config/server.js';

const BASE = `${getServerUrl()}/api/monsters`;

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

// Adds the model URL (cache-busted by the monster's version) to a stored monster.
export function withModelUrl(monster) {
  return {
    ...monster,
    modelUrl: monster.hasModel ? `${BASE}/${enc(monster.id)}/model?v=${enc(monster.version || monster.updatedAt || '')}` : null
  };
}

export const monsterApi = {
  list: async () => (await request(BASE)).monsters.map(withModelUrl),
  get: async (id) => withModelUrl((await request(`${BASE}/${enc(id)}`)).monster),
  create: async (monster) => withModelUrl((await request(BASE, { method: 'POST', body: JSON.stringify(monster) })).monster),
  update: async (id, monster) =>
    withModelUrl((await request(`${BASE}/${enc(id)}`, { method: 'PUT', body: JSON.stringify(monster) })).monster),
  remove: (id) => request(`${BASE}/${enc(id)}`, { method: 'DELETE' }),
  uploadModel: async (id, file) =>
    withModelUrl(
      (
        await request(`${BASE}/${enc(id)}/model`, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': 'application/octet-stream' }
        })
      ).monster
    )
};
