import * as THREE from 'three';
import { Fx, clamp01, easeOut, rand, registerEffects } from './effects.js';

/**
 * The bolt a tower shoots at an enemy. Built like the other effects (local space at the tower's feet, +Z towards
 * the target); `params` = { color, main, height }: the team colour, whether it is a main tower (bigger bolt) and
 * the height the bolt leaves the tower from.
 */

const TARGET_HEIGHT = 1.8;

registerEffects({
  towerBolt({ range, params }) {
    const L = Math.min(Math.max(range, 2), 120);
    const main = Boolean(params?.main);
    const color = params?.color ?? 0xffb347;
    const fromY = params?.height ?? 12;
    const size = main ? 0.9 : 0.6;
    const travel = Math.max(0.2, Math.min(0.6, L / 70));
    const fx = new Fx(travel + 0.5);

    const core = fx.add(new THREE.Mesh(new THREE.SphereGeometry(size * 0.55, 12, 10), fx.material(0xffffff, 0.95)));
    const halo = fx.add(new THREE.Mesh(new THREE.SphereGeometry(size, 12, 10), fx.material(color, 0.5)));
    const muzzle = fx.add(new THREE.Mesh(new THREE.SphereGeometry(size * 1.6, 12, 10), fx.material(color, 0.6)));
    muzzle.position.set(0, fromY, 0);
    const impact = fx.ring(0.85, 1, color, 0.9);
    const trail = fx.particles(32, color, main ? 0.7 : 0.5);
    const seeds = Array.from({ length: 32 }, () => ({ off: rand(0, 1), x: rand(-0.4, 0.4), y: rand(-0.4, 0.4) }));
    const heightAt = (z) => fromY + (TARGET_HEIGHT - fromY) * clamp01(z / L);

    fx.tick = (t) => {
      const z = L * clamp01(t / travel);
      const flying = t < travel;
      core.visible = flying;
      halo.visible = flying;
      core.position.set(0, heightAt(z), z);
      halo.position.copy(core.position);
      seeds.forEach((s, i) => {
        const back = Math.max(0, z - s.off * 5);
        trail.set(i, s.x, heightAt(back) + s.y, back);
      });
      trail.commit();
      muzzle.scale.setScalar(Math.max(0.01, 1 - t / 0.2));
      impact.position.set(0, 0.07, L);
      impact.visible = !flying;
      impact.scale.setScalar(Math.max(0.01, (main ? 3 : 2) * easeOut((t - travel) / 0.35)));
    };
    return fx;
  }
});
