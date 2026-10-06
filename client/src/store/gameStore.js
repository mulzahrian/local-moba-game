import { create } from 'zustand';

export const useGameStore = create((set) => ({
  // Room State
  roomCode: null,
  players: [],
  teamSize: 1, // N vs N of the current room
  currentPlayer: null,
  currentEnvironment: null, // { sky, weather } for the room (null = default)
  currentMap: null, // map JSON chosen for the room (null = default arena)
  gameState: 'menu', // menu, room_lobby, in_game, finished

  // Game State
  messages: [],
  selectedTarget: null,

  // Actions
  setRoomCode: (code) => set({ roomCode: code }),
  setPlayers: (players) => set({ players }),
  setTeamSize: (teamSize) => set({ teamSize }),
  setCurrentPlayer: (player) => set({ currentPlayer: player }),
  setCurrentMap: (map) => set({ currentMap: map }),
  setCurrentEnvironment: (environment) => set({ currentEnvironment: environment }),
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
    teamSize: 1,
    currentPlayer: null,
    currentMap: null,
    currentEnvironment: null,
    gameState: 'menu',
    messages: [],
    selectedTarget: null
  })
}));
