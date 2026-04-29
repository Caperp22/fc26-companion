import { create } from 'zustand';

export const useBudgetStore = create((set) => ({
  budget: 50_000_000,
  transactions: [],

  setBudget: (amount) => set({ budget: amount }),

  addTransaction: ({ type, playerName, amount }) =>
    set((state) => ({
      transactions: [
        ...state.transactions,
        { id: Date.now(), type, playerName, amount, date: new Date().toISOString() },
      ],
    })),

  removeTransaction: (id) =>
    set((state) => ({
      transactions: state.transactions.filter((t) => t.id !== id),
    })),
}));
