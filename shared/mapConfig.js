// Map rules shared by the map editor (client), the map API and the game server.

// Every map needs exactly this many towers: each team has a main tower (its base: the spawn point and the
// objective to destroy) and one side tower.
export const TOWERS_PER_TEAM = 2;
export const TOWER_TEAMS = ['team1', 'team2'];
export const REQUIRED_TOWERS = TOWERS_PER_TEAM * TOWER_TEAMS.length;

// Objects from a "tower" main object in the object library carry `tower: true` when placed. The map editor
// also stores `team` ('team1' | 'team2'), `main` (true for the team's main tower) and an optional `towerHealth`.
export const isTowerObject = (object) => object?.tower === true;

export const countTowers = (objects) => (objects || []).filter(isTowerObject).length;

// Stats of a tower by kind. Towers shoot the closest enemy in range (the one hitting them first).
export const TOWER_KINDS = {
  main: { health: 600, damage: 16, range: 40, cooldown: 1.2 },
  side: { health: 300, damage: 11, range: 32, cooldown: 1.4 }
};
export const TOWER_HEALTH = { min: 50, max: 5000, step: 10 };
export const clampTowerHealth = (value, fallback) => {
  const health = Math.round(Number(value));
  return Number.isFinite(health) && health > 0 ? Math.min(TOWER_HEALTH.max, Math.max(TOWER_HEALTH.min, health)) : fallback;
};

const hasTeam = (object) => TOWER_TEAMS.includes(object?.team);

// Team and kind a newly placed tower gets: the team with fewer towers, as its main tower when it has none yet.
export function nextTowerSettings(objects) {
  const towers = (objects || []).filter((o) => isTowerObject(o) && hasTeam(o));
  const count = (team) => towers.filter((o) => o.team === team).length;
  const team = count('team2') < count('team1') ? 'team2' : 'team1';
  return { team, main: !towers.some((o) => o.team === team && o.main) };
}

// Gives towers without settings (maps saved before teams existed) a team and kind, in placement order.
export function completeTowerSettings(objects) {
  const known = (objects || []).filter((o) => isTowerObject(o) && hasTeam(o));
  return (objects || []).map((object) => {
    if (!isTowerObject(object) || hasTeam(object)) return object;
    const completed = { ...object, ...nextTowerSettings(known) };
    known.push(completed);
    return completed;
  });
}

// null when the towers are valid, otherwise why not: 'count', 'teams' (not 2 per team) or 'main' (not 1 main per team).
export function validateTowers(objects) {
  const towers = completeTowerSettings(objects).filter(isTowerObject);
  if (towers.length !== REQUIRED_TOWERS) return 'count';
  const of = (team) => towers.filter((o) => o.team === team);
  if (TOWER_TEAMS.some((team) => of(team).length !== TOWERS_PER_TEAM)) return 'teams';
  if (TOWER_TEAMS.some((team) => of(team).filter((o) => o.main).length !== 1)) return 'main';
  return null;
}

// Background music a map can play during a match (files in client/src/music/play-list); 'none' = silent.
export const MUSIC_NONE = 'none';
export const MAP_MUSIC_TRACKS = ['list1', 'list2', 'list3', 'list4', 'list5'];
export const MAP_MUSIC_OPTIONS = [MUSIC_NONE, ...MAP_MUSIC_TRACKS];

export const sanitizeMusic = (music) => (MAP_MUSIC_TRACKS.includes(music) ? music : MUSIC_NONE);

export const DEFAULT_MAP_SIZE = 500;
export const TOWER_MODEL_HEIGHT = 20; // towers are auto-fitted to this size (default size of tower objects) before their scale
export const TOWER_RADIUS_PER_SCALE = 8; // approximate footprint radius used for hit detection and spawning
const FALLBACK_TOWER_RADIUS = 20; // maps without placed towers use the default corner bases
const SPAWN_GAP = 10; // distance between a tower's edge and its team's spawn point
const SPAWN_SPACING = 4; // distance between teammates spawning side by side

const towerStats = (main, health) => {
  const kind = main ? TOWER_KINDS.main : TOWER_KINDS.side;
  const maxHealth = clampTowerHealth(health, kind.health);
  return {
    main,
    health: maxHealth,
    maxHealth,
    attackDamage: kind.damage,
    attackRange: kind.range,
    attackCooldown: kind.cooldown
  };
};

/**
 * The towers of a map: every team has a main tower (its base; destroying it wins the match) and may have a
 * side tower. Placed towers without a team (maps saved with just two towers) become one main tower per team
 * in placement order. Maps without usable towers (the default arena) fall back to main towers in opposite corners.
 */
export function buildTowers(map) {
  const placed = completeTowerSettings((map?.objects || []).filter(isTowerObject));
  const playable = TOWER_TEAMS.every((team) => {
    const mine = placed.filter((o) => o.team === team);
    return mine.length >= 1 && mine.length <= TOWERS_PER_TEAM && mine.filter((o) => o.main).length === 1;
  });
  if (playable) {
    return placed.map((object) => {
      const scale = object.scale || 1;
      return {
        id: object.uid,
        team: object.team,
        position: { x: object.position?.x || 0, z: object.position?.z || 0 },
        radius: TOWER_RADIUS_PER_SCALE * scale,
        height: TOWER_MODEL_HEIGHT * scale,
        ...towerStats(Boolean(object.main), object.towerHealth),
        custom: true
      };
    });
  }

  const offset = (map?.size || DEFAULT_MAP_SIZE) * 0.4;
  return TOWER_TEAMS.map((team, index) => ({
    id: `tower-${team}`,
    team,
    position: { x: index === 0 ? -offset : offset, z: index === 0 ? -offset : offset },
    radius: FALLBACK_TOWER_RADIUS,
    height: 42,
    ...towerStats(true),
    custom: false
  }));
}

// The team's main tower: its base, where its players spawn.
export const getTowerForTeam = (towers, team) =>
  towers.find((tower) => tower.team === team && tower.main) || towers.find((tower) => tower.team === team) || null;

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
