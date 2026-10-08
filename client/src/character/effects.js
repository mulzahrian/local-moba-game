import * as THREE from 'three';
import { setModelOpacity } from './characterAssets.js';

/**
 * Procedural skill effects. Every effect is built in the caster's local space (origin at the
 * caster's feet, +Z forward) and sized from the skill's `range` / `shape`, so the same effect can
 * be used by any skill. `tick(t, dt)` animates it, `duration` ends it.
 */

export const TAU = Math.PI * 2;
export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const easeOut = (v) => 1 - (1 - clamp01(v)) ** 3;
export const rand = (min, max) => min + Math.random() * (max - min);

export class Fx {
  constructor(duration) {
    this.duration = duration;
    this.group = new THREE.Group();
    this.materials = [];
    this.tick = () => {};
    this.modelOpacity = null;
  }

  track(material, opacity) {
    material.userData.base = opacity;
    this.materials.push(material);
    return material;
  }

  material(color, opacity = 0.9, additive = true) {
    return this.track(
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      }),
      opacity
    );
  }

  lineMaterial(color, opacity = 0.95) {
    return this.track(
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }),
      opacity
    );
  }

  add(object) {
    this.group.add(object);
    return object;
  }

  // Flat ring lying on the ground.
  ring(inner, outer, color, opacity = 0.9, y = 0.06) {
    const mesh = this.add(new THREE.Mesh(new THREE.RingGeometry(inner, outer, 48), this.material(color, opacity)));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    return mesh;
  }

  particles(count, color, size, additive = true) {
    const positions = new Float32Array(count * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = this.track(
      new THREE.PointsMaterial({
        color,
        size,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
      }),
      0.9
    );
    const points = this.add(new THREE.Points(geometry, material));
    points.frustumCulled = false;
    return {
      set: (i, x, y, z) => {
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
      },
      commit: () => {
        geometry.attributes.position.needsUpdate = true;
      }
    };
  }

  setAlpha(alpha) {
    this.materials.forEach((m) => {
      const value = m.userData.base * alpha;
      if (m.userData.alphaUniform) m.userData.alphaUniform.value = value;
      else m.opacity = value;
    });
  }

  dispose() {
    this.group.traverse((child) => child.geometry?.dispose());
    this.materials.forEach((m) => m.dispose());
    this.group.parent?.remove(this.group);
  }
}

// Size of an area-style effect around the caster, whatever shape the skill has.
export function areaRadius(range, shape) {
  if (shape === 'circle') return Math.min(Math.max(range, 3), 20);
  if (shape === 'cone') return Math.min(Math.max(range * 0.6, 3), 9);
  return Math.min(Math.max(range * 0.25, 3), 6);
}

// Small solid accents give area effects a readable 3D silhouette from the isometric camera.
// They are intentionally lightweight meshes instead of large particle clouds, so they remain
// visible when the effect is viewed from the side as well as from above.
export function orbitingOrbs(fx, radius, color, count = 6, height = 1.2) {
  const material = fx.material(color, 0.9);
  const orbs = Array.from({ length: count }, (_, i) => {
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(Math.max(0.08, radius * 0.045), 1), material);
    orb.userData = { angle: (i / count) * TAU, phase: rand(0, TAU), lift: rand(0.65, 1.35) };
    fx.add(orb);
    return orb;
  });
  return (t, progress = 1) => {
    orbs.forEach((orb, i) => {
      const { angle, phase, lift } = orb.userData;
      const a = angle + t * (1.2 + i * 0.08);
      const r = radius * (0.45 + 0.42 * Math.sin(t * 2 + phase) ** 2) * progress;
      orb.position.set(Math.cos(a) * r, height * lift + Math.sin(t * 3 + phase) * 0.25, Math.sin(a) * r);
      orb.scale.setScalar(0.7 + 0.3 * Math.sin(t * 5 + phase) ** 2);
    });
  };
}

