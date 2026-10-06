import { MAX_EQUIPPED_SKILLS, toActionDef } from '../../shared/skillConfig.js';
import skillStore from './SkillStore.js';

// Combat definitions of the skills each player equipped (kept off the player object, which is sent to the clients).
const loadouts = new WeakMap();

export const getSkillDef = (player, skillId) => loadouts.get(player)?.get(skillId) || null;

// Equips up to MAX_EQUIPPED_SKILLS skills (ids that no longer exist are dropped); player.loadout lists the ids.
export async function setLoadout(player, skillIds) {
  const ids = [...new Set(Array.isArray(skillIds) ? skillIds : [])].slice(0, MAX_EQUIPPED_SKILLS);
  const defs = new Map();
  for (const id of ids) {
    const skill = await skillStore.get(id);
    if (skill) defs.set(id, toActionDef(skill));
  }
  loadouts.set(player, defs);
  player.loadout = [...defs.keys()];
  return player.loadout;
}
