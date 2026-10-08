import * as THREE from 'three';
import {
  Fx,
  TAU,
  areaRadius,
  clamp01,
  easeOut,
  orbitingOrbs,
  rand,
  registerEffects,
  volumetricShell
} from './effects.js';

// Elemental effects used by Character Management. Each builder stays in local space:
// origin is the caster's feet and +Z is the cast direction.

const ELEMENTS = {
  fire: { main: 0xff5b20, hot: 0xffd45a, dark: 0x9e2117 },
  wind: { main: 0x72d9ff, hot: 0xe8fbff, dark: 0x2d7aa8 },
  earth: { main: 0x9a6b43, hot: 0xd8b276, dark: 0x4e3829 },
  water: { main: 0x238de0, hot: 0xb9f4ff, dark: 0x14529c },
  electric: { main: 0x6e8cff, hot: 0xf5f7ff, dark: 0x5540c4 }
};

const makeSeeds = (count, radius = 1) => Array.from({ length: count }, () => ({
  angle: rand(0, TAU),
  radius: rand(0.15, 1) * radius,
  speed: rand(0.6, 1.8),
  lift: rand(0.5, 1.5),
  phase: rand(0, TAU)
}));

function elementalBurst(element, { range, shape }, variant = 0) {
  const c = ELEMENTS[element];
  const R = areaRadius(range, shape);
  const fx = new Fx(1.25 + variant * 0.12);
  const shell = volumetricShell(fx, R * (0.45 + variant * 0.035), c.main, 0.7 + variant * 0.1);
  const rings = Array.from({ length: 2 + (variant % 2) }, (_, i) => ({
    delay: i * 0.1,
    mesh: fx.ring(0.82, 1, i % 2 ? c.hot : c.main, 0.75)
  }));
  const orbs = orbitingOrbs(fx, R, c.hot, 5 + variant, 0.5 + variant * 0.15);
  const particles = fx.particles(45 + variant * 8, c.hot, 0.5 + variant * 0.04);
  const seeds = makeSeeds(45 + variant * 8, R);
  fx.tick = (t) => {
    const p = clamp01(t / fx.duration);
    const open = easeOut(p * 1.5);
    shell.userData.animate(t, open * (1 - clamp01((p - 0.68) * 2.5)));
    shell.position.y = R * (0.28 + variant * 0.06);
    rings.forEach(({ delay, mesh }) => {
      const u = clamp01((t - delay) / 0.7);
      mesh.visible = u > 0 && u < 1;
      mesh.scale.setScalar(Math.max(0.01, R * easeOut(u)));
      mesh.rotation.z = (iHash(variant) * 0.2) + t * (variant % 2 ? -0.7 : 0.7);
    });
    orbs(t, open);
    seeds.forEach((s, i) => {
      const d = s.radius * easeOut(p * 1.3);
      particles.set(i, Math.cos(s.angle + t * s.speed) * d, 0.35 + s.lift * R * 0.45 * Math.sin(p * Math.PI), Math.sin(s.angle + t * s.speed) * d);
    });
    particles.commit();
  };
  return fx;
}

// Stable per-variant rotation without adding another random value during every frame.
const iHash = (value) => (value * 1.618) % TAU;

function elementalSpiral(element, { range, shape }, variant = 0) {
  const c = ELEMENTS[element];
  const R = areaRadius(range, shape);
  const fx = new Fx(1.8 + variant * 0.1);
  const shell = volumetricShell(fx, R * 0.35, c.main, 2.8);
  const strands = Array.from({ length: 4 + variant }, (_, i) => {
    const material = fx.material(i % 2 ? c.hot : c.main, 0.55);
    const mesh = fx.add(new THREE.Mesh(new THREE.TorusGeometry(R * (0.2 + i * 0.035), R * 0.035, 8, 32), material));
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  });
  const motes = fx.particles(55, c.hot, 0.45);
  const seeds = makeSeeds(55, R * 0.8);
  fx.tick = (t) => {
    const p = easeOut(t / 0.45);
    shell.userData.animate(t, p * (1 - clamp01((t - fx.duration + 0.45) * 2)));
    shell.position.y = R * 0.95;
    strands.forEach((mesh, i) => {
      mesh.rotation.y = t * (2.4 + i * 0.55) * (i % 2 ? -1 : 1);
      mesh.rotation.x = Math.PI / 2 + Math.sin(t * 2 + i) * 0.25;
      mesh.scale.setScalar(p * (0.85 + Math.sin(t * 4 + i) * 0.1));
    });
    seeds.forEach((s, i) => {
      const a = s.angle + t * (2 + s.speed);
      const y = 0.4 + ((t * s.speed * 2 + s.phase) % 5);
      const r = s.radius * (0.35 + y / 8);
      motes.set(i, Math.cos(a) * r, y, Math.sin(a) * r);
    });
    motes.commit();
  };
  return fx;
}

