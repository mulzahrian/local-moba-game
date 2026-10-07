import { HIT_RADIUS } from '../../shared/characterConfig.js';
import { LEASH_FACTOR } from '../../shared/monsterConfig.js';
import { getArenaLimit } from './combat.js';
import { hurt, publicMonster, publicUnit } from './entities.js';
import { tickTowers } from './towers.js';

// Server-side behaviour of the entities in a room: monsters guard their spot and attack heroes that come
// close; summoned units follow their owner and fight (or heal / restore mana for) their team.
// `gm` is the GameManager, which owns damage to heroes, kills and everything that is sent to the clients.

export const WORLD_TICK_MS = 100;

const RETURN_SPEED_FACTOR = 1.6; // monsters hurry home after giving up a chase
const HOME_REACHED = 1;
const REGEN_PER_SECOND = 0.15; // share of max health a monster regains per second while returning / at home
const SECOND_ATTACK_FACTOR = 1.25; // attack 2 hits a little harder than attack 1
const STAND_OFF = 0.9; // attackers stop at this share of their range

const UNIT_SEEK_RANGE = 30; // units notice enemies this close to themselves...
const UNIT_OWNER_LEASH = 42; // ...as long as those are this close to their owner
const UNIT_MONSTER_RANGE = 15; // monsters are only fought when they are this close (so units don't pull the whole map)
const FOLLOW_DISTANCE = 6;
const TELEPORT_DISTANCE = 60; // units left this far behind are brought back to their owner
const MONSTER_UNIT_AGGRO = 0.75; // monsters notice units a bit later than heroes

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (value, limit) => Math.min(Math.max(value, -limit), limit);
const visible = (player, now) => !player.dead && (player.invisibleUntil || 0) <= now;

function stepToward(entity, to, speed, dt, limit) {
  const dx = to.x - entity.position.x;
  const dz = to.z - entity.position.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return 0;
  const step = Math.min(length, speed * dt);
  entity.position = {
    x: clamp(entity.position.x + (dx / length) * step, limit),
    z: clamp(entity.position.z + (dz / length) * step, limit)
  };
  entity.rotationY = Math.atan2(dx, dz);
  return step;
}

function face(entity, to) {
  const dx = to.x - entity.position.x;
  const dz = to.z - entity.position.z;
  if (Math.hypot(dx, dz) > 1e-6) entity.rotationY = Math.atan2(dx, dz);
}

const radiusOf = (target, kind) => (kind === 'player' ? HIT_RADIUS : target.radius);

// The entity a { kind, id } reference points to, if it can still be attacked.
function resolveTarget(room, ref, now) {
  if (!ref) return null;
  if (ref.kind === 'player') {
    const player = room.players.find((p) => p.id === ref.id);
    return player && visible(player, now) ? player : null;
  }
  const unit = room.units.find((u) => u.id === ref.id);
  return unit && !unit.dead ? unit : null;
}

function nearest(candidates, from) {
  let best = null;
  candidates.forEach((candidate) => {
    const d = distance(candidate.entity.position, from);
    if (!best || d < best.d) best = { ...candidate, d };
  });
  return best;
}

// ---------------------------------------------------------------------------
// Monsters
// ---------------------------------------------------------------------------

function acquireMonsterTarget(room, monster, now) {
  const candidates = [
    ...room.players.filter((p) => visible(p, now)).map((entity) => ({ kind: 'player', entity, reach: monster.aggroRange })),
    ...room.units.filter((u) => !u.dead).map((entity) => ({ kind: 'unit', entity, reach: monster.aggroRange * MONSTER_UNIT_AGGRO }))
  ].filter(({ entity, reach }) => distance(entity.position, monster.home) <= reach);
  return nearest(candidates, monster.position);
}

