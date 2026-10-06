import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { START_GOLD } from '../../../shared/economyConfig.js';

// The player's money, kept in this browser between matches (like the skills). Earned from monsters and wins,
// spent in the shop.
export const useWalletStore = create(
  persist(
    (set, get) => ({
      gold: START_GOLD,

      add: (amount) => {
        const value = Math.max(0, Math.round(Number(amount) || 0));
        if (value) set({ gold: get().gold + value });
      },

      // Takes the money when there is enough; returns whether the purchase went through.
      spend: (amount) => {
        const value = Math.max(0, Math.round(Number(amount) || 0));
        if (value > get().gold) return false;
        set({ gold: get().gold - value });
        return true;
      }
    }),
    { name: 'moba-wallet' }
  )
);
