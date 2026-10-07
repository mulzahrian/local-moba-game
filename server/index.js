import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { generateRoomCode } from '../shared/utils.js';
import GameManager from './managers/GameManager.js';
import mapStore, { MapValidationError, sanitizeEnvironment } from './managers/MapStore.js';
import characterStore, {
  MAX_IMAGE_BYTES,
  MAX_MODEL_BYTES,
  imageContentType,
  imageTypeOf,
  isGlb
} from './managers/CharacterStore.js';
import objectStore from './managers/ObjectStore.js';
import { installDefaultObjects } from './managers/DefaultObjects.js';
import skillStore from './managers/SkillStore.js';
import monsterStore from './managers/MonsterStore.js';
import { isMonsterObject, monsterIdOfType } from '../shared/monsterConfig.js';
import { setLoadout } from './managers/loadouts.js';
import { sanitizeTeamSize } from '../shared/matchConfig.js';
import { BUILTIN_CHARACTER_ID, BUILTIN_CHARACTER_NAME, DEFAULT_ROLE } from '../shared/characterConfig.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*', // Allow all origins for development
    methods: ['GET', 'POST'],
    allowEIO3: true
  }
});

// Middleware
app.use(cors({
  origin: '*' // Allow all origins
}));
app.use(express.json({ limit: '5mb' }));

// Game Manager Instance
const gameManager = new GameManager(io);

