import { HIT_RADIUS } from '../../shared/characterConfig.js';
import { hurt } from './entities.js';

// Towers shoot the enemies that come within their range: the one that is hitting them (when it is still
// close enough), otherwise the closest hero or summoned unit.

const ATTACKER_MEMORY_MS = 6000; // a tower keeps shooting whoever hit it last for this long
const TOWER_EFFECT = 'towerBolt';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function pickTarget(room, tower, now) {
  const reach = (entity, radius) => distance(entity.position, tower.position) <= tower.radius + tower.attackRange + radius;
  const heroes = room.players
    .filter((p) => p.team !== tower.team && !p.dead && (p.invisibleUntil || 0) <= now && reach(p, HIT_RADIUS))
    .map((entity) => ({ kind: 'player', entity }));
  const units = room.units
    .filter((u) => u.team !== tower.team && !u.dead && reach(u, u.radius))
    .map((entity) => ({ kind: 'unit', entity }));
  const candidates = [...heroes, ...units];

  if (tower.lastAttackerId && now - (tower.lastAttackedAt || 0) <= ATTACKER_MEMORY_MS) {
    const attacker = candidates.find((c) => c.kind === 'player' && c.entity.id === tower.lastAttackerId);
    if (attacker) return attacker;
  }

  let best = null;
  candidates.forEach((candidate) => {
    const d = distance(candidate.entity.position, tower.position);
    if (!best || d < best.d) best = { ...candidate, d };
  });
  return best;
}

/** Lets every standing tower of the room shoot when its cooldown is over and an enemy is in range. */
export function tickTowers(room, gm, now = Date.now()) {
  (room.towers || []).forEach((tower) => {
    if (tower.health <= 0 || now < (tower.nextAttackAt || 0)) return;
    const target = pickTarget(room, tower, now);
    if (!target) return;
    tower.nextAttackAt = now + tower.attackCooldown * 1000;

    const { kind, entity } = target;
    const payload = {
      kind: 'tower',
      id: tower.id,
      main: tower.main,
      effect: TOWER_EFFECT,
      range: distance(entity.position, tower.position),
      targetKind: kind,
      targetId: entity.id
    };
    if (kind === 'player') {
      payload.hit = gm.damagePlayer(room, entity, tower.attackDamage);
    } else {
      const result = hurt(entity, tower.attackDamage);
      payload.hit = { targetId: entity.id, damage: tower.attackDamage, health: result.health, died: result.died };
      if (result.died) gm.removeUnit(room, entity, 'killed');
    }
    gm.broadcastAttack(room, payload);
  });
}
