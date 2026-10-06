// Map rules shared by the map editor (client), the map API and the game server.

// Every map needs exactly this many towers: the two team bases (spawn point and the objective to destroy).
export const REQUIRED_TOWERS = 2;

// Objects from a "tower" main object in the object library carry `tower: true` when placed.
export const isTowerObject = (object) => object?.tower === true;

export const countTowers = (objects) => (objects || []).filter(isTowerObject).length;

// Background music a map can play during a match (files in client/src/music/play-list); 'none' = silent.
export const MUSIC_NONE = 'none';
export const MAP_MUSIC_TRACKS = ['list1', 'list2', 'list3', 'list4', 'list5'];
export const MAP_MUSIC_OPTIONS = [MUSIC_NONE, ...MAP_MUSIC_TRACKS];

export const sanitizeMusic = (music) => (MAP_MUSIC_TRACKS.includes(music) ? music : MUSIC_NONE);

export const DEFAULT_MAP_SIZE = 500;
export const TOWER_MAX_HEALTH = 300;
export const TOWER_MODEL_HEIGHT = 20; // towers are auto-fitted to this size (default size of tower objects) before their scale
export const TOWER_RADIUS_PER_SCALE = 8; // approximate footprint radius used for hit detection and spawning
const FALLBACK_TOWER_RADIUS = 20; // maps without placed towers use the default corner bases
const SPAWN_GAP = 10; // distance between a tower's edge and its team's spawn point
const SPAWN_SPACING = 4; // distance between teammates spawning side by side

/**
 * The two bases of a map: the first placed tower belongs to team1 (the host), the second to team2.
 * Maps without exactly two towers (the default arena, maps saved before towers existed) fall back
 * to bases in opposite corners.
 */
export function buildTowers(map) {
  const placed = (map?.objects || []).filter(isTowerObject);
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
// `slot` is the teammate's index (0-4): teammates line up side by side so nobody spawns inside another player.
export function getSpawnPosition(tower, mapSize = DEFAULT_MAP_SIZE, slot = 0) {
  const length = Math.hypot(tower.position.x, tower.position.z);
  const dir = length > 1e-6 ? { x: -tower.position.x / length, z: -tower.position.z / length } : { x: 0, z: 1 };
  const distance = tower.radius + SPAWN_GAP;
  const limit = mapSize / 2 - 10;
  const clamp = (value) => Math.min(Math.max(value, -limit), limit);
  const side = Math.ceil(slot / 2) * (slot % 2 === 1 ? 1 : -1) * SPAWN_SPACING; // 0, +1, -1, +2, -2 ...
  return {
    x: clamp(tower.position.x + dir.x * distance - dir.z * side),
    y: 0,
    z: clamp(tower.position.z + dir.z * distance + dir.x * side)
  };
}
