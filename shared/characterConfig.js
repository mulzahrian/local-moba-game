// Character roles, skills and animation slots shared by the client and the server.

export const BUILTIN_CHARACTER_ID = 'builtin-rimuru';

export const ROLES = ['fighter', 'mage', 'assassin', 'support', 'marksman'];
export const DEFAULT_ROLE = 'fighter';

// Animation slots a character can map to clips of its GLB (idle/run drive movement).
export const ANIMATION_SLOTS = [
  'idle',
  'run',
  'attack1',
  'attack2',
  'skill1',
  'skill2',
  'skill3',
  'hit',
  'knockback',
  'pulled',
  'emote'
];

export const SKILL_SLOTS = ['skill1', 'skill2', 'skill3'];

// Everything the player can trigger with an input (slot -> default key label).
export const ACTION_SLOTS = ['attack1', 'attack2', 'skill1', 'skill2', 'skill3', 'emote'];

export const EFFECT_IDS = [
  'none',
  'magicCircle',
  'fireBurst',
  'iceNova',
  'lightningStrike',
  'shadowVanish',
  'slashArc',
  'healingAura',
  'windVortex',
  'shockwave',
  'arrowVolley',
  'meteorFall'
];

export const MAX_ANIMATION_NAME = 120;
export const HIT_RADIUS = 1.5; // approximate body radius used for hit detection
export const MANA_REGEN_PER_SECOND = 4;
export const RESPAWN_SECONDS = 3;
export const EMOTE_COOLDOWN = 1.5;
export const COMBO_WINDOW_SECONDS = 1.2; // attack 2 follows attack 1 if clicked within this time

/**
 * Skill shapes: `circle` hits everything within `range` of the caster, `cone` hits a `arc`-degree
 * wedge in front, `line` hits a `width`-wide strip of length `range` in front.
 * `cc` is the crowd control applied to targets: knockback (thrown away), pull (dragged to the caster).
 * `manaPct` is the share of the role's max mana a skill costs.
 */
