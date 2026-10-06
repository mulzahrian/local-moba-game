import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectManager } from '../character/effects.js';
import { playPowerSound } from '../character/characterSounds.js';
import { SKILL_SOUND_EFFECT } from './skillEffects.js';

function createDummy(color) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 2.2, 16), material);
  body.position.y = 1.1;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.65, 16, 12), material);
  head.position.y = 2.9;
  [body, head].forEach((mesh) => {
    mesh.castShadow = true;
    group.add(mesh);
  });
  return group;
}

/** Small viewer of the Skill Generator: a caster and a target dummy, with the chosen effect replayed on demand. */
export class SkillPreviewScene {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x120d08);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
    this.camera.position.set(16, 14, -12);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1.5, 10);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.05;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(10, 22, -8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 90 });
    this.scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(46, 64),
      new THREE.MeshStandardMaterial({ color: 0x2a1f14, roughness: 0.95 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const grid = new THREE.PolarGridHelper(46, 8, 9, 64, 0x6e5428, 0x3a2c18);
    grid.position.y = 0.02;
    this.scene.add(grid);

    this.caster = createDummy(0x4a7bd0);
    this.target = createDummy(0xd05a4a);
    this.target.position.z = 12;
    this.target.rotation.y = Math.PI;
    this.scene.add(this.caster, this.target);

    this.effects = new EffectManager(this.scene);
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

  // Plays the effect of a skill action definition (see toActionDef) from the caster towards the target.
  play(action) {
    if (!action?.effect) return;
    const range = action.range || action.healRadius || 6;
    this.target.position.z = Math.min(Math.max(range * 0.6, 8), 30);
    this.effects.spawn(action.effect, {
      position: { x: 0, y: 0, z: 0 },
      rotationY: 0,
      range,
      shape: action.shape || 'circle',
      model: this.caster,
      params: { arc: action.arc, width: action.width, radius: action.healRadius }
    });
    playPowerSound(SKILL_SOUND_EFFECT[action.power]);
  }

  animate = () => {
    this.frameId = requestAnimationFrame(this.animate);
    this.effects.update(Math.min(this.clock.getDelta(), 0.1));
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    this.effects.dispose();
    this.controls.dispose();
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) this.container.removeChild(this.renderer.domElement);
  }
}