// A translucent animated shell gives an area effect volume. The moving vertex offset and
// fresnel edge keep it readable from the side instead of looking like a flat decal.
export function volumetricShell(fx, radius, color, height = 1) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 0.35 }
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec3 p = position;
        float wave = sin(p.y * 5.0 + uTime * 4.0) * 0.045 + sin(p.x * 7.0 - uTime * 3.0) * 0.035;
        p += normal * wave;
        vPosition = p;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uOpacity;
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vPosition);
        float fresnel = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 2.2);
        float bands = 0.5 + 0.5 * sin(vPosition.y * 8.0 + uTime * 5.0 + vPosition.x * 4.0);
        float alpha = (0.08 + fresnel * 0.62 + bands * 0.10) * uOpacity;
        gl_FragColor = vec4(uColor * (0.85 + fresnel * 0.7), alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  material.userData.base = 0.35;
  material.userData.alphaUniform = material.uniforms.uOpacity;
  fx.materials.push(material);

  const shell = fx.add(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), material));
  shell.scale.set(radius, radius * height, radius);
  shell.userData.animate = (t, progress = 1) => {
    material.uniforms.uTime.value = t;
    const breathe = 0.94 + Math.sin(t * 5.5) * 0.04;
    shell.scale.set(radius * progress * breathe, radius * height * progress * breathe, radius * progress * breathe);
  };
  return shell;
}

const reach = (range) => Math.min(Math.max(range, 4), 40);