// API Routes
app.get('/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

// Map API (maps are stored as JSON files in server/data/maps)
const handleMapError = (res, error) => {
  if (error instanceof MapValidationError) {
    return res.status(400).json({ success: false, message: error.message });
  }
  console.error('[MapAPI] Error:', error);
  res.status(500).json({ success: false, message: 'Server error' });
};

app.get('/api/maps', async (req, res) => {
  try {
    res.json({ success: true, maps: await mapStore.list() });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.get('/api/maps/:id', async (req, res) => {
  try {
    const map = await mapStore.get(req.params.id);
    if (!map) return res.status(404).json({ success: false, message: 'Map not found' });
    res.json({ success: true, map });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.post('/api/maps', async (req, res) => {
  try {
    res.status(201).json({ success: true, map: await mapStore.create(req.body) });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.put('/api/maps/:id', async (req, res) => {
  try {
    const map = await mapStore.update(req.params.id, req.body);
    if (!map) return res.status(404).json({ success: false, message: 'Map not found' });
    res.json({ success: true, map });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.delete('/api/maps/:id', async (req, res) => {
  try {
    const removed = await mapStore.remove(req.params.id);
    if (!removed) return res.status(404).json({ success: false, message: 'Map not found' });
    res.json({ success: true });
  } catch (error) {
    handleMapError(res, error);
  }
});

// Character API (each character lives in server/data/characters/<id>: JSON + GLB model + profile image)
const withVersion = (character) => ({ ...character, version: character.updatedAt });

app.get('/api/characters', async (req, res) => {
  try {
    res.json({ success: true, characters: (await characterStore.list()).map(withVersion) });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.get('/api/characters/:id', async (req, res) => {
  try {
    const character = await characterStore.get(req.params.id);
    if (!character) return res.status(404).json({ success: false, message: 'Character not found' });
    res.json({ success: true, character: withVersion(character) });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.post('/api/characters', async (req, res) => {
  try {
    res.status(201).json({ success: true, character: withVersion(await characterStore.create(req.body)) });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.put('/api/characters/:id', async (req, res) => {
  try {
    const character = await characterStore.update(req.params.id, req.body);
    if (!character) return res.status(404).json({ success: false, message: 'Character not found' });
    res.json({ success: true, character: withVersion(character) });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.put('/api/characters/:id/model', express.raw({ type: () => true, limit: MAX_MODEL_BYTES }), async (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body) || !isGlb(req.body)) {
      return res.status(400).json({ success: false, message: 'File must be a .glb model' });
    }
    const character = await characterStore.saveModel(req.params.id, req.body);
    if (!character) return res.status(404).json({ success: false, message: 'Character not found' });
    res.json({ success: true, character: withVersion(character) });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.put('/api/characters/:id/image', express.raw({ type: () => true, limit: MAX_IMAGE_BYTES }), async (req, res) => {
  try {
    const ext = Buffer.isBuffer(req.body) ? imageTypeOf(req.body) : null;
    if (!ext) return res.status(400).json({ success: false, message: 'File must be a PNG, JPG, WEBP or GIF image' });
    const character = await characterStore.saveImage(req.params.id, req.body, ext);
    if (!character) return res.status(404).json({ success: false, message: 'Character not found' });
    res.json({ success: true, character: withVersion(character) });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.get('/api/characters/:id/model', async (req, res) => {
  try {
    const character = await characterStore.get(req.params.id);
    if (!character?.hasModel) return res.status(404).json({ success: false, message: 'Model not found' });
    res.type('model/gltf-binary').sendFile(characterStore.modelPath(character.id));
  } catch (error) {
    handleMapError(res, error);
  }
});

app.get('/api/characters/:id/image', async (req, res) => {
  try {
    const character = await characterStore.get(req.params.id);
    const file = characterStore.imagePath(character);
    if (!file) return res.status(404).json({ success: false, message: 'Image not found' });
    res.type(imageContentType(character.imageExt)).sendFile(file);
  } catch (error) {
    handleMapError(res, error);
  }
});

app.delete('/api/characters/:id', async (req, res) => {
  try {
    const removed = await characterStore.remove(req.params.id);
    if (!removed) return res.status(404).json({ success: false, message: 'Character not found' });
    res.json({ success: true });
  } catch (error) {
    handleMapError(res, error);
  }
});

// Object library API: main objects (name + logo) holding uploaded GLB sub objects for the map editor
const withGroupVersion = (group) => ({ ...group, version: group.updatedAt });
const notFound = (res, what) => res.status(404).json({ success: false, message: `${what} not found` });

app.get('/api/object-groups', async (req, res) => {
  try {
    res.json({ success: true, groups: (await objectStore.list()).map(withGroupVersion) });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.post('/api/object-groups', async (req, res) => {
  try {
    res.status(201).json({ success: true, group: withGroupVersion(await objectStore.create(req.body)) });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.put('/api/object-groups/:id', async (req, res) => {
  try {
    const group = await objectStore.update(req.params.id, req.body);
    if (!group) return notFound(res, 'Object');
    res.json({ success: true, group: withGroupVersion(group) });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.delete('/api/object-groups/:id', async (req, res) => {
  try {
    if (!(await objectStore.remove(req.params.id))) return notFound(res, 'Object');
    res.json({ success: true });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.put('/api/object-groups/:id/logo', express.raw({ type: () => true, limit: MAX_IMAGE_BYTES }), async (req, res) => {
  try {
    const ext = Buffer.isBuffer(req.body) ? imageTypeOf(req.body) : null;
    if (!ext) return res.status(400).json({ success: false, message: 'File must be a PNG, JPG, WEBP or GIF image' });
    const group = await objectStore.saveLogo(req.params.id, req.body, ext);
    if (!group) return notFound(res, 'Object');
    res.json({ success: true, group: withGroupVersion(group) });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.get('/api/object-groups/:id/logo', async (req, res) => {
  try {
    const group = await objectStore.get(req.params.id);
    const file = objectStore.logoPath(group);
    if (!file) return notFound(res, 'Logo');
    res.type(imageContentType(group.logoExt)).sendFile(file);
  } catch (error) {
    handleMapError(res, error);
  }
});

app.post('/api/object-groups/:id/objects', async (req, res) => {
  try {
    const result = await objectStore.addObject(req.params.id, req.body);
    if (!result) return notFound(res, 'Object');
    res.status(201).json({ success: true, group: withGroupVersion(result.group), objectId: result.object.id });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.put('/api/object-groups/:id/objects/:objectId', async (req, res) => {
  try {
    const result = await objectStore.updateObject(req.params.id, req.params.objectId, req.body);
    if (!result) return notFound(res, 'Object');
    res.json({ success: true, group: withGroupVersion(result.group) });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.delete('/api/object-groups/:id/objects/:objectId', async (req, res) => {
  try {
    const group = await objectStore.removeObject(req.params.id, req.params.objectId);
    if (!group) return notFound(res, 'Object');
    res.json({ success: true, group: withGroupVersion(group) });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.put(
  '/api/object-groups/:id/objects/:objectId/model',
  express.raw({ type: () => true, limit: MAX_MODEL_BYTES }),
  async (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body) || !isGlb(req.body)) {
        return res.status(400).json({ success: false, message: 'File must be a .glb model' });
      }
      const group = await objectStore.saveObjectModel(req.params.id, req.params.objectId, req.body);
      if (!group) return notFound(res, 'Object');
      res.json({ success: true, group: withGroupVersion(group) });
    } catch (error) {
      handleMapError(res, error);
    }
  }
);

app.get('/api/object-groups/:id/objects/:objectId/model', async (req, res) => {
  try {
    const group = await objectStore.get(req.params.id);
    const object = group?.objects.find((o) => o.id === req.params.objectId);
    if (!object?.hasModel) return notFound(res, 'Model');
    res.type('model/gltf-binary').sendFile(objectStore.modelPath(group.id, object.id));
  } catch (error) {
    handleMapError(res, error);
  }
});

// Skill library API: skills made in the Skill Generator (power, effect, cost, price and an optional icon)
const withSkillVersion = (skill) => ({ ...skill, version: skill.updatedAt });

app.get('/api/skills', async (req, res) => {
  try {
    res.json({ success: true, skills: (await skillStore.list()).map(withSkillVersion) });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.post('/api/skills', async (req, res) => {
  try {
    res.status(201).json({ success: true, skill: withSkillVersion(await skillStore.create(req.body)) });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.put('/api/skills/:id', async (req, res) => {
  try {
    const skill = await skillStore.update(req.params.id, req.body);
    if (!skill) return notFound(res, 'Skill');
    res.json({ success: true, skill: withSkillVersion(skill) });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.delete('/api/skills/:id', async (req, res) => {
  try {
    if (!(await skillStore.remove(req.params.id))) return notFound(res, 'Skill');
    res.json({ success: true });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.put('/api/skills/:id/icon', express.raw({ type: () => true, limit: MAX_IMAGE_BYTES }), async (req, res) => {
  try {
    const ext = Buffer.isBuffer(req.body) ? imageTypeOf(req.body) : null;
    if (!ext) return res.status(400).json({ success: false, message: 'File must be a PNG, JPG, WEBP or GIF image' });
    const skill = await skillStore.saveIcon(req.params.id, req.body, ext);
    if (!skill) return notFound(res, 'Skill');
    res.json({ success: true, skill: withSkillVersion(skill) });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.get('/api/skills/:id/icon', async (req, res) => {
  try {
    const skill = await skillStore.get(req.params.id);
    const file = skillStore.iconPath(skill);
    if (!file) return notFound(res, 'Icon');
    res.type(imageContentType(skill.iconExt)).sendFile(file);
  } catch (error) {
    handleMapError(res, error);
  }
});

// GLB model of a unit summoned by a necromancer / summoner / support skill
app.put('/api/skills/:id/units/:unitId/model', express.raw({ type: () => true, limit: MAX_MODEL_BYTES }), async (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body) || !isGlb(req.body)) {
      return res.status(400).json({ success: false, message: 'File must be a .glb model' });
    }
    const skill = await skillStore.saveUnitModel(req.params.id, req.params.unitId, req.body);
    if (!skill) return notFound(res, 'Unit');
    res.json({ success: true, skill: withSkillVersion(skill) });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.get('/api/skills/:id/units/:unitId/model', async (req, res) => {
  try {
    const skill = await skillStore.get(req.params.id);
    const unit = skill?.units?.find((candidate) => candidate.id === req.params.unitId);
    if (!unit?.hasModel) return notFound(res, 'Model');
    res.type('model/gltf-binary').sendFile(skillStore.unitModelPath(skill.id, unit.id));
  } catch (error) {
    handleMapError(res, error);
  }
});

// Monster library API: monsters made in the Monster Generator (GLB model, animations, stats and the skill they reward)
const withMonsterVersion = (monster) => ({ ...monster, version: monster.updatedAt });

app.get('/api/monsters', async (req, res) => {
  try {
    res.json({ success: true, monsters: (await monsterStore.list()).map(withMonsterVersion) });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.get('/api/monsters/:id', async (req, res) => {
  try {
    const monster = await monsterStore.get(req.params.id);
    if (!monster) return notFound(res, 'Monster');
    res.json({ success: true, monster: withMonsterVersion(monster) });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.post('/api/monsters', async (req, res) => {
  try {
    res.status(201).json({ success: true, monster: withMonsterVersion(await monsterStore.create(req.body)) });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.put('/api/monsters/:id', async (req, res) => {
  try {
    const monster = await monsterStore.update(req.params.id, req.body);
    if (!monster) return notFound(res, 'Monster');
    res.json({ success: true, monster: withMonsterVersion(monster) });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.delete('/api/monsters/:id', async (req, res) => {
  try {
    if (!(await monsterStore.remove(req.params.id))) return notFound(res, 'Monster');
    res.json({ success: true });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.put('/api/monsters/:id/model', express.raw({ type: () => true, limit: MAX_MODEL_BYTES }), async (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body) || !isGlb(req.body)) {
      return res.status(400).json({ success: false, message: 'File must be a .glb model' });
    }
    const monster = await monsterStore.saveModel(req.params.id, req.body);
    if (!monster) return notFound(res, 'Monster');
    res.json({ success: true, monster: withMonsterVersion(monster) });
  } catch (error) {
    handleMapError(res, error);
  }
});

app.get('/api/monsters/:id/model', async (req, res) => {
  try {
    const monster = await monsterStore.get(req.params.id);
    if (!monster?.hasModel) return notFound(res, 'Model');
    res.type('model/gltf-binary').sendFile(monsterStore.modelPath(monster.id));
  } catch (error) {
    handleMapError(res, error);
  }
});

// The monsters a map places (by id) as { id -> definition }, so the room can spawn them.
async function loadMapMonsters(map) {
  const ids = (map?.objects || []).filter(isMonsterObject).map((object) => monsterIdOfType(object.type)).filter(Boolean);
  return monsterStore.getMany(ids);
}
const BUILTIN_CHARACTER = { id: BUILTIN_CHARACTER_ID, name: BUILTIN_CHARACTER_NAME, role: DEFAULT_ROLE };

// Resolves the character a player picked into the data the room needs (null when it does not exist).
async function resolveCharacter(characterId) {
  if (characterId === BUILTIN_CHARACTER_ID) return BUILTIN_CHARACTER;
  const character = await characterStore.get(characterId);
  return character?.hasModel ? { id: character.id, name: character.name, role: character.role } : null;
}

// Characters the computer players can pick: the built-in one plus every character that has a model.
async function listBotCharacters() {
  const characters = (await characterStore.list()).filter((character) => character.hasModel);
  return [BUILTIN_CHARACTER, ...characters.map(({ id, name, role }) => ({ id, name, role }))];
}

// Socket.IO Events
io.on('connection', (socket) => {
  console.log(`[${new Date().toLocaleTimeString()}] Player connected: ${socket.id}`);

  // Room Management
  socket.on('createRoom', async (data, ack) => {
    try {
      const roomCode = generateRoomCode();
      console.log(`\n[CreateRoom] ========== CREATE ROOM REQUEST ==========`);
      console.log(`[CreateRoom] Socket ID: ${socket.id}`);
      console.log(`[CreateRoom] Player Name: ${data.playerName}`);
      console.log(`[CreateRoom] Generated Room Code: "${roomCode}"`);
      console.log(`[CreateRoom] Callback function present: ${typeof ack === 'function'}`);
        
      let map = null;
      if (data.mapId) {
        map = await mapStore.get(data.mapId);
        if (!map) {
          if (typeof ack === 'function') {
            ack({ success: false, message: 'Map not found' });
          }
          return;
        }
      }

      const character = await resolveCharacter(data.characterId);
      if (!character) {
        if (typeof ack === 'function') {
          ack({ success: false, message: 'Character not found' });
        }
        return;
      }

      const singlePlayer = Boolean(data.singlePlayer);
      const room = gameManager.createRoom(roomCode, socket.id, data.playerName, map, sanitizeEnvironment(data.environment, map || {}), character, {
        teamSize: sanitizeTeamSize(data.teamSize),
        singlePlayer,
        botCharacters: singlePlayer ? await listBotCharacters() : [],
        monsterDefs: await loadMapMonsters(map)
      });
        
      if (room) {
        socket.join(roomCode);
        console.log(`[CreateRoom] ✅ Room created successfully!`);
        console.log(`[CreateRoom] Room code stored: "${roomCode}"`);
        console.log(`[CreateRoom] Total rooms now: ${gameManager.rooms.size}`);
        console.log(`[CreateRoom] Room codes in storage: ${Array.from(gameManager.rooms.keys()).join(", ")}`);
        
        console.log(`[CreateRoom] Sending callback with success=true`);
        if (typeof ack === 'function') {
          ack({ success: true, roomCode, room });
          console.log(`[CreateRoom] ✅ Callback executed`);
        } else {
          console.log(`[CreateRoom] ⚠️ ack is not a function!`);
        }
        console.log(`[CreateRoom] ========== CREATE COMPLETE ==========\n`);
      } else {
        console.log(`[CreateRoom] ❌ Failed to create room!`);
        
        console.log(`[CreateRoom] Sending callback with success=false`);
        if (typeof ack === 'function') {
          ack({ success: false, message: 'Failed to create room' });
          console.log(`[CreateRoom] ✅ Callback executed with error`);
        } else {
          console.log(`[CreateRoom] ⚠️ ack is not a function!`);
        }
        console.log(`[CreateRoom] ========== CREATE FAILED ==========\n`);
      }
    } catch (error) {
      console.error(`[CreateRoom] ❌ EXCEPTION:`, error.message);
      console.error(error.stack);
      if (typeof ack === 'function') {
        ack({ success: false, message: 'Server error: ' + error.message });
      }
    }
  });

  socket.on('joinRoom', async (data, ack) => {
    try {
      console.log(`\n[JoinRoom] ========== JOIN ROOM REQUEST ==========`);
      console.log(`[JoinRoom] Data received:`, JSON.stringify(data));
      console.log(`[JoinRoom] Callback function present: ${typeof ack === 'function'}`);
      
      const { roomCode, playerName } = data;
      
      if (!roomCode || !playerName) {
        console.log(`[JoinRoom] ❌ Missing data! roomCode="${roomCode}", playerName="${playerName}"`);
        if (typeof ack === 'function') {
          ack({ success: false, message: 'Missing room code or player name' });
        }
        return;
      }
        
      // Normalize room code to uppercase for consistency
      const normalizedRoomCode = roomCode.toUpperCase();
        
      console.log(`[JoinRoom] Socket ID: ${socket.id}`);
      console.log(`[JoinRoom] Player Name: ${playerName}`);
      console.log(`[JoinRoom] Room Code Received: "${roomCode}"`);
      console.log(`[JoinRoom] Room Code Normalized: "${normalizedRoomCode}"`);
      console.log(`[JoinRoom] Total rooms available: ${gameManager.rooms.size}`);
      console.log(`[JoinRoom] Room codes in storage: ${Array.from(gameManager.rooms.keys()).join(", ") || "NONE"}`);
        
      console.log(`[JoinRoom] Calling gameManager.joinRoom...`);
      const character = await resolveCharacter(data.characterId);
      if (!character) {
        if (typeof ack === 'function') {
          ack({ success: false, message: 'Character not found' });
        }
        return;
      }

      const { room, error: joinError } = gameManager.joinRoom(normalizedRoomCode, socket.id, playerName, character);
      console.log(`[JoinRoom] gameManager.joinRoom returned:`, room ? 'ROOM OBJECT' : joinError);

      if (room) {
        console.log(`[JoinRoom] ✅ SUCCESS - Room found!`);
        
        console.log(`[JoinRoom] Joining socket to room namespace...`);
        socket.join(normalizedRoomCode);
        console.log(`[JoinRoom] Socket joined successfully`);
          
        console.log(`[JoinRoom] Room now has ${room.players.length}/${room.maxPlayers} players`);
        console.log(`[JoinRoom] Player list: ${room.players.map(p => p.name).join(", ")}`);
          
        // Notify all players in room
        console.log(`[JoinRoom] Emitting playerJoined event...`);
        io.to(normalizedRoomCode).emit('playerJoined', {
          playerId: socket.id,
          playerName: playerName,
          players: room.players
        });
        console.log(`[JoinRoom] playerJoined event emitted`);
        
        console.log(`[JoinRoom] Sending callback with success=true`);
        if (typeof ack === 'function') {
          ack({ success: true, room });
          console.log(`[JoinRoom] ✅ Callback executed`);
        } else {
          console.log(`[JoinRoom] ⚠️ ack is not a function!`);
        }
        console.log(`[JoinRoom] ========== JOIN COMPLETE ==========\n`);
      } else {
        console.log(`[JoinRoom] ❌ FAILED - ${joinError}`);
        console.log(`[JoinRoom] Looked for room code: "${normalizedRoomCode}"`);
        console.log(`[JoinRoom] Available room codes: ${Array.from(gameManager.rooms.keys()).join(", ") || "NONE"}`);
        
        console.log(`[JoinRoom] Sending callback with success=false`);
        if (typeof ack === 'function') {
          ack({
            success: false,
            code: joinError,
            message: joinError === 'characterTaken' ? 'A teammate already uses this character' : 'Room not found or full'
          });
          console.log(`[JoinRoom] ✅ Callback executed with error`);
        } else {
          console.log(`[JoinRoom] ⚠️ ack is not a function!`);
        }
        console.log(`[JoinRoom] ========== JOIN FAILED ==========\n`);
      }
    } catch (error) {
      console.error(`[JoinRoom] ❌ EXCEPTION CAUGHT:`, error.message);
      console.error(error.stack);
      if (typeof ack === 'function') {
        ack({ success: false, message: 'Server error: ' + error.message });
      }
      console.log(`[JoinRoom] ========== ERROR ==========\n`);
    }
  });

  // Lobby: a waiting player moves to the other team (blocked when it is full or already has their character)
  socket.on('switchTeam', (data, ack) => {
    const room = gameManager.getRoom(data?.roomCode);
    if (!room) return typeof ack === 'function' && ack({ success: false, code: 'invalid' });
    const { error } = gameManager.switchTeam(room, socket.id, data.team);
    if (error) return typeof ack === 'function' && ack({ success: false, code: error });
    io.to(room.code).emit('lobbyUpdated', { players: room.players, hostId: room.hostId });
    if (typeof ack === 'function') ack({ success: true });
  });

  // Lobby: the host starts the match once both teams are full
  socket.on('startGame', (data, ack) => {
    const room = gameManager.getRoom(data?.roomCode);
    if (!room) return typeof ack === 'function' && ack({ success: false, code: 'invalid' });
    const { error } = gameManager.startGame(room, socket.id);
    if (error) return typeof ack === 'function' && ack({ success: false, code: error });
    console.log(`[StartGame] 🎮 Game starting in room ${room.code}!`);
    io.to(room.code).emit('gameStarted', {
      roomCode: room.code,
      players: room.players,
      map: room.map,
      environment: room.environment
    });
    if (typeof ack === 'function') ack({ success: true });
  });

  // Game Events
  socket.on('playerMove', (data) => {
    const { roomCode, position } = data;
    const room = gameManager.getRoom(roomCode);
    
    if (room) {
      const player = room.players.find(p => p.id === socket.id);
      if (player && !player.dead && room.gameState !== 'finished') {
        player.position = position;
        io.to(roomCode).emit('playerMoved', {
          playerId: socket.id,
          position: position
        });
      }
    }
  });

  socket.on('playerAttack', (data) => {
    const { roomCode, targetId } = data;
    const room = gameManager.getRoom(roomCode);

    if (room) {
      io.to(roomCode).emit('playerAttacked', {
        attackerId: socket.id,
        targetId: targetId
      });
    }
  });

  // Attacks, skills and emotes (attack1/2, skill1-3, emote): validated and resolved on the server.
  socket.on('useSkill', (data) => {
    const room = gameManager.getRoom(data?.roomCode);
    const caster = room?.players.find((p) => p.id === socket.id);
    if (!room || !caster) return;

    gameManager.performAction(room, caster, data.slot, data.dir);
  });

  // The skills the player equipped (ids from the skill library); they can be used with the skill keys.
  socket.on('setLoadout', async (data) => {
    try {
      const room = gameManager.getRoom(data?.roomCode);
      const player = room?.players.find((p) => p.id === socket.id);
      if (!player) return;
      const loadout = await setLoadout(player, data.skillIds);
      socket.emit('loadoutUpdated', { skillIds: loadout });
    } catch (error) {
      console.error('[Loadout] Error:', error);
    }
  });

  socket.on('leaveRoom', () => {
    for (const roomCode of socket.rooms) {
      if (roomCode !== socket.id) socket.leave(roomCode);
    }
    gameManager.playerDisconnect(socket.id);
  });

  // Chat Events
  socket.on('sendMessage', (data) => {
    const { roomCode, message } = data;
    const room = gameManager.getRoom(roomCode);

    if (room) {
      const player = room.players.find(p => p.id === socket.id);
      io.to(roomCode).emit('messageReceived', {
        playerId: socket.id,
        playerName: player?.name || 'Unknown',
        message: message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    gameManager.playerDisconnect(socket.id);
    console.log(`[${new Date().toLocaleTimeString()}] Player disconnected: ${socket.id}`);
  });
});

await installDefaultObjects(mapStore).catch((error) => {
  console.error('[Objects] Could not install the default objects:', error);
});
await skillStore.seedDefaults().catch((error) => {
  console.error('[Skills] Could not install the default skills:', error);
});
await skillStore.seedSummonDefaults().catch((error) => {
  console.error('[Skills] Could not install the default summon skills:', error);
});
await monsterStore.seedDefaults().catch((error) => {
  console.error('[Monsters] Could not install the default monsters:', error);
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`\n🎮 MOBA Game Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}\n`);
});
