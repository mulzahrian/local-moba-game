import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MAX_EQUIPPED_SKILLS } from '../../../shared/skillConfig.js';

const emptySlots = () => Array(MAX_EQUIPPED_SKILLS).fill(null);

// The player's skills, kept in this browser between matches: the ones owned and the ones equipped on keys 1-4.
export const useSkillStore = create(
  persist(
    (set, get) => ({
      owned: [],
      equipped: emptySlots(),

      // Adds a skill to the inventory and equips it on the first free key.
      addSkill: (id) => {
        const { owned, equipped } = get();
        if (owned.includes(id)) return;
        const free = equipped.indexOf(null);
        set({
          owned: [...owned, id],
          equipped: free === -1 ? equipped : equipped.map((slot, index) => (index === free ? id : slot))
        });
      },

      // Puts a skill on a key (the first free one when `index` is omitted); a skill sits on one key only.
      equip: (id, index) => {
        const { owned, equipped } = get();
        if (!owned.includes(id)) return;
        const target = index ?? equipped.indexOf(null);
        if (target < 0 || target >= MAX_EQUIPPED_SKILLS) return;
        set({ equipped: equipped.map((slot, i) => (i === target ? id : slot === id ? null : slot)) });
      },

      unequip: (id) => set({ equipped: get().equipped.map((slot) => (slot === id ? null : slot)) }),

      // Forgets skills that were deleted from the library.
      prune: (existingIds) => {
        const keep = new Set(existingIds);
        const { owned, equipped } = get();
        if (owned.every((id) => keep.has(id))) return;
        set({
          owned: owned.filter((id) => keep.has(id)),
          equipped: equipped.map((id) => (id && keep.has(id) ? id : null))
        });
      }
    }),
    {
      name: 'moba-skills',
      merge: (persisted, current) => {
        const merged = { ...current, ...persisted };
        merged.equipped = Array.from({ length: MAX_EQUIPPED_SKILLS }, (_, i) => merged.equipped?.[i] ?? null);
        return merged;
      }
    }
  )
);
