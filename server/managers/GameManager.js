class GameManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
  }

  createRoom(roomCode, hostId, hostName, map = null, environment = null) {
    console.log(`  [GameManager] Creating room with code: "${roomCode}"`);
    
    if (this.rooms.has(roomCode)) {
      console.log(`  [GameManager] ❌ Room code already exists!`);
      return null;
    }

    const room = {
      code: roomCode,
      hostId: hostId,
      players: [
        {
          id: hostId,
          name: hostName,
          position: { x: 0, y: 0, z: 0 },
          team: 'team1',
          health: 100,
          mana: 100,
          level: 1,
          experience: 0
        }
      ],
      map, // full map JSON chosen by the host (null = default arena)
      environment, // { sky, weather } chosen by the host
      gameState: 'waiting', // waiting, starting, in_progress, finished
      createdAt: new Date(),
      maxPlayers: 2
    };

    this.rooms.set(roomCode, room);
    console.log(`  [GameManager] ✅ Room stored with key: "${roomCode}"`);
    console.log(`  [GameManager] Rooms now in storage: ${Array.from(this.rooms.keys()).join(", ")}`);
    
    return room;
  }

  joinRoom(roomCode, playerId, playerName) {
    console.log(`  [GameManager] Looking up room with code: "${roomCode}"`);
    console.log(`  [GameManager] Rooms in storage: ${Array.from(this.rooms.keys()).join(", ") || "NONE"}`);
    
    const room = this.rooms.get(roomCode);
    
    console.log(`  [GameManager] Room found: ${room ? "YES" : "NO"}`);

    if (!room) {
      console.log(`  [GameManager] ❌ Room lookup failed for code: "${roomCode}"`);
      return null;
    }

    if (room.players.length >= room.maxPlayers) {
      console.log(`  [GameManager] ❌ Room is full: ${room.players.length}/${room.maxPlayers}`);
      return null;
    }

    // Determine team
    const team = room.players.some(p => p.team === 'team1') ? 'team2' : 'team1';

    const newPlayer = {
      id: playerId,
      name: playerName,
      position: { x: team === 'team1' ? -50 : 50, y: 0, z: -50 },
      team: team,
      health: 100,
      mana: 100,
      level: 1,
      experience: 0
    };

    room.players.push(newPlayer);
    console.log(`  [GameManager] ✅ Player added. Room now: ${room.players.length}/${room.maxPlayers}`);
    
    if (room.players.length === room.maxPlayers) {
      room.gameState = 'in_progress';
    }

    return room;
  }

  getRoom(roomCode) {
    return this.rooms.get(roomCode);
  }

  playerDisconnect(playerId) {
    for (const [roomCode, room] of this.rooms) {
      const playerIndex = room.players.findIndex(p => p.id === playerId);
      
      if (playerIndex !== -1) {
        const disconnectedPlayer = room.players[playerIndex];
        room.players.splice(playerIndex, 1);

        console.log(`Player ${disconnectedPlayer.name} disconnected from room ${roomCode} (${room.players.length} left)`);

        if (room.players.length > 0) {
          this.io.to(roomCode).emit('playerDisconnected', { 
            playerId,
            remainingPlayers: room.players 
          });
        } else {
          // Delete empty room after a grace period (allows brief reconnects)
          setTimeout(() => {
            const r = this.rooms.get(roomCode);
            if (r && r.players.length === 0) {
              this.rooms.delete(roomCode);
              console.log(`Room ${roomCode} deleted (empty for 60s)`);
            }
          }, 60000);
        }
        
        break;
      }
    }
  }

  getAllRooms() {
    return Array.from(this.rooms.values());
  }
}

export default GameManager;