function elementalField(element, { range, shape }, variant = 0) {
  const c = ELEMENTS[element];
  const R = areaRadius(range, shape);
  const fx = new Fx(1.7 + variant * 0.1);
  const ground = fx.ring(R * 0.86, R, c.main, 0.75);
  const shell = volumetricShell(fx, R * 0.82, c.main, 0.9);
  const pillars = Array.from({ length: 5 + variant }, (_, i) => {
    const a = (i / (5 + variant)) * TAU;
    const pillar = fx.add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.035, R * 0.12, R * 0.9, 7, 1, true), fx.material(i % 2 ? c.hot : c.main, 0.45)));
    pillar.position.set(Math.cos(a) * R * 0.65, 0, Math.sin(a) * R * 0.65);
    pillar.userData = { angle: a, delay: i * 0.08 };
    return pillar;
  });
  const motes = fx.particles(45, c.hot, 0.55);
  const seeds = makeSeeds(45, R);
  fx.tick = (t) => {
    const open = easeOut(t / 0.42);
    ground.scale.setScalar(open);
    shell.userData.animate(t, open * (1 - clamp01((t - 1.05) * 1.5)));
    shell.position.y = R * 0.5;
    pillars.forEach((pillar) => {
      const u = easeOut((t - pillar.userData.delay) / 0.35);
      pillar.scale.y = Math.max(0.01, u * (1 + Math.sin(t * 5 + pillar.userData.angle) * 0.12));
      pillar.rotation.y = t * 1.5 + pillar.userData.angle;
    });
    seeds.forEach((s, i) => motes.set(i, Math.cos(s.angle + t * s.speed) * s.radius, 0.3 + ((t * s.lift + s.phase) % 4), Math.sin(s.angle + t * s.speed) * s.radius));
    motes.commit();
  };
  return fx;
}

function elementalProjectile(element, { range, shape }, variant = 0) {
  const c = ELEMENTS[element];
  const L = Math.min(Math.max(range, 5), 35);
  const fx = new Fx(0.9 + L / 80);
  const core = fx.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 + variant * 0.08, 1), fx.material(c.hot, 0.95)));
  const halo = fx.add(new THREE.Mesh(new THREE.SphereGeometry(1.1 + variant * 0.1, 16, 12), fx.material(c.main, 0.35)));
  const trail = fx.particles(35 + variant * 5, c.main, 0.55);
  const seeds = makeSeeds(35 + variant * 5, 1);
  const travel = 0.45 + variant * 0.04;
  fx.tick = (t) => {
    const u = clamp01(t / travel);
    const z = 1 + (L - 1) * easeOut(u);
    const flying = t < travel;
    core.visible = halo.visible = flying;
    core.position.set(0, 1.5 + Math.sin(t * 18) * 0.12, z);
    core.rotation.set(t * 5, t * 7, t * 3);
    halo.position.copy(core.position);
    halo.scale.setScalar(1 + Math.sin(t * 24) * 0.15);
    seeds.forEach((s, i) => trail.set(i, (Math.random() - 0.5) * 0.8, 1.5 + s.lift * 0.25, z - s.radius * (0.4 + s.speed * 0.25)));
    trail.commit();
  };
  return fx;
}