const BUILDERS = {
  magicCircle({ range, shape }) {
    const R = areaRadius(range, shape);
    const fx = new Fx(1.8);
    fx.ring(R * 0.93, R, 0xb36bff);
    fx.ring(R * 0.62, R * 0.65, 0x7ad0ff, 0.8);
    fx.ring(R * 0.3, R * 0.32, 0xb36bff, 0.7);

    const spinner = fx.add(new THREE.Group());
    spinner.position.y = 0.08;
    const starMaterial = fx.lineMaterial(0xe0b8ff);
    [0, Math.PI / 3].forEach((offset) => {
      const points = [0, 1, 2].map((i) => {
        const a = offset + (i * TAU) / 3;
        return new THREE.Vector3(Math.cos(a) * R * 0.88, 0, Math.sin(a) * R * 0.88);
      });
      spinner.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), starMaterial));
    });
    const runeMaterial = fx.material(0xffffff, 0.9);
    for (let i = 0; i < 12; i++) {
      const rune = new THREE.Mesh(new THREE.BoxGeometry(R * 0.07, 0.02, R * 0.16), runeMaterial);
      const a = (i / 12) * TAU;
      rune.position.set(Math.cos(a) * R * 0.78, 0, Math.sin(a) * R * 0.78);
      rune.rotation.y = -a;
      spinner.add(rune);
    }

    const sparks = fx.particles(40, 0xd9a8ff, 0.5);
    const shell = volumetricShell(fx, R * 0.7, 0xa86bff, 0.42);
    const orbs = orbitingOrbs(fx, R, 0xc28cff, 7, 0.7);
    const seeds = Array.from({ length: 40 }, () => ({ a: rand(0, TAU), r: rand(0.2, 0.95), s: rand(1.5, 3.5) }));
    fx.tick = (t) => {
      const open = easeOut(t / 0.35);
      fx.group.scale.setScalar(0.2 + 0.8 * open);
      spinner.rotation.y = t * 1.6;
      shell.userData.animate(t, open);
      shell.position.y = R * 0.5;
      orbs(t, open);
      seeds.forEach((s, i) => {
        sparks.set(i, Math.cos(s.a + t) * R * s.r, (t * s.s) % 5, Math.sin(s.a + t) * R * s.r);
      });
      sparks.commit();
    };
    return fx;
  },

  fireBurst({ range, shape }) {
    const R = areaRadius(range, shape);
    const fx = new Fx(1.0);
    const outer = fx.add(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), fx.material(0xff6a1a, 0.55)));
    const inner = fx.add(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), fx.material(0xffd24a, 0.8)));
    const ground = fx.ring(0.9, 1, 0xff9a3a, 0.9);
    const shell = volumetricShell(fx, R * 0.55, 0xff6a1a, 0.8);
    const orbs = orbitingOrbs(fx, R, 0xffc04a, 8, 0.9);
    const sparks = fx.particles(60, 0xffa23a, 0.7);
    const seeds = Array.from({ length: 60 }, () => ({ a: rand(0, TAU), speed: rand(0.6, 1.6), lift: rand(0.4, 1.4) }));
    fx.tick = (t) => {
      const p = clamp01(t / fx.duration);
      outer.scale.setScalar(Math.max(0.01, R * 0.5 * easeOut(p * 1.4)));
      outer.position.y = R * 0.3;
      inner.scale.setScalar(Math.max(0.01, R * 0.3 * easeOut(p * 2)));
      inner.position.y = R * 0.3;
      shell.userData.animate(t, easeOut(p * 1.3));
      shell.position.y = R * 0.3;
      ground.scale.setScalar(Math.max(0.01, R * easeOut(p * 1.6)));
      orbs(t, easeOut(p * 1.2));
      seeds.forEach((s, i) => {
        const d = R * s.speed * easeOut(p * 1.3);
        sparks.set(i, Math.cos(s.a) * d, s.lift * R * 0.5 * Math.sin(Math.min(p * 1.4, 1) * Math.PI), Math.sin(s.a) * d);
      });
      sparks.commit();
    };
    return fx;
  },

  iceNova({ range, shape }) {
    const R = areaRadius(range, shape);
    const fx = new Fx(1.4);
    const wave = fx.ring(0.92, 1, 0x9fe8ff, 0.9);
    const frost = fx.ring(0, 1, 0x4fb8ff, 0.25, 0.04);
    const shardMaterial = fx.material(0xbff3ff, 0.85);
    const shards = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const length = R * rand(0.18, 0.32);
      const shard = new THREE.Mesh(new THREE.ConeGeometry(R * 0.04, length, 5), shardMaterial);
      shard.userData = { a, length, dist: R * rand(0.45, 0.95) };
      fx.add(shard);
      shards.push(shard);
    }
    const snow = fx.particles(50, 0xffffff, 0.45);
    const shell = volumetricShell(fx, R * 0.7, 0x62c8ff, 0.3);
    const orbs = orbitingOrbs(fx, R, 0x9fe8ff, 8, 0.6);
    const seeds = Array.from({ length: 50 }, () => ({ a: rand(0, TAU), r: rand(0.1, 1), s: rand(0.5, 1.5) }));
    fx.tick = (t) => {
      const p = clamp01(t / fx.duration);
      wave.scale.setScalar(Math.max(0.01, R * easeOut(p * 1.8)));
      frost.scale.setScalar(Math.max(0.01, R * easeOut(p * 1.8)));
      shell.userData.animate(t, easeOut(p * 1.4));
      shell.position.y = R * 0.35;
      orbs(t, easeOut(p * 1.4));
      shards.forEach((s) => {
        const grow = easeOut((p - 0.1) * 3);
        const { a, length, dist } = s.userData;
        s.scale.setScalar(Math.max(0.01, grow));
        s.position.set(Math.cos(a) * dist, (length * grow) / 2, Math.sin(a) * dist);
        s.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
      });
      seeds.forEach((s, i) => {
        snow.set(i, Math.cos(s.a) * R * s.r, 4 - ((t * s.s * 3 + i) % 4), Math.sin(s.a) * R * s.r);
      });
      snow.commit();
    };
    return fx;
  },

  lightningStrike({ range, shape }) {
    const R = areaRadius(range, shape);
    const fx = new Fx(1.0);
    const flash = fx.ring(0.5, 1, 0xcfe6ff, 0.8);
    const glow = fx.add(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), fx.material(0x9fc4ff, 0.5)));
    glow.position.y = 1;
    const boltMaterial = fx.lineMaterial(0xe8f2ff);
    const bolts = Array.from({ length: 5 }, (_, i) => {
      const a = rand(0, TAU);
      const d = i === 0 ? 0 : rand(0.3, 0.9) * R;
      const lines = [0, 1, 2].map(() => {
        const line = new THREE.Line(new THREE.BufferGeometry(), boltMaterial);
        line.frustumCulled = false;
        line.visible = false;
        fx.add(line);
        return line;
      });
      return { x: Math.cos(a) * d, z: Math.sin(a) * d, delay: i * 0.1, lines, next: 0 };
    });
    const regenerate = (bolt) => {
      bolt.lines.forEach((line, k) => {
        const points = [];
        const segments = 9;
        for (let s = 0; s <= segments; s++) {
          const jitter = s === 0 || s === segments ? 0 : 0.9;
          points.push(new THREE.Vector3(
            bolt.x + rand(-jitter, jitter) + (k - 1) * 0.12,
            14 * (1 - s / segments),
            bolt.z + rand(-jitter, jitter)
          ));
        }
        line.geometry.setFromPoints(points);
      });
    };
    fx.tick = (t) => {
      bolts.forEach((bolt) => {
        const active = t >= bolt.delay && t < bolt.delay + 0.45;
        bolt.lines.forEach((line) => { line.visible = active; });
        if (active && t >= bolt.next) {
          regenerate(bolt);
          bolt.next = t + 0.06;
        }
      });
      const p = clamp01(t / fx.duration);
      flash.scale.setScalar(Math.max(0.01, R * easeOut(p * 2)));
      glow.scale.setScalar(Math.max(0.01, R * 0.25 * (1 + Math.sin(t * 40) * 0.2)));
    };
    return fx;
  },

  shadowVanish({ range, shape }) {
    const R = Math.min(areaRadius(range, shape), 5);
    const fx = new Fx(1.5);
    const smoke = fx.particles(70, 0x2a1842, 1.6, false);
    const glow = fx.particles(30, 0xa05cff, 0.5);
    const ring = fx.ring(R * 0.9, R, 0x7a3cd0, 0.7);
    const smokeSeeds = Array.from({ length: 70 }, () => ({ a: rand(0, TAU), r: rand(0.1, 1), up: rand(0.5, 3) }));
    const glowSeeds = Array.from({ length: 30 }, () => ({ a: rand(0, TAU), r: rand(0.2, 1), up: rand(1, 4) }));
    fx.tick = (t) => {
      const p = clamp01(t / fx.duration);
      ring.scale.setScalar(Math.max(0.01, 0.4 + easeOut(p * 2) * 0.8));
      smokeSeeds.forEach((s, i) => {
        const spread = R * s.r * (0.4 + p);
        smoke.set(i, Math.cos(s.a + p * 3) * spread, 0.3 + s.up * p * 1.2, Math.sin(s.a + p * 3) * spread);
      });
      glowSeeds.forEach((s, i) => {
        glow.set(i, Math.cos(s.a - t * 2) * R * s.r, (s.up * t) % 4, Math.sin(s.a - t * 2) * R * s.r);
      });
      smoke.commit();
      glow.commit();
    };
    // Fades out quickly, stays hidden for a moment, then reappears
    fx.modelOpacity = (t) => {
      if (t < 0.25) return 1 - (t / 0.25) * 0.95;
      if (t < 0.9) return 0.05;
      return 0.05 + clamp01((t - 0.9) / 0.35) * 0.95;
    };
    return fx;
  },

  slashArc({ range }) {
    const length = Math.min(Math.max(range, 4), 12);
    const fx = new Fx(0.5);
    const arc = (Math.PI * 2) / 3;
    const start = -Math.PI / 2 - arc / 2; // centred on +Z after the ring is laid flat
    const pivot = fx.add(new THREE.Group());
    pivot.position.y = 1.8;
    const blade = new THREE.Mesh(new THREE.RingGeometry(length * 0.55, length, 40, 1, start, arc), fx.material(0xffe9b0, 0.95));
    const trail = new THREE.Mesh(new THREE.RingGeometry(length * 0.7, length * 0.98, 40, 1, start, arc), fx.material(0xff7a3a, 0.5));
    [blade, trail].forEach((mesh) => {
      mesh.rotation.x = -Math.PI / 2;
      pivot.add(mesh);
    });
    fx.tick = (t) => {
      const p = easeOut(t / 0.3);
      pivot.rotation.y = (0.6 - p * 1.2) * 1.1;
      pivot.scale.setScalar(0.7 + p * 0.3);
    };
    return fx;
  },

  healingAura({ range, shape }) {
    const R = Math.min(areaRadius(range, shape), 8);
    const fx = new Fx(1.9);
    const pulses = [0, 0.5, 1.0].map((delay) => ({ delay, mesh: fx.ring(0.88, 1, 0x6dff9a, 0.85) }));
    const column = fx.add(new THREE.Mesh(
      new THREE.CylinderGeometry(R * 0.55, R * 0.55, 7, 24, 1, true),
      fx.material(0x8cffb4, 0.18)
    ));
    column.position.y = 3.5;
    const motes = fx.particles(50, 0xd8ffe4, 0.5);
    const shell = volumetricShell(fx, R * 0.5, 0x69ff9a, 1.4);
    const orbs = orbitingOrbs(fx, R, 0xb8ffd2, 6, 1.1);
    const seeds = Array.from({ length: 50 }, () => ({ a: rand(0, TAU), r: rand(0.2, 0.55), s: rand(1, 3) }));
    fx.tick = (t) => {
      pulses.forEach(({ delay, mesh }) => {
        const u = clamp01((t - delay) / 0.9);
        mesh.visible = u > 0 && u < 1;
        mesh.scale.setScalar(Math.max(0.01, R * easeOut(u)));
      });
      shell.userData.animate(t, easeOut(t / 0.55));
      shell.position.y = 2.8;
      orbs(t, easeOut(t / 0.55));
      seeds.forEach((s, i) => {
        motes.set(i, Math.cos(s.a + t * 2) * R * s.r, (t * s.s) % 6, Math.sin(s.a + t * 2) * R * s.r);
      });
      motes.commit();
    };
    return fx;
  },

  windVortex({ range, shape }) {
    const R = areaRadius(range, shape);
    const fx = new Fx(1.7);
    const layers = Array.from({ length: 6 }, (_, i) => {
      const f = i / 5;
      const mesh = fx.add(new THREE.Mesh(
        new THREE.CylinderGeometry(R * (0.35 + f * 0.4), R * (0.25 + f * 0.3), 1.6, 28, 1, true),
        fx.material(i % 2 ? 0xd8f4ff : 0x9fd8ff, 0.35)
      ));
      mesh.position.y = 0.8 + i * 1.2;
      return mesh;
    });
    const dust = fx.particles(60, 0xeaf6ff, 0.5);
    const shell = volumetricShell(fx, R * 0.48, 0x9fd8ff, 2.6);
    const orbs = orbitingOrbs(fx, R, 0xd8f4ff, 7, 1.4);
    const seeds = Array.from({ length: 60 }, () => ({ a: rand(0, TAU), r: rand(0.3, 1), s: rand(0.8, 2) }));
    fx.tick = (t) => {
      layers.forEach((mesh, i) => {
        mesh.rotation.y = t * (3 + i * 0.7) * (i % 2 ? -1 : 1);
        mesh.scale.setScalar(0.3 + 0.7 * easeOut(t / 0.4));
      });
      shell.userData.animate(t, easeOut(t / 0.4));
      shell.position.y = R * 0.9;
      orbs(t, easeOut(t / 0.4));
      seeds.forEach((s, i) => {
        const a = s.a + t * 4 * s.s;
        const y = (t * s.s * 3) % 8;
        const r = R * s.r * (0.4 + y / 14);
        dust.set(i, Math.cos(a) * r, y, Math.sin(a) * r);
      });
      dust.commit();
    };
    return fx;
  },

  shockwave({ range, shape }) {
    const R = areaRadius(range, shape);
    const fx = new Fx(0.95);
    const waves = [0, 0.12].map((delay) => ({ delay, mesh: fx.ring(0.86, 1, delay ? 0xffd9a0 : 0xffffff, 0.9) }));
    const dustMaterial = fx.material(0xc9a77a, 0.45, false);
    const dust = Array.from({ length: 14 }, (_, i) => {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(R * 0.12, 8, 6), dustMaterial);
      puff.userData.a = (i / 14) * TAU + rand(-0.1, 0.1);
      return fx.add(puff);
    });
    const crackMaterial = fx.lineMaterial(0xffe0a0);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + rand(-0.15, 0.15);
      const points = [new THREE.Vector3(0, 0.07, 0)];
      for (let s = 1; s <= 5; s++) {
        const d = (s / 5) * R * 0.9;
        points.push(new THREE.Vector3(Math.cos(a) * d + rand(-0.4, 0.4), 0.07, Math.sin(a) * d + rand(-0.4, 0.4)));
      }
      fx.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), crackMaterial));
    }
    fx.tick = (t) => {
      waves.forEach(({ delay, mesh }) => {
        const u = clamp01((t - delay) / 0.6);
        mesh.visible = u > 0;
        mesh.scale.setScalar(Math.max(0.01, R * easeOut(u)));
      });
      const p = clamp01(t / fx.duration);
      dust.forEach((puff) => {
        const d = R * 0.85 * easeOut(p * 1.5);
        puff.position.set(Math.cos(puff.userData.a) * d, 0.5 + p * 2.2, Math.sin(puff.userData.a) * d);
        puff.scale.setScalar(0.6 + p * 1.6);
      });
    };
    return fx;
  },

  arrowVolley({ range }) {
    const length = reach(range);
    const fx = new Fx(0.5 + length / 90);
    const material = fx.material(0xfff0b0, 0.95);
    const trailMaterial = fx.material(0xffc85a, 0.5);
    const arrows = [-1.2, -0.6, 0, 0.6, 1.2].map((lateral, i) => {
      const arrow = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), material);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 6), material);
      head.position.y = 1.4;
      const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.28, 3, 6, 1, true), trailMaterial);
      trail.position.y = -2.4;
      arrow.add(shaft, head, trail);
      arrow.rotation.x = Math.PI / 2; // cylinders point along +Y; turn them to +Z
      const holder = new THREE.Group();
      holder.add(arrow);
      holder.userData = { lateral, delay: i * 0.05 };
      holder.visible = false;
      return fx.add(holder);
    });
    const speed = length / 0.35;
    fx.tick = (t) => {
      arrows.forEach((holder) => {
        const u = t - holder.userData.delay;
        holder.visible = u > 0 && u * speed < length;
        holder.position.set(holder.userData.lateral * 0.6, 1.6, 1 + Math.max(0, u) * speed);
      });
    };
    return fx;
  },

  meteorFall({ range, shape }) {
    const R = areaRadius(range, shape);
    const fx = new Fx(2.0);
    const bodyMaterial = fx.material(0xff7a2a, 0.95);
    const tailMaterial = fx.material(0xffc060, 0.6);
    const blastMaterial = fx.material(0xffb04a, 0.8);
    const meteors = Array.from({ length: 7 }, (_, i) => {
      const a = rand(0, TAU);
      const d = i === 0 ? 0 : rand(0.2, 0.9) * R;
      const size = Math.max(0.5, R * 0.07);
      const body = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 8), bodyMaterial);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(size, 5, 10, 1, true), tailMaterial);
      tail.position.y = 3;
      body.add(tail);
      const blast = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), blastMaterial);
      fx.add(body);
      fx.add(blast);
      const marker = fx.ring(0.3, 0.45, 0xff5a2a, 0.7);
      return { x: Math.cos(a) * d, z: Math.sin(a) * d, delay: 0.1 + i * 0.18, body, blast, marker };
    });
    const FALL = 0.5;
    fx.tick = (t) => {
      meteors.forEach((m) => {
        const u = clamp01((t - m.delay) / FALL);
        const started = t >= m.delay;
        m.marker.position.set(m.x, 0.06, m.z);
        m.marker.scale.setScalar(Math.max(0.01, R * 0.15));
        m.marker.visible = started && u < 1;
        m.body.visible = started && u < 1;
        m.body.position.set(m.x - (1 - u) * 8, 24 * (1 - u * u) + 0.5, m.z);
        m.body.rotation.z = 0.3;
        const b = clamp01((t - m.delay - FALL) / 0.45);
        m.blast.visible = b > 0 && b < 1;
        m.blast.position.set(m.x, 0.8, m.z);
        m.blast.scale.setScalar(Math.max(0.01, R * 0.22 * easeOut(b) + 0.1));
      });
    };
    return fx;
  }
};

