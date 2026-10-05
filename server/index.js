import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { generateRoomCode } from '../shared/utils.js';
import GameManager from './managers/GameManager.js';
import mapStore from './managers/MapStore.js';

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

      const room = gameManager.createRoom(roomCode, socket.id, data.playerName, map);
        
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

  socket.on('joinRoom', (data, ack) => {
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
      const room = gameManager.joinRoom(normalizedRoomCode, socket.id, playerName);
      console.log(`[JoinRoom] gameManager.joinRoom returned:`, room ? 'ROOM OBJECT' : 'NULL');

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
          
        // If room is now full, start the game
        if (room.players.length === room.maxPlayers) {
          console.log(`[JoinRoom] 🎮 Game starting in room ${normalizedRoomCode}!`);
          io.to(normalizedRoomCode).emit('gameStarted', {
            roomCode: normalizedRoomCode,
            players: room.players
          });
        }
        
        console.log(`[JoinRoom] Sending callback with success=true`);
        if (typeof ack === 'function') {
          ack({ success: true, room });
          console.log(`[JoinRoom] ✅ Callback executed`);
        } else {
          console.log(`[JoinRoom] ⚠️ ack is not a function!`);
        }
        console.log(`[JoinRoom] ========== JOIN COMPLETE ==========\n`);
      } else {
        console.log(`[JoinRoom] ❌ FAILED - gameManager.joinRoom returned null!`);
        console.log(`[JoinRoom] Looked for room code: "${normalizedRoomCode}"`);
        console.log(`[JoinRoom] Available room codes: ${Array.from(gameManager.rooms.keys()).join(", ") || "NONE"}`);
        
        console.log(`[JoinRoom] Sending callback with success=false`);
        if (typeof ack === 'function') {
          ack({ success: false, message: 'Room not found or full' });
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

  // Game Events
  socket.on('playerMove', (data) => {
    const { roomCode, position } = data;
    const room = gameManager.getRoom(roomCode);
    
    if (room) {
      const player = room.players.find(p => p.id === socket.id);
      if (player) {
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

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`\n🎮 MOBA Game Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}\n`);
});
