import { getAttackType, getGender } from '../../../shared/characterConfig.js';
import { audioService } from '../services/audioService.js';
import arrowPower from '../music/effect/power/arrow.mp3';
import fireBurstPower from '../music/effect/power/fire-burst.mp3';
import healingPower from '../music/effect/power/healing.mp3';
import iceNovaPower from '../music/effect/power/ice-nova.mp3';
import lightningPower from '../music/effect/power/lightning-strike.mp3';
import magicCirclePower from '../music/effect/power/magic-circle.mp3';
import meteorPower from '../music/effect/power/meteor.mp3';
import shadowVanishPower from '../music/effect/power/shadow-vanish.mp3';
import shockwavePower from '../music/effect/power/shockwave.mp3';
import slashPower from '../music/effect/power/slash.mp3';
import windPower from '../music/effect/power/wind.mp3';
import hitSfx from '../music/effect/vfx/hit.mp3';
import bowShootSfx from '../music/effect/vfx/bow-shoot.mp3';
import jumpSfx from '../music/effect/vfx/jump.mp3';
import knockSfx from '../music/effect/vfx/knock.mp3';
import pulledSfx from '../music/effect/vfx/pulled.mp3';
import punchSfx from '../music/effect/vfx/punch.mp3';
import runSfx from '../music/effect/vfx/run.mp3';
import slashSfx from '../music/effect/vfx/slash.mp3';
import hitFemaleVoice from '../music/effect/voice/hit-female.mp3';
import hitMaleVoice from '../music/effect/voice/hit-male.mp3';

// Sound(s) of every skill effect picked in the character generator (folder music/effect/power).
// Effects with several sounds play the first one at full volume and the others softer underneath.
const POWER_SOUNDS = {
  magicCircle: [magicCirclePower],
  fireBurst: [fireBurstPower],
  iceNova: [iceNovaPower],
  lightningStrike: [lightningPower],
  shadowVanish: [shadowVanishPower],
  slashArc: [slashPower],
  healingAura: [healingPower],
  windVortex: [windPower],
  shockwave: [shockwavePower],
  arrowVolley: [arrowPower],
  meteorFall: [meteorPower],
  flameArrow: [arrowPower, fireBurstPower],
  frostArrow: [arrowPower, iceNovaPower],
  thunderArrow: [arrowPower, lightningPower],
  windArrow: [arrowPower, windPower],
  arcaneCircleShot: [magicCirclePower],
  sigilBarrage: [magicCirclePower, shockwavePower],
  plasmaBeam: [magicCirclePower, lightningPower],
  homingOrbs: [magicCirclePower, windPower],
  crystalShards: [iceNovaPower, arrowPower],
  poisonCloud: [shadowVanishPower],
  holyLight: [healingPower],
  earthSpike: [shockwavePower],
  tidalWave: [windPower, shockwavePower],
  blackHole: [shadowVanishPower, windPower],
  flameTornado: [fireBurstPower, windPower],
  bloodNova: [shockwavePower, shadowVanishPower],
  runeSeal: [magicCirclePower],
  starfall: [meteorPower],
  staticField: [lightningPower]
};
const LAYER_VOLUME = 0.6;

// Basic attack sound by attack type, and the body sounds (folder music/effect/vfx).
const ATTACK_SOUNDS = { sword: slashSfx, punch: punchSfx, shot: bowShootSfx };
const REACTION_SOUNDS = { hit: hitSfx, knockback: knockSfx, pulled: pulledSfx };

// Hurt voice by gender (folder music/effect/voice).
const HIT_VOICES = { male: hitMaleVoice, female: hitFemaleVoice };

// Elemental effects intentionally use a small randomized pool so repeated casts do not sound
// identical. All entries are existing local SFX assets; no network audio is required.
const ELEMENTAL_SOUNDS = {
  elementFireBurst: [fireBurstPower, meteorPower, slashSfx, hitSfx],
  elementFireSpiral: [fireBurstPower, windPower, meteorPower],
  elementEmberRain: [fireBurstPower, meteorPower, hitSfx],
  elementMagmaRing: [shockwavePower, fireBurstPower, knockSfx],
  elementSolarFlare: [fireBurstPower, magicCirclePower, meteorPower],
  elementWindBlade: [windPower, slashPower, slashSfx],
  elementCycloneBurst: [windPower, shockwavePower, slashPower],
  elementAirCutter: [slashPower, windPower, bowShootSfx],
  elementStormEye: [windPower, lightningPower, magicCirclePower],
  elementFeatherGale: [windPower, bowShootSfx, slashSfx],
  elementStoneBurst: [shockwavePower, knockSfx, hitSfx],
  elementTectonicRing: [shockwavePower, magicCirclePower, knockSfx],
  elementCrystalWall: [iceNovaPower, magicCirclePower, hitSfx],
  elementBoulderField: [shockwavePower, meteorPower, knockSfx],
  elementQuakePulse: [shockwavePower, knockSfx, hitSfx],
  elementWaterWhirlpool: [windPower, healingPower, magicCirclePower],
  elementAquaLance: [arrowPower, windPower, bowShootSfx],
  elementTidalBurst: [windPower, shockwavePower, healingPower],
  elementBubblePrison: [magicCirclePower, healingPower, windPower],
  elementRainCrescent: [healingPower, windPower, slashPower],
  elementSparkBurst: [lightningPower, magicCirclePower, hitSfx],
  elementThunderField: [lightningPower, shockwavePower, magicCirclePower],
  elementChainLightning: [lightningPower, windPower, hitSfx],
  elementVoltNova: [lightningPower, fireBurstPower, shockwavePower],
  elementElectricCage: [lightningPower, magicCirclePower, knockSfx]
};

export const RUN_SOUND = runSfx;

/** Plays the sound of an action (attack1/2, skill1-3 via its effect, jump). `volume` is 0-1. */
export function playActionSound(def, slot, effectId, volume = 1) {
  if (slot === 'attack1' || slot === 'attack2') {
    audioService.playSfx(ATTACK_SOUNDS[getAttackType(def, slot)], volume);
  } else if (slot === 'jump') {
    audioService.playSfx(jumpSfx, volume);
  } else if (effectId) {
    playPowerSound(effectId, volume);
  }
}

/** Plays the impact sound plus the character's hurt voice (male / female) for hit, knockback and pulled. */
export function playReactionSound(def, reaction, volume = 1) {
  const sound = REACTION_SOUNDS[reaction];
  if (!sound) return;
  audioService.playSfx(sound, volume);
  audioService.playSfx(HIT_VOICES[getGender(def)], volume);
}

/** Skill effect sound on its own (used by the effect gallery in the character generator). */
export function playPowerSound(effectId, volume = 1) {
  const elemental = ELEMENTAL_SOUNDS[effectId];
  if (elemental) {
    audioService.playSfx(elemental[Math.floor(Math.random() * elemental.length)], volume);
    return;
  }
  (POWER_SOUNDS[effectId] || []).forEach((sound, i) => audioService.playSfx(sound, i === 0 ? volume : volume * LAYER_VOLUME));
}
