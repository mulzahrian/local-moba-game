import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import grassUrl from '../public/assets/texture/grass.jpg';

// Served from Vite's public directory because GLB is loaded by GLTFLoader at runtime.
const skyboxUrl = '/assets/skybox/skybox_skydays_3.glb';

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
const skyboxLoader = new GLTFLoader();

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
    this.skybox = null;
    this.skyboxSize = 800;
    this.skyboxLoadToken = 0;
    this.sky = DEFAULT_SKY;
    this.weather = DEFAULT_WEATHER;
    this.loadSkybox();
    this.apply(DEFAULT_SKY, DEFAULT_WEATHER);
  }

  loadSkybox() {
    const token = ++this.skyboxLoadToken;
    skyboxLoader.load(skyboxUrl, (gltf) => {
      if (token !== this.skyboxLoadToken) return;

      const skybox = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(skybox);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const maxSide = Math.max(size.x, size.y, size.z) || 1;

      // The supplied model is authored in a much larger unit scale than the game.
      // Normalize it so it surrounds the arena while remaining inside the camera far plane.
      skybox.position.sub(center);
      skybox.scale.setScalar(this.skyboxSize / maxSide);
      skybox.traverse((child) => {
        if (!child.isMesh) return;
        child.frustumCulled = false;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        const preparedMaterials = materials.map((material) => {
          const copy = material.clone();
          // The source is a cube with double-sided material data. Keep both sides
          // visible because exported GLB winding varies between skybox tools.
          copy.side = THREE.DoubleSide;
          copy.depthWrite = false;
          copy.depthTest = false;
          copy.fog = false;
          return copy;
        });
        child.material = Array.isArray(child.material) ? preparedMaterials : preparedMaterials[0];
      });
      skybox.renderOrder = -100;
      this.skybox = skybox;
      this.scene.add(skybox);
    }, undefined, (error) => {
      console.warn('[Environment] Could not load skybox:', error);
    });
  }

  setSkyboxSize(arenaSize) {
    this.skyboxSize = Math.max(800, arenaSize * 4);
    if (!this.skybox) return;
    const bounds = new THREE.Box3().setFromObject(this.skybox);
    const maxSide = Math.max(...bounds.getSize(new THREE.Vector3()).toArray()) || 1;
    this.skybox.scale.multiplyScalar(this.skyboxSize / maxSide);
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
    this.skyboxLoadToken += 1;
    if (this.skybox) {
      this.scene.remove(this.skybox);
      this.skybox.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.filter(Boolean).forEach((material) => material.dispose());
      });
      this.skybox = null;
    }
    if (this.rain) {
      this.scene.remove(this.rain);
      this.rain.geometry.dispose();
      this.rain.material.dispose();
      this.rain = null;
    }
  }
}
