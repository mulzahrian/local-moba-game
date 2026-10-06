import { toActionDef } from '../../../shared/skillConfig.js';
import { skillApi } from './skillApi.js';

// Skills of the server's library, loaded once and shared by the HUD, the inventory and the game scene.
let skills = new Map();
let libraryPromise = null;

function fetchLibrary() {
  return skillApi
    .list()
    .then((list) => {
      skills = new Map(list.map((skill) => [skill.id, skill]));
    })
    .catch((error) => {
      console.error('[Skills] Could not load the skill library:', error);
      skills = new Map();
    });
}

export function ensureSkillLibrary() {
  if (!libraryPromise) libraryPromise = fetchLibrary();
  return libraryPromise;
}

export function refreshSkillLibrary() {
  libraryPromise = fetchLibrary();
  return libraryPromise;
}

export const listSkills = () => [...skills.values()];
export const getSkill = (id) => skills.get(id) || null;

// Combat definition (cost, cooldown, range, ...) of a skill, or null when it is not in the library.
export function getSkillAction(id) {
  const skill = skills.get(id);
  return skill ? toActionDef(skill) : null;
}
