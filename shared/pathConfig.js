// Walker paths: NPCs placed in the map editor that follow a line of waypoints (shared by editor, API and game).

export const PATH_MAX_PATHS = 100;
export const PATH_MAX_POINTS = 200;
export const PATH_SPEED = { min: 0.5, max: 60, step: 0.5, value: 6 }; // world units per second
export const PATH_ANIM_SPEED = { min: 0.1, max: 3, step: 0.05, value: 1 };
export const PATH_SCALE = { min: 0.1, max: 10, step: 0.05, value: 1 };

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const str = (value, max) => String(value ?? '').slice(0, max);

const WALK_NAME = /walk/i;

// Picks the clip that most likely is the walk cycle of a model (falls back to the first one).
export function guessWalkAnimation(names = []) {
  return names.find((name) => WALK_NAME.test(name)) || names[0] || null;
}

export const createPathId = () => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// Normalises untrusted path data: only known fields survive and numbers are clamped.
export function sanitizePaths(input) {
  const list = Array.isArray(input) ? input.slice(0, PATH_MAX_PATHS) : [];
  return list
    .map((p, index) => ({
      id: str(p?.id, 40) || `path-${index}`,
      name: str(p?.name, 60),
      points: (Array.isArray(p?.points) ? p.points.slice(0, PATH_MAX_POINTS) : []).map((point) => ({
        x: num(point?.x),
        z: num(point?.z)
      })),
      loop: p?.loop !== false,
      type: str(p?.type, 80),
      animation: p?.animation ? str(p.animation, 120) : null,
      speed: clamp(num(p?.speed, PATH_SPEED.value), PATH_SPEED.min, PATH_SPEED.max),
      animSpeed: clamp(num(p?.animSpeed, PATH_ANIM_SPEED.value), PATH_ANIM_SPEED.min, PATH_ANIM_SPEED.max),
      scale: clamp(num(p?.scale, PATH_SCALE.value), PATH_SCALE.min, PATH_SCALE.max)
    }))
    .filter((p) => p.points.length >= 2);
}

/**
 * Precomputes the segment lengths of a path. A looping path is a closed circuit (last point connects back to
 * the first); otherwise the walker goes to the end and comes back (ping-pong).
 */
export function measurePath(points, loop) {
  const segments = [];
  let total = 0;
  const count = loop ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    segments.push({ a, b, length, start: total });
    total += length;
  }
  return { segments, total };
}

/**
 * Position and heading (radians, 0 = +Z like the rest of the game) of a walker that has travelled `distance`
 * along a measured path.
 */
export function samplePath(measured, loop, distance) {
  const { segments, total } = measured;
  if (!segments.length || total < 1e-6) {
    const point = segments[0]?.a || { x: 0, z: 0 };
    return { x: point.x, z: point.z, heading: 0 };
  }

  let travelled;
  let reverse = false;
  if (loop) {
    travelled = ((distance % total) + total) % total;
  } else {
    const cycle = ((distance % (total * 2)) + total * 2) % (total * 2);
    reverse = cycle > total;
    travelled = reverse ? total * 2 - cycle : cycle;
  }

  const segment = segments.find((s) => travelled <= s.start + s.length) || segments[segments.length - 1];
  const ratio = segment.length > 1e-6 ? (travelled - segment.start) / segment.length : 0;
  const dx = segment.b.x - segment.a.x;
  const dz = segment.b.z - segment.a.z;
  const heading = Math.atan2(reverse ? -dx : dx, reverse ? -dz : dz);
  return { x: segment.a.x + dx * ratio, z: segment.a.z + dz * ratio, heading };
}
