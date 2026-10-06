import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import objectStore, { sanitizeGroup, sanitizeObject } from './ObjectStore.js';

// The objects that used to be bundled with the client (towers, trees, ...) are installed into the
// object library once, so every object in the game is managed the same way: Map Generator > Objects.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.join(__dirname, '..', 'seed', 'objects');
const SEEDED_FILE = path.join(__dirname, '..', 'data', 'objects', '.seeded.json');

const customType = (groupId, objectId) => `custom:${groupId}:${objectId}`;

async function readSeeded() {
  try {
    return JSON.parse(await fs.readFile(SEEDED_FILE, 'utf8'));
  } catch {
    return [];
  }
}

// Installs every default group that was never installed before. Groups the user deleted stay deleted.
async function installGroups(manifest) {
  const seeded = new Set(await readSeeded());
  for (const def of manifest.groups) {
    if (seeded.has(def.id)) continue;
    if (!(await objectStore.get(def.id))) {
      let group = sanitizeGroup({ name: def.name, tower: def.tower }, def.id);
      const objects = [];
      for (const objectDef of def.objects) {
        const object = { ...sanitizeObject(objectDef, objectDef.id, group), hasModel: true };
        const modelPath = objectStore.modelPath(def.id, object.id);
        await fs.mkdir(path.dirname(modelPath), { recursive: true });
        await fs.copyFile(path.join(SEED_DIR, objectDef.model), modelPath);
        objects.push(object);
      }
      group = { ...group, objects };
      await objectStore.write(group);
    }
    seeded.add(def.id);
    await fs.writeFile(SEEDED_FILE, JSON.stringify([...seeded], null, 2));
  }
}

// Old object type -> { type, tower } for the default objects that still exist in the library.
async function buildLegacyTypeMap(manifest) {
  const map = new Map();
  for (const def of manifest.groups) {
    const group = await objectStore.get(def.id);
    if (!group) continue;
    for (const objectDef of def.objects) {
      if (!group.objects.some((o) => o.id === objectDef.id)) continue;
      (objectDef.legacyTypes || []).forEach((legacy) => {
        map.set(legacy, { type: customType(def.id, objectDef.id), tower: Boolean(group.tower) });
      });
    }
  }
  return map;
}

export async function installDefaultObjects(mapStore) {
  const manifest = JSON.parse(await fs.readFile(path.join(SEED_DIR, 'manifest.json'), 'utf8'));
  await fs.mkdir(path.dirname(SEEDED_FILE), { recursive: true });
  await installGroups(manifest);
  const migrated = await mapStore.migrateObjectTypes(await buildLegacyTypeMap(manifest));
  if (migrated.length) console.log(`[Objects] Migrated built-in objects in maps: ${migrated.join(', ')}`);
}
