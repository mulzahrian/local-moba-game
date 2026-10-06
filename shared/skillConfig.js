// Skills made in the Skill Generator: powers, their settings and the action definition used in combat.
// Shared by the client (generator, HUD, effects) and the server (validation, combat).

export const BASIC_POWERS = ['vanish', 'heal', 'control', 'fire'];
// Powers that summon units (GLB characters with their own animations and power); each has its own generator tab.
export const SUMMON_POWERS = ['necromancer', 'summoner', 'support'];
export const SKILL_POWERS = [...BASIC_POWERS, ...SUMMON_POWERS];
export const DEFAULT_POWER = 'fire';

// Visual effect styles per power (drawn by client/src/skill/skillEffects.js, separate from the character effects).
export const SKILL_EFFECTS = {
  vanish: ['smokeCloak', 'ghostVeil'],
  heal: ['lifeBloom', 'lightPillars'],
  control: ['chainBind', 'mindPulse'],
  fire: ['fireball', 'flameWave'],
  necromancer: ['graveRise', 'soulSwirl'],
  summoner: ['summonCircle', 'portalGate'],
  support: ['blessingHalo', 'guardianRunes']
};

export const SKILL_ENUMS = {
  control: { mode: ['stun', 'pull', 'knockback', 'dominate'] },
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
  },
  // Necromancer / support units vanish after `lifetime` seconds; a summoner's unit stays until it is defeated.
  necromancer: {
    lifetime: { min: 5, max: 180, step: 5, value: 30 }
  },
  summoner: {},
  support: {
    lifetime: { min: 5, max: 180, step: 5, value: 40 }
  }
};

// ---------------------------------------------------------------------------
// Units: the GLB characters summoned by necromancer / summoner / support skills.
// ---------------------------------------------------------------------------

export const MAX_UNITS = { necromancer: 5, summoner: 1, support: 1 };
export const MAX_UNIT_NAME = 40;
export const MAX_UNIT_ANIMATION_NAME = 120;
export const UNIT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,23}$/;

export const UNIT_POWERS = ['melee', 'ranged', 'heal', 'mana'];
export const DEFAULT_UNIT_POWER = 'melee';
export const UNIT_MOVEMENTS = ['run', 'flight'];
export const UNIT_ANIMATION_SLOTS = ['idle', 'run', 'attack1', 'dead'];

// Effects of the unit's own attacks (separate from the character and skill effects).
export const UNIT_EFFECTS = {
  melee: ['clawSlash', 'soulClaw'],
  ranged: ['spiritBolt', 'shadowArrow'],
  heal: ['mendingGlow'],
  mana: ['manaSpring']
};

export const UNIT_PARAMS = {
  scale: { min: 0.2, max: 6, step: 0.1, value: 1 },
  health: { min: 10, max: 2000, step: 10, value: 100 },
  speed: { min: 2, max: 25, step: 1, value: 9 },
  range: { min: 1, max: 40, step: 1, value: 5 },
  cooldown: { min: 0.3, max: 15, step: 0.1, value: 1.2 },
  amount: { min: 1, max: 300, step: 1, value: 12 } // damage, heal or mana restored per use
};

// Starting values of the settings that depend on the unit's power.
const UNIT_POWER_DEFAULTS = {
  melee: { range: 4, cooldown: 1, amount: 12 },
  ranged: { range: 18, cooldown: 1.4, amount: 10 },
  heal: { range: 16, cooldown: 2.5, amount: 15 },
  mana: { range: 16, cooldown: 3, amount: 8 }
};

export const isValidUnitPower = (power) => UNIT_POWERS.includes(power);
export const isSummonPower = (power) => SUMMON_POWERS.includes(power);

export function defaultUnit(power = DEFAULT_UNIT_POWER) {
  return {
    id: '',
    name: '',
    power,
    effect: UNIT_EFFECTS[power][0],
    movement: 'run',
    animations: Object.fromEntries(UNIT_ANIMATION_SLOTS.map((slot) => [slot, null])),
    params: {
      ...Object.fromEntries(Object.entries(UNIT_PARAMS).map(([key, spec]) => [key, spec.value])),
      ...UNIT_POWER_DEFAULTS[power]
    },
    hasModel: false
  };
}

const randomId = () => `u${Math.random().toString(36).slice(2, 8)}`;

// A new unit with a fresh id (units are told apart by it, e.g. for their model files).
export const createUnit = (power = DEFAULT_UNIT_POWER) => ({ ...defaultUnit(power), id: randomId() });

export function sanitizeUnit(input, previous = null) {
  const power = isValidUnitPower(input?.power) ? input.power : previous?.power || DEFAULT_UNIT_POWER;
  const defaults = defaultUnit(power);
  const keep = previous && previous.power === power ? previous : null;

  const animations = {};
  UNIT_ANIMATION_SLOTS.forEach((slot) => {
    const value = input?.animations?.[slot];
    animations[slot] = value ? String(value).slice(0, MAX_UNIT_ANIMATION_NAME) : null;
  });

  const params = {};
  Object.entries(UNIT_PARAMS).forEach(([key, spec]) => {
    params[key] = number(input?.params?.[key], spec, keep?.params?.[key] ?? defaults.params[key]);
  });

  const id = UNIT_ID_PATTERN.test(input?.id) ? input.id : previous?.id || randomId();
  return {
    id,
    name: String(input?.name ?? '').slice(0, MAX_UNIT_NAME).trim() || previous?.name || 'Unit',
    power,
    effect: UNIT_EFFECTS[power].includes(input?.effect)
      ? input.effect
      : UNIT_EFFECTS[power].includes(keep?.effect)
        ? keep.effect
        : defaults.effect,
    movement: UNIT_MOVEMENTS.includes(input?.movement) ? input.movement : previous?.movement || 'run',
    animations,
    params,
    hasModel: Boolean(previous?.hasModel)
  };
}

// Keeps 1..MAX_UNITS units (summon skills always have at least one); unit models are matched by id.
export function sanitizeUnits(input, power, previousUnits = []) {
  const max = MAX_UNITS[power] || 1;
  const list = (Array.isArray(input) ? input : []).slice(0, max);
  const units = list.map((unit) => sanitizeUnit(unit, previousUnits?.find((p) => p.id === unit?.id) || null));
  if (!units.length) units.push(sanitizeUnit({ id: randomId(), name: 'Unit' }));
  // two units must never share an id (their model files would collide)
  const seen = new Set();
  return units.map((unit) => {
    if (seen.has(unit.id)) unit.id = randomId();
    seen.add(unit.id);
    return unit;
  });
}

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
    params: defaultParams(power),
    ...(isSummonPower(power) ? { units: [createUnit()] } : {})
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
    params,
    ...(isSummonPower(power) ? { units: sanitizeUnits(input?.units, power, previous?.units) } : {})
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
          : p.mode === 'dominate'
            ? { type: 'dominate', ms: Math.round(p.duration * 1000) }
            : p.mode === 'knockback'
              ? { type: 'knockback', distance: p.distance }
              : { type: 'pull' };
      return { ...def, damage: p.damage, shape: 'circle', range: p.range, cc };
    }
    case 'heal':
      return { ...def, heal: p.amount, healRadius: p.radius, range: p.radius };
    case 'vanish':
      return { ...def, vanish: p.duration };
    case 'necromancer':
    case 'summoner':
    case 'support':
      // `range` only sizes the cast effect; the units come from the skill and are spawned by the server.
      return { ...def, range: 8, summon: true, lifetime: skill.power === 'summoner' ? 0 : p.lifetime, units: skill.units || [] };
    default:
      return def;
  }
}
