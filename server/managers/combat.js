import { HIT_RADIUS, getActionDef, getManaCost } from '../../shared/characterConfig.js';
import { hurt } from './entities.js';

const PULL_STOP_DISTANCE = 3; // pulled targets stop this far in front of the caster
const CC_STUN_MS = 450;
const MAX_SKILL_STUN_MS = 6000;

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

// What the clients need to draw a skill (no cost or cooldown data).
function publicSkill(def) {
  const { skillId, power, effect, name, shape, range, arc, width, healRadius } = def;
  return { skillId, power, effect, name, shape, range, arc, width, healRadius };
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
 * (or null when the action is not allowed right now). `custom` is the definition of an equipped skill
 * (see toActionDef in shared/skillConfig.js); without it the slot is an attack / role skill / emote.
 */
export function resolveAction(room, caster, slot, rawDir, now = Date.now(), custom = null) {
  if (!caster || caster.dead || room.gameState === 'finished') return null;
  const def = custom || getActionDef(caster.role, slot);
  const dir = normalize(rawDir);
  if (!def || !dir) return null;

  if ((caster.cooldowns[slot] || 0) > now) return null;
  const cost = custom ? custom.manaCost : getManaCost(caster.role, slot);
  if (caster.mana < cost) return null;

  caster.cooldowns[slot] = now + def.cooldown * 1000 - 50; // small tolerance for network jitter
  caster.mana -= cost;

  const limit = getArenaLimit(room);
  const event = { casterId: caster.id, slot, dir, hits: [], towerHits: [], monsterHits: [], unitHits: [], heals: [], casterPosition: null };
  if (custom) event.skill = publicSkill(custom);

  // Attacking breaks invisibility.
  if ((caster.invisibleUntil || 0) > now && (def.damage > 0 || def.cc)) {
    caster.invisibleUntil = 0;
    event.revealed = true;
  }

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
  }

  if (def.damage > 0 || def.cc) {
    room.players.forEach((target) => {
      if (target.id === caster.id || target.team === caster.team || target.dead) return;
      if (!isHit(def, { position: origin }, dir, target)) return;

      target.health = Math.max(0, target.health - (def.damage || 0));
      if (target.health <= 0) target.dead = true;
      let reaction = 'hit';
      let stunMs = 0;

      if (def.cc?.type === 'stun') {
        reaction = 'stunned';
        stunMs = Math.min(def.cc.ms || 0, MAX_SKILL_STUN_MS);
        target.stunUntil = Math.max(target.stunUntil || 0, now + stunMs);
      } else if (def.cc?.type === 'dominate') {
        // mind control: the target cannot act and walks towards the caster
        reaction = 'dominated';
        stunMs = Math.min(def.cc.ms || 0, MAX_SKILL_STUN_MS);
        target.stunUntil = Math.max(target.stunUntil || 0, now + stunMs);
        target.dominatedUntil = now + stunMs;
        target.dominatedBy = caster.id;
      } else if (def.cc?.type === 'knockback') {
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

      if (!['hit', 'stunned', 'dominated'].includes(reaction)) target.stunUntil = now + CC_STUN_MS; // bots wait out the displacement

      event.hits.push({
        targetId: target.id,
        damage: def.damage,
        health: target.health,
        reaction,
        position: { x: target.position.x, z: target.position.z },
        died: target.health <= 0,
        ...(stunMs ? { stunMs } : {}),
        ...(reaction === 'dominated' ? { dominateMs: stunMs, dominatorId: caster.id } : {})
      });
    });

    // Monsters and the enemy team's summoned units are hit (and controlled) like heroes.
    const entities = [
      ...(room.monsters || []).map((entity) => ({ kind: 'monster', entity })),
      ...(room.units || []).filter((unit) => unit.team !== caster.team).map((entity) => ({ kind: 'unit', entity }))
    ];
    entities.forEach(({ kind, entity }) => {
      if (entity.dead || !isHit(def, { position: origin }, dir, entity, entity.radius)) return;

      const result = hurt(entity, def.damage || 0);
      let reaction = 'hit';
      let stunMs = 0;
      if (def.cc?.type === 'stun' || def.cc?.type === 'dominate') {
        reaction = 'stunned';
        stunMs = Math.min(def.cc.ms || 0, MAX_SKILL_STUN_MS);
        entity.stunUntil = Math.max(entity.stunUntil || 0, now + stunMs);
      } else if (def.cc?.type === 'knockback' || def.cc?.type === 'pull' || def.cc?.type === 'pulled') {
        reaction = def.cc.type === 'knockback' ? 'knockback' : 'pulled';
        const dx = entity.position.x - caster.position.x;
        const dz = entity.position.z - caster.position.z;
        const length = Math.hypot(dx, dz);
        const away = length < 1e-6 ? dir : { x: dx / length, z: dz / length };
        const moved =
          reaction === 'knockback'
            ? { x: entity.position.x + away.x * def.cc.distance, z: entity.position.z + away.z * def.cc.distance }
            : length > PULL_STOP_DISTANCE
              ? { x: caster.position.x + away.x * PULL_STOP_DISTANCE, z: caster.position.z + away.z * PULL_STOP_DISTANCE }
              : entity.position;
        entity.position = clampToArena(moved, limit);
        entity.stunUntil = Math.max(entity.stunUntil || 0, now + CC_STUN_MS);
      }

      if (kind === 'monster') {
        entity.target = { kind: 'player', id: caster.id }; // hitting a monster provokes it, wherever it stands
        if (result.died) entity.killerId = caster.id;
      }
      const hit = {
        id: entity.id,
        damage: def.damage,
        health: entity.health,
        reaction,
        position: { x: entity.position.x, z: entity.position.z },
        died: result.died,
        ...(stunMs ? { stunMs } : {})
      };
      (kind === 'monster' ? event.monsterHits : event.unitHits).push(hit);
    });
  }

  if (def.heal) {
    const allies = def.healRadius > 0
      ? room.players.filter((p) => p.team === caster.team && !p.dead && Math.hypot(p.position.x - caster.position.x, p.position.z - caster.position.z) <= def.healRadius)
      : [];
    if (!allies.includes(caster)) allies.push(caster);
    allies.forEach((ally) => {
      ally.health = Math.min(ally.maxHealth, ally.health + def.heal);
      event.heals.push({ targetId: ally.id, amount: def.heal, health: ally.health });
    });
  }

  if (def.vanish) {
    caster.invisibleUntil = now + def.vanish * 1000;
    event.vanishMs = def.vanish * 1000;
  }

  return event;
}
