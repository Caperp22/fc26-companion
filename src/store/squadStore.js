import { create } from 'zustand';

export const useSquadStore = create((set) => ({
  formation: '4-3-3',
  squad: {},
  bench: {},
  reserves: {},
  pendingPlayer: null,

  // Equipo/alineación actualmente cargada
  loadedTeamId: null,
  loadedLineupId: null,
  loadedTeamName: '',
  loadedLineupName: '',

  setFormation: (formation) => set({ formation, squad: {} }),

  assignPlayer: (slotId, player) =>
    set((s) => ({ squad: { ...s.squad, [slotId]: player }, pendingPlayer: null })),
  removePlayer: (slotId) =>
    set((s) => { const { [slotId]: _, ...rest } = s.squad; return { squad: rest }; }),

  assignToBench: (slotId, player) =>
    set((s) => ({ bench: { ...s.bench, [slotId]: player }, pendingPlayer: null })),
  removeFromBench: (slotId) =>
    set((s) => { const { [slotId]: _, ...rest } = s.bench; return { bench: rest }; }),

  assignToReserves: (slotId, player) =>
    set((s) => ({ reserves: { ...s.reserves, [slotId]: player }, pendingPlayer: null })),
  removeFromReserves: (slotId) =>
    set((s) => { const { [slotId]: _, ...rest } = s.reserves; return { reserves: rest }; }),

  setPendingPlayer: (player) => set({ pendingPlayer: player }),
  clearPendingPlayer: () => set({ pendingPlayer: null }),

  // Carga una alineación guardada desde la BD en el store
  loadLineup: ({ teamId, teamName, lineupId, lineupName, formation, squad, bench, reserves }) =>
    set({
      formation,
      squad: typeof squad === 'string' ? JSON.parse(squad) : squad,
      bench: typeof bench === 'string' ? JSON.parse(bench) : bench,
      reserves: typeof reserves === 'string' ? JSON.parse(reserves) : reserves,
      pendingPlayer: null,
      loadedTeamId: teamId,
      loadedLineupId: lineupId,
      loadedTeamName: teamName,
      loadedLineupName: lineupName,
    }),

  // Limpia el contexto de equipo/alineación cargada (nueva pizarra)
  newLineup: () =>
    set({
      formation: '4-3-3',
      squad: {},
      bench: {},
      reserves: {},
      pendingPlayer: null,
      loadedTeamId: null,
      loadedLineupId: null,
      loadedTeamName: '',
      loadedLineupName: '',
    }),

  // Actualiza los IDs después de guardar por primera vez
  setLoadedIds: (teamId, teamName, lineupId, lineupName) =>
    set({ loadedTeamId: teamId, loadedTeamName: teamName, loadedLineupId: lineupId, loadedLineupName: lineupName }),
}));
