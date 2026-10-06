import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { objectApi } from './objectApi.js';
import { monsterApi } from '../monster/monsterApi.js';
import { FLIGHT_HEIGHT, monsterObjectType } from '../../../shared/monsterConfig.js';
import { CHARACTER_HEIGHT } from '../character/characterAssets.js';

const DEFAULT_FIT_SIZE = 10;

// ---------------------------------------------------------------------------
// Object library (Map Generator > Objects): main objects become categories, their sub objects become
// placeable definitions. Every object in the game comes from here; it is loaded from the server and
// shared by the editor and the game. The monsters of the Monster Generator are added as one more
// category ("monsters"); placed monsters are fought in the match instead of being plain decoration.
// ---------------------------------------------------------------------------

const CUSTOM_PREFIX = 'custom:';
export const MONSTER_CATEGORY = 'monsters';
let customCategories = [];
let customDefinitions = new Map();
let libraryPromise = null;

function applyLibrary(groups, monsters = []) {
  customCategories = [];
  customDefinitions = new Map();
  groups.forEach((group) => {
    const category = `${CUSTOM_PREFIX}${group.id}`;
    customCategories.push({
      id: category,
      custom: true,
      logoUrl: group.logoUrl,
      name: { en: group.name, id: group.name }
    });
    group.objects
      .filter((object) => object.hasModel)
      .forEach((object) => {
        const id = `${category}:${object.id}`;
        customDefinitions.set(id, {
          id,
          category,
          name: object.name,
          modelUrl: object.modelUrl,
          size: object.size,
          yOffset: object.yOffset,
          rotationY: object.rotationY,
          defaultAnimation: object.defaultAnimation || '',
          tower: group.tower
        });
      });
  });

  const placeable = monsters.filter((monster) => monster.hasModel);
  if (placeable.length) {
    customCategories.push({ id: MONSTER_CATEGORY, custom: true, logoUrl: null, name: { en: 'Monsters', id: 'Monster' } });
    placeable.forEach((monster) => {
      const id = monsterObjectType(monster.id);
      customDefinitions.set(id, {
        id,
        category: MONSTER_CATEGORY,
        name: monster.name,
        modelUrl: monster.modelUrl,
        size: CHARACTER_HEIGHT * monster.params.scale, // monsters are fitted by height, like characters
        fitHeight: true,
        yOffset: monster.movement === 'flight' ? FLIGHT_HEIGHT : 0,
        rotationY: 0,
        defaultAnimation: monster.animations?.idle || '',
        monster: true
      });
    });
  }
}

function fetchLibrary() {
  return Promise.all([objectApi.list(), monsterApi.list().catch(() => [])])
    .then(([groups, monsters]) => applyLibrary(groups, monsters))
    .catch((error) => {
      console.error('[MapAssets] Could not load the object library:', error);
      applyLibrary([]);
    });
}

// Loads the library once; later calls reuse the result until it is refreshed / invalidated.
export function ensureObjectLibrary() {
  if (!libraryPromise) libraryPromise = fetchLibrary();
  return libraryPromise;
}

export function refreshObjectLibrary() {
  libraryPromise = fetchLibrary();
  return libraryPromise;
}

export function invalidateObjectLibrary() {
  libraryPromise = null;
}

export function getCategories() {
  return customCategories;
}

export function getObjectDefinitions() {
  return [...customDefinitions.values()];
}

export function getObjectDefinition(id) {
  return customDefinitions.get(id) || null;
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
            resolve({ gltf, box, maxSide: Math.max(size.x, size.y, size.z) || 1, height: size.y || 1 });
          },
          undefined,
          reject
        );
      })
    );
  }
  return modelCache.get(url);
}

const modelUrlOf = (def) => def?.modelUrl || null;

// Returns the names of the animation clips contained in a model.
export async function getModelAnimationNames(url) {
  if (!url) return [];
  try {
    const { gltf } = await loadModel(url);
    return gltf.animations.map((clip) => clip.name);
  } catch {
    return [];
  }
}

// Returns the names of the animation clips contained in the object's model.
export const getAnimationNames = (def) => getModelAnimationNames(modelUrlOf(def));

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
    this.def = getObjectDefinition(data.type); // re-resolved in load(), once the library is loaded
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
    await ensureObjectLibrary(); // objects are only known once the library is loaded
    if (this.disposed) return;
    this.def = getObjectDefinition(this.data.type);
    const url = modelUrlOf(this.def);
    let model;
    if (!url) {
      model = createPlaceholder(this.def);
    } else {
      try {
        const { gltf, box, maxSide, height } = await loadModel(url);
        if (this.disposed) return;
        model = SkeletonUtils.clone(gltf.scene);
        const fit = (this.def.size || DEFAULT_FIT_SIZE) / (this.def.fitHeight ? height : maxSide);
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
        console.error(`[MapObject] Failed to load "${this.def.id}":`, error);
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
    this.root.rotation.set(
      THREE.MathUtils.degToRad(data.rotationX || 0),
      THREE.MathUtils.degToRad(data.rotationY || 0),
      THREE.MathUtils.degToRad(data.rotationZ || 0),
      'YXZ' // yaw first, so rotationY keeps meaning "heading" when tilted
    );
    const scale = data.scale || 1;
    this.root.scale.set(scale * (data.scaleX || 1), scale * (data.scaleY || 1), scale * (data.scaleZ || 1));
  }

  setTimeScale(value) {
    if (this.mixer) this.mixer.timeScale = value;
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