function coneBurst(element, { range, shape }, variant = 0) {
  const c = ELEMENTS[element];
  const R = areaRadius(range, shape);
  const fx = new Fx(1.45 + variant * 0.08);
  const count = 7 + variant;
  const cones = Array.from({ length: count }, (_, i) => {
    const a = (i / count) * TAU;
    const h = R * (0.35 + rand(0.2, 0.55));
    const mesh = fx.add(new THREE.Mesh(new THREE.ConeGeometry(R * 0.1, h, element === 'earth' ? 6 : 10), fx.material(i % 2 ? c.hot : c.main, 0.82, element !== 'earth')));
    mesh.userData = { a, h, d: R * (0.25 + (i % 4) * 0.18), delay: i * 0.045 };
    return mesh;
  });
  const ground = fx.ring(R * 0.8, R, c.main, 0.55);
  const shell = volumetricShell(fx, R * 0.42, c.main, 0.65);
  fx.tick = (t) => {
    const open = easeOut(t / 0.48);
    ground.scale.setScalar(open);
    shell.userData.animate(t, open * (1 - clamp01((t - 0.85) * 2)));
    shell.position.y = R * 0.3;
    cones.forEach((mesh) => {
      const u = easeOut((t - mesh.userData.delay) / 0.32);
      const h = mesh.userData.h * u * (1 - clamp01((t - 0.95) * 1.8));
      mesh.position.set(Math.cos(mesh.userData.a) * mesh.userData.d, h / 2, Math.sin(mesh.userData.a) * mesh.userData.d);
      mesh.scale.set(1, Math.max(0.01, h / mesh.userData.h), 1);
      mesh.rotation.y = mesh.userData.a + t * (element === 'wind' ? 2 : 0.5);
    });
  };
  return fx;
}

function fallingRain(element, { range, shape }, variant = 0) {
  const c = ELEMENTS[element];
  const R = areaRadius(range, shape);
  const fx = new Fx(1.8 + variant * 0.12);
  const count = 16 + variant * 4;
  const drops = Array.from({ length: count }, (_, i) => {
    const a = rand(0, TAU);
    const d = Math.sqrt(rand(0, 1)) * R;
    const length = R * rand(0.18, 0.42);
    const holder = fx.add(new THREE.Group());
    const material = fx.material(i % 3 ? c.main : c.hot, 0.78);
    const body = fx.add(new THREE.Mesh(
      element === 'fire'
        ? new THREE.IcosahedronGeometry(R * 0.07, 1)
        : element === 'wind'
          ? new THREE.TetrahedronGeometry(R * 0.08, 0)
          : new THREE.CapsuleGeometry(R * 0.035, length * 0.75, 4, 8),
      material
    ));
    const tail = fx.add(new THREE.Mesh(
      new THREE.ConeGeometry(R * 0.045, length, 7, 1, true),
      fx.material(c.hot, 0.42)
    ));
    tail.rotation.x = Math.PI;
    tail.position.y = length * 0.45;
    holder.add(body, tail);
    holder.userData = { x: Math.cos(a) * d, z: Math.sin(a) * d, length, delay: (i / count) * 0.9, phase: rand(0, TAU) };
    return holder;
  });
  const impact = fx.ring(0.2, 0.5, c.hot, 0.75);
  const impactCore = fx.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), fx.material(c.hot, 0.7)));
  fx.tick = (t) => {
    drops.forEach((drop, i) => {
      const u = clamp01((t - drop.userData.delay) / 0.55);
      drop.visible = u < 1;
      const fall = 8 * (1 - u) + 0.3;
      drop.position.set(drop.userData.x - (1 - u) * variant * 0.5, fall, drop.userData.z);
      drop.rotation.set(0.15 + variant * 0.08, t * (3 + i * 0.1), 0.15);
    });
    const p = clamp01((t - 0.6) / 0.45);
    impact.scale.setScalar(R * easeOut(p));
    impact.position.y = 0.06;
    impactCore.scale.setScalar(Math.max(0.01, (1 - p) * 0.7));
    impactCore.position.set(0, 0.35, 0);
  };
  return fx;
}

