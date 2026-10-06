import { getServerUrl } from '../config/server.js';

const BASE = `${getServerUrl()}/api/object-groups`;

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

const json = (method, body) => ({ method, body: JSON.stringify(body) });
const raw = (file) => ({ method: 'PUT', body: file, headers: { 'Content-Type': 'application/octet-stream' } });
const enc = encodeURIComponent;

// Adds the logo / model URLs (cache-busted by their version) to a stored main object.
export function withAssetUrls(group) {
  return {
    ...group,
    logoUrl: group.logoExt ? `${BASE}/${group.id}/logo?v=${enc(group.version || group.updatedAt || '')}` : null,
    objects: (group.objects || []).map((object) => ({
      ...object,
      modelUrl: object.hasModel
        ? `${BASE}/${group.id}/objects/${object.id}/model?v=${enc(object.updatedAt || '')}`
        : null
    }))
  };
}

export const objectApi = {
  list: async () => (await request(BASE)).groups.map(withAssetUrls),
  create: async (group) => withAssetUrls((await request(BASE, json('POST', group))).group),
  update: async (id, group) => withAssetUrls((await request(`${BASE}/${enc(id)}`, json('PUT', group))).group),
  remove: (id) => request(`${BASE}/${enc(id)}`, { method: 'DELETE' }),
  uploadLogo: async (id, file) => withAssetUrls((await request(`${BASE}/${enc(id)}/logo`, raw(file))).group),

  // Resolves to { group, objectId } for the newly created sub object.
  addObject: async (groupId, object) => {
    const data = await request(`${BASE}/${enc(groupId)}/objects`, json('POST', object));
    return { group: withAssetUrls(data.group), objectId: data.objectId };
  },
  updateObject: async (groupId, objectId, object) =>
    withAssetUrls((await request(`${BASE}/${enc(groupId)}/objects/${enc(objectId)}`, json('PUT', object))).group),
  removeObject: async (groupId, objectId) =>
    withAssetUrls((await request(`${BASE}/${enc(groupId)}/objects/${enc(objectId)}`, { method: 'DELETE' })).group),
  uploadModel: async (groupId, objectId, file) =>
    withAssetUrls((await request(`${BASE}/${enc(groupId)}/objects/${enc(objectId)}/model`, raw(file))).group)
};
