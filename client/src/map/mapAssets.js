import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import registry from '../config/mapObjects.json';

const DEFAULT_FIT_SIZE = 10;

// Every .glb under src/model is bundled by Vite; the registry refers to them by relative path.
const modelUrls = import.meta.glob('../model/**/*.glb', { eager: true, as: 'url' });
const urlByPath = {};
Object.entries(modelUrls).forEach(([key, url]) => {
  urlByPath[key.replace('../model/', '')] = url;
});

const categories = registry.categories || [];
const categoryIds = new Set(categories.map((c) => c.id));

function buildDefinitions() {
  const definitions = new Map();
  (registry.objects || []).forEach((def) => {
    definitions.set(def.id, { ...def, category: def.category || 'props' });
  });

  // GLBs dropped into src/model/map/<category>/ show up automatically even without a registry entry.
  const registeredModels = new Set((registry.objects || []).map((o) => o.model));
  Object.keys(urlByPath).forEach((path) => {
    if (!path.startsWith('map/') || registeredModels.has(path)) return;
    const relative = path.slice('map/'.length);
    const folder = relative.includes('/') ? relative.split('/')[0] : 'props';
    const id = relative.replace(/\.glb$/i, '');
    if (definitions.has(id)) return;
    const fileName = relative.split('/').pop().replace(/\.glb$/i, '');
    const label = fileName.replace(/[_-]+/g, ' ');
    definitions.set(id, {
      id,
      category: categoryIds.has(folder) ? folder : 'props',
      name: { en: label, id: label },
      model: path,
      auto: true
    });
  });
  return definitions;
}

const definitions = buildDefinitions();

export function getCategories() {
  return categories;
}

export function getObjectDefinitions() {
  return Array.from(definitions.values());
}

export function getObjectDefinition(id) {
  return definitions.get(id) || null;
}

export function localizedName(def, language) {
  if (!def) return '';
  if (typeof def.name === 'string') return def.name;
  return def.name?.[language] || def.name?.en || def.id;
}

const modelCache = new Map();
const loader = new GLTFLoader();

function loadModel(url) {
  if (!modelCache.has(url)) {
    modelCache.set(
      url,
      new Promise((resolve, reject) => {
        loader.load(
          url,
          (gltf) => {
            const box = new THREE.Box3().setFromObject(gltf.scene);
            const size = box.getSize(new THREE.Vector3());
            resolve({ gltf, box, maxSide: Math.max(size.x, size.y, size.z) || 1 });
          },
          undefined,
          reject
        );
      })
    );
  }
  return modelCache.get(url);
}

// Returns the names of the animation clips contained in the object's model.
export async function getAnimationNames(def) {
  const url = def && urlByPath[def.model];
  if (!url) return [];
  try {
    const { gltf } = await loadModel(url);
    return gltf.animations.map((clip) => clip.name);
  } catch {
    return [];
  }
}

function createPlaceholder(def) {
  const size = def?.size || DEFAULT_FIT_SIZE;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size * 0.6, size, size * 0.6),
    new THREE.MeshStandardMaterial({ color: 0xc0392b, transparent: true, opacity: 0.75 })
  );
  mesh.position.y = size / 2;
  mesh.castShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

/**
 * A placed map object: `root` carries position / rotation / user scale, `model` holds
 * the (auto-fitted) GLB. Animation is optional and driven by `update(delta)`.
 */
export class MapObject {
  constructor(data) {
    this.data = data;
    this.def = getObjectDefinition(data.type);
    this.root = new THREE.Group();
    this.root.userData.uid = data.uid;
    this.mixer = null;
    this.action = null;
    this.clips = [];
    this.disposed = false;
    this.ready = this.load();
    this.applyTransform(data);
  }

  async load() {
    const url = this.def && urlByPath[this.def.model];
    let model;
    if (!url) {
      model = createPlaceholder(this.def);
    } else {
      try {
        const { gltf, box, maxSide } = await loadModel(url);
        if (this.disposed) return;
        model = SkeletonUtils.clone(gltf.scene);
        const fit = this.def.scale ?? (this.def.size || DEFAULT_FIT_SIZE) / maxSide;
        model.scale.setScalar(fit);
        model.position.y = -box.min.y * fit + (this.def.yOffset || 0);
        model.rotation.y = THREE.MathUtils.degToRad(this.def.rotationY || 0);
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        this.clips = gltf.animations;
      } catch (error) {
        console.error(`[MapObject] Failed to load "${this.def.model}":`, error);
        model = createPlaceholder(this.def);
      }
    }
    if (this.disposed) return;
    this.model = model;
    this.root.add(model);
    if (this.clips.length) {
      this.mixer = new THREE.AnimationMixer(model);
      this.setAnimation(this.data.animation ?? this.def?.defaultAnimation ?? null);
    }
  }

  applyTransform(data) {
    this.data = data;
    this.root.position.set(data.position.x, data.position.y || 0, data.position.z);
    this.root.rotation.y = THREE.MathUtils.degToRad(data.rotationY || 0);
    this.root.scale.setScalar(data.scale || 1);
  }

  setAnimation(name) {
    if (!this.mixer) return;
    if (this.action) {
      this.action.stop();
      this.action = null;
    }
    if (!name) return;
    const clip = THREE.AnimationClip.findByName(this.clips, name);
    if (!clip) return;
    this.action = this.mixer.clipAction(clip);
    this.action.reset().play();
  }

  update(delta) {
    if (this.mixer) this.mixer.update(delta);
  }

  dispose() {
    this.disposed = true;
    if (this.mixer) this.mixer.stopAllAction();
    this.root.parent?.remove(this.root);
  }
}

export function createUid() {
  return `o-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