function wallEffect(element, { range, shape }, variant = 0) {
  const c = ELEMENTS[element];
  const R = areaRadius(range, shape);
  const fx = new Fx(1.8);
  const pieces = Array.from({ length: 7 + variant }, (_, i) => {
    const mesh = fx.add(new THREE.Mesh(
      element === 'earth' ? new THREE.DodecahedronGeometry(R * 0.22, 0) : new THREE.TetrahedronGeometry(R * 0.2, 1),
      fx.material(i % 2 ? c.hot : c.main, 0.8, element !== 'earth')
    ));
    mesh.userData = { x: (i / (6 + variant) - 0.5) * R * 1.7, z: R * 0.55 + rand(-0.25, 0.25), delay: i * 0.08, spin: rand(-2, 2) };
    return mesh;
  });
  const mist = fx.particles(45, c.hot, 0.5);
  const seeds = makeSeeds(45, R);
  fx.tick = (t) => {
    pieces.forEach((piece) => {
      const u = easeOut((t - piece.userData.delay) / 0.42);
      piece.position.set(piece.userData.x, R * 0.5 * u, piece.userData.z - (1 - u) * 1.5);
      piece.rotation.set(t * piece.userData.spin, t * 1.5, t * piece.userData.spin * 0.5);
      piece.scale.setScalar(Math.max(0.01, u * (1 - clamp01((t - 1.2) * 1.8))));
    });
    seeds.forEach((s, i) => mist.set(i, Math.cos(s.angle + t) * s.radius, 0.3 + ((t * s.speed) % 3), Math.sin(s.angle + t) * s.radius));
    mist.commit();
  };
  return fx;
}

function bubblePrison(element, { range, shape }, variant = 0) {
  const c = ELEMENTS[element];
  const R = areaRadius(range, shape);
  const fx = new Fx(1.8);
  const bubbles = Array.from({ length: 8 + variant }, (_, i) => {
    const mesh = fx.add(new THREE.Mesh(new THREE.SphereGeometry(R * rand(0.09, 0.18), 16, 10), fx.material(c.hot, 0.35)));
    mesh.userData = { a: (i / (8 + variant)) * TAU, r: R * rand(0.25, 0.85), y: rand(0.5, 3), phase: rand(0, TAU) };
    return mesh;
  });
  const cage = fx.ring(R * 0.82, R, c.main, 0.7);
  fx.tick = (t) => {
    const open = easeOut(t / 0.35);
    cage.scale.setScalar(open);
    bubbles.forEach((bubble) => {
      const d = bubble.userData;
      const a = d.a + t * (0.6 + variant * 0.1);
      bubble.position.set(Math.cos(a) * d.r, d.y + Math.sin(t * 2 + d.phase) * 0.3, Math.sin(a) * d.r);
      bubble.scale.setScalar(0.8 + Math.sin(t * 4 + d.phase) * 0.15);
    });
  };
  return fx;
}

function lightningField(element, { range, shape }, variant = 0) {
  const c = ELEMENTS[element];
  const R = areaRadius(range, shape);
  const fx = new Fx(1.4 + variant * 0.1);
  const bolts = Array.from({ length: 5 + variant }, () => {
    const outer = fx.add(new THREE.Line(new THREE.BufferGeometry(), fx.lineMaterial(c.main, 0.7)));
    const core = fx.add(new THREE.Line(new THREE.BufferGeometry(), fx.lineMaterial(c.hot, 0.98)));
    outer.frustumCulled = core.frustumCulled = false;
    return { outer, core, x: 0, z: 0, y: 0 };
  });
  const nodes = bolts.map(({ x, z }) => fx.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.07, 8, 6), fx.material(c.hot, 0.7))));
  const ground = fx.ring(R * 0.82, R, c.main, 0.55);
  const regenerate = () => bolts.forEach((bolt, i) => {
    const a = (i / bolts.length) * TAU + rand(-0.25, 0.25);
    const d = R * rand(0.35, 1);
    const bottom = new THREE.Vector3(Math.cos(a) * d, 0.12, Math.sin(a) * d);
    const top = new THREE.Vector3(Math.cos(a) * d * 0.25, rand(2.5, 5), Math.sin(a) * d * 0.25);
    const points = [bottom];
    for (let j = 1; j < 8; j++) {
      const u = j / 8;
      points.push(new THREE.Vector3(
        THREE.MathUtils.lerp(bottom.x, top.x, u) + rand(-0.45, 0.45),
        THREE.MathUtils.lerp(bottom.y, top.y, u),
        THREE.MathUtils.lerp(bottom.z, top.z, u) + rand(-0.45, 0.45)
      ));
    }
    points.push(top);
    bolt.outer.geometry.setFromPoints(points);
    bolt.core.geometry.setFromPoints(points.map((point) => point.clone().multiplyScalar(0.985)));
    bolt.x = bottom.x;
    bolt.z = bottom.z;
  });
  let next = 0;
  fx.tick = (t) => {
    ground.scale.setScalar(easeOut(t / 0.3));
    bolts.forEach((bolt, i) => {
      const visible = Math.sin(t * 25 + i * 1.7) > -0.35;
      bolt.outer.visible = bolt.core.visible = visible;
      nodes[i].visible = visible;
      nodes[i].position.set(bolt.x, 0.12, bolt.z);
      nodes[i].scale.setScalar(0.7 + Math.sin(t * 16 + i) * 0.25);
    });
    if (t >= next) { regenerate(); next = t + 0.07; }
  };
  return fx;
}