function monsterAttack(room, gm, monster, target, kind, now) {
  const slot = monster.nextSlot;
  monster.nextSlot = slot === 'attack1' ? 'attack2' : 'attack1';
  monster.nextAttackAt = now + monster.attackCooldown * 1000;
  const damage = Math.round(monster.damage * (slot === 'attack2' ? SECOND_ATTACK_FACTOR : 1));
  face(monster, target.position);

  const payload = {
    kind: 'monster',
    id: monster.id,
    slot,
    dir: { x: Math.sin(monster.rotationY), z: Math.cos(monster.rotationY) },
    range: monster.attackRange,
    targetKind: kind,
    targetId: target.id
  };
  if (kind === 'player') {
    payload.hit = gm.damagePlayer(room, target, damage);
  } else {
    const result = hurt(target, damage);
    payload.hit = { targetId: target.id, damage, health: result.health, died: result.died };
    if (result.died) gm.removeUnit(room, target, 'killed');
  }
  gm.broadcastAttack(room, payload);
}

function tickMonster(room, gm, monster, dt, now, limit) {
  monster.moving = false;
  if (monster.dead || monster.stunUntil > now) return;

  let ref = monster.target;
  let target = resolveTarget(room, ref, now);
  if (target && distance(target.position, monster.home) > monster.aggroRange * LEASH_FACTOR) target = null; // too far from home
  if (!target) {
    const found = acquireMonsterTarget(room, monster, now);
    target = found?.entity || null;
    ref = found ? { kind: found.kind, id: found.entity.id } : null;
  }
  monster.target = target ? ref : null;

  if (!target) {
    if (distance(monster.position, monster.home) > HOME_REACHED) {
      monster.moving = stepToward(monster, monster.home, monster.speed * RETURN_SPEED_FACTOR, dt, limit) > 0;
    }
    if (monster.health < monster.maxHealth) {
      monster.health = Math.min(monster.maxHealth, monster.health + monster.maxHealth * REGEN_PER_SECOND * dt);
    }
    return;
  }

  const gap = distance(target.position, monster.position) - radiusOf(target, ref.kind) - monster.radius * 0.5;
  if (gap > monster.attackRange * STAND_OFF) {
    monster.moving = stepToward(monster, target.position, monster.speed, dt, limit) > 0;
    return;
  }
  face(monster, target.position);
  if (now >= monster.nextAttackAt) monsterAttack(room, gm, monster, target, ref.kind, now);
}

// ---------------------------------------------------------------------------
// Summoned units
// ---------------------------------------------------------------------------

function hostilesNear(room, unit, owner, now) {
  const near = (entity, reach) =>
    distance(entity.position, unit.position) <= reach && distance(entity.position, owner.position) <= UNIT_OWNER_LEASH;
  return [
    ...room.players.filter((p) => p.team !== unit.team && visible(p, now) && near(p, UNIT_SEEK_RANGE)).map((entity) => ({ kind: 'player', entity })),
    ...room.units.filter((u) => u.team !== unit.team && !u.dead && near(u, UNIT_SEEK_RANGE)).map((entity) => ({ kind: 'unit', entity })),
    ...room.monsters.filter((m) => !m.dead && distance(m.position, unit.position) <= UNIT_MONSTER_RANGE).map((entity) => ({ kind: 'monster', entity }))
  ];
}

function unitAttackPayload(unit, extra) {
  return {
    kind: 'unit',
    id: unit.id,
    slot: 'attack1',
    dir: { x: Math.sin(unit.rotationY), z: Math.cos(unit.rotationY) },
    effect: unit.effect,
    range: unit.range,
    ...extra
  };
}

function unitStrike(room, gm, unit, target, kind, now) {
  unit.nextAttackAt = now + unit.cooldown * 1000;
  face(unit, target.position);
  const payload = unitAttackPayload(unit, { targetKind: kind, targetId: target.id });
  if (kind === 'player') {
    payload.hit = gm.damagePlayer(room, target, unit.amount);
  } else {
    const result = hurt(target, unit.amount);
    payload.hit = { targetId: target.id, damage: unit.amount, health: result.health, died: result.died };
    if (kind === 'monster') {
      if (!target.target) target.target = { kind: 'unit', id: unit.id }; // the monster answers the unit that hit it
      if (result.died) {
        target.killerId = unit.ownerId;
        gm.handleMonsterDeath(room, target);
      }
    } else if (result.died) {
      gm.removeUnit(room, target, 'killed');
    }
  }
  gm.broadcastAttack(room, payload);
}

