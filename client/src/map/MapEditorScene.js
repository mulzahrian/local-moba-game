import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { MapObject, createUid, getObjectDefinition } from './mapAssets.js';
import { PathWalker } from './PathWalker.js';
import { AGGRO_RANGE } from '../../../shared/monsterConfig.js';
import { TOWER_KINDS, TOWER_RADIUS_PER_SCALE, completeTowerSettings, nextTowerSettings } from '../../../shared/mapConfig.js';
import { PATH_ANIM_SPEED, PATH_SCALE, PATH_SPEED, createPathId } from '../../../shared/pathConfig.js';
import { Environment, createGroundGeometry, createGroundMaterial } from './environment.js';

const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const PAN_SPEED = 160;
const CAMERA_ROTATE_SPEED = 90; // degrees per second for Q / E
const GIZMO_ROTATE_SNAP = 15; // degrees, used while grid snapping is on
const PATH_COLOR = 0x4de1ff;
const PATH_COLOR_SELECTED = 0xffd34d;
const PATH_START_COLOR = 0x5dff7a;
const MIN_POINT_GAP = 1; // closer clicks than this don't add another waypoint
const TOWER_RING_COLORS = { team1: 0xff6b6b, team2: 0x4ecdc4 };

export const DEFAULT_MAP_SIZE = 500;
export const GIZMO_MODES = ['translate', 'rotate', 'scale'];

