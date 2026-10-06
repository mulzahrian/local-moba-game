import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { defaultSkill, sanitizeSkillFields } from '../../shared/skillConfig.js';

// Skill library: every skill made in the Skill Generator lives in server/data/skills/<id>:
//   skill.json + icon.<ext> (optional).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(__dirname, '..', 'data', 'skills');
const SEEDED_FILE = path.join(SKILLS_DIR, '.seeded');

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export const isValidSkillId = (id) => typeof id === 'string' && ID_PATTERN.test(id);

function slugify(name) {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'skill';
}

export function sanitizeSkill(input, id, previous = null) {
  const now = new Date().toISOString();
  return {
    id,
    ...sanitizeSkillFields(input, previous),
    iconExt: previous?.iconExt || null,
    createdAt: previous?.createdAt || now,
    updatedAt: now
  };
}

// Skills every installation starts with, one per power.
const DEFAULT_SKILLS = [
  { name: 'Shadow Cloak', power: 'vanish', effect: 'smokeCloak', mana: 30, cooldown: 20, price: 600, params: { duration: 5 } },
  { name: 'Healing Light', power: 'heal', effect: 'lifeBloom', mana: 40, cooldown: 12, price: 500, params: { amount: 60, radius: 10 } },
  { name: 'Binding Chains', power: 'control', effect: 'chainBind', mana: 40, cooldown: 14, price: 800, params: { mode: 'stun', range: 14, duration: 2, damage: 5 } },
  { name: 'Fireball', power: 'fire', effect: 'fireball', mana: 25, cooldown: 6, price: 400, params: { shape: 'line', range: 28, width: 3, damage: 35 } }
];

class SkillStore {
  dir(id) {
    return path.join(SKILLS_DIR, id);
  }

  jsonPath(id) {
    return path.join(this.dir(id), 'skill.json');
  }

  iconPath(skill) {
    return skill?.iconExt ? path.join(this.dir(skill.id), `icon.${skill.iconExt}`) : null;
  }

  async list() {
    await fs.mkdir(SKILLS_DIR, { recursive: true });
    const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
    const skills = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !isValidSkillId(entry.name)) continue;
      const skill = await this.get(entry.name).catch(() => null);
      if (skill) skills.push(skill);
    }
    return skills.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  async get(id) {
    if (!isValidSkillId(id)) return null;
    try {
      return JSON.parse(await fs.readFile(this.jsonPath(id), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async write(skill) {
    await fs.mkdir(this.dir(skill.id), { recursive: true });
    await fs.writeFile(this.jsonPath(skill.id), JSON.stringify(skill, null, 2));
    return skill;
  }

  async create(input) {
    const base = slugify(input?.name);
    let id = base;
    let counter = 2;
    while (await this.get(id)) id = `${base}-${counter++}`;
    return this.write(sanitizeSkill(input, id));
  }

  async update(id, input) {
    const previous = await this.get(id);
    if (!previous) return null;
    return this.write(sanitizeSkill(input, id, previous));
  }

  async saveIcon(id, buffer, ext) {
    const skill = await this.get(id);
    if (!skill) return null;
    if (skill.iconExt && skill.iconExt !== ext) await fs.unlink(this.iconPath(skill)).catch(() => {});
    await fs.writeFile(path.join(this.dir(id), `icon.${ext}`), buffer);
    return this.write({ ...skill, iconExt: ext, updatedAt: new Date().toISOString() });
  }

  async remove(id) {
    if (!(await this.get(id))) return false;
    await fs.rm(this.dir(id), { recursive: true, force: true });
    return true;
  }

  // Installs the default skills once; skills the user deletes afterwards stay deleted.
  async seedDefaults() {
    await fs.mkdir(SKILLS_DIR, { recursive: true });
    try {
      await fs.access(SEEDED_FILE);
      return;
    } catch {
      // not seeded yet
    }
    for (const skill of DEFAULT_SKILLS) {
      await this.create({ ...skill, params: { ...defaultSkill(skill.power).params, ...skill.params } });
    }
    await fs.writeFile(SEEDED_FILE, new Date().toISOString());
  }
}

export default new SkillStore();
