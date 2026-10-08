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
    const mesh = fx.add(new THREE.Mesh(
      element === 'fire'
        ? new THREE.ConeGeometry(R * 0.06, length, 7)
        : new THREE.CylinderGeometry(R * 0.025, R * 0.045, length, 6),
      fx.material(i % 3 ? c.main : c.hot, 0.78)
    ));
    mesh.userData = { x: Math.cos(a) * d, z: Math.sin(a) * d, length, delay: (i / count) * 0.9 };
    return mesh;
  });
  const impact = fx.ring(0.2, 0.5, c.hot, 0.75);
  fx.tick = (t) => {
    drops.forEach((drop, i) => {
      const u = clamp01((t - drop.userData.delay) / 0.55);
      drop.visible = u < 1;
      drop.position.set(drop.userData.x - (1 - u) * variant * 0.5, 8 * (1 - u) + 0.3, drop.userData.z);
      drop.rotation.set(0.15 + variant * 0.08, t * 3 + i, 0.15);
    });
    const p = clamp01((t - 0.6) / 0.45);
    impact.scale.setScalar(R * easeOut(p));
    impact.position.y = 0.06;
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
  const lines = Array.from({ length: 5 + variant }, () => {
    const line = fx.add(new THREE.Line(new THREE.BufferGeometry(), fx.lineMaterial(c.hot, 0.95)));
    line.frustumCulled = false;
    return line;
  });
  const ground = fx.ring(R * 0.82, R, c.main, 0.55);
  const regenerate = () => lines.forEach((line, i) => {
    const a = (i / lines.length) * TAU + rand(-0.25, 0.25);
    const d = R * rand(0.35, 1);
    const points = [new THREE.Vector3(Math.cos(a) * d, 0.1, Math.sin(a) * d)];
    for (let j = 1; j < 7; j++) points.push(new THREE.Vector3(Math.cos(a) * d + rand(-0.65, 0.65), j * 0.7 + rand(-0.2, 0.2), Math.sin(a) * d + rand(-0.65, 0.65)));
    points.push(new THREE.Vector3(0, 0.5, 0));
    line.geometry.setFromPoints(points);
  });
  let next = 0;
  fx.tick = (t) => {
    ground.scale.setScalar(easeOut(t / 0.3));
    lines.forEach((line, i) => { line.visible = Math.sin(t * 25 + i) > -0.35; });
    if (t >= next) { regenerate(); next = t + 0.07; }
  };
  return fx;
}

const BUILDERS = {
  elementFireBurst: (o) => coneBurst('fire', o, 1),
  elementFireSpiral: (o) => elementalSpiral('fire', o, 3),
  elementEmberRain: (o) => fallingRain('fire', o, 2),
  elementMagmaRing: (o) => coneBurst('fire', o, 5),
  elementSolarFlare: (o) => elementalBurst('fire', o, 4),
  elementWindBlade: (o) => elementalProjectile('wind', o, 0),
  elementCycloneBurst: (o) => elementalSpiral('wind', o, 1),
  elementAirCutter: (o) => elementalProjectile('wind', o, 3),
  elementStormEye: (o) => lightningField('wind', o, 2),
  elementFeatherGale: (o) => fallingRain('wind', o, 3),
  elementStoneBurst: (o) => coneBurst('earth', o, 2),
  elementTectonicRing: (o) => elementalField('earth', o, 2),
  elementCrystalWall: (o) => wallEffect('earth', o, 4),
  elementBoulderField: (o) => fallingRain('earth', o, 4),
  elementQuakePulse: (o) => coneBurst('earth', o, 6),
  elementWaterWhirlpool: (o) => elementalSpiral('water', o, 2),
  elementAquaLance: (o) => elementalProjectile('water', o, 1),
  elementTidalBurst: (o) => wallEffect('water', o, 2),
  elementBubblePrison: (o) => bubblePrison('water', o, 2),
  elementRainCrescent: (o) => fallingRain('water', o, 1),
  elementSparkBurst: (o) => lightningField('electric', o, 1),
  elementThunderField: (o) => lightningField('electric', o, 5),
  elementChainLightning: (o) => lightningField('electric', o, 3),
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
