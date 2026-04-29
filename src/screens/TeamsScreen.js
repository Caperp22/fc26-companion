import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
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
  getTeams,
} from '../db/database';
import { useSquadStore } from '../store/squadStore';
import { useFocusEffect } from '@react-navigation/native';

const TEAM_COLORS = ['#3b82f6', '#8b5cf6', '#ef4444', '#f59e0b', '#14b8a6', '#ec4899'];

function teamColor(id) {
  return TEAM_COLORS[id % TEAM_COLORS.length];
}

function LineupCard({ lineup, teamId, teamName, onLoad, onDelete }) {
  const squad = (() => { try { return JSON.parse(lineup.squad); } catch { return {}; } })();
  const bench = (() => { try { return JSON.parse(lineup.bench); } catch { return {}; } })();
  const filled = Object.keys(squad).length;
  const benched = Object.keys(bench).length;

  return (
    <View style={styles.lineupCard}>
      <View style={styles.lineupInfo}>
        <Text style={styles.lineupName}>{lineup.name}</Text>
        <Text style={styles.lineupMeta}>
          {lineup.formation}  ·  {filled}/11 titulares  ·  {benched} sup.
        </Text>
      </View>
      <View style={styles.lineupActions}>
        <TouchableOpacity
          style={styles.loadBtn}
          onPress={() => onLoad(lineup, teamId, teamName)}
        >
          <Ionicons name="play" size={14} color="#fff" />
          <Text style={styles.loadBtnText}>Cargar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => onDelete(lineup.id)}
        >
          <Ionicons name="trash-outline" size={18} color="#64748b" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function TeamCard({ team, onLoad, onDeleteTeam, onDeleteLineup, expanded, onToggle }) {
  const lineups = getLineupsByTeam(team.id);
  const color = teamColor(team.id);

  const handleDeleteTeam = () => {
    Alert.alert(
      `Eliminar "${team.name}"`,
      'Se eliminarán todas las alineaciones de este equipo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => onDeleteTeam(team.id) },
      ]
    );
  };

  const handleDeleteLineup = (lineupId) => {
    Alert.alert('Eliminar alineación', '¿Confirmas?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => onDeleteLineup(lineupId) },
    ]);
  };

  return (
    <View style={[styles.teamCard, { borderLeftColor: color }]}>
      <TouchableOpacity style={styles.teamHeader} onPress={onToggle} activeOpacity={0.7}>
        <View style={[styles.teamColorDot, { backgroundColor: color }]} />
        <View style={styles.teamTitleBlock}>
          <Text style={styles.teamName}>{team.name}</Text>
          <Text style={styles.teamSub}>{team.lineupCount} / 3 alineaciones</Text>
        </View>
        <TouchableOpacity onPress={handleDeleteTeam} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="ellipsis-vertical" size={18} color="#64748b" />
        </TouchableOpacity>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18} color="#64748b"
          style={{ marginLeft: 6 }}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.lineupList}>
          {lineups.length === 0 ? (
            <Text style={styles.emptyLineups}>Sin alineaciones guardadas</Text>
          ) : (
            lineups.map((l) => (
              <LineupCard
                key={l.id}
                lineup={l}
                teamId={team.id}
                teamName={team.name}
                onLoad={onLoad}
                onDelete={handleDeleteLineup}
              />
            ))
          )}
        </View>
      )}
    </View>
  );
}

export default function TeamsScreen({ navigation }) {
  const [teams, setTeams] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const loadLineup = useSquadStore((s) => s.loadLineup);

  const refresh = useCallback(() => {
    setTeams(getTeams());
  }, []);

  useFocusEffect(refresh);

  const handleCreate = () => {
    if (!newTeamName.trim()) { Alert.alert('Error', 'Escribe un nombre para el equipo.'); return; }
    const result = createTeam(newTeamName);
    if (result.ok) {
      setNewTeamName('');
      setShowCreateModal(false);
      setExpandedId(result.id);
      refresh();
    } else {
      Alert.alert('Error', result.error);
    }
  };

  const handleDeleteTeam = (id) => {
    deleteTeam(id);
    refresh();
  };

  const handleDeleteLineup = (id) => {
    deleteLineup(id);
    refresh();
  };

  const handleLoad = (lineup, teamId, teamName) => {
    loadLineup({
      teamId,
      teamName,
      lineupId: lineup.id,
      lineupName: lineup.name,
      formation: lineup.formation,
      squad: lineup.squad,
      bench: lineup.bench,
      reserves: lineup.reserves,
    });
    navigation.navigate('SquadBuilder');
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
            <Text style={styles.emptyText}>Crea un equipo y guarda hasta 3 alineaciones en él.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TeamCard
            team={item}
            expanded={expandedId === item.id}
            onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
            onLoad={handleLoad}
            onDeleteTeam={handleDeleteTeam}
            onDeleteLineup={handleDeleteLineup}
          />
        )}
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowCreateModal(true)}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Modal crear equipo */}
      <Modal visible={showCreateModal} transparent animationType="fade" onRequestClose={() => setShowCreateModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Nuevo equipo</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Nombre del equipo"
              placeholderTextColor="#64748b"
              value={newTeamName}
              onChangeText={setNewTeamName}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setNewTeamName(''); setShowCreateModal(false); }}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={handleCreate}>
                <Text style={styles.modalSaveText}>Crear</Text>
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
    backgroundColor: '#1e293b',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    borderLeftWidth: 4,
    overflow: 'hidden',
  },
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  teamColorDot: { width: 10, height: 10, borderRadius: 5 },
  teamTitleBlock: { flex: 1 },
  teamName: { color: '#f1f5f9', fontSize: 16, fontWeight: '700' },
  teamSub: { color: '#64748b', fontSize: 12, marginTop: 2 },

  lineupList: { paddingHorizontal: 14, paddingBottom: 12, gap: 8 },
  emptyLineups: { color: '#475569', fontSize: 13, textAlign: 'center', paddingVertical: 8 },

  lineupCard: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  lineupInfo: { flex: 1 },
  lineupName: { color: '#cbd5e1', fontSize: 14, fontWeight: '600' },
  lineupMeta: { color: '#475569', fontSize: 11, marginTop: 2 },
  lineupActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  loadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1d4ed8',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  loadBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  emptyState: { alignItems: 'center', marginTop: 80, paddingHorizontal: 40 },
  emptyTitle: { color: '#64748b', fontSize: 18, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  emptyText: { color: '#475569', fontSize: 14, textAlign: 'center', lineHeight: 20 },

  fab: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1d4ed8',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  modalBox: { backgroundColor: '#1e293b', borderRadius: 16, padding: 24, width: '100%', borderWidth: 1, borderColor: '#334155' },
  modalTitle: { color: '#f1f5f9', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  modalInput: {
    backgroundColor: '#0f172a', borderRadius: 10, paddingHorizontal: 14,
    height: 46, color: '#f1f5f9', fontSize: 15, borderWidth: 1, borderColor: '#475569',
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalCancel: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#0f172a', alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  modalCancelText: { color: '#94a3b8', fontWeight: '600' },
  modalSave: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#1d4ed8', alignItems: 'center' },
  modalSaveText: { color: '#fff', fontWeight: '700' },
});