function magmaRift({ range, shape }) {
  const c = ELEMENTS.fire;
  const R = areaRadius(range, shape);
  const fx = new Fx(1.9);
  const cracks = Array.from({ length: 9 }, (_, i) => {
    const line = fx.add(new THREE.Line(new THREE.BufferGeometry(), fx.lineMaterial(i % 2 ? c.hot : c.main, 0.85)));
    line.frustumCulled = false;
    return line;
  });
  const rocks = Array.from({ length: 13 }, (_, i) => {
    const rock = fx.add(new THREE.Mesh(new THREE.DodecahedronGeometry(R * rand(0.045, 0.1), 0), fx.material(i % 2 ? c.main : c.hot, 0.85, false)));
    rock.userData = { a: rand(0, TAU), d: R * rand(0.15, 0.95), delay: rand(0, 0.45), spin: rand(-3, 3) };
    return rock;
  });
  fx.tick = (t) => {
    cracks.forEach((line, i) => {
      const a = (i / cracks.length) * TAU + Math.sin(t * 2 + i) * 0.08;
      const points = [new THREE.Vector3(0, 0.08, 0)];
      for (let s = 1; s <= 5; s++) {
        const d = (s / 5) * R * (0.55 + Math.sin(t * 3 + i) * 0.08);
        points.push(new THREE.Vector3(Math.cos(a) * d + rand(-0.35, 0.35), 0.08, Math.sin(a) * d + rand(-0.35, 0.35)));
      }
      line.geometry.setFromPoints(points);
    });
    rocks.forEach((rock) => {
      const u = easeOut((t - rock.userData.delay) / 0.32);
      const d = rock.userData.d * (0.6 + u * 0.4);
      rock.position.set(Math.cos(rock.userData.a) * d, 0.2 + Math.sin(u * Math.PI) * R * 0.35, Math.sin(rock.userData.a) * d);
      rock.rotation.set(t * rock.userData.spin, t * 1.7, t * rock.userData.spin * 0.6);
      rock.scale.setScalar(Math.max(0.01, u * (1 - clamp01((t - 1.3) * 2))));
    });
  };
  return fx;
}

function solarFlare({ range, shape }) {
  const c = ELEMENTS.fire;
  const R = areaRadius(range, shape);
  const fx = new Fx(1.6);
  const core = fx.add(new THREE.Mesh(new THREE.IcosahedronGeometry(R * 0.22, 2), fx.material(c.hot, 0.98)));
  const halo = fx.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.42, 24, 16), fx.material(c.main, 0.28)));
  const rays = Array.from({ length: 14 }, (_, i) => {
    const ray = fx.add(new THREE.Mesh(new THREE.ConeGeometry(R * 0.045, R * rand(0.65, 1.2), 6, 1, true), fx.material(i % 2 ? c.hot : c.main, 0.6)));
    ray.userData = { a: (i / 14) * TAU, phase: rand(0, TAU) };
    return ray;
  });
  fx.tick = (t) => {
    const p = easeOut(t / 0.35);
    core.position.y = R * 0.7;
    core.rotation.set(t * 1.8, t * 2.4, t * 1.2);
    core.scale.setScalar(p * (0.9 + Math.sin(t * 10) * 0.08));
    halo.position.copy(core.position);
    halo.scale.setScalar(p * (1 + Math.sin(t * 7) * 0.1));
    rays.forEach((ray) => {
      const d = R * (0.45 + Math.sin(t * 5 + ray.userData.phase) * 0.12);
      ray.position.set(Math.cos(ray.userData.a + t * 0.4) * d, R * 0.7, Math.sin(ray.userData.a + t * 0.4) * d);
      ray.rotation.set(Math.sin(ray.userData.a) * 0.8, -ray.userData.a, Math.cos(ray.userData.a) * 0.8);
      ray.scale.setScalar(p * (0.8 + Math.sin(t * 8 + ray.userData.phase) * 0.2));
    });
  };
  return fx;
}

