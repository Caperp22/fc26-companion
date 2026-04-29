import { create } from 'zustand';

export const useSquadStore = create((set) => ({
  formation: '4-3-3',
  squad: {},
  pendingPlayer: null,

  setFormation: (formation) => set({ formation, squad: {} }),

  assignPlayer: (slotId, player) =>
    set((state) => ({ squad: { ...state.squad, [slotId]: player }, pendingPlayer: null })),

  removePlayer: (slotId) =>
    set((state) => {
      const { [slotId]: _, ...rest } = state.squad;
      return { squad: rest };
    }),

  setPendingPlayer: (player) => set({ pendingPlayer: player }),
  clearPendingPlayer: () => set({ pendingPlayer: null }),
}));
