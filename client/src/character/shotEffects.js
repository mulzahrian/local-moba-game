import * as THREE from 'three';
import { Fx, TAU, clamp01, easeOut, rand, registerEffects } from './effects.js';

/**
 * Shooting effects: arrows and magic bolts that fly forward (+Z) from the caster, some of them
 * coming out of a magic circle that opens in front of the caster. Used by skills and by shot attacks.
 */

const MUZZLE_HEIGHT = 1.6;
const TRAIL_POINTS = 8;
const HIDDEN_Y = -60;

export const shotReach = (range) => Math.min(Math.max(range, 8), 40);

// Vertical magic circle (faces +Z) that spins in front of the caster.
function sigil(fx, size, colorA, colorB) {
  const group = fx.add(new THREE.Group());
  group.position.set(0, MUZZLE_HEIGHT, 2.2);
  const ringMaterial = fx.material(colorA, 0.95);
  group.add(new THREE.Mesh(new THREE.RingGeometry(size * 0.92, size, 48), ringMaterial));
  group.add(new THREE.Mesh(new THREE.RingGeometry(size * 0.55, size * 0.6, 48), fx.material(colorB, 0.8)));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(size * 0.92, 40), fx.material(colorA, 0.14));
  disc.position.z = -0.02;
  group.add(disc);
  const spinner = new THREE.Group();
  const lineMaterial = fx.lineMaterial(colorB);
  [0, Math.PI / 3].forEach((offset) => {
    const points = [0, 1, 2].map((i) => {
      const a = offset + (i * TAU) / 3;
      return new THREE.Vector3(Math.cos(a) * size * 0.88, Math.sin(a) * size * 0.88, 0);
    });
    spinner.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), lineMaterial));
  });
  const runeMaterial = fx.material(0xffffff, 0.9);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    const rune = new THREE.Mesh(new THREE.BoxGeometry(size * 0.06, size * 0.14, 0.02), runeMaterial);
    rune.position.set(Math.cos(a) * size * 0.76, Math.sin(a) * size * 0.76, 0);
    rune.rotation.z = a;
    spinner.add(rune);
  }
  group.add(spinner);
  return {
    group,
    update(t) {
      group.scale.setScalar(Math.max(0.01, 0.2 + 0.8 * easeOut(t / 0.2)));
      spinner.rotation.z = t * 2.4;
    }
  };
}

// Projectile heads are modelled along +Z.
function buildHead(kind, fx, colors, size) {
  const head = new THREE.Group();
  const core = fx.material(colors.core, 0.95);
  const tip = fx.material(colors.tip ?? colors.core, 0.95);
  const glow = fx.material(colors.glow, 0.5);
  if (kind === 'arrow') {
    const shaftGeometry = new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6).rotateX(Math.PI / 2);
    const tipGeometry = new THREE.ConeGeometry(0.2, 0.6, 6).rotateX(Math.PI / 2).translate(0, 0, 1.4);
    const auraGeometry = new THREE.CylinderGeometry(0.3, 0.05, 3, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, -1.2);
    head.add(new THREE.Mesh(shaftGeometry, core), new THREE.Mesh(tipGeometry, tip), new THREE.Mesh(auraGeometry, glow));
    [0, Math.PI / 2].forEach((a) => {
      const fin = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), glow);
      fin.position.z = -1;
      fin.rotation.z = a;
      head.add(fin);
    });
  } else if (kind === 'orb') {
    head.add(new THREE.Mesh(new THREE.SphereGeometry(size, 14, 10), core));
    head.add(new THREE.Mesh(new THREE.SphereGeometry(size * 1.9, 14, 10), glow));
  } else {
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), core);
    shard.scale.set(0.6, 0.6, 2.4);
    const halo = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), glow);
    halo.scale.set(1, 1, 3.4);
    head.add(shard, halo);
  }
  return head;
}

