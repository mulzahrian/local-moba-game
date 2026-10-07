import * as THREE from 'three';
import { MapObject } from '../map/mapAssets.js';
import { PathWalker } from '../map/PathWalker.js';
import { computeFootprint, resolveObstacles } from '../map/collision.js';
import { Environment, createGroundGeometry, createGroundMaterial } from '../map/environment.js';
import { BUILTIN_CHARACTER_ID, COMBO_WINDOW_SECONDS, getActionDef, getAttackType, getManaCost } from '../../../shared/characterConfig.js';
import { CharacterActor } from '../character/CharacterActor.js';
import { getCharacterDefinition, loadGltf, setModelOpacity } from '../character/characterAssets.js';
import { RUN_SOUND, playActionSound, playPowerSound, playReactionSound } from '../character/characterSounds.js';
import { buildTowers } from '../../../shared/mapConfig.js';
import { audioService } from '../services/audioService.js';
import { EffectManager } from '../character/effects.js';
import { attackEffectId } from '../character/attackEffects.js';
import { isSkillSlot, skillIdOfSlot, skillSlot } from '../../../shared/skillConfig.js';
import { FLIGHT_HEIGHT, isMonsterObject, monsterIdOfType } from '../../../shared/monsterConfig.js';
import { SHOP_OPEN_SECONDS, SHOP_RANGE } from '../../../shared/economyConfig.js';
import { ensureSkillLibrary, getSkill, getSkillAction, refreshSkillLibrary } from '../skill/skillLibrary.js';
import { SKILL_SOUND_EFFECT } from '../skill/skillEffects.js';
import { SUMMON_SOUND_EFFECT } from '../skill/summonEffects.js';
import { getMonsterDefinition } from '../monster/monsterAssets.js';
import { WorldActor } from '../world/WorldActor.js';
import { useSkillStore } from '../store/skillStore.js';
import { useSettingsStore } from '../store/settingsStore.js';
import { translate } from '../i18n/index.js';

const UNIT_SCALE = 0.25; // characters are drawn at 0.25x relative to the map; scales character-attached helpers
const MOVE_SPEED = 45 * UNIT_SCALE; // units per second
const CAMERA_FOV = 60;
const CAMERA_OFFSET = new THREE.Vector3(23, 35, 35); // follow-camera offset from the focus point
const CAMERA_FOLLOW_SMOOTHING = 8; // higher = camera catches up faster
const DEFAULT_ARENA_SIZE = 500;
const NETWORK_SYNC_INTERVAL = 0.05; // seconds between position broadcasts (20Hz)
const MOVE_EPSILON_SQ = 0.0005; // squared distance threshold to consider a remote player "moving"
const REMOTE_POSITION_SMOOTHING = 14; // higher = remote players catch up to their network position faster
const REMOTE_SNAP_DISTANCE_SQ = 30 * 30; // farther than this (teleport) skips the smoothing
const REMOTE_IDLE_TIMEOUT_MS = 200; // remote player is idle if no movement update arrived within this time
const SEND_LOCK_MS = 120; // minimum gap between two action requests from the local player
const DASH_SECONDS = 0.25;
const SOUND_RANGE = 80; // world units from the camera focus beyond which action sounds are silent
const TEAM_COLORS = { team1: 0xff6b6b, team2: 0x4ecdc4 };
const KNOCKBACK_SECONDS = 0.3;
const KNOCKBACK_STUN_MS = 400;

