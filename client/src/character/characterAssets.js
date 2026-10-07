import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { BUILTIN_CHARACTER_ID, BUILTIN_CHARACTER_NAME, DEFAULT_GENDER, DEFAULT_ROLE, getRoleConfig } from '../../../shared/characterConfig.js';
import builtinModelUrl from '../model/rimuru_tempest.glb?url';
import { characterApi } from './characterApi.js';

export const CHARACTER_HEIGHT = 3.6; // world units every custom model is auto-fitted to (before the size multiplier)

const BUILTIN_CHARACTER = {
  id: BUILTIN_CHARACTER_ID,
  name: BUILTIN_CHARACTER_NAME,
  role: DEFAULT_ROLE,
  builtin: true,
  hasModel: true,
  gender: DEFAULT_GENDER,
  attackTypes: { attack1: 'punch', attack2: 'punch' },
  modelUrl: builtinModelUrl,
  imageUrl: null,
  scale: 1,
  fixedScale: 6 * 0.25, // the bundled model was authored for this exact scale
  animations: {
    idle: 'lml_anim_idle',
    run: 'lml_anim_run',
    attack1: 'lml_anim_atk01',
    attack2: 'lml_anim_atk01',
    skill1: 'lml_anim_skl01',
    skill2: 'lml_anim_skl02',
    skill3: 'lml_anim_skl01',
    hit: 'lml_anim_hit01',
    knockback: 'lml_anim_hit02',
    pulled: 'lml_anim_back',
    emote: 'lml_anim_show'
  },
  effects: Object.fromEntries(
    Object.entries(getRoleConfig(DEFAULT_ROLE).skills).map(([slot, skill]) => [slot, skill.effect])
  )
};

export function isBuiltinCharacter(id) {
  return id === BUILTIN_CHARACTER_ID;
}

export async function listCharacters() {
  return [BUILTIN_CHARACTER, ...(await characterApi.list())];
}

const definitionCache = new Map();

export function getCharacterDefinition(id) {
  if (isBuiltinCharacter(id)) return Promise.resolve(BUILTIN_CHARACTER);
  if (!definitionCache.has(id)) {
    const request = characterApi.get(id).catch((error) => {
      definitionCache.delete(id);
      throw error;
    });
    definitionCache.set(id, request);
  }
  return definitionCache.get(id);
}

export function invalidateCharacter(id) {
  definitionCache.delete(id);
}

const modelCache = new Map();
const loader = new GLTFLoader();

export function loadGltf(url) {
  if (!modelCache.has(url)) {
    modelCache.set(
      url,
      new Promise((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
      }).catch((error) => {
        modelCache.delete(url);
        throw error;
      })
    );
  }
  return modelCache.get(url);
}

/**
 * Clones the loaded GLB for one in-game / preview character. Custom models are auto-fitted to
 * CHARACTER_HEIGHT with their feet on the ground; the character's `scale` multiplier is applied on top.
 */
export function instantiateCharacter(gltf, def) {
  const model = SkeletonUtils.clone(gltf.scene);

  let scale;
  let yOffset = 0;
  if (def.fixedScale) {
    scale = def.fixedScale * (def.scale || 1);
  } else {
    gltf.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const height = box.getSize(new THREE.Vector3()).y || 1;
    scale = (CHARACTER_HEIGHT / height) * (def.scale || 1);
    yOffset = -box.min.y * scale;
  }
  model.scale.setScalar(scale);
  model.position.y = yOffset;

  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      // Own materials per instance so highlighting / fading doesn't leak between characters
      if (Array.isArray(child.material)) child.material = child.material.map((m) => m.clone());
      else if (child.material) child.material = child.material.clone();
      child.frustumCulled = false; // skinned bounds are unreliable after rescaling
    }
  });

  return { model, scale };
}

export function findClip(clips, name) {
  return name ? THREE.AnimationClip.findByName(clips, name) : null;
}

// Sets the opacity of every material of a model (used by fade / vanish effects).
export function setModelOpacity(model, opacity) {
  model.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (material.userData.baseTransparent === undefined) {
        material.userData.baseTransparent = material.transparent;
        material.userData.baseOpacity = material.opacity;
      }
      material.transparent = opacity < 0.999 || material.userData.baseTransparent;
      material.opacity = material.userData.baseOpacity * opacity;
    });
  });
}

const GUESS_PATTERNS = [
  ['idle', /idle|stand|wait|breath/i],
  ['run', /run|walk|move|jog/i],
  ['attack1', /attack|atk|slash|punch|strike/i],
  ['attack2', /attack|atk|slash|punch|strike/i],
  ['skill1', /skill|skl|cast|spell|magic|special/i],
  ['skill2', /skill|skl|cast|spell|magic|special/i],
  ['skill3', /skill|skl|cast|spell|magic|special/i],
  ['hit', /hit|hurt|damage|dmg/i],
  ['knockback', /knock|fly|throw|launch|down|fall/i],
  ['pulled', /pull|drag|back/i],
  ['emote', /emote|dance|wave|taunt|show|greet|joy|laugh/i],
  ['jump', /jump|leap|hop/i]
];

// Suggests a clip for each animation slot from the clip names of a freshly uploaded model.
export function guessAnimations(clipNames) {
  const used = new Set();
  const result = {};
  GUESS_PATTERNS.forEach(([slot, pattern]) => {
    const name = clipNames.find((n) => pattern.test(n) && !used.has(n));
    result[slot] = name || null;
    if (name) used.add(name);
  });
  return result;
}

const ACTOR_PATTERNS = {
  idle: /idle|stand|wait|breath|hover/i,
  run: /run|walk|move|jog|fly|flight|glide/i,
  attack1: /attack|atk|slash|punch|strike|bite|claw/i,
  attack2: /attack|atk|slash|punch|strike|bite|claw|skill|skl|cast/i,
  dead: /die|death|dead|dying|defeat/i
};

// Suggests a clip for each of `slots` (idle, run, attack1, attack2, dead) of a monster / unit model.
export function guessActorAnimations(clipNames, slots) {
  const used = new Set();
  const result = {};
  slots.forEach((slot) => {
    const name = clipNames.find((n) => ACTOR_PATTERNS[slot]?.test(n) && !used.has(n));
    result[slot] = name || null;
    if (name) used.add(name);
  });
  return result;
}
