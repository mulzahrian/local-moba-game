// Monsters made in the Monster Generator: a GLB model, its animations and fighting stats.
// They are placed on maps in the Map Generator (with an aggro range) and fought in matches.

export const MONSTER_MOVEMENTS = ['run', 'flight']; // the "run" animation slot is a flight animation for flying monsters
export const DEFAULT_MOVEMENT = 'run';
export const MONSTER_ANIMATION_SLOTS = ['idle', 'run', 'attack1', 'attack2', 'dead'];
export const MAX_MONSTER_NAME = 40;
export const MAX_ANIMATION_NAME = 120;

export const MONSTER_PARAMS = {
  scale: { min: 0.3, max: 8, step: 0.1, value: 1.5 }, // multiplier of the standard character height
  health: { min: 10, max: 5000, step: 10, value: 200 },
  damage: { min: 1, max: 300, step: 1, value: 12 },
  speed: { min: 1, max: 30, step: 0.5, value: 7 },
  attackRange: { min: 1, max: 40, step: 1, value: 5 },
  attackCooldown: { min: 0.3, max: 10, step: 0.1, value: 1.5 },
  gold: { min: 0, max: 100000, step: 50, value: 300 } // money rewarded for the kill
};

// Chosen per placed monster in the Map Generator: monsters attack players that come this close to them.
export const AGGRO_RANGE = { min: 5, max: 120, step: 1, value: 25 };
export const LEASH_FACTOR = 2; // a monster gives up the chase when its target is this many aggro ranges from home

export const FLIGHT_HEIGHT = 3; // flying monsters hover this high
export const MONSTER_RADIUS_PER_SCALE = 1.2; // approximate body radius used for hit detection

export const MONSTER_TYPE_PREFIX = 'monster:'; // map objects of a monster have type "monster:<monster id>"
export const monsterObjectType = (monsterId) => `${MONSTER_TYPE_PREFIX}${monsterId}`;
export const isMonsterObject = (object) => object?.monster === true;
export const monsterIdOfType = (type) =>
  typeof type === 'string' && type.startsWith(MONSTER_TYPE_PREFIX) ? type.slice(MONSTER_TYPE_PREFIX.length) : null;

const clamp = (value, spec) => Math.min(Math.max(value, spec.min), spec.max);
export const clampAggroRange = (value) => {
  const parsed = Number(value);
  return clamp(Number.isFinite(parsed) ? parsed : AGGRO_RANGE.value, AGGRO_RANGE);
};

export function defaultMonster() {
  return {
    name: '',
    movement: DEFAULT_MOVEMENT,
    animations: Object.fromEntries(MONSTER_ANIMATION_SLOTS.map((slot) => [slot, null])),
    params: Object.fromEntries(Object.entries(MONSTER_PARAMS).map(([key, spec]) => [key, spec.value])),
    rewardSkillId: null
  };
}

const SKILL_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;

// Whitelists and clamps everything a client may send; unknown values fall back to `previous` / the defaults.
export function sanitizeMonsterFields(input, previous = null) {
  const defaults = defaultMonster();

  const animations = {};
  MONSTER_ANIMATION_SLOTS.forEach((slot) => {
    const value = input?.animations?.[slot];
    animations[slot] = value ? String(value).slice(0, MAX_ANIMATION_NAME) : null;
  });

  const params = {};
  Object.entries(MONSTER_PARAMS).forEach(([key, spec]) => {
    const parsed = Number(input?.params?.[key]);
    const fallback = previous?.params?.[key] ?? defaults.params[key];
    params[key] = clamp(Number.isFinite(parsed) ? parsed : fallback, spec);
  });

  return {
    name: String(input?.name ?? '').slice(0, MAX_MONSTER_NAME).trim() || previous?.name || 'Unnamed Monster',
    movement: MONSTER_MOVEMENTS.includes(input?.movement) ? input.movement : previous?.movement || DEFAULT_MOVEMENT,
    animations,
    params,
    rewardSkillId: SKILL_ID.test(input?.rewardSkillId) ? input.rewardSkillId : null
  };
}
