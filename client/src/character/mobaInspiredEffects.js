import * as THREE from 'three';
import { Fx, TAU, clamp01, easeOut, orbitingOrbs, rand, registerEffects, volumetricShell } from './effects.js';

// Original MOBA-readable effects. These use distinct silhouettes and timing, not copied game assets.

function astralBlade({ range }) {
  const r = Math.min(Math.max(range, 4), 11);
  const fx = new Fx(0.8);
  const arcs = [0, 1, 2].map((i) => {
    const mesh = fx.add(new THREE.Mesh(new THREE.TorusGeometry(r * (0.34 + i * 0.08), r * 0.035, 8, 36, Math.PI * 0.9), fx.material(i === 1 ? 0xb9d8ff : 0x5b8cff, i === 1 ? 0.92 : 0.4)));
    mesh.rotation.x = Math.PI / 2;
    mesh.userData = { delay: i * 0.07, side: i % 2 ? -1 : 1 };
    return mesh;
  });
  const sparks = fx.particles(28, 0xeaf4ff, 0.45);
  const seeds = Array.from({ length: 28 }, () => ({ a: rand(-0.8, 0.8), d: rand(0.3, 1), phase: rand(0, TAU) }));
  fx.tick = (t) => {
    arcs.forEach((arc) => {
      const u = easeOut((t - arc.userData.delay) / 0.3);
      arc.position.z = u * r * 0.5;
      arc.rotation.z = arc.userData.side * u * 1.8;
      arc.scale.setScalar(Math.max(0.01, u * (1 - clamp01((t - 0.52) * 3))));
    });
    seeds.forEach((s, i) => sparks.set(i, Math.sin(s.a) * r * s.d, 1.2 + Math.sin(t * 8 + s.phase) * 0.35, 1 + Math.cos(s.a) * r * s.d));
    sparks.commit();
  };
  return fx;
}

function infernoComet({ range }) {
  const length = Math.min(Math.max(range, 8), 30);
  const fx = new Fx(1.35);
  const body = fx.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.7, 1), fx.material(0x54221c, 0.98, false)));
  const core = fx.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), fx.material(0xffe2a0, 0.98)));
  const plume = fx.add(new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.6, 10, 1, true), fx.material(0xff6a1e, 0.52)));
  plume.rotation.x = -Math.PI / 2;
  const impact = fx.ring(0.25, 0.5, 0xffd26a, 0.85);
  const fire = fx.particles(55, 0xffa33a, 0.55);
  const seeds = Array.from({ length: 55 }, () => ({ x: rand(-0.5, 0.5), y: rand(-0.3, 0.6), z: rand(0, 1) }));
  fx.tick = (t) => {
    const travel = 0.52;
    const u = clamp01(t / travel);
    const z = 1 + (length - 1) * easeOut(u);
    const flying = t < travel;
    body.visible = core.visible = plume.visible = flying;
    body.position.set(0, 1.7, z);
    body.rotation.set(t * 4, t * 5, t * 2);
    core.position.copy(body.position);
    core.scale.setScalar(1 + Math.sin(t * 22) * 0.15);
    plume.position.set(0, 1.7, z - 1.8);
    const impactU = clamp01((t - travel) / 0.48);
    impact.visible = impactU < 1;
    impact.position.set(0, 0.08, length);
    impact.scale.setScalar(Math.max(0.01, Math.min(8, Math.max(2.5, length * 0.18)) * easeOut(impactU)));
    seeds.forEach((s, i) => fire.set(i, s.x + (Math.random() - 0.5) * 0.3, 1.7 + s.y, z - s.z * 2));
    fire.commit();
  };
  return fx;
}

function frostPrison({ range }) {
  const r = Math.min(Math.max(range, 4), 12);
  const fx = new Fx(1.7);
  const shell = volumetricShell(fx, r * 0.6, 0x55bfff, 1.25);
  const shards = Array.from({ length: 12 }, (_, i) => {
    const h = r * rand(0.45, 0.8);
    const shard = fx.add(new THREE.Mesh(new THREE.ConeGeometry(r * 0.06, h, 6), fx.material(i % 2 ? 0xbaf5ff : 0x5dbdff, 0.72)));
    shard.userData = { a: (i / 12) * TAU, d: r * 0.7, delay: i * 0.05, h };
    return shard;
  });
  const ring = fx.ring(r * 0.75, r * 0.82, 0xbaf5ff, 0.8);
  fx.tick = (t) => {
    const open = easeOut(t / 0.45);
    shell.userData.animate(t, open * (1 - clamp01((t - 1.15) * 2)));
    shell.position.y = r * 0.8;
    ring.scale.setScalar(open);
    shards.forEach((shard) => {
      const u = easeOut((t - shard.userData.delay) / 0.35);
      const a = shard.userData.a + t * 0.25;
      shard.position.set(Math.cos(a) * shard.userData.d, shard.userData.h * u * 0.5, Math.sin(a) * shard.userData.d);
      shard.scale.setScalar(Math.max(0.01, u * (1 - clamp01((t - 1.2) * 2))));
      shard.rotation.set(Math.sin(a) * 0.3, a, Math.cos(a) * 0.3);
    });
  };
  return fx;
}

