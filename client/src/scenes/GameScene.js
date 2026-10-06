import * as THREE from 'three';
import { MapObject } from '../map/mapAssets.js';
import { Environment, createGroundGeometry, createGroundMaterial } from '../map/environment.js';
import { BUILTIN_CHARACTER_ID, COMBO_WINDOW_SECONDS, getActionDef, getManaCost } from '../../../shared/characterConfig.js';
import { CharacterActor } from '../character/CharacterActor.js';
import { getCharacterDefinition, loadGltf } from '../character/characterAssets.js';
import { EffectManager } from '../character/effects.js';

const UNIT_SCALE = 0.25; // characters are drawn at 0.25x relative to the map; scales character-attached helpers
const MOVE_SPEED = 45 * UNIT_SCALE; // units per second
const CAMERA_FOV = 60;
const CAMERA_OFFSET = new THREE.Vector3(23, 35, 35); // follow-camera offset from the focus point
const CAMERA_FOLLOW_SMOOTHING = 8; // higher = camera catches up faster
const DEFAULT_ARENA_SIZE = 500;
const NETWORK_SYNC_INTERVAL = 0.05; // seconds between position broadcasts (20Hz)
const MOVE_EPSILON_SQ = 0.0005; // squared distance threshold to consider a remote player "moving"
const REMOTE_IDLE_TIMEOUT_MS = 200; // remote player is idle if no movement update arrived within this time
const SEND_LOCK_MS = 120; // minimum gap between two action requests from the local player
const DASH_SECONDS = 0.25;
const KNOCKBACK_SECONDS = 0.3;
const KNOCKBACK_STUN_MS = 400;

const KEY_ACTIONS = { KeyZ: 'skill1', KeyX: 'skill2', KeyC: 'skill3', KeyQ: 'emote', Space: 'jump' };
const NO_REPEAT_ACTIONS = ['emote', 'jump'];

const isTypingTarget = (target) =>
  target instanceof HTMLElement &&
  (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);

