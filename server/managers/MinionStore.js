import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeMinionFields } from '../../shared/minionConfig.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'data', 'minions');
const SEEDED = path.join(DIR, '.seeded');
const SEED_MODEL = path.join(__dirname, '..', 'seed', 'objects', 'creatures', 'rimuru_tempest.glb');
const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const slug = (name) => String(name || 'minion').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'minion';
class MinionStore {
  dir(id) { return path.join(DIR, id); }
  jsonPath(id) { return path.join(this.dir(id), 'minion.json'); }
  modelPath(id) { return path.join(this.dir(id), 'model.glb'); }
  async get(id) { if (!ID.test(id)) return null; try { return JSON.parse(await fs.readFile(this.jsonPath(id), 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
  async list() { await fs.mkdir(DIR, { recursive: true }); const entries = await fs.readdir(DIR, { withFileTypes: true }); const result = []; for (const e of entries) if (e.isDirectory() && ID.test(e.name)) { const m = await this.get(e.name); if (m) result.push(m); } return result.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))); }
  async write(m) { await fs.mkdir(this.dir(m.id), { recursive: true }); await fs.writeFile(this.jsonPath(m.id), JSON.stringify(m, null, 2)); return m; }
  async create(input) { const base = slug(input?.name); let id = base, n = 2; while (await this.get(id)) id = `${base}-${n++}`; const now = new Date().toISOString(); return this.write({ id, ...sanitizeMinionFields(input), hasModel: false, createdAt: now, updatedAt: now }); }
  async update(id, input) { const old = await this.get(id); return old && this.write({ ...old, ...sanitizeMinionFields(input, old), updatedAt: new Date().toISOString() }); }
  async saveModel(id, buffer) { const m = await this.get(id); if (!m) return null; await fs.writeFile(this.modelPath(id), buffer); return this.write({ ...m, hasModel: true, updatedAt: new Date().toISOString() }); }
  async remove(id) { if (!(await this.get(id))) return false; await fs.rm(this.dir(id), { recursive: true, force: true }); return true; }
  async getMany() { return new Map((await this.list()).filter((m) => m.hasModel).map((m) => [m.id, m])); }
  async seedDefaults() {
    await fs.mkdir(DIR, { recursive: true });
    try { await fs.access(SEEDED); return; } catch {}
    const model = await fs.readFile(SEED_MODEL).catch(() => null);
    if (model) {
      const minion = await this.create({ name: 'Default Minion', animations: { idle: 'lml_anim_idle', run: 'lml_anim_run', attack1: 'lml_anim_atk01', attack2: 'lml_anim_atk01', dead: 'lml_anim_die' }, params: { scale: 1, health: 120, damage: 8, speed: 5, attackRange: 3, attackCooldown: 1.5 } });
      await this.saveModel(minion.id, model);
    }
    await fs.writeFile(SEEDED, new Date().toISOString());
  }
}
export default new MinionStore();
