import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeMonsterFields } from '../../shared/monsterConfig.js';

// Monster library: every monster made in the Monster Generator lives in server/data/monsters/<id>:
//   monster.json + model.glb
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONSTERS_DIR = path.join(__dirname, '..', 'data', 'monsters');
const SEEDED_FILE = path.join(MONSTERS_DIR, '.seeded');
const SEED_MODEL = path.join(__dirname, '..', 'seed', 'objects', 'creatures', 'rimuru_tempest.glb');
const MODEL_FILE = 'model.glb';

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export const isValidMonsterId = (id) => typeof id === 'string' && ID_PATTERN.test(id);

function slugify(name) {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'monster';
}

export function sanitizeMonster(input, id, previous = null) {
  const now = new Date().toISOString();
  return {
    id,
    ...sanitizeMonsterFields(input, previous),
    hasModel: previous?.hasModel || false,
    createdAt: previous?.createdAt || now,
    updatedAt: now
  };
}

// Monsters every installation starts with (they use the bundled slime model).
const DEFAULT_MONSTERS = [
  {
    name: 'Slime Warden',
    movement: 'run',
    animations: {
      idle: 'lml_anim_idle',
      run: 'lml_anim_run',
      attack1: 'lml_anim_atk01',
      attack2: 'lml_anim_skl01',
      dead: 'lml_anim_die'
    },
    params: { scale: 2, health: 220, damage: 10, speed: 7, attackRange: 5, attackCooldown: 1.4, gold: 300 },
    rewardSkillId: 'fireball'
  }
];

class MonsterStore {
  dir(id) {
    return path.join(MONSTERS_DIR, id);
  }

  jsonPath(id) {
    return path.join(this.dir(id), 'monster.json');
  }

  modelPath(id) {
    return path.join(this.dir(id), MODEL_FILE);
  }

  async list() {
    await fs.mkdir(MONSTERS_DIR, { recursive: true });
    const entries = await fs.readdir(MONSTERS_DIR, { withFileTypes: true });
    const monsters = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !isValidMonsterId(entry.name)) continue;
      const monster = await this.get(entry.name).catch(() => null);
      if (monster) monsters.push(monster);
    }
    return monsters.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  async get(id) {
    if (!isValidMonsterId(id)) return null;
    try {
      return JSON.parse(await fs.readFile(this.jsonPath(id), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async write(monster) {
    await fs.mkdir(this.dir(monster.id), { recursive: true });
    await fs.writeFile(this.jsonPath(monster.id), JSON.stringify(monster, null, 2));
    return monster;
  }

  async create(input) {
    const base = slugify(input?.name);
    let id = base;
    let counter = 2;
    while (await this.get(id)) id = `${base}-${counter++}`;
    return this.write(sanitizeMonster(input, id));
  }

  async update(id, input) {
    const previous = await this.get(id);
    if (!previous) return null;
    return this.write(sanitizeMonster(input, id, previous));
  }

  async saveModel(id, buffer) {
    const monster = await this.get(id);
    if (!monster) return null;
    await fs.writeFile(this.modelPath(id), buffer);
    return this.write({ ...monster, hasModel: true, updatedAt: new Date().toISOString() });
  }

  async remove(id) {
    if (!(await this.get(id))) return false;
    await fs.rm(this.dir(id), { recursive: true, force: true });
    return true;
  }

  // Definitions (by id) of the monsters a map uses; unknown ids are left out.
  async getMany(ids) {
    const defs = new Map();
    for (const id of new Set(ids)) {
      const monster = await this.get(id).catch(() => null);
      if (monster) defs.set(id, monster);
    }
    return defs;
  }

  // Installs the default monsters once; monsters the user deletes afterwards stay deleted.
  async seedDefaults() {
    await fs.mkdir(MONSTERS_DIR, { recursive: true });
    try {
      await fs.access(SEEDED_FILE);
      return;
    } catch {
      // not seeded yet
    }
    const model = await fs.readFile(SEED_MODEL).catch(() => null);
    for (const input of DEFAULT_MONSTERS) {
      const monster = await this.create(input);
      if (model) await this.saveModel(monster.id, model);
    }
    await fs.writeFile(SEEDED_FILE, new Date().toISOString());
  }
}

export default new MonsterStore();
