import { HIT_RADIUS, getActionDef, getManaCost } from '../../shared/characterConfig.js';

const PULL_STOP_DISTANCE = 3; // pulled targets stop this far in front of the caster
const CC_STUN_MS = 450;

export function getArenaLimit(room) {
  return (room.map?.size || 500) / 2 - 10;
}

function normalize(dir) {
  const x = Number(dir?.x);
  const z = Number(dir?.z);
  const length = Math.hypot(x, z);
  if (!Number.isFinite(length) || length < 1e-6) return null;
  return { x: x / length, z: z / length };
}

function clampToArena(position, limit) {
  return {
    x: Math.min(Math.max(position.x, -limit), limit),
    z: Math.min(Math.max(position.z, -limit), limit)
  };
}

function isHit(def, caster, dir, target, radius = HIT_RADIUS) {
  const dx = target.position.x - caster.position.x;
  const dz = target.position.z - caster.position.z;
  const distance = Math.hypot(dx, dz);

  if (def.shape === 'circle') return distance - radius <= def.range;

  const forward = dx * dir.x + dz * dir.z;
  if (def.shape === 'cone') {
    if (distance - radius > def.range) return false;
    if (distance < radius) return true;
    const angle = Math.acos(Math.min(1, Math.max(-1, forward / distance)));
    return angle <= ((def.arc || 90) / 2) * (Math.PI / 180);
  }
  if (def.shape === 'line') {
    const lateral = Math.abs(dx * dir.z - dz * dir.x);
    return forward >= -radius && forward - radius <= def.range && lateral <= (def.width || 2) / 2 + radius;
  }
  return false;
}

/**
 * Resolves an action (attack, skill or emote) for `caster`. Validates cooldown and mana, applies
 * damage / crowd control / healing to the enemies it hits and returns the event to broadcast
 * (or null when the action is not allowed right now).
 */
export function resolveAction(room, caster, slot, rawDir, now = Date.now()) {
  if (!caster || caster.dead || room.gameState === 'finished') return null;
  const def = getActionDef(caster.role, slot);
  const dir = normalize(rawDir);
  if (!def || !dir) return null;

  if ((caster.cooldowns[slot] || 0) > now) return null;
  const cost = getManaCost(caster.role, slot);
  if (caster.mana < cost) return null;

  caster.cooldowns[slot] = now + def.cooldown * 1000 - 50; // small tolerance for network jitter
  caster.mana -= cost;

  const limit = getArenaLimit(room);
  const event = { casterId: caster.id, slot, dir, hits: [], towerHits: [], casterPosition: null };

  const origin = caster.position; // cones/lines are tested from where the caster started
  if (def.dash) {
    caster.position = {
      ...caster.position,
      ...clampToArena(
        { x: caster.position.x + dir.x * def.dash, z: caster.position.z + dir.z * def.dash },
        limit
      )
    };
    event.casterPosition = { x: caster.position.x, z: caster.position.z };
  }

  if (def.damage > 0) {
    (room.towers || []).forEach((tower) => {
      if (tower.team === caster.team || tower.health <= 0) return;
      if (!isHit(def, { position: origin }, dir, tower, tower.radius)) return;

      tower.health = Math.max(0, tower.health - def.damage);
      event.towerHits.push({
        towerId: tower.id,
        damage: def.damage,
        health: tower.health,
        destroyed: tower.health <= 0
      });
      if (tower.health <= 0 && room.gameState !== 'finished') {
        room.gameState = 'finished';
        room.winnerTeam = caster.team;
        event.winnerTeam = caster.team;
      }
    });

    room.players.forEach((target) => {
      if (target.id === caster.id || target.team === caster.team || target.dead) return;
      if (!isHit(def, { position: origin }, dir, target)) return;

      target.health = Math.max(0, target.health - def.damage);
      if (target.health <= 0) target.dead = true;
      let reaction = 'hit';

      if (def.cc?.type === 'knockback') {
        reaction = 'knockback';
        const dx = target.position.x - caster.position.x;
        const dz = target.position.z - caster.position.z;
        const length = Math.hypot(dx, dz);
        const away = length < 1e-6 ? dir : { x: dx / length, z: dz / length };
        target.position = {
          ...target.position,
          ...clampToArena(
            { x: target.position.x + away.x * def.cc.distance, z: target.position.z + away.z * def.cc.distance },
            limit
          )
        };
      } else if (def.cc?.type === 'pulled' || def.cc?.type === 'pull') {
        reaction = 'pulled';
        const dx = target.position.x - caster.position.x;
        const dz = target.position.z - caster.position.z;
        const length = Math.hypot(dx, dz);
        if (length > PULL_STOP_DISTANCE) {
          const toward = { x: dx / length, z: dz / length };
          target.position = {
            ...target.position,
            x: caster.position.x + toward.x * PULL_STOP_DISTANCE,
            z: caster.position.z + toward.z * PULL_STOP_DISTANCE
          };
        }
      }

      if (reaction !== 'hit') target.stunUntil = now + CC_STUN_MS; // bots wait out the displacement

      event.hits.push({
        targetId: target.id,
        damage: def.damage,
        health: target.health,
        reaction,
        position: { x: target.position.x, z: target.position.z },
        died: target.health <= 0
      });
    });
  }

  if (def.heal) caster.health = Math.min(caster.maxHealth, caster.health + def.heal);

  return event;
}
