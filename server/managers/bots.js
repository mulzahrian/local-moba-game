import { getActionDef, getManaCost, SKILL_SLOTS } from '../../shared/characterConfig.js';
import { getArenaLimit } from './combat.js';

export const BOT_TICK_MS = 100;

const BOT_SPEED = 9; // units per second, a little slower than a human (11.25)
const AGGRO_RANGE = 45; // enemy heroes closer than this are fought; otherwise bots push the enemy tower
const RANGED_BASIC_RANGE = 12; // bots with a basic attack reaching this far keep their distance
const SKILL_CHANCE = 0.6;

const BOT_NAMES = ['Aria', 'Borin', 'Cyra', 'Draven', 'Elara', 'Fenris', 'Gwen', 'Hakon', 'Iris', 'Jorund'];

// Per-bot scratch data (kept off the player object, which is sent to the clients).
const memory = new WeakMap();
const getMemory = (bot) => {
  if (!memory.has(bot)) memory.set(bot, { nextActionAt: 0, nextAttackSlot: 'attack1', wasMoving: false });
  return memory.get(bot);
};

export const pickBotName = (index) => `Bot ${BOT_NAMES[index % BOT_NAMES.length]}`;

function nearestOf(list, from) {
  let best = null;
  list.forEach((entry) => {
    const distance = Math.hypot(entry.position.x - from.x, entry.position.z - from.z);
    if (!best || distance < best.distance) best = { position: entry.position, radius: entry.radius || 0, distance };
  });
  return best;
}

// Closest enemy hero when one is near, otherwise the closest standing enemy tower.
function findTarget(room, bot) {
  const heroes = room.players.filter((other) => other.team !== bot.team && !other.dead);
  const towers = (room.towers || []).filter((tower) => tower.team !== bot.team && tower.health > 0);
  const hero = nearestOf(heroes, bot.position);
  if (hero && hero.distance <= AGGRO_RANGE) return hero;
  return nearestOf(towers, bot.position) || hero;
}

function chooseAction(bot, target, mem, now) {
  const ready = (slot) => {
    const def = getActionDef(bot.role, slot);
    return (
      def &&
      (bot.cooldowns[slot] || 0) <= now &&
      bot.mana >= getManaCost(bot.role, slot) &&
      target.distance - target.radius <= def.range * 0.9
    );
  };

  if (Math.random() < SKILL_CHANCE) {
    const skills = SKILL_SLOTS.filter(ready);
    if (skills.length) return skills[Math.floor(Math.random() * skills.length)];
  }
  if (ready(mem.nextAttackSlot)) return mem.nextAttackSlot;
  return null;
}

/**
 * Advances every living bot of the room by `dt` seconds: walk towards the closest enemy hero (or the enemy
 * tower when nobody is around) and attack / cast when something is in range.
 * `cast(bot, slot, dir)` performs an action through the normal combat rules; returns the bots whose position changed.
 */
export function tickBots(room, dt, cast, now = Date.now()) {
  const moved = [];
  if (room.gameState !== 'in_progress') return moved;
  const limit = getArenaLimit(room);

  room.players.forEach((bot) => {
    if (!bot.isBot || bot.dead || (bot.stunUntil || 0) > now) return;
    const mem = getMemory(bot);
    const target = findTarget(room, bot);
    if (!target) return;

    const dx = target.position.x - bot.position.x;
    const dz = target.position.z - bot.position.z;
    const distance = Math.max(target.distance, 1e-6);
    const dir = { x: dx / distance, z: dz / distance };

    const basic = getActionDef(bot.role, 'attack1');
    const hold = target.radius + basic.range * 0.7;
    let step = 0;
    if (distance > hold) step = Math.min(BOT_SPEED * dt, distance - hold);
    else if (basic.range >= RANGED_BASIC_RANGE && target.radius === 0 && distance < hold * 0.6) step = -BOT_SPEED * dt * 0.6;

    if (step !== 0) {
      bot.position = {
        ...bot.position,
        x: Math.min(Math.max(bot.position.x + dir.x * step, -limit), limit),
        z: Math.min(Math.max(bot.position.z + dir.z * step, -limit), limit)
      };
      mem.wasMoving = true;
      moved.push(bot);
    } else if (mem.wasMoving) {
      mem.wasMoving = false;
      moved.push(bot); // one last update so clients stop the run animation
    }

    if (now < mem.nextActionAt) return;
    const slot = chooseAction(bot, target, mem, now);
    if (!slot) return;
    if (cast(bot, slot, dir)) {
      if (slot === 'attack1') mem.nextAttackSlot = 'attack2';
      else if (slot === 'attack2') mem.nextAttackSlot = 'attack1';
      mem.nextActionAt = now + 300 + Math.random() * 400;
    }
  });

  return moved;
}
