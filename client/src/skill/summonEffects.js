import * as THREE from 'three';
import { Fx, TAU, clamp01, easeOut, rand, registerEffects } from '../character/effects.js';

/**
 * Visual effects of the summon skills (necromancer, summoner, support) and of the attacks of the units they
 * summon. Built like the other effects (local space, origin at the caster's feet, +Z forward). Unit attack
 * effects are spawned at the attacker, facing the target; `range` is the distance to it.
 */

const reach = (range) => Math.min(Math.max(range, 2), 45);

// Particles that fly from the attacker towards the target; returns the seeds to animate them.
const stream = (fx, count, color, size) => ({
  points: fx.particles(count, color, size),
  seeds: Array.from({ length: count }, () => ({ off: rand(0, 1), x: rand(-0.5, 0.5), y: rand(-0.3, 0.5) }))
});

const BUILDERS = {
  // ---- necromancer -----------------------------------------------------------------------------
  graveRise() {
    const R = 3.6;
    const fx = new Fx(2.2);
    fx.ring(R * 0.88, R, 0x6dff9a, 0.85);
    fx.ring(0.2, R * 0.55, 0x0f2a18, 0.55, 0.05);
    const boneMaterial = fx.material(0xe6ffe9, 0.85, false);
    const bones = Array.from({ length: 12 }, (_, i) => {
      const bone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 2.4, 6), boneMaterial);
      bone.userData = { a: (i / 12) * TAU, delay: i * 0.06, r: R * (i % 2 ? 0.55 : 0.88) };
      fx.add(bone);
      return bone;
    });
    const souls = fx.particles(60, 0x7dffb0, 0.5);
    const seeds = Array.from({ length: 60 }, () => ({ a: rand(0, TAU), r: rand(0.1, 1), up: rand(1, 3.5) }));
    fx.tick = (t) => {
      bones.forEach((bone) => {
        const { a, delay, r } = bone.userData;
        const u = easeOut((t - delay) / 0.5);
        bone.scale.y = Math.max(0.01, u);
        bone.position.set(Math.cos(a) * r, 1.2 * u - 0.1, Math.sin(a) * r);
        bone.rotation.z = Math.sin(a * 3 + t * 2) * 0.12;
      });
      seeds.forEach((s, i) => souls.set(i, Math.cos(s.a) * R * s.r, (t * s.up) % 5, Math.sin(s.a) * R * s.r));
      souls.commit();
    };
    return fx;
  },

  soulSwirl() {
    const R = 3;
    const fx = new Fx(2.0);
    fx.ring(R * 0.9, R, 0x9be8ff, 0.7);
    const wisps = fx.particles(90, 0xb8f4ff, 0.6);
    const orbs = fx.particles(14, 0x57d7ff, 1.1);
    const seeds = Array.from({ length: 90 }, (_, i) => ({ a: (i / 90) * TAU * 3, h: (i / 90) * 6 }));
    fx.tick = (t) => {
      const open = clamp01(t / 0.6);
      seeds.forEach((s, i) => {
        const a = s.a + t * 3;
        const radius = R * (1 - s.h / 8) * open;
        wisps.set(i, Math.cos(a) * radius, (s.h + t * 2) % 6, Math.sin(a) * radius);
      });
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU - t * 4;
        orbs.set(i, Math.cos(a) * R * 0.6, 0.6 + ((t * 3 + i) % 5), Math.sin(a) * R * 0.6);
      }
      wisps.commit();
      orbs.commit();
    };
    return fx;
  },

  // ---- summoner --------------------------------------------------------------------------------
  summonCircle() {
    const R = 4;
    const fx = new Fx(2.0);
    const outer = fx.ring(R * 0.92, R, 0xffc861, 0.9);
    const inner = fx.ring(R * 0.5, R * 0.56, 0xffe9a8, 0.85, 0.07);
    const starMaterial = fx.material(0xffd98a, 0.8);
    const star = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(R * 1.7, 0.05, 0.12), starMaterial);
      line.rotation.y = (i / 6) * Math.PI;
      star.add(line);
    }
    star.position.y = 0.08;
    fx.add(star);
    const column = fx.add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.45, R * 0.45, 9, 24, 1, true), fx.material(0xffefb0, 0.35)));
    const sparks = fx.particles(50, 0xfff0b8, 0.55);
    const seeds = Array.from({ length: 50 }, () => ({ a: rand(0, TAU), r: rand(0.2, 0.9), up: rand(2, 6) }));
    fx.tick = (t) => {
      const grow = easeOut(t / 0.5);
      outer.scale.setScalar(Math.max(0.01, grow));
      inner.scale.setScalar(Math.max(0.01, grow));
      star.scale.setScalar(Math.max(0.01, grow));
      star.rotation.y = t * 0.9;
      column.position.y = 4.5;
      column.scale.set(1, Math.max(0.01, clamp01((t - 0.3) / 0.35)), 1);
      seeds.forEach((s, i) => sparks.set(i, Math.cos(s.a + t) * R * s.r, (t * s.up) % 8, Math.sin(s.a + t) * R * s.r));
      sparks.commit();
    };
    return fx;
  },

  portalGate() {
    const fx = new Fx(2.1);
    const gate = new THREE.Group();
    gate.position.set(0, 3, 3.2);
    fx.add(gate);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.18, 10, 40), fx.material(0xb78bff, 0.95));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.3, 32), fx.material(0x4a2a9a, 0.55));
    gate.add(rim, disc);
    const swirl = fx.particles(70, 0xe0c9ff, 0.5);
    const seeds = Array.from({ length: 70 }, () => ({ a: rand(0, TAU), r: rand(0.1, 1) }));
    fx.ring(1.6, 2.4, 0xb78bff, 0.6);
    fx.tick = (t) => {
      const open = easeOut(t / 0.6);
      gate.scale.set(Math.max(0.01, open), Math.max(0.01, open), 1);
      rim.rotation.z = t * 0.8;
      seeds.forEach((s, i) => {
        const a = s.a + t * (2.5 - s.r);
        swirl.set(i, Math.cos(a) * 2.2 * s.r * open, 3 + Math.sin(a) * 2.2 * s.r * open, 3.2 + Math.sin(t * 6 + i) * 0.15);
      });
      swirl.commit();
    };
    return fx;
  },

  // ---- support ---------------------------------------------------------------------------------
  blessingHalo() {
    const fx = new Fx(2.2);
    const halo = fx.add(new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.1, 8, 40), fx.material(0xfff0a0, 0.95)));
    halo.rotation.x = Math.PI / 2;
    const glow = fx.ring(1.3, 3.2, 0xfff7c8, 0.35);
    const motes = fx.particles(60, 0xfffbe0, 0.5);
    const seeds = Array.from({ length: 60 }, () => ({ a: rand(0, TAU), r: rand(0.3, 1), fall: rand(1, 2.5) }));
    fx.tick = (t) => {
      halo.position.y = 7 - easeOut(t / 0.9) * 2.4 + Math.sin(t * 3) * 0.1;
      halo.rotation.z = t;
      glow.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
      seeds.forEach((s, i) => motes.set(i, Math.cos(s.a + t) * 3 * s.r, 7 - ((t * s.fall) % 7), Math.sin(s.a + t) * 3 * s.r));
      motes.commit();
    };
    return fx;
  },

  guardianRunes() {
    const R = 3.2;
    const fx = new Fx(2.2);
    fx.ring(R * 0.9, R, 0x7ad7ff, 0.8);
    const runeMaterial = fx.material(0xc9f1ff, 0.9);
    const runes = Array.from({ length: 6 }, (_, i) => {
      const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), runeMaterial);
      rune.userData = { a: (i / 6) * TAU };
      fx.add(rune);
      return rune;
    });
    const beams = fx.particles(40, 0x9fe4ff, 0.45);
    const seeds = Array.from({ length: 40 }, () => ({ a: rand(0, TAU), up: rand(1, 4) }));
    fx.tick = (t) => {
      runes.forEach((rune) => {
        const a = rune.userData.a + t * 1.6;
        rune.position.set(Math.cos(a) * R * 0.8, 1.2 + easeOut(t / 0.8) * 1.4 + Math.sin(t * 3 + a) * 0.2, Math.sin(a) * R * 0.8);
        rune.rotation.set(t * 2, t * 3, 0);
      });
      seeds.forEach((s, i) => beams.set(i, Math.cos(s.a) * R * 0.8, (t * s.up) % 5, Math.sin(s.a) * R * 0.8));
      beams.commit();
    };
    return fx;
  },

  // ---- unit attacks: melee ---------------------------------------------------------------------
  clawSlash({ range }) {
    const fx = new Fx(0.7);
    const reachTo = Math.min(reach(range), 6);
    const material = fx.material(0xff7a5a, 0.9);
    const slashes = [-0.5, 0, 0.5].map((side, i) => {
      const slash = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, 20, 1, 0, Math.PI * 0.75), material);
      slash.userData = { side, delay: i * 0.08 };
      slash.position.set(side * 0.9, 1.6, reachTo * 0.6);
      slash.rotation.set(0, 0, 0.9 + side);
      fx.add(slash);
      return slash;
    });
    fx.tick = (t) => {
      slashes.forEach((slash) => {
        const u = clamp01((t - slash.userData.delay) / 0.25);
        slash.visible = u > 0;
        slash.scale.setScalar(Math.max(0.01, 0.6 + u * 1.2));
        slash.rotation.z = 0.9 + slash.userData.side - u * 0.8;
      });
    };
    return fx;
  },

  soulClaw({ range }) {
    const fx = new Fx(0.9);
    const L = Math.min(reach(range), 7);
    const material = fx.material(0xb98cff, 0.85);
    const claws = Array.from({ length: 3 }, (_, i) => {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.22, 2.4, 8), material);
      claw.rotation.x = Math.PI / 2;
      claw.userData = { x: (i - 1) * 0.9, delay: i * 0.07 };
      fx.add(claw);
      return claw;
    });
    const wisps = fx.particles(30, 0xe3d0ff, 0.5);
    const seeds = Array.from({ length: 30 }, () => ({ x: rand(-1.3, 1.3), off: rand(0, 1) }));
    fx.tick = (t) => {
      claws.forEach((claw) => {
        const u = easeOut((t - claw.userData.delay) / 0.3);
        claw.position.set(claw.userData.x, 1.6, 0.5 + u * L * 0.8);
        claw.scale.set(1, Math.max(0.01, 1 - Math.abs(t - 0.4) * 0.6), 1);
      });
      seeds.forEach((s, i) => wisps.set(i, s.x, 1.4 + Math.sin(t * 8 + i) * 0.3, 0.5 + ((t * 5 + s.off * L) % (L * 0.8))));
      wisps.commit();
    };
    return fx;
  },

  // ---- unit attacks: ranged --------------------------------------------------------------------
  spiritBolt({ range }) {
    const L = reach(range);
    const travel = Math.max(0.25, Math.min(0.6, L / 45));
    const fx = new Fx(travel + 0.5);
    const core = fx.add(new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), fx.material(0xbfffe8, 0.95)));
    const halo = fx.add(new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 10), fx.material(0x39e6b5, 0.45)));
    const burst = fx.ring(0.85, 1, 0x7dffd8, 0.9);
    const trail = stream(fx, 36, 0x8dffe0, 0.5);
    fx.tick = (t) => {
      const u = clamp01(t / travel);
      const z = 1 + (L - 1) * u;
      const flying = t < travel;
      core.visible = flying;
      halo.visible = flying;
      core.position.set(0, 1.8, z);
      halo.position.copy(core.position);
      trail.seeds.forEach((s, i) => trail.points.set(i, s.x * 0.4, 1.8 + s.y * 0.4, Math.max(0, z - s.off * 3)));
      trail.points.commit();
      burst.position.set(0, 0.07, L);
      burst.visible = !flying;
      burst.scale.setScalar(Math.max(0.01, 1.8 * easeOut((t - travel) / 0.35)));
    };
    return fx;
  },

  shadowArrow({ range }) {
    const L = reach(range);
    const travel = Math.max(0.2, Math.min(0.5, L / 55));
    const fx = new Fx(travel + 0.45);
    const arrow = fx.add(new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.8, 8), fx.material(0x8a5cff, 0.95)));
    arrow.rotation.x = Math.PI / 2;
    const trail = stream(fx, 30, 0x5a3aa8, 0.55);
    const hit = fx.particles(24, 0xc9a8ff, 0.7);
    const bursts = Array.from({ length: 24 }, () => ({ a: rand(0, TAU), v: rand(2, 6), up: rand(0, 3) }));
    fx.tick = (t) => {
      const u = clamp01(t / travel);
      const z = 1 + (L - 1) * u;
      arrow.visible = t < travel;
      arrow.position.set(0, 1.8, z);
      trail.seeds.forEach((s, i) => trail.points.set(i, s.x * 0.2, 1.8 + s.y * 0.2, Math.max(0, z - s.off * 4)));
      trail.points.commit();
      const e = Math.max(0, t - travel);
      bursts.forEach((b, i) => hit.set(i, Math.cos(b.a) * b.v * e, 1.8 + b.up * e, L + Math.sin(b.a) * b.v * e));
      hit.commit();
    };
    return fx;
  },

  // ---- unit support ----------------------------------------------------------------------------
  mendingGlow({ range }) {
    const L = reach(range);
    const fx = new Fx(1.2);
    const beam = stream(fx, 40, 0x8dffb0, 0.5);
    const ring = fx.ring(0.85, 1, 0xc9ffd9, 0.85);
    fx.tick = (t) => {
      beam.seeds.forEach((s, i) => {
        const u = (t * 1.6 + s.off) % 1;
        beam.points.set(i, s.x * 0.3, 1.8 + s.y * 0.3 + Math.sin(u * Math.PI) * 0.8, 1 + (L - 1) * u);
      });
      beam.points.commit();
      ring.position.set(0, 0.07, L);
      ring.scale.setScalar(Math.max(0.01, 1.6 * easeOut((t - 0.3) / 0.6)));
    };
    return fx;
  },

  manaSpring({ range }) {
    const L = reach(range);
    const fx = new Fx(1.2);
    const beam = stream(fx, 44, 0x7bb6ff, 0.5);
    const ring = fx.ring(0.85, 1, 0xb9d8ff, 0.85);
    fx.tick = (t) => {
      beam.seeds.forEach((s, i) => {
        const u = (t * 1.8 + s.off) % 1;
        const swirl = u * 6 + i;
        beam.points.set(i, Math.cos(swirl) * 0.45, 1.8 + Math.sin(swirl) * 0.45, 1 + (L - 1) * u);
      });
      beam.points.commit();
      ring.position.set(0, 0.07, L);
      ring.scale.setScalar(Math.max(0.01, 1.6 * easeOut((t - 0.3) / 0.6)));
    };
    return fx;
  }
};