export const EFFECT_LABELS = {
  none: { en: 'None', id: 'Tidak ada' },
  magicCircle: { en: 'Magic Circle', id: 'Lingkaran Sihir' },
  fireBurst: { en: 'Fire Burst', id: 'Ledakan Api' },
  iceNova: { en: 'Ice Nova', id: 'Nova Es' },
  lightningStrike: { en: 'Lightning Strike', id: 'Sambaran Petir' },
  shadowVanish: { en: 'Shadow Vanish', id: 'Menghilang Bayangan' },
  slashArc: { en: 'Slash Arc', id: 'Tebasan Busur' },
  healingAura: { en: 'Healing Aura', id: 'Aura Penyembuh' },
  windVortex: { en: 'Wind Vortex', id: 'Pusaran Angin' },
  shockwave: { en: 'Shockwave', id: 'Gelombang Kejut' },
  arrowVolley: { en: 'Arrow Volley', id: 'Rentetan Panah' },
  meteorFall: { en: 'Meteor Fall', id: 'Hujan Meteor' }
};

// Lets other effect sets (the skill effects) plug their builders into the same manager.
export function registerEffects(builders, labels = null) {
  Object.assign(BUILDERS, builders);
  if (labels) Object.assign(EFFECT_LABELS, labels);
}