function airCutter({ range, shape }, variant = 0) {
  const c = ELEMENTS.wind;
  const R = areaRadius(range, shape);
  const fx = new Fx(0.95);
  const blades = Array.from({ length: 3 + variant }, (_, i) => {
    const blade = fx.add(new THREE.Mesh(new THREE.TorusGeometry(R * 0.32 + i * R * 0.05, R * 0.035, 8, 32, Math.PI * 0.95), fx.material(i % 2 ? c.hot : c.main, 0.72)));
    blade.rotation.x = Math.PI / 2;
    blade.userData = { delay: i * 0.08, side: i % 2 ? -1 : 1 };
    return blade;
  });
  fx.tick = (t) => blades.forEach((blade) => {
    const u = easeOut((t - blade.userData.delay) / 0.35);
    blade.position.z = u * R * 0.85;
    blade.rotation.z = blade.userData.side * (u * 2.4);
    blade.scale.setScalar(Math.max(0.01, u * (1 - clamp01((t - 0.6) * 2))));
  });
  return fx;
}

function featherGale({ range, shape }, variant = 0) {
  const c = ELEMENTS.wind;
  const R = areaRadius(range, shape);
  const fx = new Fx(1.8);
  const feathers = Array.from({ length: 18 + variant * 3 }, (_, i) => {
    const feather = fx.add(new THREE.Mesh(new THREE.TetrahedronGeometry(R * 0.09, 0), fx.material(i % 2 ? c.hot : c.main, 0.68)));
    feather.userData = { a: rand(0, TAU), r: rand(0.2, 1) * R, phase: rand(0, TAU), speed: rand(0.7, 1.5) };
    return feather;
  });
  fx.tick = (t) => feathers.forEach((feather) => {
    const d = feather.userData;
    const a = d.a + t * d.speed;
    feather.position.set(Math.cos(a) * d.r, 0.5 + ((t * d.speed + d.phase) % 4), Math.sin(a) * d.r);
    feather.rotation.set(t * 2 + d.phase, a, Math.sin(t * 3 + d.phase));
    feather.scale.setScalar(0.75 + Math.sin(t * 5 + d.phase) * 0.2);
  });
  return fx;
}

function quakePulse({ range, shape }) {
  const c = ELEMENTS.earth;
  const R = areaRadius(range, shape);
  const fx = new Fx(1.15);
  const waves = [0, 0.12, 0.24].map((delay, i) => ({ delay, mesh: fx.ring(0.82, 1, i ? c.hot : c.main, 0.8) }));
  const cracks = Array.from({ length: 12 }, (_, i) => fx.add(new THREE.Line(new THREE.BufferGeometry(), fx.lineMaterial(c.hot, 0.75))));
  fx.tick = (t) => {
    waves.forEach(({ delay, mesh }, i) => {
      const u = clamp01((t - delay) / 0.65);
      mesh.visible = u > 0 && u < 1;
      mesh.scale.setScalar(R * easeOut(u));
      mesh.rotation.z = t * (i % 2 ? -1 : 1);
    });
    cracks.forEach((line, i) => {
      const a = (i / cracks.length) * TAU;
      const d = R * clamp01(t * 1.8);
      line.geometry.setFromPoints([new THREE.Vector3(0, 0.08, 0), new THREE.Vector3(Math.cos(a) * d, 0.08, Math.sin(a) * d)]);
    });
  };
  return fx;
}