/**
 * Generic volley: `count` projectiles fired in a fan (`fan` radians) or side by side (`spread`),
 * optionally leaving a spiral / jittery particle trail and curving out and back (`curve`).
 */
function volley({ range, style }) {
  const {
    kind = 'arrow', size = 0.4, colors, count = 1, fan = 0, spread = 0, stagger = 0.06, speed = 75,
    circle = null, trail, curve = 0, spin = 0, pulse = 0, impact = 1.4
  } = style;
  const length = shotReach(range);
  const startZ = circle ? 2.4 : 1.2;
  const travel = length / speed;
  const fx = new Fx(0.3 + (count - 1) * stagger + travel + 0.3);

  const sigilFx = circle ? sigil(fx, circle.size, circle.a, circle.b) : null;
  const muzzle = fx.add(new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), fx.material(colors.glow, 0.8)));
  muzzle.position.set(0, MUZZLE_HEIGHT, startZ);

  const trailParticles = fx.particles(count * TRAIL_POINTS, trail.color, trail.size, trail.additive ?? true);
  const trailSeeds = Array.from({ length: count * TRAIL_POINTS }, () => [rand(-1, 1), rand(-1, 1)]);

  const shots = Array.from({ length: count }, (_, i) => {
    const mid = (count - 1) / 2;
    const fraction = count > 1 ? (i - mid) / mid : 0;
    const holder = fx.add(new THREE.Group());
    const spinner = new THREE.Group();
    const head = buildHead(kind, fx, colors, size);
    spinner.add(head);
    holder.add(spinner);
    holder.visible = false;
    const burst = fx.add(new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), fx.material(colors.glow, 0.7)));
    burst.visible = false;
    return {
      holder, spinner, head, burst, index: i,
      angle: fraction * fan * 0.5,
      lateral: fraction * spread,
      side: i % 2 ? -1 : 1,
      delay: 0.12 + i * stagger
    };
  });

  const curveAmplitude = curve * length * 0.12;
  const pathAt = (shot, distance) => {
    const u = clamp01((distance - startZ) / (length - startZ));
    const offset = shot.lateral + shot.side * curveAmplitude * Math.sin(Math.PI * u);
    const sin = Math.sin(shot.angle);
    const cos = Math.cos(shot.angle);
    return { x: sin * distance + cos * offset, z: cos * distance - sin * offset };
  };

  fx.tick = (t) => {
    sigilFx?.update(t);
    const flash = clamp01(1 - t / 0.25);
    muzzle.visible = flash > 0;
    muzzle.scale.setScalar(0.3 + (1 - flash) * 0.9);

    shots.forEach((shot) => {
      const local = t - shot.delay;
      const u = local / travel;
      const live = u > 0 && u < 1;
      const distance = startZ + clamp01(u) * (length - startZ);
      const { x, z } = pathAt(shot, distance);
      shot.holder.visible = live;
      shot.holder.position.set(x, MUZZLE_HEIGHT, z);
      shot.holder.rotation.y = shot.angle;
      if (spin) shot.spinner.rotation.z = t * spin;
      if (pulse) shot.head.scale.setScalar(1 + Math.sin(t * 40 + shot.index) * pulse);

      const hit = clamp01((local - travel) / 0.25);
      shot.burst.visible = local >= travel && hit < 1;
      shot.burst.position.set(x, MUZZLE_HEIGHT, z);
      shot.burst.scale.setScalar(Math.max(0.01, impact * (0.2 + easeOut(hit))));

      for (let k = 0; k < TRAIL_POINTS; k++) {
        const slot = shot.index * TRAIL_POINTS + k;
        const back = distance - k * 0.55;
        if (!live || back < startZ) {
          trailParticles.set(slot, 0, HIDDEN_Y, 0);
          continue;
        }
        const p = pathAt(shot, back);
        const jitter = (trail.jitter || 0) * (k / TRAIL_POINTS);
        const phase = t * 14 - k * 0.9 + shot.index * Math.PI;
        const around = trail.spiral ? Math.cos(phase) * trail.spiral : trailSeeds[slot][0] * jitter;
        const lift = trail.spiral ? Math.sin(phase) * trail.spiral : trailSeeds[slot][1] * jitter;
        trailParticles.set(slot, p.x + Math.cos(shot.angle) * around, MUZZLE_HEIGHT + lift, p.z - Math.sin(shot.angle) * around);
      }
    });
    trailParticles.commit();
  };
  return fx;
}

