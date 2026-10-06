import * as THREE from 'three';
import { Fx, TAU, clamp01, easeOut, rand, registerEffects } from '../character/effects.js';

/**
 * Visual effects of the skills made in the Skill Generator. They are built like the character effects
 * (local space, origin at the caster's feet, +Z forward) but are a separate set with their own look.
 * Builders receive { range, shape, params } where params = { arc, width, radius } of the skill.
 */

const reach = (range) => Math.min(Math.max(range, 4), 45);
const radiusOf = (range, params, min = 3, max = 18) => Math.min(Math.max(params?.radius || range || 0, min), max);

const SKILL_BUILDERS = {
  // ---- vanish ----------------------------------------------------------------------------------
  smokeCloak({ params }) {
    const R = Math.min(Math.max(params?.radius || 2.4, 2), 5);
    const fx = new Fx(1.8);
    const smoke = fx.particles(90, 0x3b3550, 2.2, false);
    const embers = fx.particles(24, 0x9b7bff, 0.45);
    const ring = fx.ring(R * 0.4, R, 0x2a2540, 0.8);
    const seeds = Array.from({ length: 90 }, () => ({ a: rand(0, TAU), r: rand(0.2, 1), up: rand(1, 4), spin: rand(1, 3) }));
    const sparks = Array.from({ length: 24 }, () => ({ a: rand(0, TAU), r: rand(0.3, 1), up: rand(1.5, 4) }));
    fx.tick = (t) => {
      const p = clamp01(t / fx.duration);
      ring.scale.setScalar(Math.max(0.01, 1.2 - p * 0.9));
      seeds.forEach((s, i) => {
        const spread = R * s.r * (1.1 - p * 0.6);
        smoke.set(i, Math.cos(s.a + t * s.spin) * spread, 0.4 + p * s.up * 1.3, Math.sin(s.a + t * s.spin) * spread);
      });
      sparks.forEach((s, i) => embers.set(i, Math.cos(s.a - t * 2) * R * s.r, (t * s.up) % 5, Math.sin(s.a - t * 2) * R * s.r));
      smoke.commit();
      embers.commit();
    };
    return fx;
  },

  ghostVeil({ params }) {
    const R = Math.min(Math.max(params?.radius || 2.2, 2), 4.5);
    const fx = new Fx(2.0);
    const rings = Array.from({ length: 6 }, (_, i) => ({ delay: i * 0.18, mesh: fx.ring(R * 0.9, R, 0xaef2ff, 0.7, 0.1) }));
    const wisps = fx.particles(40, 0xe8fbff, 0.7);
    const seeds = Array.from({ length: 40 }, () => ({ a: rand(0, TAU), r: rand(0.4, 1), up: rand(1, 3.5) }));
    fx.tick = (t) => {
      rings.forEach((ring) => {
        const u = clamp01((t - ring.delay) / 1.1);
        ring.mesh.visible = u > 0 && u < 1;
        ring.mesh.position.y = 0.1 + u * 5.5;
        ring.mesh.scale.setScalar(Math.max(0.01, 1 - u * 0.6));
      });
      seeds.forEach((s, i) => {
        const a = s.a + t * 1.4;
        wisps.set(i, Math.cos(a) * R * s.r, (t * s.up) % 6, Math.sin(a) * R * s.r);
      });
      wisps.commit();
    };
    return fx;
  },

  // ---- heal ------------------------------------------------------------------------------------
  lifeBloom({ range, params }) {
    const R = radiusOf(range, params, 3, 14);
    const fx = new Fx(2.2);
    const petalMaterial = fx.material(0x8dffb2, 0.7);
    const innerMaterial = fx.material(0xfff3a0, 0.8);
    const petals = [];
    const count = 8;
    for (let i = 0; i < count; i++) {
      const petal = new THREE.Mesh(new THREE.CircleGeometry(1, 20), petalMaterial);
      petal.rotation.x = -Math.PI / 2;
      petal.userData.a = (i / count) * TAU;
      fx.add(petal);
      petals.push(petal);
    }
    const core = fx.add(new THREE.Mesh(new THREE.CircleGeometry(R * 0.2, 24), innerMaterial));
    core.rotation.x = -Math.PI / 2;
    core.position.y = 0.09;
    const sparkles = fx.particles(45, 0xd7ffe0, 0.55);
    const seeds = Array.from({ length: 45 }, () => ({ a: rand(0, TAU), r: rand(0.1, 1), up: rand(1, 3) }));
    fx.tick = (t) => {
      const open = easeOut(t / 0.7);
      petals.forEach((petal) => {
        const dist = R * 0.5 * open;
        petal.position.set(Math.cos(petal.userData.a) * dist, 0.07, Math.sin(petal.userData.a) * dist);
        petal.scale.set(Math.max(0.01, R * 0.24 * open), Math.max(0.01, R * 0.4 * open), 1);
        petal.rotation.z = -petal.userData.a + Math.PI / 2;
      });
      core.scale.setScalar(1 + Math.sin(t * 6) * 0.1);
      seeds.forEach((s, i) => sparkles.set(i, Math.cos(s.a + t) * R * s.r, (t * s.up) % 5, Math.sin(s.a + t) * R * s.r));
      sparkles.commit();
    };
    return fx;
  },

  lightPillars({ range, params }) {
    const R = radiusOf(range, params, 3, 14);
    const fx = new Fx(2.0);
    fx.ring(R * 0.95, R, 0xffe58a, 0.85);
    const pillars = [];
    const count = 6;
    for (let i = 0; i < count; i++) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.07, R * 0.12, 9, 12, 1, true), fx.material(0xfff0b0, 0.45));
      const a = (i / count) * TAU;
      pillar.position.set(Math.cos(a) * R * 0.7, 4.5, Math.sin(a) * R * 0.7);
      pillar.userData.delay = i * 0.1;
      fx.add(pillar);
      pillars.push(pillar);
    }
    const motes = fx.particles(50, 0xffffff, 0.5);
    const seeds = Array.from({ length: 50 }, () => ({ a: rand(0, TAU), r: rand(0.2, 0.9), up: rand(2, 5) }));
    fx.tick = (t) => {
      pillars.forEach((pillar) => {
        const u = easeOut((t - pillar.userData.delay) / 0.4);
        pillar.scale.set(1, Math.max(0.01, u), 1);
        pillar.position.y = 4.5 * Math.max(0.01, u);
      });
      seeds.forEach((s, i) => motes.set(i, Math.cos(s.a) * R * s.r, (t * s.up) % 7, Math.sin(s.a) * R * s.r));
      motes.commit();
    };
    return fx;
  },

  // ---- control ---------------------------------------------------------------------------------
  chainBind({ range }) {
    const R = Math.min(Math.max(range, 4), 16);
    const fx = new Fx(1.8);
    fx.ring(R * 0.96, R, 0x9a8cc0, 0.8);
    const linkMaterial = fx.material(0xc9c3e6, 0.9, false);
    const links = [];
    const chains = 8;
    const perChain = 9;
    for (let c = 0; c < chains; c++) {
      for (let k = 0; k < perChain; k++) {
        const link = new THREE.Mesh(new THREE.TorusGeometry(R * 0.035, R * 0.012, 6, 10), linkMaterial);
        link.userData = { a: (c / chains) * TAU, k: k / (perChain - 1) };
        link.rotation.x = k % 2 ? Math.PI / 2 : 0;
        fx.add(link);
        links.push(link);
      }
    }
    const glow = fx.particles(30, 0xb59cff, 0.5);
    const seeds = Array.from({ length: 30 }, () => ({ a: rand(0, TAU), r: rand(0.2, 1) }));
    fx.tick = (t) => {
      const close = easeOut(t / 0.55);
      links.forEach((link) => {
        const { a, k } = link.userData;
        const dist = R * (1 - close * 0.8) * (1 - k * 0.9);
        const ang = a + close * 1.2;
        link.position.set(Math.cos(ang) * dist, 0.3 + k * 1.6 * close, Math.sin(ang) * dist);
      });
      seeds.forEach((s, i) => {
        const spread = R * s.r * (1 - close * 0.7);
        glow.set(i, Math.cos(s.a + t * 2) * spread, 0.5 + ((t * 2) % 2), Math.sin(s.a + t * 2) * spread);
      });
      glow.commit();
    };
    return fx;
  },

  mindPulse({ range }) {
    const R = Math.min(Math.max(range, 4), 18);
    const fx = new Fx(1.7);
    const waves = [0, 0.3, 0.6].map((delay) => {
      const material = new THREE.MeshBasicMaterial({
        color: 0xff6bd6,
        wireframe: true,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      fx.track(material, 0.6);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), material);
      mesh.position.y = 1.6;
      fx.add(mesh);
      return { delay, mesh };
    });
    const ground = fx.ring(0.85, 1, 0xff9be8, 0.8);
    fx.tick = (t) => {
      ground.scale.setScalar(Math.max(0.01, R * easeOut(t / 0.9)));
      waves.forEach(({ delay, mesh }) => {
        const u = clamp01((t - delay) / 1.0);
        mesh.visible = u > 0;
        mesh.scale.setScalar(Math.max(0.01, R * 0.7 * easeOut(u)));
        mesh.rotation.y = t * 1.5;
      });
    };
    return fx;
  },

  // ---- fire ------------------------------------------------------------------------------------
  fireball({ range, shape }) {
    const L = reach(range);
    const travels = shape !== 'circle';
    const fx = new Fx(1.3);
    const core = fx.add(new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), fx.material(0xffd24a, 0.95)));
    const halo = fx.add(new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), fx.material(0xff5a14, 0.5)));
    const blast = fx.add(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), fx.material(0xff7a1a, 0.6)));
    const flash = fx.ring(0.85, 1, 0xffc060, 0.9);
    const trail = fx.particles(70, 0xff8a2a, 0.9);
    const seeds = Array.from({ length: 70 }, () => ({ off: rand(0, 1), spread: rand(0.1, 0.7), lift: rand(-0.3, 0.6) }));
    const travelTime = travels ? 0.5 : 0;
    const blastRadius = travels ? 3.2 : Math.min(Math.max(range, 3), 16);
    fx.tick = (t) => {
      const u = travels ? clamp01(t / travelTime) : 0;
      const z = travels ? 1.5 + (L - 1.5) * u : 0;
      const flying = travels && t < travelTime;
      core.visible = flying;
      halo.visible = flying;
      core.position.set(0, 1.8, z);
      halo.position.copy(core.position);
      halo.scale.setScalar(1 + Math.sin(t * 40) * 0.15);
      seeds.forEach((s, i) => {
        const back = flying ? z * (1 - s.off * 0.45) : z + (Math.random() - 0.5) * 2;
        trail.set(i, (Math.random() - 0.5) * s.spread, 1.8 + s.lift + Math.random() * 0.3, back);
      });
      trail.commit();
      const e = clamp01((t - travelTime) / 0.55);
      blast.position.set(0, 1.5, z);
      blast.visible = t >= travelTime;
      blast.scale.setScalar(Math.max(0.01, blastRadius * 0.6 * easeOut(e)));
      flash.position.set(0, 0.07, z);
      flash.visible = t >= travelTime;
      flash.scale.setScalar(Math.max(0.01, blastRadius * easeOut(e * 1.3)));
    };
    return fx;
  },

  flameWave({ range, shape, params }) {
    const L = reach(range);
    const arc = shape === 'cone' ? ((params?.arc || 60) * Math.PI) / 180 : shape === 'circle' ? TAU : 0.18;
    const spread = shape === 'line' ? Math.min(params?.width || 3, 12) : 0;
    const R = shape === 'circle' ? Math.min(Math.max(range, 3), 16) : L;
    const fx = new Fx(1.5);
    const flameMaterial = fx.material(0xff6a1a, 0.75);
    const tipMaterial = fx.material(0xffd05a, 0.85);
    const flames = [];
    const rows = 7;
    const columns = shape === 'circle' ? 14 : 5;
    for (let r = 1; r <= rows; r++) {
      for (let c = 0; c < columns; c++) {
        const f = columns === 1 ? 0.5 : c / (columns - 1);
        const angle = shape === 'circle' ? (c / columns) * TAU : (f - 0.5) * arc;
        const lateral = shape === 'line' ? (f - 0.5) * spread : 0;
        const size = 0.7 + (r / rows) * 1.1;
        const flame = new THREE.Mesh(new THREE.ConeGeometry(size * 0.55, size * 2.4, 7), r % 2 ? flameMaterial : tipMaterial);
        flame.userData = { angle, lateral, dist: (r / rows) * R, delay: (r / rows) * 0.5, size, phase: rand(0, TAU) };
        fx.add(flame);
        flames.push(flame);
      }
    }
    const sparks = fx.particles(50, 0xffb347, 0.6);
    const seeds = Array.from({ length: 50 }, () => ({ a: (rand(0, 1) - 0.5) * arc, d: rand(0.2, 1), up: rand(1, 4) }));
    fx.tick = (t) => {
      flames.forEach((flame) => {
        const { angle, lateral, dist, delay, size, phase } = flame.userData;
        const u = easeOut((t - delay) / 0.35);
        const x = Math.sin(angle) * dist + Math.cos(angle) * lateral;
        const z = Math.cos(angle) * dist;
        flame.position.set(x, size * 1.2 * u, z);
        flame.scale.set(1, Math.max(0.01, u * (1 + Math.sin(t * 18 + phase) * 0.18)), 1);
      });
      seeds.forEach((s, i) => {
        const d = R * s.d * clamp01(t / 0.6);
        sparks.set(i, Math.sin(s.a) * d, (t * s.up) % 4, Math.cos(s.a) * d);
      });
      sparks.commit();
    };
    return fx;
  }
};

registerEffects(SKILL_BUILDERS);

export const SKILL_EFFECT_LABELS = {
  smokeCloak: { en: 'Smoke Cloak', id: 'Jubah Asap' },
  ghostVeil: { en: 'Ghost Veil', id: 'Tabir Hantu' },
  lifeBloom: { en: 'Life Bloom', id: 'Mekar Kehidupan' },
  lightPillars: { en: 'Light Pillars', id: 'Pilar Cahaya' },
  chainBind: { en: 'Chain Bind', id: 'Ikatan Rantai' },
  mindPulse: { en: 'Mind Pulse', id: 'Denyut Pikiran' },
  fireball: { en: 'Fireball', id: 'Bola Api' },
  flameWave: { en: 'Flame Wave', id: 'Gelombang Api' }
};

export function skillEffectLabel(id, language) {
  return SKILL_EFFECT_LABELS[id]?.[language] || SKILL_EFFECT_LABELS[id]?.en || id;
}

// Sounds are shared with the character effects (the closest match for each power).
export const SKILL_SOUND_EFFECT = {
  vanish: 'shadowVanish',
  heal: 'healingAura',
  control: 'magicCircle',
  fire: 'fireBurst'
};
