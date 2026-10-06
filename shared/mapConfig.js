// Map rules shared by the map editor (client), the map API and the game server.

// Every map needs exactly this many towers: the two team bases (spawn point and the objective to destroy).
export const TOWER_TYPE = 'tower';
export const REQUIRED_TOWERS = 2;

export const countTowers = (objects) => (objects || []).filter((o) => o?.type === TOWER_TYPE).length;

export const DEFAULT_MAP_SIZE = 500;
export const TOWER_MAX_HEALTH = 300;
export const TOWER_MODEL_HEIGHT = 20; // the tower model is auto-fitted to this size (see mapObjects.json) before its scale
export const TOWER_RADIUS_PER_SCALE = 8; // approximate footprint radius used for hit detection and spawning
const FALLBACK_TOWER_RADIUS = 20; // maps without placed towers use the default corner bases
const SPAWN_GAP = 10; // distance between a tower's edge and its team's spawn point

/**
 * The two bases of a map: the first placed tower belongs to team1 (the host), the second to team2.
 * Maps without exactly two towers (the default arena, maps saved before towers existed) fall back
 * to bases in opposite corners.
 */
export function buildTowers(map) {
  const placed = (map?.objects || []).filter((o) => o?.type === TOWER_TYPE);
  if (placed.length === REQUIRED_TOWERS) {
    return placed.map((object, index) => {
      const scale = object.scale || 1;
      return {
        id: object.uid,
        team: index === 0 ? 'team1' : 'team2',
        position: { x: object.position?.x || 0, z: object.position?.z || 0 },
        radius: TOWER_RADIUS_PER_SCALE * scale,
        height: TOWER_MODEL_HEIGHT * scale,
        health: TOWER_MAX_HEALTH,
        maxHealth: TOWER_MAX_HEALTH,
        custom: true
      };
    });
  }

  const offset = (map?.size || DEFAULT_MAP_SIZE) * 0.4;
  return ['team1', 'team2'].map((team, index) => ({
    id: `tower-${team}`,
    team,
    position: { x: index === 0 ? -offset : offset, z: index === 0 ? -offset : offset },
    radius: FALLBACK_TOWER_RADIUS,
    height: 42,
    health: TOWER_MAX_HEALTH,
    maxHealth: TOWER_MAX_HEALTH,
    custom: false
  }));
}

export const getTowerForTeam = (towers, team) => towers.find((tower) => tower.team === team) || null;

// Spawn point of a team: just outside its tower, on the side facing the middle of the map.
export function getSpawnPosition(tower, mapSize = DEFAULT_MAP_SIZE) {
  const length = Math.hypot(tower.position.x, tower.position.z);
  const dir = length > 1e-6 ? { x: -tower.position.x / length, z: -tower.position.z / length } : { x: 0, z: 1 };
  const distance = tower.radius + SPAWN_GAP;
  const limit = mapSize / 2 - 10;
  const clamp = (value) => Math.min(Math.max(value, -limit), limit);
  return { x: clamp(tower.position.x + dir.x * distance), y: 0, z: clamp(tower.position.z + dir.z * distance) };
}
