import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ANIMATION_SLOTS,
  DEFAULT_ROLE,
  EFFECT_IDS,
  MAX_ANIMATION_NAME,
  SKILL_SLOTS,
  getRoleConfig,
  isValidRole
} from '../../shared/characterConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHARACTERS_DIR = path.join(__dirname, '..', 'data', 'characters');

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MODEL_FILE = 'model.glb';
const IMAGE_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif'
};

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const str = (value, max = 120) => String(value ?? '').slice(0, max);

export const MAX_MODEL_BYTES = 200 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function isValidCharacterId(id) {
  return typeof id === 'string' && ID_PATTERN.test(id) && !id.startsWith('builtin-');
}

function slugify(name) {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'hero';
}

export function imageTypeOf(buffer) {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buffer.toString('ascii', 0, 3) === 'GIF') return 'gif';
  return null;
}

export const isGlb = (buffer) => buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'glTF';

export function imageContentType(ext) {
  return IMAGE_TYPES[ext] || 'application/octet-stream';
}

// Only whitelisted fields are persisted, so clients cannot write arbitrary data to disk.
export function sanitizeCharacter(input, id, previous = null) {
  const now = new Date().toISOString();
  const animations = {};
  ANIMATION_SLOTS.forEach((slot) => {
    const value = input?.animations?.[slot];
    animations[slot] = value ? str(value, MAX_ANIMATION_NAME) : null;
  });

  const role = isValidRole(input?.role) ? input.role : previous?.role || DEFAULT_ROLE;
  const roleSkills = getRoleConfig(role).skills;
  const effects = {};
  SKILL_SLOTS.forEach((slot) => {
    const value = input?.effects?.[slot];
    effects[slot] = EFFECT_IDS.includes(value) ? value : roleSkills[slot].effect;
  });

  return {
    id,
    name: str(input?.name, 40).trim() || 'Unnamed Hero',
    role,
    scale: Math.min(Math.max(num(input?.scale, 1), 0.1), 10),
    animations,
    effects,
    hasModel: previous?.hasModel || false,
    imageExt: previous?.imageExt || null,
    createdAt: previous?.createdAt || now,
    updatedAt: now
  };
}

class CharacterStore {
  dir(id) {
    return path.join(CHARACTERS_DIR, id);
  }

  jsonPath(id) {
    return path.join(this.dir(id), 'character.json');
  }

  modelPath(id) {
    return path.join(this.dir(id), MODEL_FILE);
  }

  imagePath(character) {
    return character?.imageExt ? path.join(this.dir(character.id), `profile.${character.imageExt}`) : null;
  }

  async list() {
    await fs.mkdir(CHARACTERS_DIR, { recursive: true });
    const entries = await fs.readdir(CHARACTERS_DIR, { withFileTypes: true });
    const characters = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !isValidCharacterId(entry.name)) continue;
      const character = await this.get(entry.name).catch(() => null);
      if (character) characters.push(character);
    }
    return characters.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  async get(id) {
    if (!isValidCharacterId(id)) return null;
    try {
      return JSON.parse(await fs.readFile(this.jsonPath(id), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async write(character) {
    await fs.mkdir(this.dir(character.id), { recursive: true });
    await fs.writeFile(this.jsonPath(character.id), JSON.stringify(character, null, 2));
    return character;
  }

  async create(input) {
    const base = slugify(input?.name);
    let id = base;
    let counter = 2;
    while (await this.get(id)) {
      id = `${base}-${counter++}`;
    }
    return this.write(sanitizeCharacter(input, id));
  }

  async update(id, input) {
    const previous = await this.get(id);
    if (!previous) return null;
    return this.write(sanitizeCharacter(input, id, previous));
  }

  async saveModel(id, buffer) {
    const character = await this.get(id);
    if (!character) return null;
    await fs.writeFile(this.modelPath(id), buffer);
    return this.write({ ...character, hasModel: true, updatedAt: new Date().toISOString() });
  }

  async saveImage(id, buffer, ext) {
    const character = await this.get(id);
    if (!character) return null;
    if (character.imageExt && character.imageExt !== ext) {
      await fs.unlink(this.imagePath(character)).catch(() => {});
    }
    await fs.writeFile(path.join(this.dir(id), `profile.${ext}`), buffer);
    return this.write({ ...character, imageExt: ext, updatedAt: new Date().toISOString() });
  }

  async remove(id) {
    if (!isValidCharacterId(id) || !(await this.get(id))) return false;
    await fs.rm(this.dir(id), { recursive: true, force: true });
    return true;
  }
}

export default new CharacterStore();