export function effectLabel(id, language) {
  return EFFECT_LABELS[id]?.[language] || EFFECT_LABELS[id]?.en || id;
}

/** Spawns, animates and disposes effects inside a Three.js scene. */
export class EffectManager {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
  }

  /**
   * @param id effect id (see EFFECT_IDS)
   * @param options position (caster), rotationY (facing), range / shape of the skill, and the optional
   *   character `model` that effects like shadowVanish may fade, and the skill's own `params` (skill effects).
   */
  spawn(id, { position, rotationY = 0, range = 8, shape = 'circle', model = null, params = null } = {}) {
    const build = BUILDERS[id];
    if (!build) return;
    const fx = build({ range, shape, params });
    fx.group.position.set(position.x, position.y || 0, position.z);
    fx.group.rotation.y = rotationY;
    this.scene.add(fx.group);
    const entry = { fx, model, time: 0 };
    this.active.push(entry);
    this.step(entry, 0);
  }

  step(entry, dt) {
    const { fx } = entry;
    entry.time += dt;
    const t = entry.time;
    fx.tick(t, dt);
    const fadeIn = Math.min(1, t / 0.12);
    const fadeOut = Math.min(1, (fx.duration - t) / 0.35);
    fx.setAlpha(Math.max(0, Math.min(fadeIn, fadeOut)));
    if (fx.modelOpacity && entry.model) setModelOpacity(entry.model, fx.modelOpacity(t));
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const entry = this.active[i];
      this.step(entry, dt);
      if (entry.time >= entry.fx.duration) {
        this.finish(entry);
        this.active.splice(i, 1);
      }
    }
  }

  finish({ fx, model }) {
    if (fx.modelOpacity && model) setModelOpacity(model, 1);
    fx.dispose();
  }

  dispose() {
    this.active.forEach((entry) => this.finish(entry));
    this.active = [];
  }
}