function stormLance({ range }) {
  const length = Math.min(Math.max(range, 8), 32);
  const fx = new Fx(1.0);
  const charge = fx.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 1), fx.material(0xf4f8ff, 0.98)));
  const aura = fx.add(new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), fx.material(0x5d86ff, 0.3)));
  const bolts = Array.from({ length: 5 }, () => fx.add(new THREE.Line(new THREE.BufferGeometry(), fx.lineMaterial(0xbfd1ff, 0.9))));
  fx.tick = (t) => {
    const u = easeOut(t / 0.32);
    const z = 1 + (length - 1) * easeOut(clamp01((t - 0.18) / 0.4));
    const active = t >= 0.18 && t < 0.65;
    charge.visible = aura.visible = !active;
    charge.position.set(0, 1.6, 1 + u * 1.8);
    charge.rotation.set(t * 8, t * 6, t * 4);
    aura.position.copy(charge.position);
    aura.scale.setScalar(1 + Math.sin(t * 20) * 0.16);
    bolts.forEach((bolt, i) => {
      bolt.visible = active;
      const side = (i - 2) * 0.12;
      bolt.geometry.setFromPoints([new THREE.Vector3(side, 1.6, 1), new THREE.Vector3(side * 1.4 + rand(-0.25, 0.25), 1.6 + rand(-0.3, 0.3), z * 0.5), new THREE.Vector3(side * 0.4, 1.6 + rand(-0.2, 0.2), z)]);
    });
  };
  return fx;
}

function voidBloom({ range }) {
  const r = Math.min(Math.max(range, 4), 12);
  const fx = new Fx(1.9);
  const core = fx.add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.24, 24, 16), fx.material(0x080312, 0.98, false)));
  const shell = volumetricShell(fx, r * 0.52, 0x7c3cff, 1.0);
  const petals = Array.from({ length: 8 }, (_, i) => {
    const petal = fx.add(new THREE.Mesh(new THREE.TorusGeometry(r * 0.3, r * 0.045, 8, 24, Math.PI * 0.72), fx.material(i % 2 ? 0xd76bff : 0x713bdb, 0.6)));
    petal.userData = { a: (i / 8) * TAU };
    return petal;
  });
  const motes = orbitingOrbs(fx, r, 0xd8b6ff, 8, 1.0);
  fx.tick = (t) => {
    const p = easeOut(t / 0.5);
    core.position.y = r * 0.75;
    core.rotation.set(t * 1.5, t * 3, t * 2);
    core.scale.setScalar(p * (1 + Math.sin(t * 7) * 0.08));
    shell.position.y = r * 0.75;
    shell.userData.animate(t, p * (1 - clamp01((t - 1.2) * 1.4)));
    petals.forEach((petal) => {
      const a = petal.userData.a + t * 0.7;
      const d = r * (0.24 + p * 0.3);
      petal.position.set(Math.cos(a) * d, r * 0.75 + Math.sin(t * 2 + a) * 0.3, Math.sin(a) * d);
      petal.rotation.set(Math.PI / 2 + Math.sin(t + a) * 0.4, a, t * 1.5);
      petal.scale.setScalar(p);
    });
    motes(t, p);
  };
  return fx;
}

registerEffects(
  {
    mobaAstralBlade: astralBlade,
    mobaInfernoComet: infernoComet,
    mobaFrostPrison: frostPrison,
    mobaStormLance: stormLance,
    mobaVoidBloom: voidBloom
  },
  {
    mobaAstralBlade: { en: 'Astral Blade', id: 'Pedang Astral' },
    mobaInfernoComet: { en: 'Inferno Comet', id: 'Komet Inferno' },
    mobaFrostPrison: { en: 'Frost Prison', id: 'Penjara Embun Beku' },
    mobaStormLance: { en: 'Storm Lance', id: 'Tombak Badai' },
    mobaVoidBloom: { en: 'Void Bloom', id: 'Mekar Void' }
  }
);