function sparkBurst({ range, shape }, variant = 0) {
  const c = ELEMENTS.electric;
  const R = areaRadius(range, shape);
  const fx = new Fx(1.1);
  const core = fx.add(new THREE.Mesh(new THREE.IcosahedronGeometry(R * 0.18, 1), fx.material(c.hot, 0.95)));
  const sparks = Array.from({ length: 10 + variant }, () => fx.add(new THREE.Line(new THREE.BufferGeometry(), fx.lineMaterial(c.hot, 0.9))));
  fx.tick = (t) => {
    core.position.y = R * 0.6;
    core.rotation.set(t * 8, t * 6, t * 4);
    sparks.forEach((line, i) => {
      const a = (i / sparks.length) * TAU + t * 0.8;
      const length = R * (0.25 + easeOut(t / 0.25) * 0.75);
      line.geometry.setFromPoints([
        new THREE.Vector3(0, R * 0.6, 0),
        new THREE.Vector3(Math.cos(a) * length * 0.45, R * (0.6 + Math.sin(i * 2) * 0.2), Math.sin(a) * length * 0.45),
        new THREE.Vector3(Math.cos(a) * length, R * (0.6 + Math.cos(i) * 0.25), Math.sin(a) * length)
      ]);
    });
  };
  return fx;
}

function thunderField({ range, shape }, variant = 0) {
  const c = ELEMENTS.electric;
  const R = areaRadius(range, shape);
  const fx = new Fx(1.7);
  const rods = Array.from({ length: 5 + variant }, (_, i) => {
    const rod = fx.add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.035, R * 0.08, R * 1.4, 7), fx.material(i % 2 ? c.hot : c.main, 0.65)));
    const a = (i / (5 + variant)) * TAU;
    rod.userData = { a, d: R * 0.68, delay: i * 0.06 };
    return rod;
  });
  const arcs = fx.particles(30, c.hot, 0.5);
  const seeds = makeSeeds(30, R);
  fx.tick = (t) => {
    rods.forEach((rod) => {
      const u = easeOut((t - rod.userData.delay) / 0.3);
      rod.position.set(Math.cos(rod.userData.a) * rod.userData.d, R * 0.7 * u, Math.sin(rod.userData.a) * rod.userData.d);
      rod.scale.y = Math.max(0.01, u * (0.9 + Math.sin(t * 18 + rod.userData.a) * 0.2));
      rod.rotation.z = Math.sin(t * 5 + rod.userData.a) * 0.2;
    });
    seeds.forEach((s, i) => arcs.set(i, Math.cos(s.angle + t * 3) * s.radius, 0.5 + ((t * s.speed) % 3), Math.sin(s.angle + t * 3) * s.radius));
    arcs.commit();
  };
  return fx;
}

function chainLightning({ range, shape }, variant = 0) {
  const c = ELEMENTS.electric;
  const R = areaRadius(range, shape);
  const fx = new Fx(1.55);
  const nodes = Array.from({ length: 4 + variant }, (_, i) => fx.add(new THREE.Mesh(new THREE.IcosahedronGeometry(R * 0.11, 1), fx.material(c.hot, 0.85))));
  const links = Array.from({ length: nodes.length - 1 }, () => fx.add(new THREE.Line(new THREE.BufferGeometry(), fx.lineMaterial(c.hot, 0.95))));
  fx.tick = (t) => {
    nodes.forEach((node, i) => {
      const a = (i / nodes.length) * TAU + t * 0.8;
      node.position.set(Math.cos(a) * R * 0.55, 0.8 + Math.sin(t * 4 + i) * 0.45, Math.sin(a) * R * 0.55);
      node.rotation.set(t * 5, t * 7, t * 3);
    });
    links.forEach((line, i) => {
      const from = nodes[i].position;
      const to = nodes[i + 1].position;
      const points = [from.clone()];
      for (let j = 1; j < 4; j++) points.push(new THREE.Vector3(THREE.MathUtils.lerp(from.x, to.x, j / 4) + rand(-0.3, 0.3), THREE.MathUtils.lerp(from.y, to.y, j / 4) + rand(-0.3, 0.3), THREE.MathUtils.lerp(from.z, to.z, j / 4) + rand(-0.3, 0.3)));
      points.push(to.clone());
      line.geometry.setFromPoints(points);
    });
  };
  return fx;
}

