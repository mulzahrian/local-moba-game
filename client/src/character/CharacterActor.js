import * as THREE from 'three';
import { findClip, instantiateCharacter } from './characterAssets.js';

const FADE = 0.15;
const MAX_ONE_SHOT_SECONDS = 4;

/**
 * One animated character instance: owns the cloned model, maps animation slots (idle, run, attack1...)
 * to the clips chosen in the character generator, and blends between locomotion and one-shot actions.
 */
export class CharacterActor {
  constructor(gltf, def) {
    this.def = def;
    this.clips = gltf.animations;
    const { model, scale } = instantiateCharacter(gltf, def);
    this.model = model;
    this.scale = scale;
    this.mixer = new THREE.AnimationMixer(model);

    this.buildActions(def.animations);

    this.moving = false;
    this.current = null; // action currently weighted in (locomotion or one-shot)
    this.oneShot = null; // { slot, action, time }

    this.mixer.addEventListener('finished', (event) => {
      if (this.oneShot && event.action === this.oneShot.action) this.endOneShot();
    });

    this.crossFadeTo(this.locomotionAction());
  }

  // Maps animation slots to the clips chosen in the character generator.
  buildActions(animations) {
    this.slotActions = {};
    Object.entries(animations || {}).forEach(([slot, name]) => {
      const clip = findClip(this.clips, name);
      if (clip) this.slotActions[slot] = this.mixer.clipAction(clip);
    });
  }

  // Re-maps the slots on a live actor (used by the character editor preview).
  setAnimations(animations) {
    this.mixer.stopAllAction();
    this.current = null;
    this.oneShot = null;
    this.buildActions(animations);
    this.crossFadeTo(this.locomotionAction());
  }

  locomotionAction() {
    const { idle, run } = this.slotActions;
    return (this.moving ? run || idle : idle || run) || null;
  }

  crossFadeTo(next) {
    if (next === this.current) return;
    if (next) next.reset().setEffectiveWeight(1).fadeIn(FADE).play();
    if (this.current) this.current.fadeOut(FADE);
    this.current = next;
  }

  setMoving(moving) {
    if (this.moving === moving) return;
    this.moving = moving;
    if (!this.oneShot) this.crossFadeTo(this.locomotionAction());
    else if (moving && this.oneShot.slot === 'emote') this.endOneShot();
  }

  hasAnimation(slot) {
    return Boolean(this.slotActions[slot]);
  }

  // Plays the clip assigned to `slot` once, then returns to idle/run. Returns false if none is assigned.
  play(slot) {
    const action = this.slotActions[slot];
    if (!action) return false;
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    this.oneShot = { slot, action, time: 0 };
    if (this.current === action) action.reset().setEffectiveWeight(1).play(); // replaying the clip that is already active
    else this.crossFadeTo(action);
    return true;
  }

  endOneShot() {
    this.oneShot = null;
    this.crossFadeTo(this.locomotionAction());
  }

  update(delta) {
    this.mixer.update(delta);
    if (this.oneShot) {
      this.oneShot.time += delta;
      if (this.oneShot.time > MAX_ONE_SHOT_SECONDS) this.endOneShot();
    }
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
  }
}
