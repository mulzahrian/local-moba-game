// Skills made in the Skill Generator: powers, their settings and the action definition used in combat.
// Shared by the client (generator, HUD, effects) and the server (validation, combat).

export const SKILL_POWERS = ['vanish', 'heal', 'control', 'fire'];
export const DEFAULT_POWER = 'fire';

// Visual effect styles per power (drawn by client/src/skill/skillEffects.js, separate from the character effects).
export const SKILL_EFFECTS = {
  vanish: ['smokeCloak', 'ghostVeil'],
  heal: ['lifeBloom', 'lightPillars'],
  control: ['chainBind', 'mindPulse'],
  fire: ['fireball', 'flameWave']
};

export const SKILL_ENUMS = {
  control: { mode: ['stun', 'pull', 'knockback'] },
  fire: { shape: ['line', 'cone', 'circle'] }
};

// Numeric settings: { min, max, step, value (default) }.
export const COMMON_PARAMS = {
  mana: { min: 0, max: 200, step: 5, value: 20 },
  cooldown: { min: 0.5, max: 120, step: 0.5, value: 8 },
  price: { min: 0, max: 100000, step: 50, value: 500 }
};

export const POWER_PARAMS = {
  vanish: {
    duration: { min: 1, max: 20, step: 0.5, value: 5 }
  },
  heal: {
    amount: { min: 5, max: 300, step: 5, value: 40 },
    radius: { min: 0, max: 30, step: 1, value: 10 } // 0 = only the caster is healed
  },
  control: {
    range: { min: 3, max: 30, step: 1, value: 14 },
    duration: { min: 0.5, max: 6, step: 0.5, value: 2 }, // stun time
    distance: { min: 2, max: 30, step: 1, value: 10 }, // knockback distance
    damage: { min: 0, max: 100, step: 5, value: 0 }
  },
  fire: {
    range: { min: 5, max: 50, step: 1, value: 24 },
    width: { min: 1, max: 12, step: 1, value: 3 }, // line shape
    arc: { min: 20, max: 180, step: 10, value: 60 }, // cone shape (degrees)
    damage: { min: 5, max: 200, step: 5, value: 30 }
  }
};

export const SKILL_ID_PREFIX = 'skill:';
export const MAX_EQUIPPED_SKILLS = 4;
export const MAX_SKILL_NAME = 40;

export const isValidPower = (power) => SKILL_POWERS.includes(power);
export const skillSlot = (skillId) => `${SKILL_ID_PREFIX}${skillId}`;
export const isSkillSlot = (slot) => typeof slot === 'string' && slot.startsWith(SKILL_ID_PREFIX);
export const skillIdOfSlot = (slot) => slot.slice(SKILL_ID_PREFIX.length);

const clamp = (value, spec) => Math.min(Math.max(value, spec.min), spec.max);
const number = (value, spec, fallback) => {
  const parsed = Number(value);
  return clamp(Number.isFinite(parsed) ? parsed : fallback ?? spec.value, spec);
};

export function defaultParams(power) {
  const params = Object.fromEntries(Object.entries(POWER_PARAMS[power] || {}).map(([key, spec]) => [key, spec.value]));
  Object.entries(SKILL_ENUMS[power] || {}).forEach(([key, values]) => {
    params[key] = values[0];
  });
  return params;
}

export function defaultSkill(power = DEFAULT_POWER) {
  return {
    name: '',
    power,
    effect: SKILL_EFFECTS[power][0],
    mana: COMMON_PARAMS.mana.value,
    cooldown: COMMON_PARAMS.cooldown.value,
    price: COMMON_PARAMS.price.value,
    params: defaultParams(power)
  };
}

// Whitelists and clamps everything a client may send; unknown values fall back to `previous` / the defaults.
export function sanitizeSkillFields(input, previous = null) {
  const power = isValidPower(input?.power) ? input.power : previous?.power || DEFAULT_POWER;
  const defaults = defaultSkill(power);
  const keepPrevious = previous && previous.power === power ? previous : null;

  const effect = SKILL_EFFECTS[power].includes(input?.effect)
    ? input.effect
    : SKILL_EFFECTS[power].includes(keepPrevious?.effect)
      ? keepPrevious.effect
      : defaults.effect;

  const params = {};
  Object.entries(POWER_PARAMS[power]).forEach(([key, spec]) => {
    params[key] = number(input?.params?.[key], spec, keepPrevious?.params?.[key]);
  });
  Object.entries(SKILL_ENUMS[power] || {}).forEach(([key, values]) => {
    const value = input?.params?.[key];
    params[key] = values.includes(value) ? value : values.includes(keepPrevious?.params?.[key]) ? keepPrevious.params[key] : values[0];
  });

  return {
    name: String(input?.name ?? '').slice(0, MAX_SKILL_NAME).trim() || previous?.name || 'Unnamed Skill',
    power,
    effect,
    mana: number(input?.mana, COMMON_PARAMS.mana, previous?.mana),
    cooldown: number(input?.cooldown, COMMON_PARAMS.cooldown, previous?.cooldown),
    price: Math.round(number(input?.price, COMMON_PARAMS.price, previous?.price)),
    params
  };
}

/**
 * The combat definition of a skill (same shape the server uses for attacks and role skills, plus the
 * extra fields of skills): `cc` is { type: 'stun' | 'pull' | 'knockback' }, `heal` / `healRadius` heal
 * the caster and allies, `vanish` is the invisibility time in seconds.
 */
export function toActionDef(skill) {
  const p = skill.params || {};
  const def = {
    slot: skillSlot(skill.id),
    skillId: skill.id,
    power: skill.power,
    effect: skill.effect,
    name: skill.name,
    manaCost: skill.mana,
    cooldown: skill.cooldown,
    damage: 0,
    shape: 'none',
    range: 0
  };

  switch (skill.power) {
    case 'fire':
      return { ...def, damage: p.damage, shape: p.shape, range: p.range, arc: p.arc, width: p.width };
    case 'control': {
      const cc =
        p.mode === 'stun'
          ? { type: 'stun', ms: Math.round(p.duration * 1000) }
          : p.mode === 'knockback'
            ? { type: 'knockback', distance: p.distance }
            : { type: 'pull' };
      return { ...def, damage: p.damage, shape: 'circle', range: p.range, cc };
    }
    case 'heal':
      return { ...def, heal: p.amount, healRadius: p.radius, range: p.radius };
    case 'vanish':
      return { ...def, vanish: p.duration };
    default:
      return def;
  }
}
