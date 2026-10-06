import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CharacterActor } from './CharacterActor.js';
import { EffectManager } from './effects.js';
import { playActionSound, playPowerSound, playReactionSound } from './characterSounds.js';

const PREVIEW_EFFECT_RANGE = 9; // real skill ranges are too large to frame in the small preview

/** Small standalone 3D viewer used by the character generator to preview animations and skill effects. */
export class CharacterPreviewScene {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x120d08);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
    this.camera.position.set(0, 4.5, 13);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1.8, 0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 40;
    this.controls.maxPolarAngle = Math.PI / 2.05;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(8, 16, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 60 });
    this.scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(16, 64),
      new THREE.MeshStandardMaterial({ color: 0x2a1f14, roughness: 0.95 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const grid = new THREE.PolarGridHelper(16, 8, 8, 64, 0x6e5428, 0x3a2c18);
    grid.position.y = 0.02;
    this.scene.add(grid);

    this.effects = new EffectManager(this.scene);
    this.actor = null;
    this.profile = null;
    this.gltf = null;
    this.clock = new THREE.Clock();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.animate();
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  // (Re)creates the character; call again when the size multiplier changes.
  setCharacter(gltf, def) {
    this.gltf = gltf;
    if (this.actor) {
      this.scene.remove(this.actor.model);
      this.actor.dispose();
    }
    this.actor = new CharacterActor(gltf, def);
    this.scene.add(this.actor.model);
  }

  clearCharacter() {
    if (!this.actor) return;
    this.scene.remove(this.actor.model);
    this.actor.dispose();
    this.actor = null;
  }

  setAnimations(animations) {
    this.actor?.setAnimations(animations);
  }

  // Gender and attack types decide which voice / attack sounds the preview plays.
  setProfile(profile) {
    this.profile = profile;
  }

  // Plays the clip assigned to `slot` (idle / run loop, everything else plays once) and its sound.
  playSlot(slot) {
    if (!this.actor) return false;
    if (slot === 'idle' || slot === 'run') {
      this.actor.endOneShot();
      this.actor.setMoving(slot === 'run');
      return this.actor.hasAnimation(slot);
    }
    playActionSound(this.profile, slot, null);
    playReactionSound(this.profile, slot);
    return this.actor.play(slot);
  }

  playEffect(id, def) {
    if (!id || id === 'none' || !this.actor) return;
    playPowerSound(id);
    this.effects.spawn(id, {
      position: { x: 0, y: 0, z: 0 },
      rotationY: 0,
      range: Math.min(def?.range ?? PREVIEW_EFFECT_RANGE, PREVIEW_EFFECT_RANGE * 1.5),
      shape: def?.shape || 'circle',
      model: this.actor.model
    });
  }

  animate = () => {
    this.frameId = requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.1);
    this.actor?.update(delta);
    this.effects.update(delta);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    this.effects.dispose();
    this.actor?.dispose();
    this.controls.dispose();
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) this.container.removeChild(this.renderer.domElement);
  }
}