// Heals the most hurt ally in range (or refills the mana of the one who lacks it most).
function unitSupport(room, gm, unit, now) {
  const stat = unit.power === 'heal' ? ['health', 'maxHealth'] : ['mana', 'maxMana'];
  let best = null;
  room.players.forEach((ally) => {
    if (ally.team !== unit.team || ally.dead || distance(ally.position, unit.position) > unit.range) return;
    const missing = ally[stat[1]] - ally[stat[0]];
    if (missing <= 0.5) return;
    const ratio = ally[stat[0]] / ally[stat[1]];
    if (!best || ratio < best.ratio) best = { ally, ratio };
  });
  if (!best) return;

  unit.nextAttackAt = now + unit.cooldown * 1000;
  const { ally } = best;
  face(unit, ally.position);
  ally[stat[0]] = Math.min(ally[stat[1]], ally[stat[0]] + unit.amount);
  gm.broadcastAttack(
    room,
    unitAttackPayload(unit, {
      targetKind: 'player',
      targetId: ally.id,
      support: { type: unit.power, amount: unit.amount, health: ally.health, mana: ally.mana }
    })
  );
}

function follow(unit, owner, dt, limit) {
  const d = distance(owner.position, unit.position);
  if (d > TELEPORT_DISTANCE) {
    unit.position = { x: clamp(owner.position.x + 2, limit), z: clamp(owner.position.z + 2, limit) };
    unit.moving = false;
  } else if (d > FOLLOW_DISTANCE) {
    unit.moving = stepToward(unit, owner.position, unit.speed, dt, limit) > 0;
  }
}

function tickUnit(room, gm, unit, dt, now, limit) {
  unit.moving = false;
  const owner = room.players.find((p) => p.id === unit.ownerId);
  if (!owner) return gm.removeUnit(room, unit, 'orphaned');
  if (unit.expiresAt && now >= unit.expiresAt) return gm.removeUnit(room, unit, 'expired');
  if (unit.stunUntil > now) return undefined;

  if (unit.power === 'heal' || unit.power === 'mana') {
    if (now >= unit.nextAttackAt) unitSupport(room, gm, unit, now);
    follow(unit, owner, dt, limit);
    return undefined;
  }

  const found = nearest(hostilesNear(room, unit, owner, now), unit.position);
  if (!found) {
    follow(unit, owner, dt, limit);
    return undefined;
  }
  const { entity, kind } = found;
  const gap = found.d - radiusOf(entity, kind) - unit.radius * 0.5;
  if (gap > unit.range * STAND_OFF) {
    unit.moving = stepToward(unit, entity.position, unit.speed, dt, limit) > 0;
  } else {
    face(unit, entity.position);
    if (now >= unit.nextAttackAt) unitStrike(room, gm, unit, entity, kind, now);
  }
  return undefined;
}

// ---------------------------------------------------------------------------

/** Advances every monster and unit of the room by `dt` seconds and broadcasts what moved. */
export function tickWorld(room, gm, dt, now = Date.now()) {
  if (room.gameState !== 'in_progress') return;
  const limit = getArenaLimit(room);

  tickTowers(room, gm, now);

  room.monsters.forEach((monster) => tickMonster(room, gm, monster, dt, now, limit));
  [...room.units].forEach((unit) => {
    if (!unit.dead) tickUnit(room, gm, unit, dt, now, limit);
  });

  // only entities whose position, facing, motion or health changed are sent
  const changedStates = (entities, toPublic) =>
    entities
      .filter((entity) => !entity.dead)
      .flatMap((entity) => {
        const state = toPublic(entity);
        const key = `${state.x.toFixed(2)},${state.z.toFixed(2)},${state.r.toFixed(2)},${state.m},${Math.round(state.h)}`;
        if (entity.sentState === key) return [];
        entity.sentState = key;
        return [{ id: state.id, x: state.x, z: state.z, r: state.r, m: state.m, h: state.h }];
      });
  const monsters = changedStates(room.monsters, publicMonster);
  const units = changedStates(room.units, publicUnit);
  if (monsters.length || units.length) gm.io.to(room.code).emit('worldState', { monsters, units });
}
