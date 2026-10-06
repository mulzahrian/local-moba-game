// Map rules shared by the map editor (client) and the map API (server).

// Every map needs exactly this many towers: the two team bases (spawn point and the objective to destroy).
export const TOWER_TYPE = 'tower';
export const REQUIRED_TOWERS = 2;

export const countTowers = (objects) => (objects || []).filter((o) => o?.type === TOWER_TYPE).length;