const KEY_ACTIONS = { KeyZ: 'skill1', KeyX: 'skill2', KeyC: 'skill3', KeyQ: 'emote', Space: 'jump' };
const NO_REPEAT_ACTIONS = ['emote', 'jump'];
const SKILL_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4']; // equipped skills (see skillStore)
const GHOST_OPACITY = 0.35; // how visible an invisible player is to its own team
const DOMINATED_SPEED_FACTOR = 0.7; // mind-controlled players are dragged along slower than they walk
const DOMINATED_STOP_DISTANCE = 3;
const MONSTER_BAR_COLOR = 0xd04a3a;

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
    this.footprints = []; // ground footprints of the solid map objects (see map/collision.js)
    this.pathWalkers = []; // NPCs walking along the paths of the map
    this.towers = new Map(); // tower id -> { ...tower, root, ring, bar, canvas, color }
    this.gameOver = false;
    this.setupBoard();

    this.players = new Map();
    this.pendingPlayers = new Map(); // playerId -> { playerData, isCurrentPlayer } while the character model loads
    this.monsters = new Map(); // map object uid -> WorldActor (guards placed on the map; the server moves them)
    this.units = new Map(); // unit id -> WorldActor (summoned by skills)
    this.defeatedEntities = new Set(); // ids that died while their model was still loading
    this.pendingStates = new Map(); // id -> last server state received before the entity was created
    this.mapVersion = 0;
    this.startedAt = Date.now(); // the shop is open for the first minutes after this
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
      const skillIndex = SKILL_KEYS.indexOf(event.code);
      if (skillIndex >= 0) {
        const skillId = useSkillStore.getState().equipped[skillIndex];
        if (skillId && !event.repeat) this.performAction(skillSlot(skillId));
        return;
      }
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

  setupBoard(size = DEFAULT_ARENA_SIZE, withMarkers = true) {
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

    // Default bases (bottom-left and top-right); maps with placed towers draw those instead
    this.markerGroups = {};
    if (withMarkers) {
      const baseOffset = size * 0.4;
      this.markerGroups.team1 = this.createBaseMarker(-baseOffset, 0, -baseOffset, 0x92a825, 'Radiant');
      this.markerGroups.team2 = this.createBaseMarker(baseOffset, 0, baseOffset, 0x922620, 'Dire');
    }

    // Add some arena walls/boundaries
    this.createWall(-half, 0, 0, size, 'vertical');
    this.createWall(half, 0, 0, size, 'vertical');
    this.createWall(0, 0, -half, size, 'horizontal');
    this.createWall(0, 0, half, size, 'horizontal');
  }

  // Rebuilds the arena from a saved map (null keeps the default arena) and places its objects and towers.
  loadMap(map) {
    this.clearMapObjects();
    this.clearWorld();
    this.clearTowers();
    const towers = buildTowers(map);

    if (map) {
      this.setupBoard(map.size || DEFAULT_ARENA_SIZE, !towers[0].custom);
      this.environment.apply(map.sky, map.weather);
      (map.objects || []).forEach((data) => {
        if (isMonsterObject(data)) {
          this.addMonster(data);
          return;
        }
        const object = new MapObject(data);
        this.scene.add(object.root);
        this.mapObjects.push(object);
        if (!data.noCollision) {
          object.ready.then(() => {
            if (object.disposed) return;
            object.footprint = computeFootprint(object.root);
            this.rebuildFootprints();
          });
        }
      });
      (map.paths || []).forEach((path) => {
        if (!path.type || path.points?.length < 2) return;
        const walker = new PathWalker(path);
        this.scene.add(walker.root);
        this.pathWalkers.push(walker);
      });
    }
    this.setupTowers(towers);
  }

  // ---------------------------------------------------------------------------
  // Towers: each team's base. Its health bar is drawn above it; destroying the enemy tower wins.
  // ---------------------------------------------------------------------------

  setupTowers(towers) {
    this.gameOver = false;
    towers.forEach((tower) => {
      const color = TEAM_COLORS[tower.team];
      const root = tower.custom
        ? this.mapObjects.find((object) => object.data.uid === tower.id)?.root
        : this.markerGroups[tower.team];

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(tower.radius, tower.radius + 1.5, 48),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(tower.position.x, 0.08, tower.position.z);
      this.scene.add(ring);

      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 16;
      const bar = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false })
      );
      bar.scale.set(tower.radius * 2.4, tower.radius * 0.3, 1);
      bar.position.set(tower.position.x, tower.height + 3, tower.position.z);
      bar.renderOrder = 10;
      this.scene.add(bar);

      const entry = { ...tower, root, ring, bar, canvas, color };
      this.towers.set(tower.id, entry);
      this.drawTowerBar(entry);
    });
  }

  drawTowerBar(tower) {
    const ctx = tower.canvas.getContext('2d');
    const { width, height } = tower.canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = `#${tower.color.toString(16).padStart(6, '0')}`;
    ctx.fillRect(2, 2, (width - 4) * (tower.health / tower.maxHealth), height - 4);
    tower.bar.material.map.needsUpdate = true;
  }

  // Server broadcast: a tower took damage (and maybe fell).
  handleTowerHit(hit) {
    const tower = this.towers.get(hit.towerId);
    if (!tower) return;

    tower.health = hit.health;
    this.drawTowerBar(tower);
    this.spawnFloater(tower.position, `-${hit.damage}`, '#ffb347');

    if (!hit.destroyed) return;
    if (tower.root) tower.root.visible = false;
    const fallen = this.mapObjects.find((object) => object.data.uid === tower.id);
    if (fallen) {
      fallen.footprint = null;
      this.rebuildFootprints();
    }
    tower.bar.visible = false;
    tower.ring.visible = false;
    const options = { position: { x: tower.position.x, y: 0, z: tower.position.z }, range: tower.radius * 2, shape: 'circle' };
    this.effects.spawn('fireBurst', options);
    this.effects.spawn('shockwave', options);
    playPowerSound('fireBurst', this.soundVolume(tower.position));
  }

  // The match is decided: nobody can move or act any more.
  handleGameOver() {
    this.gameOver = true;
    const me = this.getCurrentPlayerEntry();
    if (me) this.setPlayerMoving(me, false);
  }

  clearTowers() {
    this.towers.forEach((tower) => {
      this.scene.remove(tower.ring);
      this.scene.remove(tower.bar);
      tower.ring.geometry.dispose();
      tower.ring.material.dispose();
      tower.bar.material.map.dispose();
      tower.bar.material.dispose();
    });
    this.towers.clear();
  }

  // ---------------------------------------------------------------------------
  // Monsters and summoned units: the server runs their behaviour, the scene only draws them.
  // ---------------------------------------------------------------------------

  async addMonster(object) {
    const version = this.mapVersion;
    try {
      const def = await getMonsterDefinition(monsterIdOfType(object.type));
      if (!def.modelUrl) return;
      const gltf = await loadGltf(def.modelUrl);
      if (this.disposed || version !== this.mapVersion || this.monsters.has(object.uid) || this.defeatedEntities.has(object.uid)) return;

      const actor = new WorldActor({
        id: object.uid,
        kind: 'monster',
        gltf,
        def,
        position: object.position,
        rotationY: THREE.MathUtils.degToRad(object.rotationY || 0),
        scale: object.scale || 1,
        hover: def.hover,
        health: def.params.health,
        maxHealth: def.params.health,
        color: MONSTER_BAR_COLOR
      });
      actor.def = def;
      this.scene.add(actor.group);
      this.monsters.set(object.uid, actor);
      const pending = this.pendingStates.get(object.uid);
      if (pending) actor.setState(pending);
    } catch (error) {
      console.error('[GameScene] Failed to load monster:', error);
    }
  }

  async addUnit(data) {
    if (this.units.has(data.id)) return;
    try {
      await ensureSkillLibrary();
      const findUnit = () => getSkill(data.skillId)?.units?.find((candidate) => candidate.id === data.unitId);
      let unit = findUnit();
      if (!unit) {
        await refreshSkillLibrary(); // the skill may have been made after this client loaded the library
        unit = findUnit();
      }
      if (!unit?.modelUrl) return;
      const gltf = await loadGltf(unit.modelUrl);
      if (this.disposed || this.units.has(data.id) || this.defeatedEntities.has(data.id)) return;

      const color = TEAM_COLORS[data.team];
      const actor = new WorldActor({
        id: data.id,
        kind: 'unit',
        gltf,
        def: { animations: unit.animations, scale: unit.params.scale },
        position: data,
        rotationY: data.r,
        hover: unit.movement === 'flight' ? FLIGHT_HEIGHT : 0,
        health: data.h,
        maxHealth: data.maxHealth,
        color,
        ringColor: color
      });
      actor.unit = unit;
      this.scene.add(actor.group);
      this.units.set(data.id, actor);
      const pending = this.pendingStates.get(data.id);
      if (pending) actor.setState(pending);
    } catch (error) {
      console.error('[GameScene] Failed to load unit:', error);
    }
  }

  // Server tick: where the monsters and units are now.
  handleWorldState({ monsters = [], units = [] }) {
    [[monsters, this.monsters], [units, this.units]].forEach(([states, actors]) => {
      states.forEach((state) => {
        const actor = actors.get(state.id);
        if (actor) actor.setState(state);
        else this.pendingStates.set(state.id, state);
      });
    });
  }

  worldActor(kind, id) {
    return (kind === 'monster' ? this.monsters : this.units).get(id) || null;
  }

  // Position of anything that can be attacked (hero, monster or unit), or null when it is not in the scene.
  entityPosition(kind, id) {
    return (kind === 'player' ? this.players.get(id)?.mesh : this.worldActor(kind, id)?.group)?.position || null;
  }

  // A monster / unit attacked or healed: play its animation and effect and show the result.
  handleEntityAttack(event) {
    const attacker = this.worldActor(event.kind, event.id);
    const to = this.entityPosition(event.targetKind, event.targetId);

    if (attacker && to) {
      attacker.attack(event.slot || 'attack1', to.x, to.z);
      const from = attacker.group.position;
      const volume = this.soundVolume(from);
      if (event.effect) {
        this.effects.spawn(event.effect, {
          position: from,
          rotationY: Math.atan2(to.x - from.x, to.z - from.z),
          range: Math.hypot(to.x - from.x, to.z - from.z),
          shape: 'line'
        });
        playPowerSound(SUMMON_SOUND_EFFECT[event.effect], volume);
      } else {
        playPowerSound('slashArc', volume);
      }
    }

    const { hit, support } = event;
    if (support) {
      const target = this.players.get(event.targetId);
      if (target) {
        target.data = { ...target.data, health: support.health, mana: support.mana };
        this.spawnFloater(target.mesh.position, `+${support.amount}`, support.type === 'mana' ? '#7bb6ff' : '#7dff9c');
      }
    } else if (hit && event.targetKind === 'player') {
      this.applyHit(hit);
    } else if (hit) {
      this.applyEntityHit(event.targetKind, { ...hit, id: hit.targetId });
    }
  }

  // Damage (and crowd control) received by a monster or unit.
  applyEntityHit(kind, hit) {
    const actor = this.worldActor(kind, hit.id);
    if (!actor) return;
    actor.setHealth(hit.health);
    if (hit.damage > 0) this.spawnFloater(actor.group.position, `-${hit.damage}`, '#ffb347');
    if (hit.stunMs) this.spawnFloater(actor.group.position, 'STUN', '#ffd34d');
    if (hit.position && (hit.reaction === 'knockback' || hit.reaction === 'pulled')) {
      actor.targetPosition.set(hit.position.x, 0, hit.position.z);
    }
  }

  handleEntityDied({ kind, id, reason }) {
    const actor = this.worldActor(kind, id);
    if (!actor) {
      this.defeatedEntities.add(id);
      return;
    }
    actor.die(kind === 'monster' || reason === 'killed');
    if (kind === 'monster') this.spawnFloater(actor.group.position, 'X', '#ffd34d');
  }

  updateWorld(delta) {
    [this.monsters, this.units].forEach((actors) => {
      actors.forEach((actor, id) => {
        actor.update(delta);
        if (!actor.finished) return;
        actor.dispose();
        actors.delete(id);
      });
    });
  }

  clearWorld() {
    this.mapVersion += 1;
    [this.monsters, this.units].forEach((actors) => {
      actors.forEach((actor) => actor.dispose());
      actors.clear();
    });
    this.defeatedEntities.clear();
    this.pendingStates.clear();
  }

  // Overrides the sky/weather chosen for the room (null keeps the current one).
  setEnvironment(environment) {
    if (environment) this.environment.apply(environment.sky, environment.weather);
  }

  rebuildFootprints() {
    this.footprints = this.mapObjects.map((object) => object.footprint).filter(Boolean);
  }

  // Pushes a position out of the solid map objects.
  collide(x, z) {
    return this.footprints.length ? resolveObstacles(this.footprints, x, z) : { x, z };
  }

  clearMapObjects() {
    this.mapObjects.forEach((object) => object.dispose());
    this.mapObjects = [];
    this.footprints = [];
    this.pathWalkers.forEach((walker) => walker.dispose());
    this.pathWalkers = [];
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
    const group = new THREE.Group();
    // Larger base marker - visible tower-like structure
    const geometry = new THREE.ConeGeometry(20, 40, 32);
    const material = new THREE.MeshStandardMaterial({ color, metalness: 0.4 });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.set(x, y, z);
    marker.castShadow = true;
    marker.receiveShadow = true;
    group.add(marker);
    
    // Base circle on ground
    const baseGeometry = new THREE.CylinderGeometry(30, 30, 1, 32);
    const baseMaterial = new THREE.MeshStandardMaterial({ color: color, opacity: 0.6, transparent: true });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.set(x, 0.5, z);
    base.receiveShadow = true;
    group.add(base);

    this.boardGroup.add(group);
    return group;
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

    // Name label: the player's name with a team + character header above it
    const teamHex = `#${teamColor.toString(16).padStart(6, '0')}`;
    const header = `${translate(useSettingsStore.getState().language, `team.${playerData.team}`)} • ${playerData.characterName || def.name}`;
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.font = 'Bold 26px Arial';
    ctx.strokeText(header, 192, 30, 370);
    ctx.fillStyle = teamHex;
    ctx.fillText(header, 192, 30, 370);
    ctx.font = 'Bold 40px Arial';
    ctx.strokeText(playerData.name, 192, 76, 370);
    ctx.fillStyle = 'white';
    ctx.fillText(playerData.name, 192, 76, 370);

    const texture = new THREE.CanvasTexture(canvas);
    const labelGeometry = new THREE.PlaneGeometry(6, 1.5);
    const labelMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
    const label = new THREE.Mesh(labelGeometry, labelMaterial);
    label.position.y = 17 * UNIT_SCALE + 0.3;

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
      targetPosition: group.position.clone(),
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

    const dx = playerData.position.x - player.targetPosition.x;
    const dz = playerData.position.z - player.targetPosition.z;
    const movedDistanceSq = dx * dx + dz * dz;

    // Network updates only set the target; updateRemotePlayers() glides the mesh towards it every frame.
    player.targetPosition.set(playerData.position.x, 0, playerData.position.z);

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

  // Sounds fade out with the distance from the camera focus (the local player).
  soundVolume(position) {
    const distance = Math.hypot(position.x - this.cameraFocus.x, position.z - this.cameraFocus.z);
    return Math.max(0, 1 - distance / SOUND_RANGE);
  }

  setPlayerMoving(player, isMoving) {
    if (player.isMoving === isMoving) return;
    player.isMoving = isMoving;
    player.actor.setMoving(isMoving);
    if (player.isCurrentPlayer) {
      if (isMoving) audioService.startLoop('run', RUN_SOUND, 0.5);
      else audioService.stopLoop('run');
    }
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

  // Smoothly follows the last received position of remote players (updates arrive at only 10-20Hz).
  updateRemotePlayers(delta) {
    const blend = 1 - Math.exp(-REMOTE_POSITION_SMOOTHING * delta);
    for (const player of this.players.values()) {
      if (player.isCurrentPlayer || player.displacement || player.dead) continue;
      const { mesh, targetPosition } = player;
      if (mesh.position.distanceToSquared(targetPosition) > REMOTE_SNAP_DISTANCE_SQ) {
        mesh.position.copy(targetPosition);
      } else {
        mesh.position.lerp(targetPosition, blend);
      }
    }
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

    if (player.dead || this.gameOver || player.displacement) {
      this.setPlayerMoving(player, false);
      return;
    }

    // Mind controlled: the player is walked towards whoever controls it and cannot steer.
    if (performance.now() < (player.dominatedUntil || 0)) {
      const master = this.players.get(player.dominatorId)?.mesh.position;
      const toMaster = master ? new THREE.Vector3(master.x - player.mesh.position.x, 0, master.z - player.mesh.position.z) : null;
      if (toMaster && toMaster.length() > DOMINATED_STOP_DISTANCE) {
        this.stepLocal(player, toMaster.normalize(), delta, DOMINATED_SPEED_FACTOR);
      } else {
        this.setPlayerMoving(player, false);
      }
      return;
    }

    if (this.isStunned(player)) {
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
    this.stepLocal(player, moveDir.normalize(), delta);
  }

  // Moves the local player along `moveDir` (a unit vector), faces it that way and syncs the position.
  stepLocal(player, moveDir, delta, speedFactor = 1) {
    const distance = MOVE_SPEED * speedFactor * delta;
    const wantedX = THREE.MathUtils.clamp(player.mesh.position.x + moveDir.x * distance, -this.arenaLimit, this.arenaLimit);
    const wantedZ = THREE.MathUtils.clamp(player.mesh.position.z + moveDir.z * distance, -this.arenaLimit, this.arenaLimit);
    const { x: nextX, z: nextZ } = this.collide(wantedX, wantedZ);

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
    if (!me || me.dead || this.gameOver || this.isStunned(me) || me.displacement || now < me.sendLockUntil) return;

    let slot = request;
    if (request === 'attack') {
      const combo = me.nextAttack === 'attack2' && now - me.lastAttackAt < COMBO_WINDOW_SECONDS * 1000;
      slot = combo ? 'attack2' : 'attack1';
    }

    const custom = isSkillSlot(slot);
    const def = custom ? getSkillAction(skillIdOfSlot(slot)) : getActionDef(me.role, slot);
    if (!def || (me.cooldownEnds[slot] || 0) > now) return;

    const networked = Boolean(this.socketService && this.roomCode);
    const cost = custom ? def.manaCost : getManaCost(me.role, slot);
    if (networked && (me.data.mana ?? Infinity) < cost) return;

    me.sendLockUntil = now + SEND_LOCK_MS;
    const dir = this.getAimDirection(me);

    if (networked) {
      this.socketService.emit('useSkill', { roomCode: this.roomCode, slot, dir });
      return;
    }

    const event = { casterId: me.playerId, slot, dir, hits: [], heals: [], casterPosition: null };
    if (custom) {
      const { skillId, power, effect, name, shape, range, arc, width, healRadius } = def;
      event.skill = { skillId, power, effect, name, shape, range, arc, width, healRadius };
      if (def.heal) event.heals.push({ targetId: me.playerId, amount: def.heal, health: me.data.health });
      if (def.vanish) event.vanishMs = def.vanish * 1000;
    }
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
      const custom = event.skill || null;
      const def = custom ? getSkillAction(custom.skillId) : getActionDef(caster.role, event.slot);
      caster.model.rotation.y = Math.atan2(event.dir.x, event.dir.z);
      if (custom) {
        if (!caster.actor.play('skill1')) caster.actor.play('attack1'); // skills have no clip of their own
      } else {
        caster.actor.play(event.slot);
      }

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

      if (custom) {
        playPowerSound(SKILL_SOUND_EFFECT[custom.power], this.soundVolume(caster.mesh.position));
        this.effects.spawn(custom.effect, {
          position: caster.mesh.position,
          rotationY: caster.model.rotation.y,
          range: custom.range || custom.healRadius || 6,
          shape: custom.shape || 'circle',
          params: { arc: custom.arc, width: custom.width, radius: custom.healRadius }
        });
      }

      const effectId = custom ? null : this.getEffectId(caster, event.slot);
      if (!custom) playActionSound(caster.def, event.slot, effectId, this.soundVolume(caster.mesh.position));
      if (def && effectId) {
        this.effects.spawn(effectId, {
          position: caster.mesh.position,
          rotationY: caster.model.rotation.y,
          range: def.range,
          shape: def.shape,
          model: caster.model
        });
      }
      if (event.vanishMs) caster.vanishUntil = now + event.vanishMs;
      if (event.revealed) caster.vanishUntil = 0;
      if (event.casterPosition) this.displace(caster, event.casterPosition, DASH_SECONDS);
    }

    (event.heals || []).forEach((heal) => {
      const target = this.players.get(heal.targetId);
      if (!target) return;
      target.data = { ...target.data, health: heal.health };
      this.spawnFloater(target.mesh.position, `+${heal.amount}`, '#7dff9c');
    });
    event.hits.forEach((hit) => this.applyHit(hit));
    (event.towerHits || []).forEach((hit) => this.handleTowerHit(hit));
    (event.monsterHits || []).forEach((hit) => this.applyEntityHit('monster', hit));
    (event.unitHits || []).forEach((hit) => this.applyEntityHit('unit', hit));
    (event.spawned || []).forEach((unit) => this.addUnit(unit));
  }

  // Skills use the effect picked in the character generator; basic attacks get a light default one.
  getEffectId(caster, slot) {
    const chosen = caster.def.effects?.[slot];
    if (chosen) return chosen === 'none' ? null : chosen;
    if (slot === 'attack1' || slot === 'attack2') return attackEffectId(getAttackType(caster.def, slot), slot);
    return null;
  }

  applyHit(hit) {
    const target = this.players.get(hit.targetId);
    if (!target) return;

    target.data = { ...target.data, health: hit.health };
    if (hit.damage > 0) this.spawnFloater(target.mesh.position, `-${hit.damage}`, '#ff6b6b');

    if (!target.actor.play(hit.reaction)) target.actor.play('hit');
    playReactionSound(target.def, hit.reaction === 'stunned' ? 'hit' : hit.reaction, this.soundVolume(target.mesh.position));
    if (hit.stunMs) {
      target.stunUntil = Math.max(target.stunUntil, performance.now() + hit.stunMs);
      this.spawnFloater(target.mesh.position, hit.dominateMs ? 'MIND' : 'STUN', hit.dominateMs ? '#ff6bd6' : '#ffd34d');
      if (hit.dominateMs) {
        target.dominatedUntil = performance.now() + hit.dominateMs;
        target.dominatorId = hit.dominatorId;
      }
    } else if (hit.reaction !== 'hit') {
      this.displace(target, hit.position, KNOCKBACK_SECONDS, KNOCKBACK_STUN_MS);
    }
  }

  // Invisible players are see-through for their own team and hidden from the enemies.
  updateStealth(now) {
    const me = this.getCurrentPlayerEntry();
    for (const player of this.players.values()) {
      const invisible = (player.vanishUntil || 0) > now;
      const state = !invisible ? 'visible' : me && player.data.team === me.data.team ? 'ghost' : 'hidden';
      if (state === (player.stealthState || 'visible')) continue;
      player.stealthState = state;
      setModelOpacity(player.model, state === 'ghost' ? GHOST_OPACITY : 1);
      player.mesh.visible = state !== 'hidden' && !player.dead;
    }
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
      const free = this.collide(player.mesh.position.x, player.mesh.position.z);
      player.mesh.position.set(free.x, 0, free.z);
      if (u >= 1) {
        player.displacement = null;
        player.targetPosition.copy(player.mesh.position);
        if (player.isCurrentPlayer) this.emitPosition(player.mesh.position.x, player.mesh.position.z);
      }
    }
  }

  handlePlayerDied(playerId) {
    const player = this.players.get(playerId);
    if (!player) return;
    player.dead = true;
    player.vanishUntil = 0;
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
    player.dominatedUntil = 0;
    player.cooldownEnds = {};
    player.data = { ...player.data, ...data };
    player.actor.endOneShot();
    player.mesh.position.set(data.position.x, 0, data.position.z);
    player.targetPosition.copy(player.mesh.position);
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
    return { role: me.role, dead: me.dead, mana: this.socketService ? me.data.mana : null, cooldowns, shop: this.getShopState(me) };
  }

  // The shop opens near your own tower, and only during the first minutes of the match.
  getShopState(me) {
    const tower = [...this.towers.values()].find((entry) => entry.team === me.data.team);
    const nearBase =
      !!tower &&
      Math.hypot(me.mesh.position.x - tower.position.x, me.mesh.position.z - tower.position.z) <= tower.radius + SHOP_RANGE;
    const secondsLeft = Math.max(0, SHOP_OPEN_SECONDS - (Date.now() - this.startedAt) / 1000);
    return { nearBase, secondsLeft };
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
    this.updateRemotePlayers(delta);
    this.mapObjects.forEach((object) => object.update(delta));
    this.pathWalkers.forEach((walker) => walker.update(delta));
    const now = performance.now();
    for (const player of this.players.values()) {
      // Remote players stop sending updates when they stop, so no "idle" event ever arrives;
      // fall back to idle when no movement update was received recently.
      if (!player.isCurrentPlayer && player.isMoving && now - player.lastMoveTime > REMOTE_IDLE_TIMEOUT_MS) {
        this.setPlayerMoving(player, false);
      }
      player.actor.update(delta);
    }
    this.updateStealth(now);
    this.updateWorld(delta);
    this.effects.update(delta);
    this.updateFloaters(delta);

    this.updateCamera(delta);
    this.environment.update(delta, this.cameraFocus);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    audioService.stopLoop('run');
    this.environment.dispose();
    this.container.removeEventListener('mousedown', this.onMouseDown);
    this.container.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.effects.dispose();
    while (this.floaters.length) this.removeFloater(this.floaters.length - 1);
    this.players.forEach((player) => player.actor.dispose());
    this.clearWorld();
    this.clearMapObjects();
    this.clearTowers();
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
