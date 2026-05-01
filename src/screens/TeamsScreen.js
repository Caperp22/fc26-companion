import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  createTeam,
  deleteLineup,
  deleteTeam,
  getLineupsByTeam,
  getRoster,
  getTeams,
} from '../db/database';
import { useSquadStore } from '../store/squadStore';

const TEAM_COLORS = ['#3b82f6', '#8b5cf6', '#ef4444', '#f59e0b', '#14b8a6', '#ec4899'];
const teamColor  = (id) => TEAM_COLORS[id % TEAM_COLORS.length];
const ovrColor   = (ovr) => ovr >= 85 ? '#d97706' : ovr >= 75 ? '#16a34a' : '#4b5563';

// ─── Lineup card ────────────────────────────────────────────────
function LineupCard({ lineup, onLoad, onDelete }) {
  let filled = 0;
  let benched = 0;
  try {
    const squad = JSON.parse(lineup.squad || '{}');
    const bench = JSON.parse(lineup.bench || '{}');
    filled = Object.keys(squad).length;
    benched = Object.keys(bench).length;
  } catch { /* ignore parse errors */ }

  return (
    <View style={styles.lineupCard}>
      <View style={styles.lineupInfo}>
        <Text style={styles.lineupName}>{lineup.name}</Text>
        <Text style={styles.lineupMeta}>
          {lineup.formation}  ·  {filled}/11  ·  {benched} sup.
        </Text>
      </View>
      <View style={styles.lineupActions}>
        <TouchableOpacity style={styles.loadBtn} onPress={onLoad}>
          <Ionicons name="play" size={13} color="#fff" />
          <Text style={styles.loadBtnText}>Cargar</Text>
        </TouchableOpacity>
        <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={onDelete}>
          <Ionicons name="trash-outline" size={17} color="#64748b" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Team card ───────────────────────────────────────────────────
function TeamCard({ team, lineups, expanded, onToggle, onLoad, onDeleteTeam, onDeleteLineup, onAutoLineup, rosterStats }) {
  const color = teamColor(team.id);

  const confirmDeleteTeam = () => {
    Alert.alert(
      `Eliminar "${team.name}"`,
      'Se eliminarán todas las alineaciones de este equipo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => onDeleteTeam(team.id) },
      ]
    );
  };

  const confirmDeleteLineup = (id) => {
    Alert.alert('Eliminar alineación', '¿Confirmas?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => onDeleteLineup(id) },
    ]);
  };

  return (
    <View style={[styles.teamCard, { borderLeftColor: color }]}>
      <TouchableOpacity style={styles.teamHeader} onPress={onToggle} activeOpacity={0.7}>
        <View style={[styles.teamDot, { backgroundColor: color }]} />
        <View style={styles.teamTitleBlock}>
          <Text style={styles.teamName}>{team.name}</Text>
          <Text style={styles.teamSub}>{lineups.length} / 3 alineaciones</Text>
        </View>
        <TouchableOpacity style={styles.plantillaBtn} onPress={onAutoLineup}>
          <Ionicons name="people-outline" size={13} color="#7c3aed" />
          <Text style={styles.plantillaBtnText}>Plantilla</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={confirmDeleteTeam} hitSlop={{ top: 8, bottom: 8, left: 12, right: 8 }}>
          <Ionicons name="trash-outline" size={17} color="#475569" />
        </TouchableOpacity>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color="#475569" style={{ marginLeft: 8 }} />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.lineupList}>
          {/* Stats de plantilla */}
          {rosterStats && rosterStats.total > 0 && (
            <View style={styles.squadStatsRow}>
              {[
                { label: 'Jugadores', value: rosterStats.total,  color: '#60a5fa' },
                { label: 'OVR medio', value: rosterStats.avgOvr || '—', color: ovrColor(rosterStats.avgOvr) },
                rosterStats.injured   > 0 ? { label: 'Lesionados',  value: rosterStats.injured,   color: '#ef4444' } : null,
                rosterStats.suspended > 0 ? { label: 'Suspendidos', value: rosterStats.suspended,  color: '#f59e0b' } : null,
              ].filter(Boolean).map(({ label, value, color }) => (
                <View key={label} style={styles.squadStatBox}>
                  <Text style={[styles.squadStatValue, { color }]}>{value}</Text>
                  <Text style={styles.squadStatLabel}>{label}</Text>
                </View>
              ))}
            </View>
          )}

          {lineups.length === 0 ? (
            <Text style={styles.noLineups}>Sin alineaciones — guarda una desde la Pizarra</Text>
          ) : (
            lineups.map((l) => (
              <LineupCard
                key={l.id}
                lineup={l}
                onLoad={() => onLoad(l, team)}
                onDelete={() => confirmDeleteLineup(l.id)}
              />
            ))
          )}
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────
export default function TeamsScreen({ navigation, autoLineupRoute = 'AutoLineup' }) {
  const [teams, setTeams] = useState([]);
  const [lineupsByTeam, setLineupsByTeam] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [rosterStatsByTeam, setRosterStatsByTeam] = useState({});
  const loadLineup = useSquadStore((s) => s.loadLineup);

  const refresh = () => {
    try {
      const t = getTeams();
      setTeams(t);
      const map = {};
      t.forEach((team) => {
        try { map[team.id] = getLineupsByTeam(team.id); } catch { map[team.id] = []; }
      });
      setLineupsByTeam(map);
    } catch { /* tabla puede no existir todavía */ }
  };

  // Carga inicial + cada vez que la pantalla obtiene foco
  useEffect(() => {
    refresh();
    const unsubscribe = navigation.addListener('focus', refresh);
    return unsubscribe;
  }, [navigation]);

  const handleCreate = () => {
    if (!newName.trim()) { Alert.alert('Error', 'Escribe un nombre para el equipo.'); return; }
    const result = createTeam(newName.trim());
    if (result.ok) {
      setNewName('');
      setShowModal(false);
      setExpandedId(result.id);
      refresh();
    } else {
      Alert.alert('Error', result.error || 'No se pudo crear el equipo.');
    }
  };

  const handleDeleteTeam = (id) => {
    deleteTeam(id);
    setExpandedId(null);
    refresh();
  };

  const handleDeleteLineup = (id) => {
    deleteLineup(id);
    refresh();
  };

  const handleToggle = (teamId) => {
    const isOpening = expandedId !== teamId;
    setExpandedId(isOpening ? teamId : null);
    if (isOpening && !rosterStatsByTeam[teamId]) {
      try {
        const raw = getRoster(teamId);
        const players = raw.map(r => { try { return JSON.parse(r.playerData); } catch { return null; } }).filter(p => p?.overall);
        const total  = players.length;
        const avgOvr = total ? Math.round(players.reduce((s, p) => s + p.overall, 0) / total) : 0;
        const injured   = raw.filter(r => r.playerStatus === 'lesionado').length;
        const suspended = raw.filter(r => r.playerStatus === 'suspendido').length;
        setRosterStatsByTeam(prev => ({ ...prev, [teamId]: { total, avgOvr, injured, suspended } }));
      } catch {}
    }
  };

  const handleLoad = (lineup, team) => {
    loadLineup({
      teamId: team.id,
      teamName: team.name,
      lineupId: lineup.id,
      lineupName: lineup.name,
      formation: lineup.formation,
      squad: lineup.squad,
      bench: lineup.bench,
      reserves: lineup.reserves,
    });
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={teams}
        keyExtractor={(t) => t.id.toString()}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="shield-outline" size={56} color="#334155" />
            <Text style={styles.emptyTitle}>Sin equipos guardados</Text>
            <Text style={styles.emptyText}>
              Crea un equipo y guarda hasta 3 alineaciones por equipo desde la Pizarra.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TeamCard
            team={item}
            lineups={lineupsByTeam[item.id] || []}
            expanded={expandedId === item.id}
            onToggle={() => handleToggle(item.id)}
            onLoad={handleLoad}
            onDeleteTeam={handleDeleteTeam}
            onDeleteLineup={handleDeleteLineup}
            onAutoLineup={() => navigation.navigate(autoLineupRoute, { teamId: item.id, teamName: item.name })}
            rosterStats={rosterStatsByTeam[item.id]}
          />
        )}
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Modal nuevo equipo */}
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Nuevo equipo</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Nombre del equipo"
              placeholderTextColor="#64748b"
              value={newName}
              onChangeText={setNewName}
              autoFocus
              onSubmitEditing={handleCreate}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setNewName(''); setShowModal(false); }}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleCreate}>
                <Text style={styles.saveText}>Crear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  list: { padding: 16, gap: 12, paddingBottom: 100 },

  teamCard: {
    backgroundColor: '#1e293b', borderRadius: 14,
    borderWidth: 1, borderColor: '#334155', borderLeftWidth: 4, overflow: 'hidden',
  },
  teamHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  teamDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  teamTitleBlock: { flex: 1 },
  teamName: { color: '#f1f5f9', fontSize: 16, fontWeight: '700' },
  teamSub: { color: '#64748b', fontSize: 12, marginTop: 2 },

  lineupList: { paddingHorizontal: 14, paddingBottom: 12, gap: 8 },
  noLineups: { color: '#475569', fontSize: 12, textAlign: 'center', paddingVertical: 10 },

  lineupCard: {
    backgroundColor: '#0f172a', borderRadius: 10, padding: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: '#334155',
  },
  lineupInfo: { flex: 1 },
  lineupName: { color: '#cbd5e1', fontSize: 14, fontWeight: '600' },
  lineupMeta: { color: '#475569', fontSize: 11, marginTop: 2 },
  lineupActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  loadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#1d4ed8', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
  },
  loadBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  plantillaBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: '#2e1065', borderWidth: 1, borderColor: '#6d28d9', marginRight: 6 },
  plantillaBtnText: { color: '#a78bfa', fontSize: 11, fontWeight: '700' },

  squadStatsRow:  { flexDirection: 'row', backgroundColor: '#0f172a', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#1e293b', justifyContent: 'space-around' },
  squadStatBox:   { alignItems: 'center', gap: 2 },
  squadStatValue: { fontSize: 20, fontWeight: '900' },
  squadStatLabel: { color: '#475569', fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },

  emptyState: { alignItems: 'center', marginTop: 80, paddingHorizontal: 40 },
  emptyTitle: { color: '#64748b', fontSize: 18, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  emptyText: { color: '#475569', fontSize: 14, textAlign: 'center', lineHeight: 22 },

  fab: {
    position: 'absolute', bottom: 28, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#1d4ed8', justifyContent: 'center', alignItems: 'center',
    elevation: 6, shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6,
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  modalBox: { backgroundColor: '#1e293b', borderRadius: 16, padding: 24, width: '100%', borderWidth: 1, borderColor: '#334155' },
  modalTitle: { color: '#f1f5f9', fontSize: 18, fontWeight: '700', marginBottom: 14 },
  modalInput: {
    backgroundColor: '#0f172a', borderRadius: 10, paddingHorizontal: 14,
    height: 46, color: '#f1f5f9', fontSize: 15, borderWidth: 1, borderColor: '#475569',
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#0f172a', alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  cancelText: { color: '#94a3b8', fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#1d4ed8', alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '700' },
});
