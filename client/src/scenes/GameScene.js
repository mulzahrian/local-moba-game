import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import characterModelUrl from '../model/rimuru_tempest.glb?url';
import { MapObject } from '../map/mapAssets.js';

const ANIM_IDLE = 'lml_anim_idle';
const ANIM_RUN = 'lml_anim_run';
const CHARACTER_SCALE = 6;
const MOVE_SPEED = 45; // units per second
const DEFAULT_ARENA_SIZE = 500;
const NETWORK_SYNC_INTERVAL = 0.05; // seconds between position broadcasts (20Hz)
const MOVE_EPSILON_SQ = 0.0005; // squared distance threshold to consider a remote player "moving"
const REMOTE_IDLE_TIMEOUT_MS = 200; // remote player is idle if no movement update arrived within this time

export class GameScene {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
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
    this.enemies = new Map();
    this.selectedPlayer = null;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    this.socketService = null;
    this.roomCode = null;

    // WASD movement state
    this.keys = { w: false, a: false, s: false, d: false };
    this.clock = new THREE.Clock();
    this.networkSyncTimer = 0;

    // Character model (shared template, cloned per player once loaded)
    this.characterTemplate = null;
    this.pendingPlayers = [];
    this.loadCharacterModel();

    this.setupEventListeners();
    this.setupKeyboardControls();
    this.animate();
  }

  loadCharacterModel() {
    const loader = new GLTFLoader();
    loader.load(
      characterModelUrl,
      (gltf) => {
        this.characterTemplate = gltf;
        // Flush players that were requested before the model finished loading
        const queued = this.pendingPlayers;
        this.pendingPlayers = [];
        queued.forEach(({ playerId, playerData, isCurrentPlayer }) => {
          this.createPlayerCharacter(playerId, playerData, isCurrentPlayer);
        });
      },
      undefined,
      (error) => console.error('[GameScene] Failed to load character model:', error)
    );
  }

  setupKeyboardControls() {
    this.onKeyDown = (event) => this.setKeyState(event.code, true);
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

    window.addEventListener('resize', () => this.onWindowResize());
  }

  setupScene() {
    this.scene.background = new THREE.Color(0x0a0a0a);
    // Camera positioned for better isometric-like view of larger map
    this.camera.position.set(100, 150, 150);
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
    this.scene.add(directionalLight);
  }

  setupBoard(size = DEFAULT_ARENA_SIZE, groundColor = 0x1a3a1a) {
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
    const boardGeometry = new THREE.PlaneGeometry(size, size);
    const boardMaterial = new THREE.MeshLambertMaterial({ color: groundColor });
    const board = new THREE.Mesh(boardGeometry, boardMaterial);
    board.receiveShadow = true;
    board.rotation.x = -Math.PI / 2;
    this.boardGroup.add(board);

    // Large grid helper - like Dota map
    const gridHelper = new THREE.GridHelper(size, Math.max(1, Math.round(size / 10)), 0x447744, 0x223322);
    gridHelper.position.y = 0.1;
    this.boardGroup.add(gridHelper);

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

    this.setupBoard(map.size || DEFAULT_ARENA_SIZE, new THREE.Color(map.groundColor || '#1a3a1a'));
    (map.objects || []).forEach((data) => {
      const object = new MapObject(data);
      this.scene.add(object.root);
      this.mapObjects.push(object);
    });
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
    if (this.players.has(playerId)) {
      this.updatePlayer(playerId, playerData);
      return;
    }

    const queuedEntry = this.pendingPlayers.find((p) => p.playerId === playerId);
    if (queuedEntry) {
      queuedEntry.playerData = playerData;
      queuedEntry.isCurrentPlayer = isCurrentPlayer;
      return;
    }

    if (!this.characterTemplate) {
      // Model is still loading - queue this player and create them once it's ready
      this.pendingPlayers.push({ playerId, playerData, isCurrentPlayer });
      return;
    }

    this.createPlayerCharacter(playerId, playerData, isCurrentPlayer);
  }

  createPlayerCharacter(playerId, playerData, isCurrentPlayer) {
    if (this.players.has(playerId)) return;

    const model = SkeletonUtils.clone(this.characterTemplate.scene);
    model.scale.setScalar(CHARACTER_SCALE);
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        // Clone materials so per-player highlighting doesn't affect other instances
        if (child.material) {
          child.material = child.material.clone();
        }
      }
    });

    const teamColor = playerData.team === 'team1' ? 0xff6b6b : 0x4ecdc4;

    // Team-colored ring under the character's feet (keeps the character's own textures intact)
    const ringGeometry = new THREE.RingGeometry(4, 5.5, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: teamColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.2;

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
    const labelGeometry = new THREE.PlaneGeometry(8, 2);
    const labelMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
    const label = new THREE.Mesh(labelGeometry, labelMaterial);
    label.position.y = 17;

    // Group holds everything at the world position; only `model` rotates to face movement,
    // keeping the ring and name label upright/non-rotated.
    const group = new THREE.Group();
    group.userData.playerId = playerId;
    group.add(model);
    group.add(ring);
    group.add(label);
    group.position.set(playerData.position.x, 0, playerData.position.z);

    this.scene.add(group);

    const mixer = new THREE.AnimationMixer(model);
    const clips = this.characterTemplate.animations;
    const idleClip = THREE.AnimationClip.findByName(clips, ANIM_IDLE);
    const runClip = THREE.AnimationClip.findByName(clips, ANIM_RUN);
    const actions = {
      idle: idleClip ? mixer.clipAction(idleClip) : null,
      run: runClip ? mixer.clipAction(runClip) : null
    };

    const currentAction = actions.idle || actions.run || null;
    if (currentAction) currentAction.play();

    this.players.set(playerId, {
      mesh: group,
      model,
      mixer,
      actions,
      currentAction,
      data: playerData,
      isCurrentPlayer,
      isMoving: false,
      lastMoveTime: 0
    });
  }

  updatePlayer(playerId, playerData) {
    const player = this.players.get(playerId);
    if (!player) {
      const queuedEntry = this.pendingPlayers.find((p) => p.playerId === playerId);
      if (queuedEntry) {
        queuedEntry.playerData = { ...queuedEntry.playerData, ...playerData };
      }
      return;
    }

    player.data = playerData;

    // The current player's position is driven locally by WASD input (see updateLocalMovement);
    // applying the server echo here would fight local prediction and cause jitter.
    if (player.isCurrentPlayer) return;

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
      this.players.delete(playerId);
    }
    this.pendingPlayers = this.pendingPlayers.filter((p) => p.playerId !== playerId);
  }

  setPlayerMoving(player, isMoving) {
    if (player.isMoving === isMoving) return;
    player.isMoving = isMoving;

    const nextAction = isMoving ? player.actions.run : player.actions.idle;
    if (!nextAction || player.currentAction === nextAction) return;

    nextAction.reset().fadeIn(0.2).play();
    if (player.currentAction) {
      player.currentAction.fadeOut(0.2);
    }
    player.currentAction = nextAction;
  }

  getCurrentPlayerEntry() {
    for (const player of this.players.values()) {
      if (player.isCurrentPlayer) return player;
    }
    return null;
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

  setupEventListeners() {
    this.container.addEventListener('click', (e) => this.onMouseClick(e));
    this.container.addEventListener('mousemove', (e) => this.onMouseMove(e));
  }

  onMouseClick(event) {
    // Movement is handled via WASD (see updateLocalMovement); clicking only selects a player.
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const playerGroups = Array.from(this.players.values()).map(p => p.mesh);
    const intersects = this.raycaster.intersectObjects(playerGroups, true);

    if (intersects.length > 0) {
      // Walk up from the hit mesh to the player's group, which carries the playerId
      let hitObject = intersects[0].object;
      while (hitObject && hitObject.userData.playerId === undefined) {
        hitObject = hitObject.parent;
      }
      if (hitObject) {
        this.selectPlayer(hitObject.userData.playerId);
      }
    }
  }

  onMouseMove(event) {
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  selectPlayer(playerId) {
    // Remove previous selection highlight
    if (this.selectedPlayer && this.players.has(this.selectedPlayer)) {
      this.setHighlight(this.players.get(this.selectedPlayer), false);
    }

    // Add selection highlight
    if (this.players.has(playerId)) {
      this.setHighlight(this.players.get(playerId), true);
      this.selectedPlayer = playerId;
    }
  }

  setHighlight(player, isHighlighted) {
    player.model.traverse((child) => {
      if (child.isMesh && child.material && child.material.emissive) {
        child.material.emissive.setHex(isHighlighted ? 0x444444 : 0x000000);
      }
    });
  }

  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate = () => {
    requestAnimationFrame(this.animate);

    const delta = this.clock.getDelta();
    this.updateLocalMovement(delta);
    this.mapObjects.forEach((object) => object.update(delta));
    const now = performance.now();
    for (const player of this.players.values()) {
      // Remote players stop sending updates when they stop, so no "idle" event ever arrives;
      // fall back to idle when no movement update was received recently.
      if (!player.isCurrentPlayer && player.isMoving && now - player.lastMoveTime > REMOTE_IDLE_TIMEOUT_MS) {
        this.setPlayerMoving(player, false);
      }
      player.mixer.update(delta);
    }

    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.container.removeEventListener('click', this.onMouseClick);
    this.container.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('resize', this.onWindowResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.clearMapObjects();
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
