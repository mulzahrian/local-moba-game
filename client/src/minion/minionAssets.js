import { minionApi } from './minionApi.js';
const cache = new Map();
export const getMinionDefinition = (id) => { if (!cache.has(id)) cache.set(id, minionApi.get(id).catch((e) => { cache.delete(id); throw e; })); return cache.get(id); };
export const invalidateMinion = (id) => cache.delete(id);
