import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Object library: every "main object" (group) lives in server/data/objects/<id>:
//   group.json + logo.<ext> + models/<objectId>.glb for each sub object.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OBJECTS_DIR = path.join(__dirname, '..', 'data', 'objects');

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_OBJECTS_PER_GROUP = 200;
const DEFAULT_SIZE = 10;
const DEFAULT_TOWER_SIZE = 20;

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const str = (value, max = 120) => String(value ?? '').slice(0, max);
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const isValidObjectId = (id) => typeof id === 'string' && ID_PATTERN.test(id);

function slugify(name, fallback) {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || fallback;
}

// Only whitelisted fields are persisted, so clients cannot write arbitrary data to disk.
export function sanitizeGroup(input, id, previous = null) {
  const now = new Date().toISOString();
  return {
    id,
    name: str(input?.name, 40).trim() || previous?.name || 'Unnamed Object',
    tower: typeof input?.tower === 'boolean' ? input.tower : Boolean(previous?.tower),
    logoExt: previous?.logoExt || null,
    objects: previous?.objects || [],
    createdAt: previous?.createdAt || now,
    updatedAt: now
  };
}

export function sanitizeObject(input, id, group, previous = null) {
  const now = new Date().toISOString();
  const fallbackSize = previous?.size ?? (group.tower ? DEFAULT_TOWER_SIZE : DEFAULT_SIZE);
  return {
    id,
    name: str(input?.name, 60).trim() || previous?.name || 'Unnamed',
    size: clamp(num(input?.size, fallbackSize), 0.5, 500),
    yOffset: clamp(num(input?.yOffset, previous?.yOffset ?? 0), -100, 100),
    rotationY: clamp(num(input?.rotationY, previous?.rotationY ?? 0), -360, 360),
    defaultAnimation: input && 'defaultAnimation' in input ? str(input.defaultAnimation, 120) : previous?.defaultAnimation || '',
    hasModel: previous?.hasModel || false,
    createdAt: previous?.createdAt || now,
    updatedAt: now
  };
}

class ObjectStore {
  dir(id) {
    return path.join(OBJECTS_DIR, id);
  }

  jsonPath(id) {
    return path.join(this.dir(id), 'group.json');
  }

  logoPath(group) {
    return group?.logoExt ? path.join(this.dir(group.id), `logo.${group.logoExt}`) : null;
  }

  modelPath(groupId, objectId) {
    return path.join(this.dir(groupId), 'models', `${objectId}.glb`);
  }

  async list() {
    await fs.mkdir(OBJECTS_DIR, { recursive: true });
    const entries = await fs.readdir(OBJECTS_DIR, { withFileTypes: true });
    const groups = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !isValidObjectId(entry.name)) continue;
      const group = await this.get(entry.name).catch(() => null);
      if (group) groups.push(group);
    }
    return groups.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  async get(id) {
    if (!isValidObjectId(id)) return null;
    try {
      return JSON.parse(await fs.readFile(this.jsonPath(id), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async write(group) {
    await fs.mkdir(this.dir(group.id), { recursive: true });
    await fs.writeFile(this.jsonPath(group.id), JSON.stringify(group, null, 2));
    return group;
  }

  async create(input) {
    const base = slugify(input?.name, 'object');
    let id = base;
    let counter = 2;
    while (await this.get(id)) id = `${base}-${counter++}`;
    return this.write(sanitizeGroup(input, id));
  }

  async update(id, input) {
    const previous = await this.get(id);
    if (!previous) return null;
    return this.write(sanitizeGroup(input, id, previous));
  }

  async saveLogo(id, buffer, ext) {
    const group = await this.get(id);
    if (!group) return null;
    if (group.logoExt && group.logoExt !== ext) await fs.unlink(this.logoPath(group)).catch(() => {});
    await fs.writeFile(path.join(this.dir(id), `logo.${ext}`), buffer);
    return this.write({ ...group, logoExt: ext, updatedAt: new Date().toISOString() });
  }

  async remove(id) {
    if (!(await this.get(id))) return false;
    await fs.rm(this.dir(id), { recursive: true, force: true });
    return true;
  }

  // ---------- Sub objects ----------

  // Returns { group, object } or null when the group does not exist (or is full).
  async addObject(groupId, input) {
    const group = await this.get(groupId);
    if (!group || group.objects.length >= MAX_OBJECTS_PER_GROUP) return null;
    const base = slugify(input?.name, 'object');
    let id = base;
    let counter = 2;
    while (group.objects.some((o) => o.id === id)) id = `${base}-${counter++}`;
    const object = sanitizeObject(input, id, group);
    const saved = await this.write({ ...group, objects: [...group.objects, object], updatedAt: object.updatedAt });
    return { group: saved, object };
  }

  async updateObject(groupId, objectId, input) {
    const group = await this.get(groupId);
    const previous = group?.objects.find((o) => o.id === objectId);
    if (!previous) return null;
    const object = sanitizeObject(input, objectId, group, previous);
    const objects = group.objects.map((o) => (o.id === objectId ? object : o));
    return { group: await this.write({ ...group, objects, updatedAt: object.updatedAt }), object };
  }

  async saveObjectModel(groupId, objectId, buffer) {
    const group = await this.get(groupId);
    const previous = group?.objects.find((o) => o.id === objectId);
    if (!previous || !isValidObjectId(objectId)) return null;
    await fs.mkdir(path.dirname(this.modelPath(groupId, objectId)), { recursive: true });
    await fs.writeFile(this.modelPath(groupId, objectId), buffer);
    const now = new Date().toISOString();
    const objects = group.objects.map((o) => (o.id === objectId ? { ...o, hasModel: true, updatedAt: now } : o));
    return this.write({ ...group, objects, updatedAt: now });
  }

  async removeObject(groupId, objectId) {
    const group = await this.get(groupId);
    if (!group?.objects.some((o) => o.id === objectId)) return null;
    await fs.unlink(this.modelPath(groupId, objectId)).catch(() => {});
    const objects = group.objects.filter((o) => o.id !== objectId);
    return this.write({ ...group, objects, updatedAt: new Date().toISOString() });
  }
}

export default new ObjectStore();