registerEffects(BUILDERS);

export const SUMMON_EFFECT_LABELS = {
  graveRise: { en: 'Grave Rise', id: 'Bangkit dari Kubur' },
  soulSwirl: { en: 'Soul Swirl', id: 'Pusaran Jiwa' },
  summonCircle: { en: 'Summon Circle', id: 'Lingkaran Pemanggil' },
  portalGate: { en: 'Portal Gate', id: 'Gerbang Portal' },
  blessingHalo: { en: 'Blessing Halo', id: 'Halo Berkah' },
  guardianRunes: { en: 'Guardian Runes', id: 'Rune Penjaga' },
  clawSlash: { en: 'Claw Slash', id: 'Cakaran' },
  soulClaw: { en: 'Soul Claw', id: 'Cakar Jiwa' },
  spiritBolt: { en: 'Spirit Bolt', id: 'Panah Roh' },
  shadowArrow: { en: 'Shadow Arrow', id: 'Anak Panah Bayangan' },
  mendingGlow: { en: 'Mending Glow', id: 'Cahaya Penyembuh' },
  manaSpring: { en: 'Mana Spring', id: 'Mata Air Mana' }
};

// Sounds are shared with the character effects (the closest match for each effect).
export const SUMMON_SOUND_EFFECT = {
  necromancer: 'shadowVanish',
  summoner: 'magicCircle',
  support: 'healingAura',
  clawSlash: 'slashArc',
  soulClaw: 'slashArc',
  spiritBolt: 'magicCircle',
  shadowArrow: 'arrowVolley',
  mendingGlow: 'healingAura',
  manaSpring: 'magicCircle'
};
