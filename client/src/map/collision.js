import * as THREE from 'three';

// Placed map objects block the heroes. Every object gets a ground footprint (an axis aligned rectangle on
// the x/z plane) and walkers are pushed out of it, so they slide along obstacles instead of sticking to them.

export const PLAYER_RADIUS = 0.7; // collision radius of a hero (the models are about 3.6 tall)
const BASE_SLICE = 0.3; // share of the object's height used for the footprint, so a tree blocks with its trunk and not its crown
const MAX_SAMPLES = 20000;
const MIN_HALF_SIZE = 0.15;

const vertex = new THREE.Vector3();

// Footprint of the lowest part of `root` in world space, or null when it has no geometry.
export function computeFootprint(root) {
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((child) => {
    if (child.isMesh && child.geometry?.attributes?.position && child.visible) meshes.push(child);
  });
  if (!meshes.length) return null;

  const total = meshes.reduce((sum, mesh) => sum + mesh.geometry.attributes.position.count, 0);
  const stride = Math.max(1, Math.ceil(total / MAX_SAMPLES));
  const points = [];
  let minY = Infinity;
  let maxY = -Infinity;
  meshes.forEach((mesh) => {
    const position = mesh.geometry.attributes.position;
    for (let i = 0; i < position.count; i += stride) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      points.push(vertex.x, vertex.y, vertex.z);
      minY = Math.min(minY, vertex.y);
      maxY = Math.max(maxY, vertex.y);
    }
  });
  if (!Number.isFinite(minY)) return null;

  const limit = minY + (maxY - minY) * BASE_SLICE;
  const box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let i = 0; i < points.length; i += 3) {
    if (points[i + 1] > limit) continue;
    box.minX = Math.min(box.minX, points[i]);
    box.maxX = Math.max(box.maxX, points[i]);
    box.minZ = Math.min(box.minZ, points[i + 2]);
    box.maxZ = Math.max(box.maxZ, points[i + 2]);
  }
  if (!Number.isFinite(box.minX)) return null;

  // Never thinner than a sliver, otherwise heroes could squeeze through paper-thin models.
  const padX = Math.max(0, MIN_HALF_SIZE - (box.maxX - box.minX) / 2);
  const padZ = Math.max(0, MIN_HALF_SIZE - (box.maxZ - box.minZ) / 2);
  return { minX: box.minX - padX, maxX: box.maxX + padX, minZ: box.minZ - padZ, maxZ: box.maxZ + padZ };
}

// Moves the point (x, z) out of every footprint it overlaps (treated as a circle of `radius`).
export function resolveObstacles(footprints, x, z, radius = PLAYER_RADIUS) {
  let px = x;
  let pz = z;
  for (let pass = 0; pass < 3; pass += 1) {
    let moved = false;
    for (const box of footprints) {
      if (px + radius <= box.minX || px - radius >= box.maxX || pz + radius <= box.minZ || pz - radius >= box.maxZ) continue;
      const nearestX = Math.min(Math.max(px, box.minX), box.maxX);
      const nearestZ = Math.min(Math.max(pz, box.minZ), box.maxZ);
      const dx = px - nearestX;
      const dz = pz - nearestZ;
      const distance = Math.hypot(dx, dz);

      if (distance >= radius) continue;
      moved = true;
      if (distance > 1e-6) {
        px = nearestX + (dx / distance) * radius;
        pz = nearestZ + (dz / distance) * radius;
        continue;
      }
      // The centre is inside the rectangle: leave through the closest side.
      const exits = [
        [px - box.minX, -1, 0],
        [box.maxX - px, 1, 0],
        [pz - box.minZ, 0, -1],
        [box.maxZ - pz, 0, 1]
      ].sort((a, b) => a[0] - b[0]);
      const [depth, sx, sz] = exits[0];
      px += sx * (depth + radius);
      pz += sz * (depth + radius);
    }
    if (!moved) break;
  }
  return { x: px, z: pz };
}
