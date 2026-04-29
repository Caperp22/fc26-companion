import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const useBudgetStore = create(
  persist(
    (set) => ({
      budget: 50_000_000,
      transactions: [],

      setBudget: (amount) => set({ budget: amount }),

      addTransaction: ({ type, playerName, amount, season }) =>
        set((state) => ({
          transactions: [
            ...state.transactions,
            {
              id: Date.now(),
              type,
              playerName,
              amount,
              season: season || '',
              date: new Date().toISOString(),
            },
          ],
        })),

      removeTransaction: (id) =>
        set((state) => ({
          transactions: state.transactions.filter((t) => t.id !== id),
        })),
    }),
    {
      name: 'budget-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
