import * as THREE from 'three';
import { CharacterActor } from '../character/CharacterActor.js';
import { CHARACTER_HEIGHT, setModelOpacity } from '../character/characterAssets.js';

const POSITION_SMOOTHING = 12; // higher = the drawn entity catches up with the server position faster
const SNAP_DISTANCE_SQ = 25 * 25; // farther than this (teleport) skips the smoothing
const TURN_SMOOTHING = 14;
const DEAD_HOLD_SECONDS = 1.6; // how long a defeated monster lies there before it fades
const FADE_SECONDS = 1;
const BOB_HEIGHT = 0.25;

const shortestAngle = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/**
 * A monster or summoned unit in the game scene: an animated GLB (idle / run or flight / attacks / dead)
 * with a health bar. The server owns where it is; it only glides towards the positions it is sent.
 */
export class WorldActor {
  constructor({ id, kind, gltf, def, position, rotationY = 0, scale = 1, hover = 0, health, maxHealth, color = 0xc0392b, ringColor = null }) {
    this.id = id;
    this.kind = kind;
    this.health = health;
    this.maxHealth = maxHealth;
    this.color = color;
    this.hover = hover;
    this.dead = false;
    this.finished = false; // true once the entity has faded away and can be removed
    this.deadTime = 0;
    this.time = Math.random() * 10;
    this.targetRotation = rotationY;
    this.targetPosition = new THREE.Vector3(position.x, 0, position.z);

    this.actor = new CharacterActor(gltf, { animations: def.animations, scale: (def.scale || 1) * scale });
    this.model = this.actor.model;
    this.model.rotation.y = rotationY;
    this.height = CHARACTER_HEIGHT * (def.scale || 1) * scale + hover;

    this.group = new THREE.Group();
    this.group.position.copy(this.targetPosition);
    this.group.add(this.model);

    if (ringColor !== null) {
      const radius = Math.max(1, this.height * 0.3);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius, radius * 1.25, 28),
        new THREE.MeshBasicMaterial({ color: ringColor, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      this.ring = ring;
      this.group.add(ring);
    }

    this.canvas = document.createElement('canvas');
    this.canvas.width = 128;
    this.canvas.height = 16;
    this.bar = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(this.canvas), transparent: true, depthTest: false })
    );
    this.bar.scale.set(Math.max(2.4, this.height * 0.5), 0.32, 1);
    this.bar.position.y = this.height + 0.8;
    this.bar.renderOrder = 10;
    this.group.add(this.bar);
    this.drawBar();
  }

  drawBar() {
    const ctx = this.canvas.getContext('2d');
    const { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = `#${this.color.toString(16).padStart(6, '0')}`;
    const fraction = Math.min(1, Math.max(0, this.health / (this.maxHealth || 1)));
    ctx.fillRect(2, 2, (width - 4) * fraction, height - 4);
    this.bar.material.map.needsUpdate = true;
  }

  setHealth(health, maxHealth = this.maxHealth) {
    if (health === this.health && maxHealth === this.maxHealth) return;
    this.health = health;
    this.maxHealth = maxHealth;
    this.drawBar();
  }

  // Server update: where the entity is, which way it faces, whether it is walking and its health.
  setState({ x, z, r, m, h }) {
    if (this.dead) return;
    this.targetPosition.set(x, 0, z);
    if (r !== undefined) this.targetRotation = r;
    this.actor.setMoving(Boolean(m));
    if (h !== undefined) this.setHealth(h);
  }

  faceTowards(x, z) {
    const dx = x - this.group.position.x;
    const dz = z - this.group.position.z;
    if (Math.hypot(dx, dz) > 1e-3) this.targetRotation = Math.atan2(dx, dz);
  }

  attack(slot, x, z) {
    if (this.dead) return;
    this.faceTowards(x, z);
    this.model.rotation.y = this.targetRotation;
    if (!this.actor.play(slot)) this.actor.play('attack1');
  }

  // Defeated: monsters play their death clip and lie there for a moment, then everything fades away.
  die(withAnimation = true) {
    if (this.dead) return;
    this.dead = true;
    this.actor.setMoving(false);
    this.deadTime = withAnimation && this.actor.play('dead', { hold: true }) ? 0 : DEAD_HOLD_SECONDS;
    this.bar.visible = false;
  }

  update(delta) {
    this.time += delta;
    this.actor.update(delta);

    if (this.dead) {
      this.deadTime += delta;
      const fade = (this.deadTime - DEAD_HOLD_SECONDS) / FADE_SECONDS;
      if (fade > 0) {
        setModelOpacity(this.model, Math.max(0, 1 - fade));
        if (this.ring) this.ring.material.opacity = 0.8 * Math.max(0, 1 - fade);
      }
      if (fade >= 1) this.finished = true;
      return;
    }

    const blend = 1 - Math.exp(-POSITION_SMOOTHING * delta);
    if (this.group.position.distanceToSquared(this.targetPosition) > SNAP_DISTANCE_SQ) this.group.position.copy(this.targetPosition);
    else this.group.position.lerp(this.targetPosition, blend);

    const turn = shortestAngle(this.model.rotation.y, this.targetRotation);
    this.model.rotation.y += turn * (1 - Math.exp(-TURN_SMOOTHING * delta));

    if (this.hover) this.model.position.y = this.actor.baseY + this.hover + Math.sin(this.time * 2.4) * BOB_HEIGHT;
  }

  dispose() {
    this.actor.dispose();
    this.group.parent?.remove(this.group);
    this.bar.material.map.dispose();
    this.bar.material.dispose();
    this.ring?.geometry.dispose();
    this.ring?.material.dispose();
  }
}
