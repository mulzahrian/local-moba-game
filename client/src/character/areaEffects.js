import * as THREE from 'three';
import { Fx, TAU, areaRadius, clamp01, easeOut, rand, registerEffects } from './effects.js';

/** More magic effects around the caster: clouds, pillars, waves, vortexes... (origin at the caster's feet). */

const jagged = (from, to, segments, jitter) => {
  const points = [];
  for (let s = 0; s <= segments; s++) {
    const f = s / segments;
    const j = s === 0 || s === segments ? 0 : jitter;
    points.push(new THREE.Vector3(
      THREE.MathUtils.lerp(from.x, to.x, f) + rand(-j, j),
      THREE.MathUtils.lerp(from.y, to.y, f) + rand(-j, j),
      THREE.MathUtils.lerp(from.z, to.z, f) + rand(-j, j)
    ));
  }
  return points;
};

const BUILDERS = {
  poisonCloud({ range, shape }) {
    const R = areaRadius(range, shape);
    const fx = new Fx(2.2);
    const pool = fx.ring(0, R, 0x3fa020, 0.35, 0.05);
    const edge = fx.ring(R * 0.93, R, 0x9aff4a, 0.8);
    const cloud = fx.particles(80, 0x4fbf2a, 2.6, false);
    const bubbles = fx.particles(40, 0xcfff7a, 0.5);
    const cloudSeeds = Array.from({ length: 80 }, () => ({ a: rand(0, TAU), r: rand(0.1, 1), s: rand(0.3, 0.9), h: rand(0.3, 2.6) }));
    const bubbleSeeds = Array.from({ length: 40 }, () => ({ a: rand(0, TAU), r: rand(0.1, 0.95), s: rand(0.6, 1.6) }));
    fx.tick = (t) => {
      const grow = Math.max(0.01, easeOut(t / 0.45));
      pool.scale.setScalar(grow);
      edge.scale.setScalar(grow);
      cloudSeeds.forEach((s, i) => {
        const a = s.a + t * s.s;
        cloud.set(i, Math.cos(a) * R * s.r * grow, s.h + Math.sin(t * 2 + s.a) * 0.4, Math.sin(a) * R * s.r * grow);
      });
      bubbleSeeds.forEach((s, i) => {
        bubbles.set(i, Math.cos(s.a) * R * s.r, (t * s.s * 2 + s.a) % 3.5, Math.sin(s.a) * R * s.r);
      });
      cloud.commit();
      bubbles.commit();
    };
    return fx;
  },

  holyLight({ range, shape }) {
    const R = Math.min(areaRadius(range, shape), 10);
    const fx = new Fx(1.9);
    const column = fx.add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.45, R * 0.45, 16, 28, 1, true), fx.material(0xfff0b0, 0.4)));
    const core = fx.add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.18, R * 0.18, 16, 20, 1, true), fx.material(0xffffff, 0.8)));
    [column, core].forEach((m) => { m.position.y = 8; });
    const pulses = [0, 0.35, 0.7].map((delay) => ({ delay, mesh: fx.ring(0.9, 1, 0xffe08a, 0.9) }));
    const rayMaterial = fx.material(0xfff6c8, 0.5);
    const rays = Array.from({ length: 8 }, (_, i) => {
      const ray = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.18, 12, 6, 1, true), rayMaterial);
      const a = (i / 8) * TAU;
      ray.position.set(Math.cos(a) * R * 0.7, 6, Math.sin(a) * R * 0.7);
      ray.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
      return fx.add(ray);
    });
    const motes = fx.particles(45, 0xfff6c8, 0.5);
    const seeds = Array.from({ length: 45 }, () => ({ a: rand(0, TAU), r: rand(0.1, 0.7), s: rand(1, 3) }));
    fx.tick = (t) => {
      const open = Math.max(0.01, easeOut(t / 0.25));
      const flicker = 1 + Math.sin(t * 22) * 0.05;
      column.scale.set(open * flicker, 1, open * flicker);
      core.scale.set(open, 1, open);
      rays.forEach((ray, i) => { ray.scale.y = 0.6 + 0.4 * Math.sin(t * 6 + i); });
      pulses.forEach(({ delay, mesh }) => {
        const u = clamp01((t - delay) / 0.9);
        mesh.visible = u > 0 && u < 1;
        mesh.scale.setScalar(Math.max(0.01, R * easeOut(u)));
      });
      seeds.forEach((s, i) => {
        motes.set(i, Math.cos(s.a + t) * R * s.r, (t * s.s) % 8, Math.sin(s.a + t) * R * s.r);
      });
      motes.commit();
    };
    return fx;
  },

  earthSpike({ range, shape }) {
    const R = areaRadius(range, shape);
    const fx = new Fx(1.8);
    const rockMaterial = fx.material(0x8a6a42, 0.95, false);
    const tipMaterial = fx.material(0xc9a77a, 0.95, false);
    const spikes = Array.from({ length: 22 }, (_, i) => {
      const height = R * rand(0.3, 0.65);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(R * 0.07, height, 6), i % 3 ? rockMaterial : tipMaterial);
      const a = rand(0, TAU);
      const d = i < 2 ? 0 : Math.sqrt(rand(0.02, 1)) * R * 0.95;
      spike.userData = { x: Math.cos(a) * d, z: Math.sin(a) * d, height, delay: rand(0, 0.45) + (d / R) * 0.2, lean: [rand(-0.3, 0.3), rand(-0.3, 0.3)] };
      return fx.add(spike);
    });
    const crackMaterial = fx.lineMaterial(0xffd9a0);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + rand(-0.2, 0.2);
      const points = [new THREE.Vector3(0, 0.07, 0)];
      for (let s = 1; s <= 5; s++) {
        const d = (s / 5) * R;
        points.push(new THREE.Vector3(Math.cos(a) * d + rand(-0.4, 0.4), 0.07, Math.sin(a) * d + rand(-0.4, 0.4)));
      }
      fx.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), crackMaterial));
    }
    const dust = fx.particles(50, 0xd2b48a, 1.2, false);
    const seeds = Array.from({ length: 50 }, () => ({ a: rand(0, TAU), r: rand(0, 1), s: rand(0.5, 1.5) }));
    fx.tick = (t) => {
      spikes.forEach((spike) => {
        const { x, z, height, delay, lean } = spike.userData;
        const rise = easeOut((t - delay) / 0.22);
        const sink = clamp01((t - 1.2 - delay * 0.5) / 0.5);
        const h = Math.max(0.01, rise * (1 - sink));
        spike.scale.set(1, h, 1);
        spike.position.set(x, (height * h) / 2 - 0.1, z);
        spike.rotation.set(lean[0], 0, lean[1]);
      });
      seeds.forEach((s, i) => {
        dust.set(i, Math.cos(s.a) * R * s.r, 0.3 + ((t * s.s) % 1.5) * 1.5, Math.sin(s.a) * R * s.r);
      });
      dust.commit();
    };
    return fx;
  },

  tidalWave({ range, shape }) {
    const R = areaRadius(range, shape);
    const fx = new Fx(1.7);
    const waves = [0, 0.15].map((delay, i) => ({
      delay,
      ring: fx.ring(0.82, 1, i ? 0xcff4ff : 0x4fb8ff, 0.85),
      wall: fx.add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.6, 40, 1, true), fx.material(i ? 0xa8e4ff : 0x3d9bff, 0.4)))
    }));
    const foam = fx.particles(70, 0xffffff, 0.6);
    const seeds = Array.from({ length: 70 }, () => ({ a: rand(0, TAU), r: rand(0.5, 1), lift: rand(1, 3) }));
    fx.tick = (t) => {
      waves.forEach(({ delay, ring, wall }) => {
        const u = clamp01((t - delay) / 0.9);
        ring.visible = wall.visible = u > 0 && u < 1;
        const radius = Math.max(0.01, R * easeOut(u));
        ring.scale.setScalar(radius);
        wall.scale.set(radius, 1 + Math.sin(u * Math.PI) * 0.8, radius);
        wall.position.y = 0.8;
      });
      const u = clamp01(t / 1.0);
      seeds.forEach((s, i) => {
        const d = R * s.r * easeOut(u);
        foam.set(i, Math.cos(s.a) * d, Math.max(0, s.lift * Math.sin(u * Math.PI) * 1.2), Math.sin(s.a) * d);
      });
      foam.commit();
    };
    return fx;
  },

  blackHole({ range, shape }) {
    const R = Math.min(areaRadius(range, shape), 12);
    const fx = new Fx(2.4);
    const core = fx.add(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), fx.material(0x07000f, 0.95, false)));
    const halo = fx.add(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), fx.material(0x7a2cff, 0.35)));
    [core, halo].forEach((m) => { m.position.y = 2.6; });
    const disks = [0.55, 0.8, 1].map((f, i) => {
      const disk = fx.add(new THREE.Mesh(new THREE.RingGeometry(R * f * 0.9, R * f, 48), fx.material(i % 2 ? 0xff6bd6 : 0x9b6bff, 0.6)));
      disk.rotation.x = -Math.PI / 2 + 0.25;
      disk.position.y = 2.6;
      return disk;
    });
    const dust = fx.particles(90, 0xd9b8ff, 0.5);
    const seeds = Array.from({ length: 90 }, () => ({ a: rand(0, TAU), phase: rand(0, 1), s: rand(0.4, 0.9) }));
    const ground = fx.ring(R * 0.96, R, 0x7a2cff, 0.7);
    fx.tick = (t) => {
      const grow = Math.max(0.01, easeOut(t / 0.5));
      core.scale.setScalar(Math.max(0.01, R * 0.16 * grow));
      halo.scale.setScalar(Math.max(0.01, R * 0.22 * grow * (1 + Math.sin(t * 9) * 0.06)));
      ground.scale.setScalar(grow);
      disks.forEach((disk, i) => {
        disk.rotation.z = t * (2 + i) * (i % 2 ? -1 : 1);
        disk.scale.setScalar(grow);
      });
      seeds.forEach((s, i) => {
        const u = (s.phase + t * s.s) % 1;
        const r = R * (1 - u) * grow;
        const a = s.a + u * 5;
        dust.set(i, Math.cos(a) * r, 2.6 + (Math.sin(a * 2) * r) * 0.12, Math.sin(a) * r);
      });
      dust.commit();
    };
    return fx;
  },

  flameTornado({ range, shape }) {
    const R = Math.min(areaRadius(range, shape), 10);
    const fx = new Fx(1.9);
    const layers = Array.from({ length: 6 }, (_, i) => {
      const f = i / 5;
      const mesh = fx.add(new THREE.Mesh(
        new THREE.CylinderGeometry(R * (0.3 + f * 0.45), R * (0.2 + f * 0.25), 1.8, 24, 1, true),
        fx.material(i % 2 ? 0xffc04a : 0xff5a1a, 0.4)
      ));
      mesh.position.y = 0.9 + i * 1.4;
      return mesh;
    });
    const ground = fx.ring(R * 0.5, R * 0.75, 0xff7a2a, 0.7);
    const sparks = fx.particles(70, 0xffd27a, 0.6);
    const seeds = Array.from({ length: 70 }, () => ({ a: rand(0, TAU), r: rand(0.2, 1), s: rand(0.8, 2) }));
    fx.tick = (t) => {
      const grow = 0.3 + 0.7 * easeOut(t / 0.4);
      layers.forEach((mesh, i) => {
        mesh.rotation.y = t * (4 + i * 0.8) * (i % 2 ? -1 : 1);
        mesh.scale.set(grow, 1, grow);
      });
      ground.scale.setScalar(grow);
      seeds.forEach((s, i) => {
        const y = (t * s.s * 3) % 9;
        const a = s.a + t * 5 * s.s;
        const r = R * s.r * (0.3 + y / 14) * grow;
        sparks.set(i, Math.cos(a) * r, y, Math.sin(a) * r);
      });
      sparks.commit();
    };
    return fx;
  },

  bloodNova({ range, shape }) {
    const R = areaRadius(range, shape);
    const fx = new Fx(1.6);
    const pulses = [0, 0.18, 0.36].map((delay, i) => ({ delay, mesh: fx.ring(0.88, 1, i ? 0xff3a4a : 0xb3001b, 0.9) }));
    const star = fx.add(new THREE.Group());
    star.position.y = 0.08;
    const points = [0, 2, 4, 1, 3].map((i) => {
      const a = (i / 5) * TAU;
      return new THREE.Vector3(Math.cos(a) * R * 0.7, 0, Math.sin(a) * R * 0.7);
    });
    star.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), fx.lineMaterial(0xff4a5a)));
    const pentaRing = fx.ring(R * 0.7, R * 0.73, 0xff4a5a, 0.8);
    const drops = fx.particles(70, 0xd1001f, 0.7);
    const seeds = Array.from({ length: 70 }, () => ({ a: rand(0, TAU), speed: rand(0.5, 1.2), lift: rand(1, 3.5) }));
    fx.tick = (t) => {
      star.rotation.y = t * 1.5;
      pentaRing.scale.setScalar(Math.max(0.01, easeOut(t / 0.3)));
      pulses.forEach(({ delay, mesh }) => {
        const u = clamp01((t - delay) / 0.7);
        mesh.visible = u > 0 && u < 1;
        mesh.scale.setScalar(Math.max(0.01, R * easeOut(u)));
      });
      const p = clamp01((t - 0.1) / 1.0);
      seeds.forEach((s, i) => {
        const d = R * s.speed * easeOut(p);
        drops.set(i, Math.cos(s.a) * d, Math.max(0, s.lift * 4 * p * (1 - p)), Math.sin(s.a) * d);
      });
      drops.commit();
    };
    return fx;
  },

  runeSeal({ range, shape }) {
    const R = areaRadius(range, shape);
    const fx = new Fx(2.2);
    fx.ring(R * 0.94, R, 0x5ee7d1, 0.9);
    fx.ring(R * 0.62, R * 0.65, 0xc8fff6, 0.8);
    const spinner = fx.add(new THREE.Group());
    spinner.position.y = 0.08;
    const lineMaterial = fx.lineMaterial(0xa8fff0);
    [0, Math.PI / 4].forEach((offset) => {
      const points = [0, 1, 2, 3].map((i) => {
        const a = offset + (i * TAU) / 4;
        return new THREE.Vector3(Math.cos(a) * R * 0.86, 0, Math.sin(a) * R * 0.86);
      });
      spinner.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), lineMaterial));
    });
    const runeMaterial = fx.material(0xffffff, 0.9);
    for (let i = 0; i < 16; i++) {
      const rune = new THREE.Mesh(new THREE.BoxGeometry(R * 0.05, 0.02, R * 0.12), runeMaterial);
      const a = (i / 16) * TAU;
      rune.position.set(Math.cos(a) * R * 0.78, 0, Math.sin(a) * R * 0.78);
      rune.rotation.y = -a;
      spinner.add(rune);
    }
    const beamMaterial = fx.material(0x9ff7e6, 0.55);
    const beams = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * TAU;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.05, R * 0.08, 12, 8, 1, true), beamMaterial);
      beam.position.set(Math.cos(a) * R * 0.75, 6, Math.sin(a) * R * 0.75);
      return fx.add(beam);
    });
    const motes = fx.particles(40, 0xd8fff8, 0.5);
    const seeds = Array.from({ length: 40 }, () => ({ a: rand(0, TAU), r: rand(0.2, 0.95), s: rand(1, 3) }));
    fx.tick = (t) => {
      spinner.rotation.y = t * 1.2;
      spinner.scale.setScalar(Math.max(0.01, easeOut(t / 0.5)));
      const burst = clamp01((t - 0.9) / 0.15) * clamp01((1.9 - t) / 0.3);
      beams.forEach((beam, i) => {
        beam.scale.set(burst, 1, burst);
        beam.visible = burst > 0.01;
        beam.position.y = 6 * (0.9 + Math.sin(t * 8 + i) * 0.1);
      });
      seeds.forEach((s, i) => {
        motes.set(i, Math.cos(s.a - t) * R * s.r, (t * s.s) % 5, Math.sin(s.a - t) * R * s.r);
      });
      motes.commit();
    };
    return fx;
  },

  starfall({ range, shape }) {
    const R = areaRadius(range, shape);
    const fx = new Fx(2.2);
    const bodyMaterial = fx.material(0xfff3a0, 0.95);
    const tailMaterial = fx.material(0xffffff, 0.55);
    const blastMaterial = fx.material(0xffe27a, 0.8);
    const stars = Array.from({ length: 22 }, () => {
      const a = rand(0, TAU);
      const d = Math.sqrt(rand(0, 1)) * R;
      const body = new THREE.Mesh(new THREE.OctahedronGeometry(Math.max(0.3, R * 0.04)), bodyMaterial);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 3.5, 6, 1, true), tailMaterial);
      tail.position.y = 2;
      tail.rotation.z = 0.3;
      body.add(tail);
      const blast = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), blastMaterial);
      fx.add(body);
      fx.add(blast);
      return { x: Math.cos(a) * d, z: Math.sin(a) * d, delay: rand(0.05, 1.2), body, blast };
    });
    const FALL = 0.4;
    fx.tick = (t) => {
      stars.forEach((s) => {
        const u = clamp01((t - s.delay) / FALL);
        s.body.visible = t >= s.delay && u < 1;
        s.body.position.set(s.x - (1 - u) * 5, 20 * (1 - u) + 0.4, s.z);
        s.body.rotation.y = t * 8;
        const b = clamp01((t - s.delay - FALL) / 0.35);
        s.blast.visible = b > 0 && b < 1;
        s.blast.position.set(s.x, 0.5, s.z);
        s.blast.scale.setScalar(Math.max(0.01, 0.2 + R * 0.08 * easeOut(b)));
      });
    };
    return fx;
  },

  staticField({ range, shape }) {
    const R = Math.min(areaRadius(range, shape), 12);
    const fx = new Fx(1.9);
    const ground = fx.ring(R * 0.94, R, 0xffe45a, 0.85);
    const inner = fx.ring(0, R, 0x5a8cff, 0.18, 0.05);
    const dome = fx.add(new THREE.Mesh(new THREE.SphereGeometry(R, 24, 12, 0, TAU, 0, Math.PI / 2), fx.material(0x7fb4ff, 0.1)));
    const arcMaterial = fx.lineMaterial(0xf4f8ff);
    const arcs = Array.from({ length: 10 }, () => {
      const line = new THREE.Line(new THREE.BufferGeometry(), arcMaterial);
      line.frustumCulled = false;
      return fx.add(line);
    });
    const sparks = fx.particles(50, 0xfff27a, 0.5);
    const seeds = Array.from({ length: 50 }, () => ({ a: rand(0, TAU), r: rand(0.1, 1), s: rand(1, 3) }));
    let next = 0;
    const regenerate = () => {
      arcs.forEach((line) => {
        const a = rand(0, TAU);
        const b = a + rand(-1.2, 1.2);
        const from = new THREE.Vector3(Math.cos(a) * R * rand(0.3, 1), 0.1, Math.sin(a) * R * rand(0.3, 1));
        const to = new THREE.Vector3(Math.cos(b) * R * rand(0, 0.8), rand(2, 5), Math.sin(b) * R * rand(0, 0.8));
        line.geometry.setFromPoints(jagged(from, to, 7, 0.7));
      });
    };
    fx.tick = (t) => {
      const grow = Math.max(0.01, easeOut(t / 0.3));
      ground.scale.setScalar(grow);
      inner.scale.setScalar(grow);
      dome.scale.setScalar(grow);
      if (t >= next) {
        regenerate();
        next = t + 0.08;
      }
      seeds.forEach((s, i) => {
        sparks.set(i, Math.cos(s.a + t * s.s) * R * s.r, rand(0, 4), Math.sin(s.a + t * s.s) * R * s.r);
      });
      sparks.commit();
    };
    return fx;
  }
};

const LABELS = {
  poisonCloud: { en: 'Poison Cloud', id: 'Awan Racun' },
  holyLight: { en: 'Holy Light', id: 'Cahaya Suci' },
  earthSpike: { en: 'Earth Spikes', id: 'Duri Tanah' },
  tidalWave: { en: 'Tidal Wave', id: 'Gelombang Pasang' },
  blackHole: { en: 'Black Hole', id: 'Lubang Hitam' },
  flameTornado: { en: 'Flame Tornado', id: 'Tornado Api' },
  bloodNova: { en: 'Blood Nova', id: 'Nova Darah' },
  runeSeal: { en: 'Rune Seal', id: 'Segel Rune' },
  starfall: { en: 'Starfall', id: 'Hujan Bintang' },
  staticField: { en: 'Static Field', id: 'Medan Listrik' }
};

registerEffects(BUILDERS, LABELS);
