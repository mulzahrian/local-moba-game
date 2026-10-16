import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MapObject } from './mapAssets.js';

// Lightweight isolated viewer used by the Map Generator sidebar.
export class MapObjectPreviewScene {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x100b07);
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.05, 200);
    this.camera.position.set(7, 5, 9);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 40;
    this.controls.maxPolarAngle = Math.PI / 2.02;

    this.scene.add(new THREE.HemisphereLight(0xffe3bd, 0x24150b, 1.8));
    const key = new THREE.DirectionalLight(0xffe2b5, 2.2);
    key.position.set(5, 10, 7);
    key.castShadow = true;
    this.scene.add(key);
    const fill = new THREE.PointLight(0x6b8dff, 1.2, 25);
    fill.position.set(-5, 4, -4);
    this.scene.add(fill);

    this.floor = new THREE.Mesh(
      new THREE.CircleGeometry(8, 48),
      new THREE.MeshStandardMaterial({ color: 0x291b11, roughness: 0.9, metalness: 0.05 })
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
    this.grid = new THREE.PolarGridHelper(8, 8, 8, 32, 0x76552b, 0x362516);
    this.grid.position.y = 0.015;
    this.scene.add(this.grid);

    this.object = null;
    this.request = 0;
    this.clock = new THREE.Clock();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.animate();
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setObject(type, settings = {}) {
    if (!type) return;
    const data = {
      uid: 'map-object-preview',
      type,
      position: { x: 0, y: 0, z: 0 },
      rotationX: settings.rotationX || 0,
      rotationY: settings.rotationY || 0,
      rotationZ: settings.rotationZ || 0,
      scale: settings.scale || 1,
      scaleX: settings.scaleX || 1,
      scaleY: settings.scaleY || 1,
      scaleZ: settings.scaleZ || 1,
      animation: settings.animation || null
    };

    if (this.object?.data.type === type) {
      this.object.applyTransform(data);
      this.object.setAnimation(data.animation);
      return;
    }

    this.clearObject();
    const object = new MapObject(data);
    this.object = object;
    this.scene.add(object.root);
    const request = ++this.request;
    object.ready.then(() => {
      if (this.object !== object || request !== this.request) return;
      object.applyTransform(data);
      object.setAnimation(data.animation || object.def?.defaultAnimation || null);
      this.frameObject();
    });
  }

  frameObject() {
    if (!this.object?.model) return;
    const box = new THREE.Box3().setFromObject(this.object.root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 1);
    this.controls.target.set(center.x, Math.max(0.5, center.y * 0.75), center.z);
    this.camera.position.set(span * 1.55, span * 1.05, span * 1.9);
    this.camera.near = Math.max(0.01, span / 100);
    this.camera.far = Math.max(100, span * 20);
    this.camera.updateProjectionMatrix();
    this.floor.scale.setScalar(Math.max(1, span * 1.8));
    this.grid.scale.setScalar(Math.max(1, span * 1.8));
  }

  clearObject() {
    if (!this.object) return;
    this.scene.remove(this.object.root);
    this.object.dispose();
    this.object = null;
  }

  animate = () => {
    this.frameId = requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.1);
    this.object?.update(delta);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    this.clearObject();
    this.controls.dispose();
    this.floor.geometry.dispose();
    this.floor.material.dispose();
    this.grid.geometry.dispose();
    (Array.isArray(this.grid.material) ? this.grid.material : [this.grid.material]).forEach((material) => material.dispose());
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) this.container.removeChild(this.renderer.domElement);
  }
}
