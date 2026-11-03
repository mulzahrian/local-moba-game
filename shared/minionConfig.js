export const MINION_ANIMATION_SLOTS = ['idle', 'run', 'attack1', 'attack2', 'dead'];
export const MINION_MOVEMENTS = ['run', 'flight'];
export const MINION_RESPAWNS = 3;
export const MINION_RESPAWN_DELAY = 10;
export const MINION_COUNT_PER_TEAM = 4;
export const MINION_ATTACK_TYPES = ['sword', 'punch', 'shot', 'arrow'];

export function defaultMinion() {
  return {
    name: '', movement: 'run',
    animations: Object.fromEntries(MINION_ANIMATION_SLOTS.map((slot) => [slot, null])), attackType: 'sword',
    params: { scale: 1, health: 120, damage: 8, speed: 5, attackRange: 3, attackCooldown: 1.5 }
  };
}

export function sanitizeMinionFields(input, previous = null) {
  const fallback = previous || defaultMinion();
  const animations = Object.fromEntries(MINION_ANIMATION_SLOTS.map((slot) => [slot, input?.animations?.[slot] ? String(input.animations[slot]).slice(0, 120) : null]));
  const clamp = (key, min, max) => {
    const value = Number(input?.params?.[key]);
    return Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback.params[key]));
  };
  return {
    name: String(input?.name ?? '').slice(0, 40).trim() || fallback.name || 'Unnamed Minion',
    movement: MINION_MOVEMENTS.includes(input?.movement) ? input.movement : fallback.movement,
    attackType: MINION_ATTACK_TYPES.includes(input?.attackType) ? input.attackType : fallback.attackType || 'sword',
    animations,
    params: { scale: clamp('scale', 0.3, 5), health: clamp('health', 10, 2000), damage: clamp('damage', 1, 200), speed: clamp('speed', 1, 20), attackRange: clamp('attackRange', 1, 15), attackCooldown: clamp('attackCooldown', 0.3, 10) }
  };
}
