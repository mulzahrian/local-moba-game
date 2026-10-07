import { io } from 'socket.io-client';
import { getServerUrl } from '../config/server.js';

const SOCKET_URL = getServerUrl();

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect() {
    if (this.socket) return;

    console.log('[Socket] Attempting to connect to:', SOCKET_URL);

    this.socket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected:', this.socket.id);
    });

    this.socket.on('disconnect', () => {
      console.log('[Socket] Disconnected');
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Socket] Connection Error:', error);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  emit(event, data) {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
      
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      this.listeners.get(event).push(callback);
    }
  }

  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback);
      
      if (this.listeners.has(event)) {
        const callbacks = this.listeners.get(event);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    }
  }

  // Room Management
  createRoom(playerName, mapId, environment, characterId, match, callback) {
    if (!this.socket) {
      console.error('Socket not connected');
      return;
    }
    this.socket.emit('createRoom', { playerName, mapId, environment, characterId, ...match }, (response) => {
      if (callback) callback(response);
    });
  }

  // Leaves the current room (the server removes the player and any computer players with the last human)
  leaveRoom() {
    this.emit('leaveRoom');
  }

  joinRoom(roomCode, playerName, characterId, callback) {
    if (!this.socket) {
      console.error('Socket not connected');
      return;
    }
    this.socket.emit('joinRoom', { roomCode, playerName, characterId }, (response) => {
      if (callback) callback(response);
    });
  }

  // Lobby: move to the other team / start the match (host only). The callback gets { success, code }.
  switchTeam(roomCode, team, callback) {
    this.socket?.emit('switchTeam', { roomCode, team }, (response) => callback?.(response));
  }

  startGame(roomCode, callback) {
    this.socket?.emit('startGame', { roomCode }, (response) => callback?.(response));
  }

  // Game Events
  playerMove(x, z) {
    // Note: roomCode is managed by store and passed separately when needed
    this.emit('playerMove', { x, z });
  }

  movePlayer(roomCode, position) {
    this.emit('playerMove', { roomCode, position });
  }

  attackPlayer(roomCode, targetId) {
    this.emit('playerAttack', { roomCode, targetId });
  }

  // Chat
  sendMessage(roomCode, message) {
    this.emit('sendMessage', { roomCode, message });
  }
}

export const socketService = new SocketService();