// A beam that bursts out of a magic circle and stays on for a moment.
function plasmaBeam({ range }) {
  const length = shotReach(range);
  const fx = new Fx(1.3);
  const sigilFx = sigil(fx, 1.7, 0xff5ad8, 0x8ad8ff);
  const outerGeometry = new THREE.CylinderGeometry(0.55, 0.55, length, 14, 1, true).rotateX(Math.PI / 2).translate(0, 0, length / 2);
  const coreGeometry = new THREE.CylinderGeometry(0.2, 0.2, length, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, length / 2);
  const outer = fx.add(new THREE.Mesh(outerGeometry, fx.material(0xff5ad8, 0.45)));
  const core = fx.add(new THREE.Mesh(coreGeometry, fx.material(0xffffff, 0.95)));
  [outer, core].forEach((mesh) => mesh.position.set(0, MUZZLE_HEIGHT, 2.4));
  const flare = fx.add(new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), fx.material(0xffa8ee, 0.8)));
  flare.position.set(0, MUZZLE_HEIGHT, 2.4);
  const sparks = fx.particles(40, 0xffd6f6, 0.45);
  const seeds = Array.from({ length: 40 }, () => ({ z: rand(0, 1), s: rand(0.8, 2), a: rand(0, TAU), r: rand(0.3, 1) }));
  fx.tick = (t) => {
    sigilFx.update(t);
    const on = clamp01((t - 0.2) / 0.1) * clamp01((fx.duration - 0.35 - t) / 0.2);
    const wobble = 1 + Math.sin(t * 50) * 0.12;
    outer.scale.set(on * wobble, on * wobble, 1);
    core.scale.set(on, on, 1);
    flare.scale.setScalar(Math.max(0.01, on * 1.1 * wobble));
    seeds.forEach((s, i) => {
      const z = 2.4 + ((s.z + t * s.s) % 1) * length;
      sparks.set(i, Math.cos(s.a + t * 8) * 0.9 * s.r * on, MUZZLE_HEIGHT + Math.sin(s.a + t * 8) * 0.9 * s.r * on, z);
    });
    sparks.commit();
  };
  return fx;
}

