import { MONSTER_RADIUS_PER_SCALE, isMonsterObject, monsterIdOfType, clampAggroRange } from '../../shared/monsterConfig.js';

// Monsters (placed on the map) and units (summoned by skills) are server-side entities that live in
// room.monsters / room.units. Their `position` is { x, z }; clients draw them from the broadcasts.

export const unitRadius = (scale) => Math.max(0.8, 1.2 * scale);

// Builds the monsters of a map; `defs` maps monster ids to their definitions (missing ones are skipped).
export function createMonsters(map, defs) {
  const monsters = [];
  (map?.objects || []).filter(isMonsterObject).forEach((object) => {
    const def = defs.get(monsterIdOfType(object.type));
    if (!def?.hasModel) return;
    const scale = def.params.scale * (object.scale || 1);
    monsters.push({
      id: object.uid,
      monsterId: def.id,
      name: def.name,
      movement: def.movement,
      home: { x: object.position.x, z: object.position.z },
      position: { x: object.position.x, z: object.position.z },
      rotationY: ((object.rotationY || 0) * Math.PI) / 180,
      aggroRange: clampAggroRange(object.aggroRange),
      radius: Math.max(1.5, MONSTER_RADIUS_PER_SCALE * scale),
      health: def.params.health,
      maxHealth: def.params.health,
      damage: def.params.damage,
      speed: def.params.speed,
      attackRange: def.params.attackRange,
      attackCooldown: def.params.attackCooldown,
      gold: def.params.gold,
      rewardSkillId: def.rewardSkillId,
      dead: false,
      target: null, // { kind: 'player' | 'unit', id }
      nextAttackAt: 0,
      nextSlot: 'attack1',
      stunUntil: 0,
      moving: false,
      killerId: null
    });
  });
  return monsters;
}

// Applies damage to a monster or unit; returns the hit as the clients need it.
export function hurt(entity, damage) {
  entity.health = Math.max(0, entity.health - damage);
  if (entity.health <= 0) entity.dead = true;
  return { id: entity.id, damage, health: entity.health, died: entity.dead };
}

export const publicMonster = (monster) => ({
  id: monster.id,
  x: monster.position.x,
  z: monster.position.z,
  r: monster.rotationY,
  m: monster.moving,
  h: monster.health
});

export const publicUnit = (unit) => ({
  id: unit.id,
  ownerId: unit.ownerId,
  team: unit.team,
  skillId: unit.skillId,
  unitId: unit.unitId,
  x: unit.position.x,
  z: unit.position.z,
  r: unit.rotationY,
  m: unit.moving,
  h: unit.health,
  maxHealth: unit.maxHealth
});
