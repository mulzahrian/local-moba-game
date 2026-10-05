import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAPS_DIR = path.join(__dirname, '..', 'data', 'maps');

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_OBJECTS = 5000;

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const str = (value, max = 120) => String(value ?? '').slice(0, max);

export function isValidMapId(id) {
  return typeof id === 'string' && ID_PATTERN.test(id);
}

export function slugify(name) {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'map';
}

// Only whitelisted fields are persisted, so clients cannot write arbitrary data to disk.
export function sanitizeMap(input, id, previous = null) {
  const now = new Date().toISOString();
  const rawObjects = Array.isArray(input?.objects) ? input.objects.slice(0, MAX_OBJECTS) : [];

  return {
    id,
    name: str(input?.name, 60).trim() || 'Untitled Map',
    version: 1,
    size: Math.min(Math.max(num(input?.size, 500), 50), 2000),
    groundColor: /^#[0-9a-fA-F]{6}$/.test(input?.groundColor) ? input.groundColor : '#1a3a1a',
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    objects: rawObjects.map((o, index) => ({
      uid: str(o?.uid, 40) || `obj-${index}`,
      type: str(o?.type, 80),
      position: { x: num(o?.position?.x), y: num(o?.position?.y), z: num(o?.position?.z) },
      rotationY: num(o?.rotationY),
      scale: Math.min(Math.max(num(o?.scale, 1), 0.01), 1000),
      animation: o?.animation ? str(o.animation, 120) : null
    })).filter((o) => o.type)
  };
}

class MapStore {
  async ensureDir() {
    await fs.mkdir(MAPS_DIR, { recursive: true });
  }

  filePath(id) {
    return path.join(MAPS_DIR, `${id}.json`);
  }

  async list() {
    await this.ensureDir();
    const files = (await fs.readdir(MAPS_DIR)).filter((f) => f.endsWith('.json'));
    const maps = [];
    for (const file of files) {
      try {
        const map = JSON.parse(await fs.readFile(path.join(MAPS_DIR, file), 'utf8'));
        maps.push({
          id: map.id,
          name: map.name,
          size: map.size,
          objectCount: Array.isArray(map.objects) ? map.objects.length : 0,
          createdAt: map.createdAt,
          updatedAt: map.updatedAt
        });
      } catch (error) {
        console.error(`[MapStore] Skipping unreadable map file ${file}:`, error.message);
      }
    }
    return maps.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  async get(id) {
    if (!isValidMapId(id)) return null;
    try {
      return JSON.parse(await fs.readFile(this.filePath(id), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async create(input) {
    await this.ensureDir();
    const base = slugify(input?.name);
    let id = base;
    let counter = 2;
    while (await this.get(id)) {
      id = `${base}-${counter++}`;
    }
    const map = sanitizeMap(input, id);
    await fs.writeFile(this.filePath(id), JSON.stringify(map, null, 2));
    return map;
  }

  async update(id, input) {
    const previous = await this.get(id);
    if (!previous) return null;
    const map = sanitizeMap(input, id, previous);
    await fs.writeFile(this.filePath(id), JSON.stringify(map, null, 2));
    return map;
  }

  async remove(id) {
    if (!isValidMapId(id)) return false;
    try {
      await fs.unlink(this.filePath(id));
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  }
}

export default new MapStore();
