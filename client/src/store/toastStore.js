import { create } from 'zustand';

let nextId = 1;
const LIFETIME_MS = 4500;

// Short messages shown over the game (rewards, ...). Each one removes itself after a few seconds.
export const useToastStore = create((set) => ({
  toasts: [],
  push: (text) => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts, { id, text }].slice(-4) }));
    setTimeout(() => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })), LIFETIME_MS);
  }
}));