export const ROLE_CONFIG = {
  fighter: {
    maxHealth: 140,
    maxMana: 100,
    attack: { shape: 'cone', range: 7, arc: 120, cooldown: 0.5, damage1: 5, damage2: 7 },
    skills: {
      skill1: {
        name: { en: 'Power Strike', id: 'Pukulan Kuat' },
        manaPct: 10, damage: 10, cooldown: 1.5, shape: 'cone', range: 8, arc: 100,
        effect: 'slashArc'
      },
      skill2: {
        name: { en: 'Ground Slam', id: 'Hantaman Tanah' },
        manaPct: 50, damage: 22, cooldown: 5, shape: 'circle', range: 10,
        cc: { type: 'knockback', distance: 12 },
        effect: 'shockwave'
      },
      skill3: {
        name: { en: 'Rending Leap', id: 'Lompatan Pencabik' },
        manaPct: 50, damage: 28, cooldown: 7, shape: 'cone', range: 14, arc: 70,
        cc: { type: 'knockback', distance: 18 },
        effect: 'fireBurst'
      }
    }
  },
  mage: {
    maxHealth: 90,
    maxMana: 100,
    attack: { shape: 'line', range: 22, width: 3, cooldown: 0.6, damage1: 4, damage2: 6 },
    skills: {
      skill1: {
        name: { en: 'Arcane Bolt', id: 'Panah Arkana' },
        manaPct: 10, damage: 9, cooldown: 1.2, shape: 'line', range: 26, width: 3,
        effect: 'magicCircle'
      },
      skill2: {
        name: { en: 'Gravity Well', id: 'Sumur Gravitasi' },
        manaPct: 50, damage: 20, cooldown: 5, shape: 'circle', range: 14,
        cc: { type: 'pull' },
        effect: 'windVortex'
      },
      skill3: {
        name: { en: 'Meteor Storm', id: 'Badai Meteor' },
        manaPct: 50, damage: 30, cooldown: 7, shape: 'circle', range: 16,
        cc: { type: 'knockback', distance: 10 },
        effect: 'meteorFall'
      }
    }
  },
  assassin: {
    maxHealth: 100,
    maxMana: 100,
    attack: { shape: 'cone', range: 6, arc: 90, cooldown: 0.4, damage1: 5, damage2: 7 },
    skills: {
      skill1: {
        name: { en: 'Quick Stab', id: 'Tusukan Cepat' },
        manaPct: 10, damage: 10, cooldown: 1.2, shape: 'cone', range: 7, arc: 90,
        effect: 'slashArc'
      },
      skill2: {
        name: { en: 'Shadow Step', id: 'Langkah Bayangan' },
        manaPct: 50, damage: 22, cooldown: 5, shape: 'cone', range: 18, arc: 40, dash: 14,
        effect: 'shadowVanish'
      },
      skill3: {
        name: { en: 'Blade Flurry', id: 'Badai Pedang' },
        manaPct: 50, damage: 26, cooldown: 7, shape: 'circle', range: 9,
        cc: { type: 'pull' },
        effect: 'lightningStrike'
      }
    }
  },
  support: {
    maxHealth: 110,
    maxMana: 100,
    attack: { shape: 'line', range: 12, width: 3, cooldown: 0.6, damage1: 3, damage2: 5 },
    skills: {
      skill1: {
        name: { en: 'Holy Spark', id: 'Percikan Suci' },
        manaPct: 10, damage: 8, cooldown: 1.2, shape: 'line', range: 16, width: 3,
        effect: 'healingAura'
      },
      skill2: {
        name: { en: 'Chain of Light', id: 'Rantai Cahaya' },
        manaPct: 50, damage: 18, cooldown: 5, shape: 'circle', range: 16,
        cc: { type: 'pull' },
        effect: 'magicCircle'
      },
      skill3: {
        name: { en: 'Radiant Nova', id: 'Nova Cemerlang' },
        manaPct: 50, damage: 22, cooldown: 7, shape: 'circle', range: 12, heal: 20,
        cc: { type: 'knockback', distance: 8 },
        effect: 'iceNova'
      }
    }
  },
  marksman: {
    maxHealth: 90,
    maxMana: 100,
    attack: { shape: 'line', range: 30, width: 2, cooldown: 0.5, damage1: 5, damage2: 6 },
    skills: {
      skill1: {
        name: { en: 'Quick Shot', id: 'Tembakan Cepat' },
        manaPct: 10, damage: 10, cooldown: 1.2, shape: 'line', range: 30, width: 2,
        effect: 'arrowVolley'
      },
      skill2: {
        name: { en: 'Piercing Arrow', id: 'Panah Penembus' },
        manaPct: 50, damage: 24, cooldown: 5, shape: 'line', range: 40, width: 3,
        effect: 'arrowVolley'
      },
      skill3: {
        name: { en: 'Arrow Rain', id: 'Hujan Panah' },
        manaPct: 50, damage: 28, cooldown: 7, shape: 'circle', range: 16,
        cc: { type: 'knockback', distance: 6 },
        effect: 'meteorFall'
      }
    }
  }
};

export function isValidRole(role) {
  return ROLES.includes(role);
}

export function getRoleConfig(role) {
  return ROLE_CONFIG[role] || ROLE_CONFIG[DEFAULT_ROLE];
}

// Normalised definition for any action slot of a role (attack1/2, skill1-3, emote).
export function getActionDef(role, slot) {
  const config = getRoleConfig(role);
  if (slot === 'attack1' || slot === 'attack2') {
    const a = config.attack;
    return {
      slot,
      manaPct: 0,
      damage: slot === 'attack1' ? a.damage1 : a.damage2,
      cooldown: a.cooldown,
      shape: a.shape,
      range: a.range,
      arc: a.arc,
      width: a.width
    };
  }
  if (SKILL_SLOTS.includes(slot)) return { slot, ...config.skills[slot] };
  if (slot === 'emote') return { slot, manaPct: 0, damage: 0, cooldown: EMOTE_COOLDOWN, shape: 'none', range: 0 };
  return null;
}

export function getManaCost(role, slot) {
  const def = getActionDef(role, slot);
  if (!def) return 0;
  return Math.round((getRoleConfig(role).maxMana * (def.manaPct || 0)) / 100);
}
