import { FLIGHT_HEIGHT } from '../../../shared/monsterConfig.js';
import { monsterApi } from './monsterApi.js';

// Monster definitions as the game needs them: `scale` + `animations` drive CharacterActor, the rest is display data.
const cache = new Map();

export function toActorDefinition(monster) {
  return {
    ...monster,
    scale: monster.params.scale,
    hover: monster.movement === 'flight' ? FLIGHT_HEIGHT : 0
  };
}

export function getMonsterDefinition(id) {
  if (!cache.has(id)) {
    const request = monsterApi.get(id).then(toActorDefinition);
    request.catch(() => cache.delete(id));
    cache.set(id, request);
  }
  return cache.get(id);
}

export function invalidateMonster(id) {
  cache.delete(id);
}
