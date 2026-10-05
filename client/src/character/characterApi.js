import { getServerUrl } from '../config/server.js';

const BASE = `${getServerUrl()}/api/characters`;

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

const upload = async (path, file) =>
  (await request(path, { method: 'PUT', body: file, headers: { 'Content-Type': 'application/octet-stream' } })).character;

// Adds the model / profile image URLs (cache-busted by the character's version) to a stored character.
export function withAssetUrls(character) {
  const version = encodeURIComponent(character.version || character.updatedAt || '');
  return {
    ...character,
    modelUrl: character.hasModel ? `${BASE}/${character.id}/model?v=${version}` : null,
    imageUrl: character.imageExt ? `${BASE}/${character.id}/image?v=${version}` : null
  };
}

export const characterApi = {
  list: async () => (await request(BASE)).characters.map(withAssetUrls),
  get: async (id) => withAssetUrls((await request(`${BASE}/${encodeURIComponent(id)}`)).character),
  create: async (character) =>
    (await request(BASE, { method: 'POST', body: JSON.stringify(character) })).character,
  update: async (id, character) =>
    (await request(`${BASE}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(character) })).character,
  uploadModel: (id, file) => upload(`${BASE}/${encodeURIComponent(id)}/model`, file),
  uploadImage: (id, file) => upload(`${BASE}/${encodeURIComponent(id)}/image`, file),
  remove: async (id) => request(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' })
};
