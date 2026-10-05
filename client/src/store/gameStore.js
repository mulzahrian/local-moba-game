import { create } from 'zustand';

export const useGameStore = create((set) => ({
  // Room State
  roomCode: null,
  players: [],
  currentPlayer: null,
  currentMap: null, // map JSON chosen for the room (null = default arena)
  gameState: 'menu', // menu, room_lobby, in_game, finished

  // Game State
  messages: [],
  selectedTarget: null,

  // Actions
  setRoomCode: (code) => set({ roomCode: code }),
  setPlayers: (players) => set({ players }),
  setCurrentPlayer: (player) => set({ currentPlayer: player }),
  setCurrentMap: (map) => set({ currentMap: map }),
  setGameState: (state) => set({ gameState: state }),
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message]
  })),
  clearMessages: () => set({ messages: [] }),
  setSelectedTarget: (targetId) => set({ selectedTarget: targetId }),

  // Reset
  reset: () => set({
    roomCode: null,
    players: [],
    currentPlayer: null,
    currentMap: null,
    gameState: 'menu',
    messages: [],
    selectedTarget: null
  })
}));