const BUILDERS = {
  elementFireBurst: (o) => coneBurst('fire', o, 1),
  elementFireSpiral: (o) => elementalSpiral('fire', o, 3),
  elementEmberRain: (o) => fallingRain('fire', o, 2),
  elementMagmaRing: magmaRift,
  elementSolarFlare: solarFlare,
  elementWindBlade: (o) => elementalProjectile('wind', o, 0),
  elementCycloneBurst: (o) => elementalSpiral('wind', o, 1),
  elementAirCutter: airCutter,
  elementStormEye: (o) => lightningField('wind', o, 2),
  elementFeatherGale: featherGale,
  elementStoneBurst: (o) => coneBurst('earth', o, 2),
  elementTectonicRing: (o) => elementalField('earth', o, 2),
  elementCrystalWall: (o) => wallEffect('earth', o, 4),
  elementBoulderField: (o) => fallingRain('earth', o, 4),
  elementQuakePulse: quakePulse,
  elementWaterWhirlpool: (o) => elementalSpiral('water', o, 2),
  elementAquaLance: (o) => elementalProjectile('water', o, 1),
  elementTidalBurst: (o) => wallEffect('water', o, 2),
  elementBubblePrison: (o) => bubblePrison('water', o, 2),
  elementRainCrescent: (o) => fallingRain('water', o, 1),
  elementSparkBurst: (o) => sparkBurst(o, 1),
  elementThunderField: (o) => thunderField(o, 5),
  elementChainLightning: (o) => chainLightning(o, 3),
  elementVoltNova: (o) => elementalBurst('electric', o, 4),
  elementElectricCage: (o) => bubblePrison('electric', o, 5)
};

const LABELS = {
  elementFireBurst: { en: 'Fire Burst', id: 'Ledakan Api' },
  elementFireSpiral: { en: 'Fire Spiral', id: 'Pusaran Api' },
  elementEmberRain: { en: 'Ember Rain', id: 'Hujan Bara' },
  elementMagmaRing: { en: 'Magma Ring', id: 'Cincin Magma' },
  elementSolarFlare: { en: 'Solar Flare', id: 'Semburan Surya' },
  elementWindBlade: { en: 'Wind Blade', id: 'Pedang Angin' },
  elementCycloneBurst: { en: 'Cyclone Burst', id: 'Ledakan Siklon' },
  elementAirCutter: { en: 'Air Cutter', id: 'Sabetan Udara' },
  elementStormEye: { en: 'Storm Eye', id: 'Mata Badai' },
  elementFeatherGale: { en: 'Feather Gale', id: 'Badai Bulu Angin' },
  elementStoneBurst: { en: 'Stone Burst', id: 'Ledakan Batu' },
  elementTectonicRing: { en: 'Tectonic Ring', id: 'Cincin Tektonik' },
  elementCrystalWall: { en: 'Crystal Wall', id: 'Dinding Kristal' },
  elementBoulderField: { en: 'Boulder Field', id: 'Ladang Bongkah' },
  elementQuakePulse: { en: 'Quake Pulse', id: 'Denyut Gempa' },
  elementWaterWhirlpool: { en: 'Water Whirlpool', id: 'Pusaran Air' },
  elementAquaLance: { en: 'Aqua Lance', id: 'Tombak Air' },
  elementTidalBurst: { en: 'Tidal Burst', id: 'Ledakan Pasang' },
  elementBubblePrison: { en: 'Bubble Prison', id: 'Penjara Gelembung' },
  elementRainCrescent: { en: 'Rain Crescent', id: 'Sabit Hujan' },
  elementSparkBurst: { en: 'Spark Burst', id: 'Ledakan Percik' },
  elementThunderField: { en: 'Thunder Field', id: 'Medan Petir' },
  elementChainLightning: { en: 'Chain Lightning', id: 'Rantai Listrik' },
  elementVoltNova: { en: 'Volt Nova', id: 'Nova Volt' },
  elementElectricCage: { en: 'Electric Cage', id: 'Kandang Listrik' }
};

registerEffects(BUILDERS, LABELS);
