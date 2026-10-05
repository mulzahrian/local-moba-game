import * as THREE from 'three';
import grassUrl from '../public/assets/texture/grass.jpg';

export const SKY_OPTIONS = ['darkFantasy', 'bright'];
export const WEATHER_OPTIONS = ['clear', 'rain'];
export const DEFAULT_SKY = 'bright';
export const DEFAULT_WEATHER = 'clear';

const GROUND_TILE_SIZE = 20; // world units covered by one repeat of the ground texture

const SKY_PRESETS = {
  darkFantasy: {
    background: 0x1b1430,
    ambientColor: 0x8a7fb5,
    ambientIntensity: 0.55,
    sunColor: 0xb9a8ff,
    sunIntensity: 0.65,
    fogDensity: 0.006
  },
  bright: {
    background: 0x87ceeb,
    ambientColor: 0xffffff,
    ambientIntensity: 0.7,
    sunColor: 0xfff2d6,
    sunIntensity: 0.95,
    fogDensity: 0.002
  }
};

const RAIN_DROP_COUNT = 3500;
const RAIN_FALL_SPEED = 90;
const RAIN_DROP_LENGTH = 2.5;

let groundTexture = null;

// Shared by every scene; tiling is baked into the ground geometry UVs rather than texture.repeat.
export function getGroundTexture() {
  if (!groundTexture) {
    groundTexture = new THREE.TextureLoader().load(grassUrl);
    groundTexture.wrapS = THREE.RepeatWrapping;
    groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.colorSpace = THREE.SRGBColorSpace;
    groundTexture.anisotropy = 8;
  }
  return groundTexture;
}

export function createGroundGeometry(size) {
  const geometry = new THREE.PlaneGeometry(size, size);
  const uv = geometry.attributes.uv;
  const tiles = size / GROUND_TILE_SIZE;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, uv.getX(i) * tiles, uv.getY(i) * tiles);
  }
  return geometry;
}

export function createGroundMaterial() {
  return new THREE.MeshLambertMaterial({ map: getGroundTexture() });
}

/**
 * Applies the sky (background, fog, light colours) and weather (rain) of a map to a scene.
 * `fogScale` lets far-away cameras (the editor) use thinner fog than the close game camera.
 */
export class Environment {
  constructor(scene, { ambientLight, sunLight, fogScale = 1, rainArea = 120 }) {
    this.scene = scene;
    this.ambientLight = ambientLight;
    this.sunLight = sunLight;
    this.fogScale = fogScale;
    this.rainArea = rainArea;
    this.rain = null;
    this.sky = DEFAULT_SKY;
    this.weather = DEFAULT_WEATHER;
    this.apply(DEFAULT_SKY, DEFAULT_WEATHER);
  }

  apply(sky, weather) {
    this.sky = SKY_PRESETS[sky] ? sky : DEFAULT_SKY;
    this.weather = WEATHER_OPTIONS.includes(weather) ? weather : DEFAULT_WEATHER;

    const preset = SKY_PRESETS[this.sky];
    const raining = this.weather === 'rain';

    const background = new THREE.Color(preset.background);
    if (raining) background.lerp(new THREE.Color(0x4a525c), 0.55).multiplyScalar(0.8);

    this.scene.background = background;
    const density = (preset.fogDensity + (raining ? 0.004 : 0)) * this.fogScale;
    this.scene.fog = new THREE.FogExp2(background.getHex(), density);

    this.ambientLight.color.set(preset.ambientColor);
    this.ambientLight.intensity = preset.ambientIntensity * (raining ? 0.85 : 1);
    this.sunLight.color.set(preset.sunColor);
    this.sunLight.intensity = preset.sunIntensity * (raining ? 0.55 : 1);

    this.setRainVisible(raining);
  }

  setRainVisible(visible) {
    if (visible && !this.rain) this.createRain();
    if (this.rain) this.rain.visible = visible;
  }

  createRain() {
    const area = this.rainArea;
    const height = area * 0.7;
    const positions = new Float32Array(RAIN_DROP_COUNT * 6);
    for (let i = 0; i < RAIN_DROP_COUNT; i += 1) {
      const x = (Math.random() - 0.5) * area * 2;
      const y = Math.random() * height;
      const z = (Math.random() - 0.5) * area * 2;
      positions.set([x, y, z, x, y - RAIN_DROP_LENGTH, z], i * 6);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color: 0xaec6dd,
      transparent: true,
      opacity: 0.55,
      fog: false
    });
    this.rain = new THREE.LineSegments(geometry, material);
    this.rain.frustumCulled = false;
    this.rainHeight = height;
    this.scene.add(this.rain);
  }

  // Moves the rain volume with the camera focus and makes the drops fall.
  update(delta, focus) {
    if (!this.rain?.visible) return;
    if (focus) this.rain.position.set(focus.x, 0, focus.z);

    const positions = this.rain.geometry.attributes.position;
    const fall = RAIN_FALL_SPEED * delta;
    for (let i = 0; i < RAIN_DROP_COUNT; i += 1) {
      const top = i * 2;
      const bottom = top + 1;
      let y = positions.getY(top) - fall;
      if (y < 0) y += this.rainHeight;
      positions.setY(top, y);
      positions.setY(bottom, y - RAIN_DROP_LENGTH);
    }
    positions.needsUpdate = true;
  }

  dispose() {
    if (this.rain) {
      this.scene.remove(this.rain);
      this.rain.geometry.dispose();
      this.rain.material.dispose();
      this.rain = null;
    }
  }
}
