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

// Skills of the summon powers (necromancer, summoner, support) installed next to the ones above; they use the bundled slime model.
const SUMMON_SEED_ANIMATIONS = { idle: 'lml_anim_idle', run: 'lml_anim_run', attack1: 'lml_anim_atk01', dead: 'lml_anim_die' };
const seedUnit = (id, name, power, scale, params) => ({
  id,
  name,
  power,
  animations: SUMMON_SEED_ANIMATIONS,
  params: { scale, ...params }
});
const DEFAULT_SUMMON_SKILLS = [
  {
    name: 'Raise Dead',
    power: 'necromancer',
    effect: 'graveRise',
    mana: 60,
    cooldown: 30,
    price: 1200,
    params: { lifetime: 30 },
    units: [
      seedUnit('bone-fighter', 'Bone Fighter', 'melee', 0.8, { health: 90, amount: 9, speed: 10 }),
      seedUnit('bone-archer', 'Bone Archer', 'ranged', 0.7, { health: 60, amount: 8 })
    ]
  },
  {
    name: 'Summon Guardian',
    power: 'summoner',
    effect: 'summonCircle',
    mana: 70,
    cooldown: 45,
    price: 1500,
    params: {},
    units: [seedUnit('guardian', 'Guardian', 'melee', 1.4, { health: 300, amount: 16, range: 5, cooldown: 1.1 })]
  },
  {
    name: 'Spirit Healer',
    power: 'support',
    effect: 'blessingHalo',
    mana: 50,
    cooldown: 35,
    price: 1000,
    params: { lifetime: 40 },
    units: [seedUnit('healer', 'Spirit Healer', 'heal', 0.8, { health: 80, amount: 14 })]
  }
];
const SUMMON_SEEDED_FILE = path.join(SKILLS_DIR, '.seeded-summons');
const SEED_MODEL = path.join(__dirname, '..', 'seed', 'objects', 'creatures', 'rimuru_tempest.glb');

class SkillStore {
  dir(id) {
    return path.join(SKILLS_DIR, id);
  }

  unitModelPath(skillId, unitId) {
    return path.join(this.dir(skillId), 'units', `${unitId}.glb`);
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
    const skill = sanitizeSkill(input, id, previous);
    // units that were removed (or the whole skill changed to another power) lose their model files
    const kept = new Set((skill.units || []).map((unit) => unit.id));
    for (const unit of previous.units || []) {
      if (!kept.has(unit.id)) await fs.rm(this.unitModelPath(id, unit.id), { force: true });
    }
    return this.write(skill);
  }

  async saveUnitModel(id, unitId, buffer) {
    const skill = await this.get(id);
    const unit = skill?.units?.find((candidate) => candidate.id === unitId);
    if (!unit) return null;
    await fs.mkdir(path.join(this.dir(id), 'units'), { recursive: true });
    await fs.writeFile(this.unitModelPath(id, unitId), buffer);
    unit.hasModel = true;
    return this.write({ ...skill, updatedAt: new Date().toISOString() });
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

  // Same for the summon skills, which came later than the first set of defaults.
  async seedSummonDefaults() {
    await fs.mkdir(SKILLS_DIR, { recursive: true });
    try {
      await fs.access(SUMMON_SEEDED_FILE);
      return;
    } catch {
      // not seeded yet
    }
    const model = await fs.readFile(SEED_MODEL).catch(() => null);
    for (const input of DEFAULT_SUMMON_SKILLS) {
      const skill = await this.create(input);
      if (model) for (const unit of skill.units) await this.saveUnitModel(skill.id, unit.id, model);
    }
    await fs.writeFile(SUMMON_SEEDED_FILE, new Date().toISOString());
  }
}

export default new SkillStore();
