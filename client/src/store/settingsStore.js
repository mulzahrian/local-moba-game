import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useSettingsStore = create(
  persist(
    (set) => ({
      musicOn: true,
      language: 'en',
      playerName: '',
      setMusicOn: (musicOn) => set({ musicOn }),
      setLanguage: (language) => set({ language }),
      setPlayerName: (playerName) => set({ playerName })
    }),
    { name: 'moba-settings' }
  )
);