const BUILDERS = {
  flameArrow: ({ range }) => volley({
    range,
    style: {
      kind: 'arrow', speed: 80, impact: 2.2, pulse: 0.1,
      colors: { core: 0xffe2a0, tip: 0xff9a3a, glow: 0xff5a1a },
      trail: { color: 0xff9a3a, size: 0.8, jitter: 0.5 }
    }
  }),
  frostArrow: ({ range }) => volley({
    range,
    style: {
      kind: 'arrow', count: 3, fan: 0.4, stagger: 0.05, speed: 75,
      colors: { core: 0xe8fbff, tip: 0x9fe8ff, glow: 0x4fb8ff },
      trail: { color: 0xdff8ff, size: 0.55, jitter: 0.7 }
    }
  }),
  thunderArrow: ({ range }) => volley({
    range,
    style: {
      kind: 'arrow', speed: 110, impact: 2.6, pulse: 0.35,
      colors: { core: 0xffffff, tip: 0xfff27a, glow: 0x7fb4ff },
      trail: { color: 0xcfe6ff, size: 0.5, jitter: 1.4 }
    }
  }),
  windArrow: ({ range }) => volley({
    range,
    style: {
      kind: 'arrow', count: 2, spread: 1.4, stagger: 0.03, speed: 85,
      colors: { core: 0xf2fff4, tip: 0xbfffd0, glow: 0x7dffb0 },
      trail: { color: 0xd8ffe4, size: 0.5, spiral: 0.9 }
    }
  }),
  arcaneCircleShot: ({ range }) => volley({
    range,
    style: {
      kind: 'orb', size: 0.45, count: 3, stagger: 0.14, speed: 60,
      circle: { size: 2.1, a: 0xb36bff, b: 0x7ad0ff },
      colors: { core: 0xf0dcff, glow: 0xa05cff },
      trail: { color: 0xc99aff, size: 0.7, jitter: 0.4 }
    }
  }),
  sigilBarrage: ({ range }) => volley({
    range,
    style: {
      kind: 'orb', size: 0.28, count: 7, fan: 0.9, stagger: 0.05, speed: 65,
      circle: { size: 2.6, a: 0xff6bd6, b: 0xffd6f6 },
      colors: { core: 0xffe6f8, glow: 0xff5ad0 },
      trail: { color: 0xff9ae6, size: 0.5, jitter: 0.3 }
    }
  }),
  plasmaBeam,
  homingOrbs: ({ range }) => volley({
    range,
    style: {
      kind: 'orb', size: 0.5, count: 4, stagger: 0.1, speed: 50, curve: 1, spin: 6, impact: 2,
      circle: { size: 1.6, a: 0x6dff9a, b: 0xe8fff0 },
      colors: { core: 0xeaffef, glow: 0x3fe07a },
      trail: { color: 0x8dffb4, size: 0.6, jitter: 0.5 }
    }
  }),
  crystalShards: ({ range }) => volley({
    range,
    style: {
      kind: 'shard', count: 5, fan: 0.6, stagger: 0.03, speed: 80, spin: 10,
      colors: { core: 0xffffff, glow: 0x7ad0ff },
      trail: { color: 0xbff3ff, size: 0.4, jitter: 0.6 }
    }
  })
};

const LABELS = {
  flameArrow: { en: 'Flame Arrow', id: 'Panah Api' },
  frostArrow: { en: 'Frost Arrow', id: 'Panah Es' },
  thunderArrow: { en: 'Thunder Arrow', id: 'Panah Petir' },
  windArrow: { en: 'Wind Arrow', id: 'Panah Angin' },
  arcaneCircleShot: { en: 'Arcane Circle Shot', id: 'Tembakan Lingkaran Arkana' },
  sigilBarrage: { en: 'Sigil Barrage', id: 'Rentetan Lingkaran Sihir' },
  plasmaBeam: { en: 'Plasma Beam', id: 'Sinar Plasma' },
  homingOrbs: { en: 'Homing Orbs', id: 'Bola Sihir Pengejar' },
  crystalShards: { en: 'Crystal Shards', id: 'Tembakan Kristal' }
};

registerEffects(BUILDERS, LABELS);

// Used by shot-type basic attacks: a single (attack 1) or twin (attack 2) bolt with a muzzle flash.
export const SHOT_EFFECT_STYLE = {
  attackShot1: {
    kind: 'arrow', speed: 90, impact: 1.2,
    colors: { core: 0xfff0b0, tip: 0xffd36a, glow: 0xffc85a },
    trail: { color: 0xffd98a, size: 0.45, jitter: 0.3 }
  },
  attackShot2: {
    kind: 'arrow', count: 2, spread: 1.1, stagger: 0.07, speed: 90, impact: 1.2,
    colors: { core: 0xfff0b0, tip: 0xffd36a, glow: 0xffc85a },
    trail: { color: 0xffd98a, size: 0.45, jitter: 0.3 }
  }
};

registerEffects(
  Object.fromEntries(
    Object.entries(SHOT_EFFECT_STYLE).map(([id, style]) => [id, ({ range }) => volley({ range, style })])
  )
);