const clone = (data) => ({ ...data, position: { ...data.position } });
const clonePath = (path) => ({ ...path, points: path.points.map((point) => ({ ...point })) });
const roundTo = (value, digits = 3) => Math.round(value * 10 ** digits) / 10 ** digits;
const wrapDegrees = (degrees) => ((((degrees + 180) % 360) + 360) % 360) - 180;
const setOrDelete = (data, key, value) => {
  if (value) data[key] = value;
  else delete data[key];
};

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
    this.setupGround(DEFAULT_MAP_SIZE);
    this.environment = new Environment(this.scene, {
      ambientLight: this.ambientLight,
      sunLight: this.sunLight,
      fogScale: 0.15,
      rainArea: 300
    });

    this.selectionBox = new THREE.Box3Helper(new THREE.Box3(), 0xffd34d);
    this.selectionBox.visible = false;
    this.scene.add(this.selectionBox);
    this.rangeRings = new Map(); // monster uid -> aggro range ring
    this.ghostRing = null;

    this.paths = new Map(); // path id -> { data, line, markers, walker, cursor }
    this.selectedPathId = null;
    this.drawingPathId = null;
    this.waypointGeometry = new THREE.SphereGeometry(1.4, 14, 10);
    this.waypointMaterials = {
      normal: new THREE.MeshBasicMaterial({ color: PATH_COLOR, depthTest: false }),
      selected: new THREE.MeshBasicMaterial({ color: PATH_COLOR_SELECTED, depthTest: false }),
      start: new THREE.MeshBasicMaterial({ color: PATH_START_COLOR, depthTest: false })
    };
    this.gizmoMode = 'translate';
    this.gizmoChangePending = false;

    this.bindEvents();
    this.setupGizmo();
    this.resize();
    this.animate();
  }

  // Move / rotate / scale handles on the selected object, like in a 3D modelling tool.
  setupGizmo() {
    this.gizmo = new TransformControls(this.camera, this.renderer.domElement);
    this.gizmo.setSize(0.9);
    this.gizmo.addEventListener('dragging-changed', (event) => {
      this.controls.enabled = !event.value;
      if (!event.value) this.flushGizmoChange();
    });
    this.gizmo.addEventListener('objectChange', () => this.handleGizmoChange());
    this.scene.add(this.gizmo);
  }

  setGizmoMode(mode) {
    if (!GIZMO_MODES.includes(mode)) return;
    this.gizmoMode = mode;
    this.gizmo.setMode(mode);
    this.callbacks.onGizmoModeChange?.(mode);
  }

  setGizmoSpace(space) {
    this.gizmo.setSpace(space === 'local' ? 'local' : 'world');
  }

  updateGizmo() {
    const entry = this.entries.get(this.selectedUid);
    if (entry && !this.placingType) this.gizmo.attach(entry.object.root);
    else this.gizmo.detach();
  }

  // Copies what the handles did to the selected object back into its data.
  handleGizmoChange() {
    const entry = this.entries.get(this.selectedUid);
    if (!entry) return;
    const { root } = entry.object;
    const { data } = entry;

    Object.assign(data.position, { x: root.position.x, y: root.position.y, z: root.position.z });
    this.clampToMap(data.position);
    root.position.set(data.position.x, data.position.y, data.position.z);

    const toDegrees = THREE.MathUtils.radToDeg;
    data.rotationY = roundTo(((toDegrees(root.rotation.y) % 360) + 360) % 360);
    setOrDelete(data, 'rotationX', roundTo(wrapDegrees(toDegrees(root.rotation.x))));
    setOrDelete(data, 'rotationZ', roundTo(wrapDegrees(toDegrees(root.rotation.z))));

    const axes = ['x', 'y', 'z'].map((axis) => Math.max(root.scale[axis], 0.01));
    if (Math.max(...axes) - Math.min(...axes) < 1e-3 * axes[0]) {
      data.scale = roundTo(axes[0]);
      ['scaleX', 'scaleY', 'scaleZ'].forEach((key) => delete data[key]);
    } else {
      const base = data.scale || 1;
      ['scaleX', 'scaleY', 'scaleZ'].forEach((key, i) => {
        data[key] = roundTo(axes[i] / base);
      });
    }
    this.gizmoChangePending = true;
  }

  flushGizmoChange() {
    if (!this.gizmoChangePending) return;
    this.gizmoChangePending = false;
    this.emitChange();
  }

  setupLights() {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(this.ambientLight);
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    this.sunLight = sun;
    sun.position.set(120, 220, 90);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -320, right: 320, top: 320, bottom: -320, near: 1, far: 700 });
    this.scene.add(sun);
  }

  setupGround(size) {
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
      createGroundGeometry(size),
      createGroundMaterial()
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.grid = new THREE.GridHelper(size, Math.max(1, Math.round(size / 10)), 0xffffff, 0xffffff);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.12;
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
    this.onDoubleClick = () => this.finishDrawing();
    this.onKeyDown = (e) => this.handleKeyDown(e);
    this.onKeyUp = (e) => this.keys.delete(e.code);
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('dblclick', this.onDoubleClick);
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
    this.gizmo.enabled = !paused;
    if (paused) this.finishDrawing();
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
    this.clearPaths();
    this.setupGround(map.size || DEFAULT_MAP_SIZE);
    this.setEnvironment(map.sky, map.weather);
    completeTowerSettings(map.objects || []).forEach((data) => this.createEntry(clone(data)));
    (map.paths || []).forEach((path) => this.createPathEntry(clonePath(path)));
    this.select(null);
    this.setPlacingType(null);
    this.emitChange();
    this.emitPathsChange();
  }

  getObjects() {
    return Array.from(this.entries.values()).map((entry) => clone(entry.data));
  }

  setGroundSize(size) {
    if (size === this.size) return;
    this.setupGround(size);
    this.entries.forEach((entry) => {
      this.clampToMap(entry.data.position);
      entry.object.applyTransform(entry.data);
    });
    this.paths.forEach((entry) => {
      entry.data.points.forEach((point) => this.clampToMap(point));
      this.refreshPath(entry);
    });
    this.emitChange();
    this.emitPathsChange();
  }

  setEnvironment(sky, weather) {
    this.environment.apply(sky, weather);
  }

  clearObjects() {
    this.gizmo.detach();
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
    if (this.selectedUid) this.selectPath(null);
    this.callbacks.onSelect?.(this.selectedUid);
    this.updateSelectionBox();
    this.updateGizmo();
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
    // a team has one main tower: promoting this one demotes the previous main tower of its team
    if (rest.main === true) {
      this.entries.forEach(({ data }) => {
        if (data !== entry.data && data.tower && data.team === entry.data.team) data.main = false;
      });
    }
    if (rest.team && entry.data.main) {
      this.entries.forEach(({ data }) => {
        if (data !== entry.data && data.tower && data.team === rest.team) data.main = false;
      });
    }
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
    if (data.tower) Object.assign(data, nextTowerSettings(this.getObjects()));
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
    this.gizmo.setTranslationSnap(size > 0 ? size : null);
    this.gizmo.setRotationSnap(size > 0 ? THREE.MathUtils.degToRad(GIZMO_ROTATE_SNAP) : null);
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
    this.finishDrawing();
    this.selectPath(null);
    this.select(null);
    this.placeSettings = { rotationY: 0, scale: 1, animation: null, ...defaults };
    const ghost = new MapObject({
      uid: 'ghost',
      type,
      position: { x: 0, y: 0, z: 0 },
      rotationX: this.placeSettings.rotationX,
      rotationY: this.placeSettings.rotationY,
      rotationZ: this.placeSettings.rotationZ,
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
    const definition = getObjectDefinition(this.placingType);
    const data = {
      uid: createUid(),
      type: this.placingType,
      position: { x: this.snapValue(point.x), y: 0, z: this.snapValue(point.z) },
      rotationY: this.placeSettings.rotationY,
      ...(this.placeSettings.rotationX ? { rotationX: this.placeSettings.rotationX } : {}),
      ...(this.placeSettings.rotationZ ? { rotationZ: this.placeSettings.rotationZ } : {}),
      scale: this.placeSettings.scale,
      animation: this.placeSettings.animation,
      ...(definition?.tower ? { tower: true, ...nextTowerSettings(this.getObjects()) } : {}),
      ...(definition?.monster ? { monster: true, aggroRange: this.placeSettings.aggroRange ?? AGGRO_RANGE.value } : {})
    };
    this.clampToMap(data.position);
    this.createEntry(data);
    this.emitChange();
  }

  // ---------- Walker paths ----------

  emitPathsChange() {
    this.callbacks.onPathsChange?.(this.getPaths());
  }

  getPaths() {
    return Array.from(this.paths.values()).map((entry) => clonePath(entry.data));
  }

  createPathEntry(data) {
    const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: PATH_COLOR, depthTest: false }));
    line.renderOrder = 10;
    line.frustumCulled = false;
    const markers = new THREE.Group();
    this.scene.add(line, markers);
    const entry = { data, line, markers, walker: null, cursor: null };
    this.paths.set(data.id, entry);
    this.refreshPath(entry);
    return entry;
  }

  disposePathEntry(entry) {
    entry.walker?.dispose();
    this.scene.remove(entry.line, entry.markers);
    entry.line.geometry.dispose();
    entry.line.material.dispose();
  }

  clearPaths() {
    this.drawingPathId = null;
    this.selectedPathId = null;
    this.paths.forEach((entry) => this.disposePathEntry(entry));
    this.paths.clear();
  }

  // Redraws the line and waypoints of a path and keeps its walker in sync with the path settings.
  refreshPath(entry) {
    const { data } = entry;
    const selected = data.id === this.selectedPathId;
    const color = selected ? PATH_COLOR_SELECTED : PATH_COLOR;

    const vertices = data.points.map((point) => new THREE.Vector3(point.x, 0.4, point.z));
    if (data.loop && vertices.length > 2) vertices.push(vertices[0].clone());
    if (entry.cursor && vertices.length) vertices.push(new THREE.Vector3(entry.cursor.x, 0.4, entry.cursor.z));
    entry.line.geometry.setFromPoints(vertices);
    entry.line.material.color.setHex(color);

    entry.markers.clear();
    data.points.forEach((point, index) => {
      const marker = new THREE.Mesh(
        this.waypointGeometry,
        this.waypointMaterials[index === 0 ? 'start' : selected ? 'selected' : 'normal']
      );
      marker.position.set(point.x, 1, point.z);
      marker.renderOrder = 11;
      marker.userData = { pathId: data.id, index };
      entry.markers.add(marker);
    });

    const walks = data.type && data.points.length >= 2;
    if (walks && !entry.walker) {
      entry.walker = new PathWalker(data);
      this.scene.add(entry.walker.root);
    } else if (walks) {
      entry.walker.setPath(data);
    } else if (entry.walker) {
      entry.walker.dispose();
      entry.walker = null;
    }
  }

  selectPath(id) {
    const next = id && this.paths.has(id) ? id : null;
    if (next === this.selectedPathId) return;
    if (this.drawingPathId && this.drawingPathId !== next) this.finishDrawing();
    this.selectedPathId = next;
    if (next) this.select(null);
    this.paths.forEach((entry) => this.refreshPath(entry));
    this.callbacks.onPathSelect?.(next);
  }

  // Starts a new path: every click on the ground adds a waypoint until it is finished (Enter / double click).
  startPath(defaults = {}) {
    this.setPlacingType(null);
    this.finishDrawing();
    const data = {
      id: createPathId(),
      name: '',
      points: [],
      loop: true,
      type: '',
      animation: null,
      speed: PATH_SPEED.value,
      animSpeed: PATH_ANIM_SPEED.value,
      scale: PATH_SCALE.value,
      ...defaults
    };
    this.createPathEntry(data);
    this.selectPath(data.id);
    this.beginDrawing(data.id);
    this.emitPathsChange();
  }

  beginDrawing(id) {
    this.drawingPathId = id;
    this.callbacks.onDrawingChange?.(true);
  }

  // Continues adding waypoints to the selected path.
  resumeDrawing() {
    if (this.selectedPathId) this.beginDrawing(this.selectedPathId);
  }

  // Ends drawing; a path with fewer than two waypoints is not a path, so it is removed.
  finishDrawing() {
    const id = this.drawingPathId;
    if (!id) return;
    this.drawingPathId = null;
    const entry = this.paths.get(id);
    if (entry) {
      entry.cursor = null;
      if (entry.data.points.length < 2) {
        this.deletePath(id);
      } else {
        this.refreshPath(entry);
      }
    }
    this.callbacks.onDrawingChange?.(false);
    this.emitPathsChange();
  }

  addPathPoint(point) {
    const entry = this.paths.get(this.drawingPathId);
    if (!entry) return;
    const next = { x: this.snapValue(point.x), z: this.snapValue(point.z) };
    this.clampToMap(next);
    const last = entry.data.points[entry.data.points.length - 1];
    if (last && Math.hypot(next.x - last.x, next.z - last.z) < MIN_POINT_GAP) return;
    entry.data.points.push(next);
    this.refreshPath(entry);
    this.emitPathsChange();
  }

  removeLastPathPoint() {
    const entry = this.paths.get(this.drawingPathId);
    if (!entry || !entry.data.points.length) return;
    entry.data.points.pop();
    this.refreshPath(entry);
    this.emitPathsChange();
  }

  removePathPoint(index) {
    const entry = this.paths.get(this.selectedPathId);
    if (!entry) return;
    entry.data.points.splice(index, 1);
    this.refreshPath(entry);
    this.emitPathsChange();
  }

  updateSelectedPath(patch) {
    const entry = this.paths.get(this.selectedPathId);
    if (!entry) return;
    const { points, id, ...rest } = patch;
    Object.assign(entry.data, rest);
    this.refreshPath(entry);
    this.emitPathsChange();
  }

  deletePath(id) {
    const entry = this.paths.get(id);
    if (!entry) return;
    if (this.drawingPathId === id) {
      this.drawingPathId = null;
      this.callbacks.onDrawingChange?.(false);
    }
    this.disposePathEntry(entry);
    this.paths.delete(id);
    if (this.selectedPathId === id) {
      this.selectedPathId = null;
      this.callbacks.onPathSelect?.(null);
    }
    this.emitPathsChange();
  }

  deleteSelectedPath() {
    if (this.selectedPathId) this.deletePath(this.selectedPathId);
  }

  pickWaypoint() {
    const markers = [];
    this.paths.forEach((entry) => markers.push(...entry.markers.children));
    const hit = this.raycaster.intersectObjects(markers, false)[0];
    return hit ? hit.object.userData : null;
  }

  // Waypoints keep a constant on-screen size no matter how far the camera is.
  updatePathVisuals(delta) {
    this.paths.forEach((entry) => {
      entry.walker?.update(delta);
      entry.markers.children.forEach((marker) => {
        const distance = this.camera.position.distanceTo(marker.position);
        marker.scale.setScalar(THREE.MathUtils.clamp(distance / 90, 0.6, 10));
      });
    });
  }

  // ---------- Monster aggro range / tower shooting range ----------

  createRangeRing(color = 0xff4a3a) {
    const group = new THREE.Group();
    const material = () =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
    const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 48), material());
    const edge = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 64), material());
    [fill, edge].forEach((mesh) => {
      mesh.rotation.x = -Math.PI / 2;
      group.add(mesh);
    });
    group.userData = { fill, edge };
    this.scene.add(group);
    return group;
  }

  disposeRangeRing(ring) {
    this.scene.remove(ring);
    ring.children.forEach((mesh) => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
  }

  // Draws the range within which every placed monster (and the one being placed) attacks players, and the
  // range within which every tower shoots, in its team's colour.
  syncRangeRings() {
    const seen = new Set();
    this.entries.forEach((entry, uid) => {
      const { data } = entry;
      if (!data.monster && !data.tower) return;
      seen.add(uid);
      let ring = this.rangeRings.get(uid);
      if (!ring) {
        ring = this.createRangeRing(data.tower ? TOWER_RING_COLORS[data.team] : undefined);
        this.rangeRings.set(uid, ring);
      }
      const selected = uid === this.selectedUid;
      ring.position.set(data.position.x, 0.15, data.position.z);
      if (data.tower) {
        const kind = data.main ? TOWER_KINDS.main : TOWER_KINDS.side;
        ring.scale.setScalar(kind.range + TOWER_RADIUS_PER_SCALE * (data.scale || 1));
        ring.children.forEach((mesh) => mesh.material.color.setHex(TOWER_RING_COLORS[data.team] ?? TOWER_RING_COLORS.team1));
      } else {
        ring.scale.setScalar(data.aggroRange || AGGRO_RANGE.value);
      }
      ring.userData.fill.material.opacity = selected ? 0.18 : 0.07;
      ring.userData.edge.material.opacity = selected ? 0.95 : 0.45;
    });
    this.rangeRings.forEach((ring, uid) => {
      if (seen.has(uid)) return;
      this.disposeRangeRing(ring);
      this.rangeRings.delete(uid);
    });

    const placingMonster = Boolean(this.ghost?.root.visible && getObjectDefinition(this.placingType)?.monster);
    if (placingMonster && !this.ghostRing) this.ghostRing = this.createRangeRing();
    if (this.ghostRing) {
      this.ghostRing.visible = placingMonster;
      if (placingMonster) {
        this.ghostRing.position.set(this.ghost.root.position.x, 0.15, this.ghost.root.position.z);
        this.ghostRing.scale.setScalar(this.placeSettings.aggroRange ?? AGGRO_RANGE.value);
      }
    }
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
    if (this.gizmo.object && this.gizmo.axis) return; // the transform handles own this click
    this.setPointer(event);
    const point = this.groundPoint();

    if (this.drawingPathId) {
      if (point) this.addPathPoint(point);
      return;
    }

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

    const waypoint = uid ? null : this.pickWaypoint();
    if (waypoint) {
      this.selectPath(waypoint.pathId);
      this.drag = { pathId: waypoint.pathId, index: waypoint.index, moved: false };
      return;
    }

    this.selectPath(null);
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

    if (this.drawingPathId) {
      const entry = this.paths.get(this.drawingPathId);
      if (entry) {
        entry.cursor = point ? { x: this.snapValue(point.x), z: this.snapValue(point.z) } : null;
        this.refreshPath(entry);
      }
    }

    if (!this.drag) {
      const el = this.renderer.domElement;
      if (this.placingType || this.drawingPathId) el.style.cursor = 'crosshair';
      else el.style.cursor = this.pickObject() || this.pickWaypoint() ? 'pointer' : 'default';
    }

    if (this.drag?.pathId && point) {
      const entry = this.paths.get(this.drag.pathId);
      const target = entry?.data.points[this.drag.index];
      if (!target) return;
      target.x = this.snapValue(point.x);
      target.z = this.snapValue(point.z);
      this.clampToMap(target);
      this.refreshPath(entry);
      this.drag.moved = true;
    } else if (this.drag?.uid && point) {
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
    if (this.drag?.moved) {
      if (this.drag.pathId) this.emitPathsChange();
      else this.emitChange();
    }
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
        if (this.drawingPathId) this.removeLastPathPoint();
        else if (this.selectedPathId) this.deleteSelectedPath();
        else this.deleteSelected();
        break;
      case 'Enter':
        this.finishDrawing();
        break;
      case 'Escape':
        this.finishDrawing();
        this.setPlacingType(null);
        this.selectPath(null);
        this.select(null);
        break;
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
        this.setGizmoMode(GIZMO_MODES[Number(event.code.slice(-1)) - 1]);
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
    this.updatePathVisuals(delta);
    this.flushGizmoChange();
    this.updateSelectionBox();
    this.syncRangeRings();
    this.environment.update(delta, this.controls.target);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    this.rangeRings.forEach((ring) => this.disposeRangeRing(ring));
    this.rangeRings.clear();
    if (this.ghostRing) this.disposeRangeRing(this.ghostRing);
    this.environment.dispose();
    cancelAnimationFrame(this.frameId);
    this.clearPaths();
    this.waypointGeometry.dispose();
    Object.values(this.waypointMaterials).forEach((material) => material.dispose());
    this.scene.remove(this.gizmo);
    this.gizmo.dispose();
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('dblclick', this.onDoubleClick);
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
