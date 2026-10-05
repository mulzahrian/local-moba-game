import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MapObject, createUid } from './mapAssets.js';

const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const PAN_SPEED = 160;
const CAMERA_ROTATE_SPEED = 90; // degrees per second for Q / E

export const DEFAULT_MAP_SIZE = 500;
export const DEFAULT_GROUND_COLOR = '#1a3a1a';

const clone = (data) => ({ ...data, position: { ...data.position } });

/**
 * Three.js scene for the Map Generator. It owns the authoritative list of placed objects and
 * reports changes to React through callbacks (`onChange`, `onSelect`, `onPlacingChange`).
 */
export class MapEditorScene {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;

    this.entries = new Map(); // uid -> { data, object }
    this.selectedUid = null;
    this.placingType = null;
    this.placeSettings = { rotationY: 0, scale: 1, animation: null };
    this.snap = 0;
    this.size = DEFAULT_MAP_SIZE;
    this.drag = null;
    this.ghost = null;
    this.keys = new Set();
    this.disposed = false;
    this.paused = false;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.clock = new THREE.Clock();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0d12);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.5, 4000);
    this.camera.position.set(0, 220, 260);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 1200;
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, 0);

    this.setupLights();
    this.setupGround(DEFAULT_MAP_SIZE, DEFAULT_GROUND_COLOR);

    this.selectionBox = new THREE.Box3Helper(new THREE.Box3(), 0xffd34d);
    this.selectionBox.visible = false;
    this.scene.add(this.selectionBox);

    this.bindEvents();
    this.resize();
    this.animate();
  }

  setupLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(120, 220, 90);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -320, right: 320, top: 320, bottom: -320, near: 1, far: 700 });
    this.scene.add(sun);
  }

  setupGround(size, color) {
    if (this.ground) {
      this.scene.remove(this.ground);
      this.ground.geometry.dispose();
      this.ground.material.dispose();
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      this.scene.remove(this.markers);
    }
    this.size = size;
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshLambertMaterial({ color })
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.grid = new THREE.GridHelper(size, Math.max(1, Math.round(size / 10)), 0x5d8f5d, 0x2c452c);
    this.grid.position.y = 0.1;
    this.scene.add(this.grid);
    this.setupBaseMarkers(size);
  }

  // Reference markers: the two team bases used by the game scene.
  setupBaseMarkers(size) {
    this.markers = new THREE.Group();
    const offset = size * 0.4;
    [[-offset, 0x92a825], [offset, 0x922620]].forEach(([coord, color]) => {
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(30, 30, 0.6, 32),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 })
      );
      disc.position.set(coord, 0.4, coord);
      this.markers.add(disc);
    });
    this.scene.add(this.markers);
  }

  bindEvents() {
    const el = this.renderer.domElement;
    this.onPointerDown = (e) => this.handlePointerDown(e);
    this.onPointerMove = (e) => this.handlePointerMove(e);
    this.onPointerUp = () => this.handlePointerUp();
    this.onContextMenu = (e) => e.preventDefault();
    this.onKeyDown = (e) => this.handleKeyDown(e);
    this.onKeyUp = (e) => this.keys.delete(e.code);
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
  }

  resize() {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  // Suspends rendering and keyboard shortcuts while the play preview covers the editor.
  setPaused(paused) {
    this.paused = paused;
    this.keys.clear();
    this.drag = null;
  }

  // ---------- Camera ----------

  // Orbit the camera around its target by `degrees` (positive = counter-clockwise from above).
  rotateCamera(degrees) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(degrees));
    this.camera.position.copy(this.controls.target).add(offset);
    this.camera.lookAt(this.controls.target);
  }

  // Change the viewing angle (degrees of elevation to add; positive = look more from above).
  tiltCamera(degrees) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.phi = THREE.MathUtils.clamp(
      spherical.phi - THREE.MathUtils.degToRad(degrees),
      0.01,
      this.controls.maxPolarAngle
    );
    offset.setFromSpherical(spherical);
    this.camera.position.copy(this.controls.target).add(offset);
    this.camera.lookAt(this.controls.target);
  }

  setCameraView(view) {
    const distance = this.camera.position.distanceTo(this.controls.target);
    const target = this.controls.target;
    if (view === 'top') {
      this.camera.position.set(target.x, target.y + distance, target.z + 0.01);
    } else {
      this.controls.target.set(0, 0, 0);
      this.camera.position.set(0, 220, 260);
    }
    this.camera.lookAt(this.controls.target);
  }

  // ---------- Map data ----------

  loadMap(map) {
    this.clearObjects();
    this.setupGround(map.size || DEFAULT_MAP_SIZE, map.groundColor || DEFAULT_GROUND_COLOR);
    (map.objects || []).forEach((data) => this.createEntry(clone(data)));
    this.select(null);
    this.setPlacingType(null);
    this.emitChange();
  }

  getObjects() {
    return Array.from(this.entries.values()).map((entry) => clone(entry.data));
  }

  setGround(color, size) {
    if (size !== this.size) {
      this.setupGround(size, color);
      this.entries.forEach((entry) => {
        this.clampToMap(entry.data.position);
        entry.object.applyTransform(entry.data);
      });
      this.emitChange();
    } else {
      this.ground.material.color.set(color);
    }
  }

  clearObjects() {
    this.entries.forEach((entry) => entry.object.dispose());
    this.entries.clear();
    this.selectedUid = null;
  }

  createEntry(data) {
    const object = new MapObject(data);
    this.scene.add(object.root);
    this.entries.set(data.uid, { data, object });
    return this.entries.get(data.uid);
  }

  emitChange() {
    this.callbacks.onChange?.(this.getObjects());
  }

  // ---------- Selection / editing ----------

  select(uid) {
    this.selectedUid = uid && this.entries.has(uid) ? uid : null;
    this.callbacks.onSelect?.(this.selectedUid);
    this.updateSelectionBox();
  }

  updateSelectionBox() {
    const entry = this.entries.get(this.selectedUid);
    this.selectionBox.visible = !!entry;
    if (entry) {
      this.selectionBox.box.setFromObject(entry.object.root);
    }
  }

  updateSelected(patch) {
    const entry = this.entries.get(this.selectedUid);
    if (!entry) return;
    const { position, ...rest } = patch;
    Object.assign(entry.data, rest);
    if (position) {
      Object.assign(entry.data.position, position);
      this.clampToMap(entry.data.position);
    }
    entry.object.applyTransform(entry.data);
    if ('animation' in patch) entry.object.setAnimation(patch.animation);
    this.emitChange();
  }

  deleteSelected() {
    const entry = this.entries.get(this.selectedUid);
    if (!entry) return;
    entry.object.dispose();
    this.entries.delete(this.selectedUid);
    this.select(null);
    this.emitChange();
  }

  duplicateSelected() {
    const entry = this.entries.get(this.selectedUid);
    if (!entry) return;
    const data = clone(entry.data);
    data.uid = createUid();
    data.position.x += 10;
    data.position.z += 10;
    this.clampToMap(data.position);
    this.createEntry(data);
    this.select(data.uid);
    this.emitChange();
  }

  clampToMap(position) {
    const limit = this.size / 2;
    position.x = THREE.MathUtils.clamp(position.x, -limit, limit);
    position.z = THREE.MathUtils.clamp(position.z, -limit, limit);
  }

  setSnap(size) {
    this.snap = size;
  }

  snapValue(value) {
    return this.snap > 0 ? Math.round(value / this.snap) * this.snap : value;
  }

  // ---------- Placement ----------

  setPlacingType(type, defaults = {}) {
    this.placingType = type;
    if (this.ghost) {
      this.ghost.dispose();
      this.ghost = null;
    }
    if (!type) {
      this.callbacks.onPlacingChange?.(null);
      return;
    }
    this.select(null);
    this.placeSettings = { rotationY: 0, scale: 1, animation: null, ...defaults };
    const ghost = new MapObject({
      uid: 'ghost',
      type,
      position: { x: 0, y: 0, z: 0 },
      rotationY: this.placeSettings.rotationY,
      scale: this.placeSettings.scale,
      animation: this.placeSettings.animation
    });
    ghost.root.visible = false;
    ghost.root.userData.uid = undefined;
    ghost.ready.then(() => {
      // Ghost materials are cloned so making them translucent doesn't affect placed objects.
      ghost.root.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material = child.material.clone();
          child.material.transparent = true;
          child.material.opacity = 0.55;
          child.castShadow = false;
        }
      });
    });
    this.ghost = ghost;
    this.scene.add(ghost.root);
    this.callbacks.onPlacingChange?.(this.placeSettings);
  }

  updatePlaceSettings(patch) {
    this.placeSettings = { ...this.placeSettings, ...patch };
    if (this.ghost) {
      this.ghost.applyTransform({
        ...this.ghost.data,
        ...this.placeSettings,
        position: { ...this.ghost.root.position }
      });
      if ('animation' in patch) this.ghost.setAnimation(patch.animation);
    }
    this.callbacks.onPlacingChange?.(this.placeSettings);
  }

  placeAt(point) {
    const data = {
      uid: createUid(),
      type: this.placingType,
      position: { x: this.snapValue(point.x), y: 0, z: this.snapValue(point.z) },
      rotationY: this.placeSettings.rotationY,
      scale: this.placeSettings.scale,
      animation: this.placeSettings.animation
    };
    this.clampToMap(data.position);
    this.createEntry(data);
    this.emitChange();
  }

  // ---------- Pointer / keyboard ----------

  setPointer(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  groundPoint() {
    const point = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(GROUND_PLANE, point) ? point : null;
  }

  pickObject() {
    const roots = Array.from(this.entries.values()).map((entry) => entry.object.root);
    const hits = this.raycaster.intersectObjects(roots, true);
    for (const hit of hits) {
      let node = hit.object;
      while (node && node.userData.uid === undefined) node = node.parent;
      if (node) return node.userData.uid;
    }

    // Fallback for thin / sparse models: pick the nearest bounding box under the cursor.
    let best = null;
    let bestDistance = Infinity;
    const box = new THREE.Box3();
    const hitPoint = new THREE.Vector3();
    this.entries.forEach((entry) => {
      box.setFromObject(entry.object.root);
      if (box.isEmpty() || !this.raycaster.ray.intersectBox(box, hitPoint)) return;
      const distance = hitPoint.distanceTo(this.raycaster.ray.origin);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = entry.data.uid;
      }
    });
    return best;
  }

  handlePointerDown(event) {
    if (event.button !== 0) return;
    this.setPointer(event);
    const point = this.groundPoint();

    const uid = this.pickObject();

    // While placing, clicking an existing object selects it instead (Shift+click places anyway).
    if (this.placingType) {
      if (uid && !event.shiftKey) {
        this.setPlacingType(null);
      } else {
        if (point) this.placeAt(point);
        return;
      }
    }

    this.select(uid);
    if (uid && point) {
      const entry = this.entries.get(uid);
      this.drag = {
        uid,
        offsetX: entry.data.position.x - point.x,
        offsetZ: entry.data.position.z - point.z,
        moved: false
      };
    }
  }

  handlePointerMove(event) {
    this.setPointer(event);
    const point = this.groundPoint();

    if (this.ghost) {
      if (point) {
        this.ghost.root.visible = true;
        this.ghost.root.position.set(this.snapValue(point.x), 0, this.snapValue(point.z));
      } else {
        this.ghost.root.visible = false;
      }
    }

    if (!this.drag) {
      const el = this.renderer.domElement;
      if (this.placingType) el.style.cursor = 'crosshair';
      else el.style.cursor = this.pickObject() ? 'pointer' : 'default';
    }

    if (this.drag && point) {
      const entry = this.entries.get(this.drag.uid);
      if (!entry) return;
      entry.data.position.x = this.snapValue(point.x + this.drag.offsetX);
      entry.data.position.z = this.snapValue(point.z + this.drag.offsetZ);
      this.clampToMap(entry.data.position);
      entry.object.applyTransform(entry.data);
      this.drag.moved = true;
    }
  }

  handlePointerUp() {
    if (this.drag?.moved) this.emitChange();
    this.drag = null;
  }

  handleKeyDown(event) {
    if (this.paused) return;
    const tag = event.target?.tagName;
    const inputType = event.target?.type;
    // Sliders / checkboxes keep focus after use, so only real text entry should swallow shortcuts.
    const isTyping =
      tag === 'TEXTAREA' || (tag === 'INPUT' && !['range', 'checkbox', 'color', 'button'].includes(inputType));
    if (isTyping || tag === 'SELECT') return;
    if (!event.ctrlKey && !event.metaKey) this.keys.add(event.code);

    const selected = this.entries.get(this.selectedUid);
    const rotateStep = event.shiftKey ? -15 : 15;

    switch (event.code) {
      case 'Delete':
      case 'Backspace':
        this.deleteSelected();
        break;
      case 'Escape':
        this.setPlacingType(null);
        this.select(null);
        break;
      case 'KeyV':
        if (!event.ctrlKey && !event.metaKey) this.setPlacingType(null);
        break;
      case 'KeyR':
        if (event.ctrlKey || event.metaKey || event.repeat) break;
        if (this.placingType) {
          this.updatePlaceSettings({ rotationY: (this.placeSettings.rotationY + rotateStep + 360) % 360 });
        } else if (selected) {
          this.updateSelected({ rotationY: (selected.data.rotationY + rotateStep + 360) % 360 });
        }
        break;
      case 'BracketLeft':
      case 'BracketRight': {
        const factor = event.code === 'BracketRight' ? 1.1 : 1 / 1.1;
        const round = (v) => Math.round(Math.min(Math.max(v * factor, 0.05), 50) * 100) / 100;
        if (this.placingType) {
          this.updatePlaceSettings({ scale: round(this.placeSettings.scale) });
        } else if (selected) {
          this.updateSelected({ scale: round(selected.data.scale) });
        }
        break;
      }
      case 'KeyD':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this.duplicateSelected();
        }
        break;
      default:
        break;
    }
  }

  panWithKeys(delta) {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
    const move = new THREE.Vector3();
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) move.add(forward);
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) move.sub(forward);
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) move.add(right);
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) move.sub(right);
    if (move.lengthSq() === 0) return;
    move.normalize().multiplyScalar(PAN_SPEED * delta);
    this.camera.position.add(move);
    this.controls.target.add(move);
  }

  animate = () => {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame(this.animate);
    const delta = this.clock.getDelta();
    if (this.paused) return;
    this.panWithKeys(delta);
    if (this.keys.has('KeyQ')) this.rotateCamera(-CAMERA_ROTATE_SPEED * delta);
    if (this.keys.has('KeyE')) this.rotateCamera(CAMERA_ROTATE_SPEED * delta);
    this.controls.update();
    this.entries.forEach((entry) => entry.object.update(delta));
    this.ghost?.update(delta);
    this.updateSelectionBox();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    if (this.container.contains(el)) this.container.removeChild(el);
  }
}
