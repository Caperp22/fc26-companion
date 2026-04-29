import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { FORMATIONS } from '../constants/formations';
import {
  createTeam,
  getTeams,
  saveLineup,
  updateSquadsFromCloud,
} from '../db/database';
import { useSquadStore } from '../store/squadStore';

const SLOT_SIZE = 56;
const BENCH_SLOTS  = Array.from({ length: 7 }, (_, i) => ({ id: `B${i}`, label: `SUP ${i + 1}` }));
const RESERVE_SLOTS = Array.from({ length: 5 }, (_, i) => ({ id: `R${i}`, label: `RES ${i + 1}` }));

const getSlotBorderColor = (pos) => {
  if (pos === 'GK') return '#f59e0b';
  if (['CB','LB','RB','LWB','RWB'].includes(pos)) return '#3b82f6';
  if (['CDM','CM','CAM','LM','RM'].includes(pos)) return '#8b5cf6';
  return '#ef4444';
};

const getOverallBg = (overall) => {
  if (overall >= 85) return '#d97706';
  if (overall >= 75) return '#16a34a';
  return '#4b5563';
};

// ─── Bench card ────────────────────────────────────────────────
function BenchCard({ slotId, label, player, pendingPlayer, onPress, onLongPress }) {
  return (
    <TouchableOpacity
      style={[styles.benchCard, player && { backgroundColor: getOverallBg(player.overall), borderColor: 'transparent' }]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.75}
    >
      {player ? (
        <>
          <Text style={styles.benchOverall}>{player.overall}</Text>
          <Text style={styles.benchName} numberOfLines={1}>{player.name.split(' ').slice(-1)[0]}</Text>
          <Text style={styles.benchPos}>{player.position}</Text>
        </>
      ) : (
        <>
          <Text style={styles.benchEmptyIcon}>{pendingPlayer ? '+' : '·'}</Text>
          <Text style={styles.benchEmptyLabel}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// ─── Save Modal ────────────────────────────────────────────────
function SaveModal({ visible, onClose, onSaved, currentFormation, currentSquad, currentBench, currentReserves, loadedTeamId, loadedTeamName, loadedLineupId, loadedLineupName }) {
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [lineupName, setLineupName] = useState('');
  const [createNew, setCreateNew] = useState(false);

  useEffect(() => {
    if (visible) {
      const t = getTeams();
      setTeams(t);
      if (loadedTeamId) {
        setSelectedTeamId(loadedTeamId);
        setLineupName(loadedLineupName || 'Titular');
        setCreateNew(false);
      } else {
        setSelectedTeamId(t[0]?.id ?? null);
        setLineupName('Titular');
        setCreateNew(t.length === 0);
      }
      setNewTeamName('');
    }
  }, [visible, loadedTeamId, loadedLineupName]);

  const handleSave = () => {
    const lName = lineupName.trim() || 'Titular';

    let teamId = selectedTeamId;
    let teamName = teams.find((t) => t.id === teamId)?.name || '';

    if (createNew) {
      if (!newTeamName.trim()) { Alert.alert('Error', 'Escribe el nombre del equipo.'); return; }
      const res = createTeam(newTeamName.trim());
      if (!res.ok) { Alert.alert('Error', res.error); return; }
      teamId = res.id;
      teamName = newTeamName.trim();
    }

    if (!teamId) { Alert.alert('Error', 'Selecciona o crea un equipo.'); return; }

    const result = saveLineup({
      teamId,
      lineupId: loadedTeamId === teamId ? loadedLineupId : null,
      name: lName,
      formation: currentFormation,
      squad: currentSquad,
      bench: currentBench,
      reserves: currentReserves,
    });

    if (result.ok) {
      onSaved(teamId, teamName, result.id, lName);
      onClose();
    } else {
      Alert.alert('Error', result.error);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={saveModal.overlay}>
        <View style={saveModal.sheet}>
          <Text style={saveModal.title}>Guardar alineación</Text>

          {/* Equipo */}
          <Text style={saveModal.label}>Equipo</Text>
          {!createNew && teams.length > 0 ? (
            <FlatList
              data={teams}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(t) => t.id.toString()}
              contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[saveModal.teamChip, selectedTeamId === item.id && saveModal.teamChipActive]}
                  onPress={() => setSelectedTeamId(item.id)}
                >
                  <Text style={[saveModal.teamChipText, selectedTeamId === item.id && saveModal.teamChipTextActive]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          ) : null}

          <TouchableOpacity
            style={saveModal.toggleNew}
            onPress={() => { setCreateNew(!createNew); setSelectedTeamId(null); }}
          >
            <Ionicons name={createNew ? 'checkmark-circle' : 'ellipse-outline'} size={18} color="#3b82f6" />
            <Text style={saveModal.toggleNewText}>Crear equipo nuevo</Text>
          </TouchableOpacity>

          {createNew && (
            <TextInput
              style={saveModal.input}
              placeholder="Nombre del equipo"
              placeholderTextColor="#64748b"
              value={newTeamName}
              onChangeText={setNewTeamName}
            />
          )}

          {/* Nombre alineación */}
          <Text style={[saveModal.label, { marginTop: 14 }]}>Nombre de la alineación</Text>
          <TextInput
            style={saveModal.input}
            placeholder="Titular, Alternativa, Copa..."
            placeholderTextColor="#64748b"
            value={lineupName}
            onChangeText={setLineupName}
          />

          <View style={saveModal.actions}>
            <TouchableOpacity style={saveModal.cancelBtn} onPress={onClose}>
              <Text style={saveModal.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={saveModal.saveBtn} onPress={handleSave}>
              <Text style={saveModal.saveText}>Guardar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ────────────────────────────────────────────────
export default function SquadBuilderScreen({ navigation }) {
  const {
    formation, squad, bench, reserves,
    setFormation, assignPlayer, removePlayer,
    assignToBench, removeFromBench,
    assignToReserves, removeFromReserves,
    pendingPlayer, clearPendingPlayer,
    loadedTeamId, loadedLineupId, loadedTeamName, loadedLineupName,
    setLoadedIds, newLineup,
  } = useSquadStore();

  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const { width: screenWidth } = useWindowDimensions();


  const PITCH_W = screenWidth - 24;
  const PITCH_H = Math.round(PITCH_W * 1.48);

  const currentSlots = FORMATIONS[formation]?.slots || [];
  const filledCount = Object.keys(squad).length;
  const benchCount = Object.keys(bench).length;

  // Botón guardar en header
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => setShowSaveModal(true)} style={{ marginRight: 4, padding: 6 }}>
          <Ionicons name="save-outline" size={22} color="#f1f5f9" />
        </TouchableOpacity>
      ),
      headerShown: true,
      headerTitle: loadedTeamName
        ? () => (
            <View>
              <Text style={{ color: '#f1f5f9', fontSize: 16, fontWeight: '700' }}>{loadedTeamName}</Text>
              <Text style={{ color: '#64748b', fontSize: 11 }}>{loadedLineupName}</Text>
            </View>
          )
        : () => <Text style={{ color: '#f1f5f9', fontSize: 17, fontWeight: '700' }}>Mi Pizarra</Text>,
      headerStyle: { backgroundColor: '#0f172a' },
      headerShadowVisible: false,
    });
  }, [loadedTeamName, loadedLineupName]);

  const navigateToScouting = (slotId, slotLabel, slotPosition) =>
    navigation.navigate('Scouting', { selectionMode: true, slotId, slotLabel, slotPosition });

  const handleSlotPress = (slot) => {
    if (pendingPlayer) { assignPlayer(slot.id, pendingPlayer); return; }
    navigateToScouting(slot.id, slot.label, slot.position);
  };

  const handleSlotLongPress = (slot) => {
    const player = squad[slot.id];
    if (!player) { handleSlotPress(slot); return; }
    Alert.alert(player.name, `GRL ${player.overall}  •  ${player.position}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cambiar', onPress: () => navigateToScouting(slot.id, slot.label, slot.position) },
      { text: 'Quitar', style: 'destructive', onPress: () => removePlayer(slot.id) },
    ]);
  };

  const handleBenchPress = (slotId, label, assignFn) => {
    if (pendingPlayer) { assignFn(slotId, pendingPlayer); return; }
    navigateToScouting(slotId, label, null);
  };

  const handleBenchLongPress = (slotId, player, removeFn, assignFn, label) => {
    if (!player) { handleBenchPress(slotId, label, assignFn); return; }
    Alert.alert(player.name, `GRL ${player.overall}  •  ${player.position}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cambiar', onPress: () => navigateToScouting(slotId, label, null) },
      { text: 'Quitar', style: 'destructive', onPress: () => removeFn(slotId) },
    ]);
  };

  const handleFormationChange = (f) => {
    if (f === formation) return;
    const count = Object.keys(squad).length;
    if (count > 0) {
      Alert.alert('Cambiar formación', `¿Cambiar a ${f}? Se perderán los ${count} jugadores del once.`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', style: 'destructive', onPress: () => setFormation(f) },
      ]);
    } else {
      setFormation(f);
    }
  };

  const handleUpdateSquads = async () => {
    setIsUpdating(true);
    setUpdateProgress('Iniciando...');
    const result = await updateSquadsFromCloud((msg) => setUpdateProgress(msg));
    setIsUpdating(false);
    setUpdateProgress('');
    Alert.alert(
      result.ok ? 'Base de datos actualizada' : 'Error al actualizar',
      result.ok ? `${result.count.toLocaleString()} jugadores disponibles.` : result.error
    );
  };

  return (
    <View style={styles.container}>
      <SaveModal
        visible={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSaved={(tId, tName, lId, lName) => setLoadedIds(tId, tName, lId, lName)}
        currentFormation={formation}
        currentSquad={squad}
        currentBench={bench}
        currentReserves={reserves}
        loadedTeamId={loadedTeamId}
        loadedTeamName={loadedTeamName}
        loadedLineupId={loadedLineupId}
        loadedLineupName={loadedLineupName}
      />

      {/* Pending banner */}
      {pendingPlayer && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingText}>
            Toca un puesto para asignar a <Text style={styles.pendingName}>{pendingPlayer.name}</Text>
          </Text>
          <TouchableOpacity onPress={clearPendingPlayer} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={18} color="#64748b" />
          </TouchableOpacity>
        </View>
      )}

      {/* Formation chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.formationScroll}
        contentContainerStyle={styles.formationContainer}
      >
        {Object.keys(FORMATIONS).map((key) => (
          <TouchableOpacity
            key={key}
            style={[styles.formationChip, formation === key && styles.formationChipActive]}
            onPress={() => handleFormationChange(key)}
          >
            <Text style={[styles.formationChipText, formation === key && styles.formationChipTextActive]}>
              {key}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Pitch + bench + reserves */}
      <ScrollView style={styles.scrollFlex} contentContainerStyle={styles.pitchScroll} showsVerticalScrollIndicator={false}>

        {/* Pitch */}
        <View style={[styles.pitch, { width: PITCH_W, height: PITCH_H }]}>
          {/* Franjas decorativas */}
          {Array.from({ length: 6 }).map((_, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: 0, right: 0,
                top: (PITCH_H / 6) * i,
                height: PITCH_H / 6,
                backgroundColor: i % 2 === 0 ? 'rgba(0,0,0,0.04)' : 'transparent',
              }}
            />
          ))}
          {/* Líneas */}
          <View style={[styles.pitchLine, { top: PITCH_H / 2 - 0.5, left: PITCH_W * 0.05, width: PITCH_W * 0.9 }]} />
          <View style={[styles.pitchCircle, { top: PITCH_H / 2 - 44, left: PITCH_W / 2 - 44, width: 88, height: 88, borderRadius: 44 }]} />
          <View style={[styles.pitchBox, { top: 0, left: PITCH_W * 0.22, width: PITCH_W * 0.56, height: PITCH_H * 0.16 }]} />
          <View style={[styles.pitchBox, { bottom: 0, left: PITCH_W * 0.22, width: PITCH_W * 0.56, height: PITCH_H * 0.16 }]} />

          {currentSlots.map((slot) => {
            const player = squad[slot.id];
            const left = slot.x * PITCH_W - SLOT_SIZE / 2;
            const top = slot.y * PITCH_H - SLOT_SIZE / 2;
            const borderColor = getSlotBorderColor(slot.position);

            return (
              <TouchableOpacity
                key={slot.id}
                style={[
                  styles.slot,
                  { left, top, borderColor },
                  player ? { backgroundColor: getOverallBg(player.overall) } : styles.slotEmpty,
                ]}
                onPress={() => handleSlotPress(slot)}
                onLongPress={() => handleSlotLongPress(slot)}
                activeOpacity={0.75}
              >
                {player ? (
                  <>
                    <Text style={styles.slotOverall}>{player.overall}</Text>
                    <Text style={styles.slotName} numberOfLines={1}>
                      {player.name.split(' ').slice(-1)[0]}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.slotLabel}>{slot.label}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Contador */}
        <View style={styles.countRow}>
          <Text style={styles.countText}>{filledCount}/11 titulares</Text>
          {benchCount > 0 && <Text style={styles.countSep}>·</Text>}
          {benchCount > 0 && <Text style={styles.countText}>{benchCount} suplentes</Text>}
          <Text style={styles.hint}>Mantén pulsado para editar</Text>
        </View>

        {/* Suplentes */}
        <View style={[styles.section, { width: PITCH_W }]}>
          <Text style={styles.sectionTitle}>Suplentes</Text>
          <View style={styles.benchRow}>
            {BENCH_SLOTS.map((slot) => (
              <BenchCard
                key={slot.id}
                slotId={slot.id}
                label={slot.label}
                player={bench[slot.id]}
                pendingPlayer={pendingPlayer}
                onPress={() => handleBenchPress(slot.id, slot.label, assignToBench)}
                onLongPress={() => handleBenchLongPress(slot.id, bench[slot.id], removeFromBench, assignToBench, slot.label)}
              />
            ))}
          </View>
        </View>

        {/* Reservas */}
        <View style={[styles.section, { width: PITCH_W }]}>
          <Text style={styles.sectionTitle}>Reservas</Text>
          <View style={styles.benchRow}>
            {RESERVE_SLOTS.map((slot) => (
              <BenchCard
                key={slot.id}
                slotId={slot.id}
                label={slot.label}
                player={reserves[slot.id]}
                pendingPlayer={pendingPlayer}
                onPress={() => handleBenchPress(slot.id, slot.label, assignToReserves)}
                onLongPress={() => handleBenchLongPress(slot.id, reserves[slot.id], removeFromReserves, assignToReserves, slot.label)}
              />
            ))}
          </View>
        </View>

      </ScrollView>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        {isUpdating ? (
          <View style={styles.progressRow}>
            <ActivityIndicator color="#60a5fa" size="small" />
            <Text style={styles.progressText}>{updateProgress}</Text>
          </View>
        ) : (
          <View style={styles.bottomActions}>
            <TouchableOpacity style={styles.updateButton} onPress={handleUpdateSquads}>
              <Ionicons name="cloud-download-outline" size={16} color="#fff" />
              <Text style={styles.updateButtonText}>Actualizar BD</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.teamsButton} onPress={() => navigation.push('Teams')}>
              <Ionicons name="shield-outline" size={16} color="#60a5fa" />
              <Text style={styles.teamsButtonText}>Mis Equipos</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.newBtn} onPress={() => {
              Alert.alert('Nueva pizarra', '¿Limpiar la pizarra actual?', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Nueva', style: 'destructive', onPress: newLineup },
              ]);
            }}>
              <Ionicons name="add-outline" size={16} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },

  formationScroll: { maxHeight: 46, flexGrow: 0, flexShrink: 0, backgroundColor: '#0f172a', borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  formationContainer: { paddingHorizontal: 12, paddingVertical: 7, gap: 8, alignItems: 'center' },
  formationChip: {
    paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155',
  },
  formationChipActive: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  formationChipText: { color: '#94a3b8', fontWeight: '700', fontSize: 13 },
  formationChipTextActive: { color: '#fff' },

  scrollFlex: { flex: 1 },
  pitchScroll: { alignItems: 'center', paddingVertical: 12 },

  pitch: {
    backgroundColor: '#15803d',
    borderRadius: 10,
    position: 'relative',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  pitchLine: { position: 'absolute', height: 1, backgroundColor: 'rgba(255,255,255,0.25)' },
  pitchCircle: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'transparent' },
  pitchBox: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'transparent' },

  slot: {
    position: 'absolute',
    width: SLOT_SIZE, height: SLOT_SIZE,
    borderRadius: SLOT_SIZE / 2,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, overflow: 'hidden',
  },
  slotEmpty: { backgroundColor: 'rgba(0,0,0,0.55)' },
  slotOverall: {
    color: '#fff', fontSize: 15, fontWeight: 'bold', lineHeight: 17,
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  slotName: {
    color: '#fff', fontSize: 10, maxWidth: SLOT_SIZE - 4, textAlign: 'center', lineHeight: 12,
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  slotLabel: {
    color: '#fff', fontSize: 12, fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },

  countRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 8, marginBottom: 4 },
  countText: { color: '#64748b', fontSize: 11 },
  countSep: { color: '#334155', fontSize: 11 },
  hint: { color: '#334155', fontSize: 10, marginLeft: 6 },

  section: { marginTop: 8, marginBottom: 12 },
  sectionTitle: { color: '#475569', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  benchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  benchCard: {
    width: 68, height: 72, borderRadius: 10,
    backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155',
    justifyContent: 'center', alignItems: 'center', padding: 4,
  },
  benchOverall: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  benchName: { color: '#fff', fontSize: 9, textAlign: 'center', maxWidth: 62 },
  benchPos: { color: '#94a3b8', fontSize: 8, marginTop: 1 },
  benchEmptyIcon: { color: '#334155', fontSize: 20, lineHeight: 24 },
  benchEmptyLabel: { color: '#475569', fontSize: 9, textAlign: 'center' },

  pendingBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1e3a5f', borderLeftWidth: 4, borderLeftColor: '#3b82f6',
    paddingHorizontal: 14, paddingVertical: 10,
  },
  pendingText: { color: '#93c5fd', fontSize: 13, flex: 1 },
  pendingName: { color: '#fff', fontWeight: 'bold' },

  bottomBar: {
    paddingVertical: 10, paddingHorizontal: 16,
    backgroundColor: '#0f172a', borderTopWidth: 1, borderTopColor: '#1e293b',
  },
  bottomActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  updateButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#16a34a', paddingVertical: 10, borderRadius: 20,
  },
  updateButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  teamsButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#1e293b', paddingVertical: 10, borderRadius: 20,
    borderWidth: 1, borderColor: '#334155',
  },
  teamsButtonText: { color: '#60a5fa', fontWeight: '700', fontSize: 13 },
  newBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155',
    justifyContent: 'center', alignItems: 'center',
  },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center' },
  progressText: { color: '#94a3b8', fontSize: 13 },
});

const saveModal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#1e293b', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  title: { color: '#f1f5f9', fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  label: { color: '#94a3b8', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: {
    backgroundColor: '#0f172a', borderRadius: 10, paddingHorizontal: 14,
    height: 44, color: '#f1f5f9', fontSize: 15, borderWidth: 1, borderColor: '#475569',
  },
  teamChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155',
  },
  teamChipActive: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  teamChipText: { color: '#94a3b8', fontWeight: '600', fontSize: 13 },
  teamChipTextActive: { color: '#fff' },
  toggleNew: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  toggleNewText: { color: '#94a3b8', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#0f172a', alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  cancelText: { color: '#94a3b8', fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#16a34a', alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '700' },
});
