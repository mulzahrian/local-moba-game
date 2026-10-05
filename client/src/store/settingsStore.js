import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useSettingsStore = create(
  persist(
    (set) => ({
      musicOn: true,
      language: 'en',
      playerName: '',
      characterId: '',
      setMusicOn: (musicOn) => set({ musicOn }),
      setLanguage: (language) => set({ language }),
      setPlayerName: (playerName) => set({ playerName }),
      setCharacterId: (characterId) => set({ characterId })
    }),
    { name: 'moba-settings' }
  )
);