export class GameScene {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });

    this.setupRenderer();
    this.setupScene();
    this.setupLights();
    this.mapObjects = [];
    this.setupBoard();

    this.players = new Map();
    this.pendingPlayers = new Map(); // playerId -> { playerData, isCurrentPlayer } while the character model loads
    this.effects = new EffectManager(this.scene);
    this.floaters = []; // floating damage / heal numbers
    this.disposed = false;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.socketService = null;
    this.roomCode = null;

    // WASD movement state
    this.keys = { w: false, a: false, s: false, d: false };
    this.clock = new THREE.Clock();
    this.networkSyncTimer = 0;
    this.cameraFocus = new THREE.Vector3();
    this.cameraSnapPending = true;

    this.setupEventListeners();
    this.setupKeyboardControls();
    this.animate();
  }

  setupKeyboardControls() {
    this.onKeyDown = (event) => {
      if (isTypingTarget(event.target)) return;
      const action = KEY_ACTIONS[event.code];
      if (action) {
        if (event.code === 'Space') event.preventDefault(); // don't scroll the page / click a focused button
        if (!event.repeat || !NO_REPEAT_ACTIONS.includes(action)) this.performAction(action);
        return;
      }
      this.setKeyState(event.code, true);
    };
    this.onKeyUp = (event) => this.setKeyState(event.code, false);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  setKeyState(code, isDown) {
    switch (code) {
      case 'KeyW': case 'ArrowUp': this.keys.w = isDown; break;
      case 'KeyA': case 'ArrowLeft': this.keys.a = isDown; break;
      case 'KeyS': case 'ArrowDown': this.keys.s = isDown; break;
      case 'KeyD': case 'ArrowRight': this.keys.d = isDown; break;
      default: break;
    }
  }

  setupRenderer() {
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setClearColor(0x1a1a1a);
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    this.onResize = () => this.onWindowResize();
    window.addEventListener('resize', this.onResize);
  }

  setupScene() {
    this.scene.background = new THREE.Color(0x0a0a0a);
    // MOBA-style fixed-angle camera; updateCamera() keeps it centred on the local player.
    this.camera.position.copy(CAMERA_OFFSET);
    this.camera.lookAt(0, 0, 0);

    // Precompute camera-relative movement axes (flattened to the ground plane)
    // so WASD moves the character relative to this fixed isometric view.
    this.cameraForward = new THREE.Vector3();
    this.camera.getWorldDirection(this.cameraForward);
    this.cameraForward.y = 0;
    this.cameraForward.normalize();
    this.cameraRight = new THREE.Vector3()
      .crossVectors(this.cameraForward, this.camera.up)
      .normalize();
  }

  setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    // The shadow frustum only covers the area around the followed player (see updateCamera).
    Object.assign(directionalLight.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 300 });
    this.scene.add(directionalLight);
    this.scene.add(directionalLight.target);
    this.sunLight = directionalLight;
    this.environment = new Environment(this.scene, { ambientLight, sunLight: directionalLight });
  }

  setupBoard(size = DEFAULT_ARENA_SIZE) {
    if (this.boardGroup) {
      this.scene.remove(this.boardGroup);
      this.boardGroup.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    }
    this.boardGroup = new THREE.Group();
    this.scene.add(this.boardGroup);

    const half = size / 2;
    this.arenaLimit = half - 10;

    // Game board - DOTA-style large map (500x500 units by default)
    const boardGeometry = createGroundGeometry(size);
    const boardMaterial = createGroundMaterial();
    const board = new THREE.Mesh(boardGeometry, boardMaterial);
    board.receiveShadow = true;
    board.rotation.x = -Math.PI / 2;
    this.boardGroup.add(board);

    // Radiant base (bottom-left, green)
    const baseOffset = size * 0.4;
    this.createBaseMarker(-baseOffset, 0, -baseOffset, 0x92a825, 'Radiant');

    // Dire base (top-right, red)
    this.createBaseMarker(baseOffset, 0, baseOffset, 0x922620, 'Dire');

    // Add some arena walls/boundaries
    this.createWall(-half, 0, 0, size, 'vertical');
    this.createWall(half, 0, 0, size, 'vertical');
    this.createWall(0, 0, -half, size, 'horizontal');
    this.createWall(0, 0, half, size, 'horizontal');
  }

  // Rebuilds the arena from a saved map (null keeps the default arena) and places its objects.
  loadMap(map) {
    this.clearMapObjects();
    if (!map) return;

    this.setupBoard(map.size || DEFAULT_ARENA_SIZE);
    this.environment.apply(map.sky, map.weather);
    (map.objects || []).forEach((data) => {
      const object = new MapObject(data);
      this.scene.add(object.root);
      this.mapObjects.push(object);
    });
  }

  // Overrides the sky/weather chosen for the room (null keeps the current one).
  setEnvironment(environment) {
    if (environment) this.environment.apply(environment.sky, environment.weather);
  }

  clearMapObjects() {
    this.mapObjects.forEach((object) => object.dispose());
    this.mapObjects = [];
  }

  createWall(x, y, z, length, orientation) {
    const width = orientation === 'horizontal' ? length : 5;
    const depth = orientation === 'vertical' ? length : 5;
    const geometry = new THREE.BoxGeometry(width, 15, depth);
    const material = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.3 });
    const wall = new THREE.Mesh(geometry, material);
    wall.position.set(x, 7.5, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    this.boardGroup.add(wall);
  }

  createBaseMarker(x, y, z, color, name) {
    // Larger base marker - visible tower-like structure
    const geometry = new THREE.ConeGeometry(20, 40, 32);
    const material = new THREE.MeshStandardMaterial({ color, metalness: 0.4 });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.set(x, y, z);
    marker.castShadow = true;
    marker.receiveShadow = true;
    this.boardGroup.add(marker);
    
    // Base circle on ground
    const baseGeometry = new THREE.CylinderGeometry(30, 30, 1, 32);
    const baseMaterial = new THREE.MeshStandardMaterial({ color: color, opacity: 0.6, transparent: true });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.set(x, 0.5, z);
    base.receiveShadow = true;
    this.boardGroup.add(base);
  }
  addPlayer(playerId, playerData, isCurrentPlayer = false) {
    const existing = this.players.get(playerId);
    if (existing) {
      // Only refresh stats / metadata; the live position is owned by the scene (movement, knockback)
      existing.data = { ...existing.data, ...playerData, position: existing.data.position };
      return;
    }

    const queued = this.pendingPlayers.get(playerId);
    if (queued) {
      queued.playerData = { ...queued.playerData, ...playerData };
      queued.isCurrentPlayer = isCurrentPlayer;
      return;
    }

    // The character's model is downloaded first; the player is created once it is ready
    this.pendingPlayers.set(playerId, { playerData, isCurrentPlayer });
    this.loadCharacter(playerData.characterId)
      .then(({ def, gltf }) => {
        const entry = this.pendingPlayers.get(playerId);
        if (this.disposed || !entry) return;
        this.pendingPlayers.delete(playerId);
        this.createPlayerCharacter(playerId, entry.playerData, entry.isCurrentPlayer, def, gltf);
      })
      .catch((error) => {
        console.error('[GameScene] Failed to load character:', error);
        this.pendingPlayers.delete(playerId);
      });
  }

  async loadCharacter(characterId) {
    const def = await getCharacterDefinition(characterId || BUILTIN_CHARACTER_ID);
    const gltf = await loadGltf(def.modelUrl);
    return { def, gltf };
  }

  createPlayerCharacter(playerId, playerData, isCurrentPlayer, def, gltf) {
    if (this.players.has(playerId)) return;

    const actor = new CharacterActor(gltf, def);
    const { model } = actor;

    const teamColor = playerData.team === 'team1' ? 0xff6b6b : 0x4ecdc4;

    // Team-colored ring under the character's feet (keeps the character's own textures intact)
    const ringGeometry = new THREE.RingGeometry(4 * UNIT_SCALE, 5.5 * UNIT_SCALE, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: teamColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;

    // Name label
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.font = 'Bold 40px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(playerData.name, 128, 45);

    const texture = new THREE.CanvasTexture(canvas);
    const labelGeometry = new THREE.PlaneGeometry(4, 1);
    const labelMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
    const label = new THREE.Mesh(labelGeometry, labelMaterial);
    label.position.y = 17 * UNIT_SCALE;

    // Group holds everything at the world position; only `model` rotates to face movement,
    // keeping the ring and name label upright/non-rotated.
    const group = new THREE.Group();
    group.userData.playerId = playerId;
    group.add(model);
    group.add(ring);
    group.add(label);
    group.position.set(playerData.position.x, 0, playerData.position.z);

    this.scene.add(group);

    this.players.set(playerId, {
      playerId,
      mesh: group,
      model,
      actor,
      def,
      role: playerData.role || def.role,
      data: playerData,
      isCurrentPlayer,
      isMoving: false,
      lastMoveTime: 0,
      dead: false,
      stunUntil: 0,
      displacement: null,
      cooldownEnds: {},
      cooldownTotals: {},
      nextAttack: 'attack1',
      lastAttackAt: 0,
      sendLockUntil: 0
    });
  }

  updatePlayer(playerId, playerData) {
    const player = this.players.get(playerId);
    if (!player) {
      const queued = this.pendingPlayers.get(playerId);
      if (queued) queued.playerData = { ...queued.playerData, ...playerData };
      return;
    }

    player.data = playerData;

    // The current player's position is driven locally by WASD input (see updateLocalMovement);
    // applying the server echo here would fight local prediction and cause jitter.
    if (player.isCurrentPlayer) return;
    // A knockback / dash animation is moving this player right now
    if (player.displacement) return;

    const dx = playerData.position.x - player.mesh.position.x;
    const dz = playerData.position.z - player.mesh.position.z;
    const movedDistanceSq = dx * dx + dz * dz;

    player.mesh.position.set(playerData.position.x, 0, playerData.position.z);

    const isMoving = movedDistanceSq > MOVE_EPSILON_SQ;
    if (isMoving) {
      player.model.rotation.y = Math.atan2(dx, dz);
      player.lastMoveTime = performance.now();
    }
    this.setPlayerMoving(player, isMoving);
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (player) {
      this.scene.remove(player.mesh);
      player.actor.dispose();
      this.players.delete(playerId);
    }
    this.pendingPlayers.delete(playerId);
  }

  setPlayerMoving(player, isMoving) {
    if (player.isMoving === isMoving) return;
    player.isMoving = isMoving;
    player.actor.setMoving(isMoving);
  }

  getCurrentPlayerEntry() {
    for (const player of this.players.values()) {
      if (player.isCurrentPlayer) return player;
    }
    return null;
  }

  isStunned(player) {
    return performance.now() < player.stunUntil;
  }

  // Sends the local player's final position once movement stops, so remote clients
  // don't end up with a slightly stale position due to throttled syncing.
  flushLocalPosition(player) {
    if (this.networkSyncTimer === 0) return;
    this.networkSyncTimer = 0;
    this.emitPosition(player.mesh.position.x, player.mesh.position.z);
  }

  emitPosition(x, z) {
    if (this.socketService && this.roomCode) {
      this.socketService.emit('playerMove', {
        roomCode: this.roomCode,
        position: { x, z }
      });
    }
  }

  // Reads WASD state, moves the local player, rotates it to face its movement
  // direction, drives its run/idle animation, and throttles position sync to the server.
  updateLocalMovement(delta) {
    const player = this.getCurrentPlayerEntry();
    if (!player) return;

    if (player.dead || player.displacement || this.isStunned(player)) {
      this.setPlayerMoving(player, false);
      return;
    }

    const { w, a, s, d } = this.keys;
    if (!w && !a && !s && !d) {
      this.setPlayerMoving(player, false);
      this.flushLocalPosition(player);
      return;
    }

    const moveDir = new THREE.Vector3();
    if (w) moveDir.add(this.cameraForward);
    if (s) moveDir.sub(this.cameraForward);
    if (d) moveDir.add(this.cameraRight);
    if (a) moveDir.sub(this.cameraRight);

    if (moveDir.lengthSq() === 0) {
      this.setPlayerMoving(player, false);
      this.flushLocalPosition(player);
      return;
    }
    moveDir.normalize();

    const distance = MOVE_SPEED * delta;
    const nextX = THREE.MathUtils.clamp(player.mesh.position.x + moveDir.x * distance, -this.arenaLimit, this.arenaLimit);
    const nextZ = THREE.MathUtils.clamp(player.mesh.position.z + moveDir.z * distance, -this.arenaLimit, this.arenaLimit);

    player.mesh.position.set(nextX, 0, nextZ);
    player.model.rotation.y = Math.atan2(moveDir.x, moveDir.z);
    this.setPlayerMoving(player, true);

    this.networkSyncTimer += delta;
    if (this.networkSyncTimer >= NETWORK_SYNC_INTERVAL) {
      this.networkSyncTimer = 0;
      this.emitPosition(nextX, nextZ);
    }
  }

  // Called by App.jsx to set socket reference and room code for emitting events
  setSocketService(socketService, roomCode) {
    this.socketService = socketService;
    this.roomCode = roomCode;
  }

  // ---------------------------------------------------------------------------
  // Combat: attacks, skills and emotes
  // ---------------------------------------------------------------------------

  // Direction (on the ground plane) from the local player towards the mouse cursor.
  getAimDirection(player) {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const point = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, point)) {
      const dx = point.x - player.mesh.position.x;
      const dz = point.z - player.mesh.position.z;
      const length = Math.hypot(dx, dz);
      if (length > 0.5) return { x: dx / length, z: dz / length };
    }
    const facing = player.model.rotation.y;
    return { x: Math.sin(facing), z: Math.cos(facing) };
  }

  /**
   * Local player input: 'attack' (alternates attack1/attack2 as a combo), 'skill1'-'skill3' or 'emote'.
   * In a room the request goes to the server, which validates it and broadcasts `skillUsed`;
   * in the offline map preview it plays immediately without damage.
   */
  performAction(request) {
    const me = this.getCurrentPlayerEntry();
    const now = performance.now();
    if (!me || me.dead || this.isStunned(me) || me.displacement || now < me.sendLockUntil) return;

    let slot = request;
    if (request === 'attack') {
      const combo = me.nextAttack === 'attack2' && now - me.lastAttackAt < COMBO_WINDOW_SECONDS * 1000;
      slot = combo ? 'attack2' : 'attack1';
    }

    const def = getActionDef(me.role, slot);
    if (!def || (me.cooldownEnds[slot] || 0) > now) return;

    const networked = Boolean(this.socketService && this.roomCode);
    if (networked && (me.data.mana ?? Infinity) < getManaCost(me.role, slot)) return;

    me.sendLockUntil = now + SEND_LOCK_MS;
    const dir = this.getAimDirection(me);

    if (networked) {
      this.socketService.emit('useSkill', { roomCode: this.roomCode, slot, dir });
      return;
    }

    const event = { casterId: me.playerId, slot, dir, hits: [], casterPosition: null };
    if (def.dash) {
      event.casterPosition = {
        x: THREE.MathUtils.clamp(me.mesh.position.x + dir.x * def.dash, -this.arenaLimit, this.arenaLimit),
        z: THREE.MathUtils.clamp(me.mesh.position.z + dir.z * def.dash, -this.arenaLimit, this.arenaLimit)
      };
    }
    this.handleSkillUsed(event);
  }

  // Server broadcast: someone attacked / cast a skill / emoted.
  handleSkillUsed(event) {
    const caster = this.players.get(event.casterId);
    const now = performance.now();

    if (caster) {
      const def = getActionDef(caster.role, event.slot);
      caster.model.rotation.y = Math.atan2(event.dir.x, event.dir.z);
      caster.actor.play(event.slot);

      if (def) {
        caster.cooldownEnds[event.slot] = now + def.cooldown * 1000;
        caster.cooldownTotals[event.slot] = def.cooldown * 1000;
      }
      if (event.slot === 'attack1') {
        caster.nextAttack = 'attack2';
        caster.lastAttackAt = now;
      } else if (event.slot === 'attack2') {
        caster.nextAttack = 'attack1';
      }

      const effectId = this.getEffectId(caster, event.slot, def);
      if (def && effectId) {
        this.effects.spawn(effectId, {
          position: caster.mesh.position,
          rotationY: caster.model.rotation.y,
          range: def.range,
          shape: def.shape,
          model: caster.model
        });
      }
      if (def?.heal) this.spawnFloater(caster.mesh.position, `+${def.heal}`, '#7dff9c');
      if (event.casterPosition) this.displace(caster, event.casterPosition, DASH_SECONDS);
    }

    event.hits.forEach((hit) => this.applyHit(hit));
  }

  // Skills use the effect picked in the character generator; basic attacks get a light default one.
  getEffectId(caster, slot, def) {
    const chosen = caster.def.effects?.[slot];
    if (chosen) return chosen === 'none' ? null : chosen;
    if (slot === 'attack1' || slot === 'attack2') {
      if (def?.shape === 'cone') return 'slashArc';
      if (def?.shape === 'line') return 'arrowVolley';
    }
    return null;
  }

  applyHit(hit) {
    const target = this.players.get(hit.targetId);
    if (!target) return;

    target.data = { ...target.data, health: hit.health };
    this.spawnFloater(target.mesh.position, `-${hit.damage}`, '#ff6b6b');

    if (!target.actor.play(hit.reaction)) target.actor.play('hit');
    if (hit.reaction !== 'hit') this.displace(target, hit.position, KNOCKBACK_SECONDS, KNOCKBACK_STUN_MS);
  }

  // Smoothly slides a player to `to`; the local player can't walk while it happens.
  displace(player, to, seconds, stunMs = seconds * 1000) {
    player.displacement = {
      from: player.mesh.position.clone(),
      to: new THREE.Vector3(to.x, 0, to.z),
      elapsed: 0,
      duration: seconds
    };
    if (player.isCurrentPlayer) player.stunUntil = Math.max(player.stunUntil, performance.now() + stunMs);
  }

  updateDisplacements(delta) {
    for (const player of this.players.values()) {
      const move = player.displacement;
      if (!move) continue;
      move.elapsed += delta;
      const u = Math.min(1, move.elapsed / move.duration);
      player.mesh.position.lerpVectors(move.from, move.to, 1 - (1 - u) ** 3);
      if (u >= 1) {
        player.displacement = null;
        if (player.isCurrentPlayer) this.emitPosition(player.mesh.position.x, player.mesh.position.z);
      }
    }
  }

  handlePlayerDied(playerId) {
    const player = this.players.get(playerId);
    if (!player) return;
    player.dead = true;
    player.displacement = null;
    player.data = { ...player.data, health: 0 };
    player.mesh.visible = false;
  }

  handlePlayerRespawned(data) {
    const player = this.players.get(data.id);
    if (!player) return;
    player.dead = false;
    player.displacement = null;
    player.stunUntil = 0;
    player.cooldownEnds = {};
    player.data = { ...player.data, ...data };
    player.actor.endOneShot();
    player.mesh.position.set(data.position.x, 0, data.position.z);
    player.mesh.visible = true;
    if (player.isCurrentPlayer) {
      this.cameraSnapPending = true;
      this.networkSyncTimer = 0;
    }
  }

  spawnFloater(position, text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 52px Arial';
    ctx.textAlign = 'center';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#000';
    ctx.strokeText(text, 80, 56);
    ctx.fillStyle = color;
    ctx.fillText(text, 80, 56);

    const material = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(5, 2.5, 1);
    sprite.position.set(position.x, 6, position.z);
    sprite.renderOrder = 10;
    this.scene.add(sprite);
    this.floaters.push({ sprite, age: 0 });
  }

  updateFloaters(delta) {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const floater = this.floaters[i];
      floater.age += delta;
      floater.sprite.position.y += 3 * delta;
      floater.sprite.material.opacity = Math.max(0, 1 - floater.age);
      if (floater.age >= 1) this.removeFloater(i);
    }
  }

  removeFloater(index) {
    const [{ sprite }] = this.floaters.splice(index, 1);
    this.scene.remove(sprite);
    sprite.material.map.dispose();
    sprite.material.dispose();
  }

  // Snapshot for the skill bar: cooldown progress of the local player's actions.
  getHudState() {
    const me = this.getCurrentPlayerEntry();
    if (!me) return null;
    const now = performance.now();
    const cooldowns = {};
    Object.keys(me.cooldownEnds).forEach((slot) => {
      const remaining = Math.max(0, me.cooldownEnds[slot] - now);
      if (remaining > 0) cooldowns[slot] = { remaining, total: me.cooldownTotals[slot] };
    });
    return { role: me.role, dead: me.dead, mana: this.socketService ? me.data.mana : null, cooldowns };
  }

  // ---------------------------------------------------------------------------

  setupEventListeners() {
    this.onMouseDown = (e) => {
      if (e.button !== 0) return;
      this.updateMouse(e);
      this.performAction('attack');
    };
    this.onMove = (e) => this.updateMouse(e);
    this.container.addEventListener('mousedown', this.onMouseDown);
    this.container.addEventListener('mousemove', this.onMove);
  }

  updateMouse(event) {
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  // Smoothly keeps the camera (and the sun's shadow frustum) centred on the local player.
  updateCamera(delta) {
    const player = this.getCurrentPlayerEntry();
    if (!player) return;

    const target = player.mesh.position;
    if (this.cameraSnapPending) {
      this.cameraFocus.copy(target);
      this.cameraSnapPending = false;
    } else {
      this.cameraFocus.lerp(target, 1 - Math.exp(-CAMERA_FOLLOW_SMOOTHING * delta));
    }

    this.camera.position.copy(this.cameraFocus).add(CAMERA_OFFSET);
    this.camera.lookAt(this.cameraFocus);

    this.sunLight.position.copy(this.cameraFocus).add(new THREE.Vector3(50, 100, 50));
    this.sunLight.target.position.copy(this.cameraFocus);
  }

  animate = () => {
    this.frameId = requestAnimationFrame(this.animate);

    const delta = this.clock.getDelta();
    this.updateLocalMovement(delta);
    this.updateDisplacements(delta);
    this.mapObjects.forEach((object) => object.update(delta));
    const now = performance.now();
    for (const player of this.players.values()) {
      // Remote players stop sending updates when they stop, so no "idle" event ever arrives;
      // fall back to idle when no movement update was received recently.
      if (!player.isCurrentPlayer && player.isMoving && now - player.lastMoveTime > REMOTE_IDLE_TIMEOUT_MS) {
        this.setPlayerMoving(player, false);
      }
      player.actor.update(delta);
    }
    this.effects.update(delta);
    this.updateFloaters(delta);

    this.updateCamera(delta);
    this.environment.update(delta, this.cameraFocus);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.environment.dispose();
    this.container.removeEventListener('mousedown', this.onMouseDown);
    this.container.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.effects.dispose();
    while (this.floaters.length) this.removeFloater(this.floaters.length - 1);
    this.players.forEach((player) => player.actor.dispose());
    this.clearMapObjects();
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
