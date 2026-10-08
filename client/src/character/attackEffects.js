import * as THREE from 'three';
import { Fx, TAU, clamp01, easeOut, rand, registerEffects } from './effects.js';
import './shotEffects.js';
import './areaEffects.js';
import './elementalEffects.js';

/**
 * Effects of the basic attacks (attack 1 and attack 2) for every attack type: sword slashes,
 * punch impacts and shots. Attack 2 is the heavier / mirrored follow-up of attack 1.
 */

const HAND_HEIGHT = 1.6;

// Crescent slash in a tilted plane; attack 2 swings back the other way.
function slash(range, mirror) {
  const length = Math.min(Math.max(range * 0.9, 4), 8);
  const fx = new Fx(0.5);
  const arc = (Math.PI * 2) / 3;
  const start = -Math.PI / 2 - arc / 2;
  const tilt = fx.add(new THREE.Group());
  tilt.position.y = HAND_HEIGHT;
  tilt.rotation.z = mirror ? -0.55 : 0.55;
  const pivot = new THREE.Group();
  tilt.add(pivot);
  const blade = new THREE.Mesh(new THREE.RingGeometry(length * 0.6, length, 40, 1, start, arc), fx.material(0xf4fbff, 0.95));
  const edge = new THREE.Mesh(new THREE.RingGeometry(length * 0.93, length, 40, 1, start, arc), fx.material(0xffffff, 1));
  const trail = new THREE.Mesh(new THREE.RingGeometry(length * 0.4, length * 0.98, 40, 1, start, arc), fx.material(0x7ac8ff, 0.4));
  [trail, blade, edge].forEach((mesh) => {
    mesh.rotation.x = -Math.PI / 2;
    pivot.add(mesh);
  });
  const sparks = fx.particles(16, 0xdff4ff, 0.45);
  const seeds = Array.from({ length: 16 }, () => ({ f: rand(0, 1), r: rand(0.7, 1.05), up: rand(-0.6, 0.6) }));
  const dir = mirror ? -1 : 1;
  fx.tick = (t) => {
    const p = easeOut(t / 0.28);
    pivot.rotation.y = (0.65 - p * 1.3) * 1.1 * dir;
    pivot.scale.setScalar(0.75 + p * 0.25);
    seeds.forEach((s, i) => {
      const a = pivot.rotation.y + (s.f - 0.5) * arc * 0.6;
      sparks.set(i, Math.sin(a) * length * s.r, HAND_HEIGHT + s.up, Math.cos(a) * length * s.r);
    });
    sparks.commit();
  };
  return fx;
}

// A fist that shoots forward and hits with a shock ring; attack 2 hits harder with a ground ring and dust.
function punch(range, heavy) {
  const reach = Math.min(Math.max(range * 0.45, 2.5), 4.5);
  const fx = new Fx(heavy ? 0.7 : 0.55);
  const fist = fx.add(new THREE.Mesh(new THREE.SphereGeometry(heavy ? 0.5 : 0.38, 12, 8), fx.material(0xfff0d0, 0.95)));
  const aura = fx.add(new THREE.Mesh(new THREE.SphereGeometry(heavy ? 1 : 0.75, 12, 8), fx.material(0xff9a3a, 0.45)));
  const flash = fx.add(new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), fx.material(0xffd27a, 0.8)));
  const rings = (heavy ? [0, 0.08] : [0]).map((delay, i) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32), fx.material(i ? 0xff9a3a : 0xffffff, 0.9));
    ring.position.set(0, HAND_HEIGHT, reach);
    return { delay, mesh: fx.add(ring) };
  });
  const ground = heavy ? fx.ring(0.85, 1, 0xffc27a, 0.8) : null;
  const trail = fx.particles(6, 0xffc27a, 0.6);
  const sparks = fx.particles(20, 0xffe6b0, 0.5);
  const seeds = Array.from({ length: 20 }, () => {
    const a = rand(0, TAU);
    const b = rand(-0.9, 0.9);
    return { x: Math.cos(a) * Math.cos(b), y: Math.sin(b), z: Math.sin(a) * Math.cos(b) * 0.6 + 0.4, s: rand(0.7, 1.5) };
  });
  const HIT = 0.1;
  const power = heavy ? 1.5 : 1;
  fx.tick = (t) => {
    const u = clamp01(t / HIT);
    const z = 0.8 + (reach - 0.8) * easeOut(u);
    const x = heavy ? (1 - u) * 1.4 : 0; // the heavy punch swings in from the side
    fist.visible = aura.visible = t < HIT + 0.06;
    fist.position.set(x, HAND_HEIGHT, z);
    aura.position.copy(fist.position);
    for (let i = 0; i < 6; i++) {
      if (t >= HIT) {
        trail.set(i, 0, -60, 0);
        continue;
      }
      const back = Math.max(0.8, z - i * 0.35);
      const progress = clamp01((back - 0.8) / (reach - 0.8));
      trail.set(i, heavy ? (1 - progress) * 1.4 : 0, HAND_HEIGHT, back);
    }
    trail.commit();

    const hit = clamp01((t - HIT) / 0.3);
    flash.visible = t >= HIT && hit < 1;
    flash.position.set(0, HAND_HEIGHT, reach);
    flash.scale.setScalar(Math.max(0.01, power * (0.3 + easeOut(hit) * 0.9)));
    rings.forEach(({ delay, mesh }) => {
      const r = clamp01((t - HIT - delay) / 0.3);
      mesh.visible = t >= HIT + delay && r < 1;
      mesh.scale.setScalar(Math.max(0.01, power * (0.4 + easeOut(r) * 2.2)));
    });
    if (ground) {
      ground.position.z = reach;
      ground.visible = t >= HIT;
      ground.scale.setScalar(Math.max(0.01, 3.2 * easeOut(clamp01((t - HIT) / 0.35))));
    }
    seeds.forEach((s, i) => {
      if (t < HIT) {
        sparks.set(i, 0, -60, 0);
        return;
      }
      const d = easeOut((t - HIT) / 0.4) * 2.6 * s.s * power;
      sparks.set(i, s.x * d, HAND_HEIGHT + s.y * d, reach + s.z * d * 0.5);
    });
    sparks.commit();
  };
  return fx;
}

const BUILDERS = {
  attackSword1: ({ range }) => slash(range, false),
  attackSword2: ({ range }) => slash(range, true),
  attackPunch1: ({ range }) => punch(range, false),
  attackPunch2: ({ range }) => punch(range, true)
};

const LABELS = {
  attackSword1: { en: 'Sword Slash 1', id: 'Tebasan Pedang 1' },
  attackSword2: { en: 'Sword Slash 2', id: 'Tebasan Pedang 2' },
  attackPunch1: { en: 'Punch 1', id: 'Pukulan 1' },
  attackPunch2: { en: 'Punch 2', id: 'Pukulan 2' },
  attackShot1: { en: 'Shot 1', id: 'Tembakan 1' },
  attackShot2: { en: 'Shot 2', id: 'Tembakan 2' }
};

registerEffects(BUILDERS, LABELS);

const ATTACK_EFFECT_PREFIX = { sword: 'attackSword', punch: 'attackPunch', shot: 'attackShot' };

/** Effect id of a basic attack: its attack type plus 1 (attack1) or 2 (attack2). */
export function attackEffectId(attackType, slot) {
  return `${ATTACK_EFFECT_PREFIX[attackType] || ATTACK_EFFECT_PREFIX.sword}${slot === 'attack2' ? 2 : 1}`;
}
