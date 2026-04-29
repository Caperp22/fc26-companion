import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Fragment, useEffect, useState } from 'react';
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
  getLineupsByTeam,
  getTeams,
  saveLineup,
  updateSquadsFromCloud,
} from '../db/database';
import { useSquadStore } from '../store/squadStore';

// ─── Constantes ────────────────────────────────────────────────
const SLOT_SIZE     = 60;
const FACE_SIZE     = SLOT_SIZE - 6;   // imagen dentro del círculo
const BENCH_SLOTS   = Array.from({ length: 7 }, (_, i) => ({ id: `B${i}`, label: `SUP ${i + 1}` }));
const RESERVE_SLOTS = Array.from({ length: 5 }, (_, i) => ({ id: `R${i}`, label: `RES ${i + 1}` }));

// Orden de formaciones: 3 atrás → 4 atrás → 5 atrás
const FORMATION_ORDER = [
  '3-4-3', '3-5-2',
  '4-3-3', '4-3-3 (A)', '4-3-3 (D)',
  '4-4-2', '4-4-2 ♦',
  '4-2-3-1', '4-5-1',
  '4-1-4-1', '4-1-2-1-2', '4-3-1-2', '4-1-3-2',
  '5-3-2', '5-4-1',
];

const getSlotBorderColor = (pos) => {
  if (pos === 'GK') return '#f59e0b';
  if (['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(pos)) return '#3b82f6';
  if (['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(pos)) return '#8b5cf6';
  return '#ef4444';
};

const getOverallBg = (overall) => {
  if (overall >= 85) return '#d97706';
  if (overall >= 75) return '#16a34a';
  return '#4b5563';
};

// ─── Foto del jugador en el slot ───────────────────────────────
function SlotPlayer({ player }) {
  const [imgError, setImgError] = useState(false);
  if (player.faceUrl && !imgError) {
    return (
      <Image
        source={{ uri: player.faceUrl }}
        style={{ width: FACE_SIZE, height: FACE_SIZE, borderRadius: FACE_SIZE / 2 }}
        contentFit="cover"
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <Text style={styles.slotInitial}>
      {player.name?.[0]?.toUpperCase() ?? '?'}
    </Text>
  );
}

const chunkArray = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// ─── Bench / Reserve card ───────────────────────────────────────
function BenchCard({ label, player, pendingPlayer, isSelected, onPress, onLongPress, style }) {
  return (
    <TouchableOpacity
      style={[
        styles.benchCard,
        player && { backgroundColor: getOverallBg(player.overall), borderColor: 'transparent' },
        isSelected && styles.benchCardSelected,
        style,
      ]}
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
          <Text style={styles.benchEmptyIcon}>{pendingPlayer || isSelected ? '+' : '·'}</Text>
          <Text style={styles.benchEmptyLabel}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// ─── Save Modal ─────────────────────────────────────────────────
function SaveModal({
  visible, onClose, onSaved,
  currentFormation, currentSquad, currentBench, currentReserves,
  loadedTeamId, loadedTeamName, loadedLineupId, loadedLineupName,
}) {
  const [teams, setTeams]               = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [newTeamName, setNewTeamName]   = useState('');
  const [lineupName, setLineupName]     = useState('');
  const [createNew, setCreateNew]       = useState(false);

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
    let teamId   = selectedTeamId;
    let teamName = teams.find((t) => t.id === teamId)?.name || '';

    if (createNew) {
      if (!newTeamName.trim()) { Alert.alert('Error', 'Escribe el nombre del equipo.'); return; }
      const res = createTeam(newTeamName.trim());
      if (!res.ok) { Alert.alert('Error', res.error); return; }
      teamId   = res.id;
      teamName = newTeamName.trim();
    }

    if (!teamId) { Alert.alert('Error', 'Selecciona o crea un equipo.'); return; }

    const result = saveLineup({
      teamId,
      lineupId: loadedTeamId === teamId ? loadedLineupId : null,
      name:     lName,
      formation: currentFormation,
      squad:    currentSquad,
      bench:    currentBench,
      reserves: currentReserves,
    });

    if (result.ok) { onSaved(teamId, teamName, result.id, lName); onClose(); }
    else           { Alert.alert('Error', result.error); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={saveModal.overlay}>
        <View style={saveModal.sheet}>
          <Text style={saveModal.title}>Guardar alineación</Text>

          <Text style={saveModal.label}>Equipo</Text>
          {!createNew && teams.length > 0 && (
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
          )}

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

// ─── Main Screen ─────────────────────────────────────────────────
export default function SquadBuilderScreen({ navigation }) {
  const {
    formation, squad, bench, reserves,
    setFormation, assignPlayer, removePlayer,
    assignToBench, removeFromBench,
    assignToReserves, removeFromReserves,
    pendingPlayer, clearPendingPlayer,
    loadedTeamId, loadedLineupId, loadedTeamName, loadedLineupName,
    setLoadedIds, newLineup, loadLineup,
  } = useSquadStore();

  const [isUpdating, setIsUpdating]       = useState(false);
  const [updateProgress, setUpdateProgress] = useState('');
  const [showSaveModal, setShowSaveModal]  = useState(false);
  const [selectedSlot, setSelectedSlot]   = useState(null);
  const [teamLineups, setTeamLineups]     = useState([]);

  const { width: screenWidth } = useWindowDimensions();

  // Pitch deja margen lateral de SLOT_SIZE/2 a cada lado para que
  // los slots extremos (RWB x=0.92, LWB x=0.08) nunca queden fuera
  // de los bounds del contenedor → Android entrega el touch event.
  const PITCH_W    = screenWidth - SLOT_SIZE * 2;
  const PITCH_H    = Math.round(PITCH_W * 1.52);
  const CENTER_OFF = (screenWidth - PITCH_W) / 2;   // = SLOT_SIZE = 60

  const currentSlots = FORMATIONS[formation]?.slots || [];
  const filledCount  = Object.keys(squad).length;
  const benchCount   = Object.keys(bench).length;

  // ── Cargar alineaciones del equipo cuando cambia el equipo/lineup ──
  useEffect(() => {
    if (loadedTeamId) {
      setTeamLineups(getLineupsByTeam(loadedTeamId));
    } else {
      setTeamLineups([]);
    }
  }, [loadedTeamId, loadedLineupId]);

  const handleLineupTabPress = (lineup) => {
    if (lineup.id === loadedLineupId) return;
    loadLineup({
      teamId:      loadedTeamId,
      teamName:    loadedTeamName,
      lineupId:    lineup.id,
      lineupName:  lineup.name,
      formation:   lineup.formation,
      squad:       lineup.squad,
      bench:       lineup.bench,
      reserves:    lineup.reserves,
    });
  };

  // ── Header ─────────────────────────────────────────────────────
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
  }, [navigation, loadedTeamName, loadedLineupName]);

  // ── Navegación a scouting ───────────────────────────────────────
  const navigateToScouting = (slotId, slotLabel, slotPosition) =>
    navigation.navigate('Scouting', { selectionMode: true, slotId, slotLabel, slotPosition });

  // ── Swap entre cualquier tipo de slot ──────────────────────────
  const swapPlayers = (from, to) => {
    const getPlayer = ({ type, id }) => {
      if (type === 'main')     return squad[id];
      if (type === 'bench')    return bench[id];
      if (type === 'reserves') return reserves[id];
    };
    const setPlayer = ({ type, id }, player) => {
      if (!player) {
        if (type === 'main')     removePlayer(id);
        if (type === 'bench')    removeFromBench(id);
        if (type === 'reserves') removeFromReserves(id);
      } else {
        if (type === 'main')     assignPlayer(id, player);
        if (type === 'bench')    assignToBench(id, player);
        if (type === 'reserves') assignToReserves(id, player);
      }
    };
    const fromPlayer = getPlayer(from);
    const toPlayer   = getPlayer(to);
    setPlayer(to, fromPlayer);
    setPlayer(from, toPlayer ?? null);
  };

  // ── Handlers titulares ─────────────────────────────────────────
  const handleSlotPress = (slot) => {
    if (pendingPlayer) {
      assignPlayer(slot.id, pendingPlayer);
      clearPendingPlayer();
      return;
    }
    if (selectedSlot) {
      if (selectedSlot.type === 'main' && selectedSlot.id === slot.id) {
        setSelectedSlot(null);
      } else {
        swapPlayers(selectedSlot, { type: 'main', id: slot.id });
        setSelectedSlot(null);
      }
      return;
    }
    const player = squad[slot.id];
    if (player) {
      setSelectedSlot({ type: 'main', id: slot.id });
    } else {
      navigateToScouting(slot.id, slot.label, slot.position);
    }
  };

  const handleSlotLongPress = (slot) => {
    setSelectedSlot(null);
    const player = squad[slot.id];
    if (!player) { navigateToScouting(slot.id, slot.label, slot.position); return; }
    Alert.alert(player.name, `GRL ${player.overall}  •  ${player.position}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cambiar',  onPress: () => navigateToScouting(slot.id, slot.label, slot.position) },
      { text: 'Quitar',   style: 'destructive', onPress: () => removePlayer(slot.id) },
    ]);
  };

  // ── Handlers banco / reservas ───────────────────────────────────
  const handleBenchPress = (slotId, label, type) => {
    const player   = type === 'bench' ? bench[slotId] : reserves[slotId];
    const assignFn = type === 'bench' ? assignToBench : assignToReserves;

    if (pendingPlayer) {
      assignFn(slotId, pendingPlayer);
      clearPendingPlayer();
      return;
    }
    if (selectedSlot) {
      if (selectedSlot.type === type && selectedSlot.id === slotId) {
        setSelectedSlot(null);
      } else {
        swapPlayers(selectedSlot, { type, id: slotId });
        setSelectedSlot(null);
      }
      return;
    }
    if (player) {
      setSelectedSlot({ type, id: slotId });
    } else {
      navigateToScouting(slotId, label, null);
    }
  };

  const handleBenchLongPress = (slotId, label, type) => {
    setSelectedSlot(null);
    const player   = type === 'bench' ? bench[slotId] : reserves[slotId];
    const removeFn = type === 'bench' ? removeFromBench : removeFromReserves;
    if (!player) { navigateToScouting(slotId, label, null); return; }
    Alert.alert(player.name, `GRL ${player.overall}  •  ${player.position}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cambiar',  onPress: () => navigateToScouting(slotId, label, null) },
      { text: 'Quitar',   style: 'destructive', onPress: () => removeFn(slotId) },
    ]);
  };

  // ── Formación ───────────────────────────────────────────────────
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

  // ── Actualizar BD ───────────────────────────────────────────────
  const handleUpdateSquads = async () => {
    setIsUpdating(true);
    setUpdateProgress('Iniciando...');
    const result = await updateSquadsFromCloud((msg) => setUpdateProgress(msg));
    setIsUpdating(false);
    setUpdateProgress('');
    Alert.alert(
      result.ok ? 'Base de datos actualizada' : 'Error al actualizar',
      result.ok ? `${result.count.toLocaleString()} jugadores disponibles.` : result.error,
    );
  };

  const isSlotSelected = (type, id) => selectedSlot?.type === type && selectedSlot?.id === id;
  const selectedPlayer = selectedSlot
    ? (selectedSlot.type === 'main'     ? squad[selectedSlot.id]
     : selectedSlot.type === 'bench'    ? bench[selectedSlot.id]
     : reserves[selectedSlot.id])
    : null;

  // Formaciones ordenadas y filtradas a las que existen
  const orderedFormations = FORMATION_ORDER.filter((k) => FORMATIONS[k]);

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

      {/* Banner: jugador pendiente */}
      {pendingPlayer && !selectedSlot && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingText}>
            Toca un puesto para asignar a <Text style={styles.pendingName}>{pendingPlayer.name}</Text>
          </Text>
          <TouchableOpacity onPress={clearPendingPlayer} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={18} color="#64748b" />
          </TouchableOpacity>
        </View>
      )}

      {/* Banner: jugador seleccionado para mover */}
      {selectedSlot && selectedPlayer && (
        <View style={[styles.pendingBanner, styles.moveBanner]}>
          <Ionicons name="swap-horizontal" size={16} color="#fbbf24" style={{ marginRight: 6 }} />
          <Text style={styles.pendingText}>
            Toca un puesto para mover a <Text style={styles.pendingName}>{selectedPlayer.name}</Text>
          </Text>
          <TouchableOpacity onPress={() => setSelectedSlot(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={18} color="#64748b" />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Chips de formación (ordenados) ─────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.formationScroll}
        contentContainerStyle={styles.formationContainer}
      >
        {orderedFormations.map((key) => (
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

      {/* ── Tabs de alineación (solo si hay 2+) ───────────────── */}
      {teamLineups.length >= 2 && (
        <View style={styles.lineupTabsRow}>
          {teamLineups.map((l) => (
            <TouchableOpacity
              key={l.id}
              style={[styles.lineupTab, loadedLineupId === l.id && styles.lineupTabActive]}
              onPress={() => handleLineupTabPress(l)}
            >
              <Text style={[styles.lineupTabText, loadedLineupId === l.id && styles.lineupTabTextActive]}>
                {l.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Pitch + suplentes + reservas ───────────────────────── */}
      <ScrollView
        style={styles.scrollFlex}
        contentContainerStyle={styles.pitchScroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Cancha: contenedor de ancho completo de pantalla.
            CENTER_OFF centra la imagen visual; los slots se posicionan
            con left = CENTER_OFF + x*PITCH_W - SLOT/2, garantizando
            que incluso los extremos (x≈0.92) quedan DENTRO de los
            bounds del View → Android entrega los touch events. */}
        <View style={{ width: screenWidth, height: PITCH_H + SLOT_SIZE }}>

          {/* Capa visual: campo verde con overflow:hidden para bordes */}
          <View style={[styles.pitch, {
            position: 'absolute',
            left: CENTER_OFF, top: SLOT_SIZE / 2,
            width: PITCH_W, height: PITCH_H,
          }]}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={{
                position: 'absolute', left: 0, right: 0,
                top: (PITCH_H / 6) * i, height: PITCH_H / 6,
                backgroundColor: i % 2 === 0 ? 'rgba(0,0,0,0.04)' : 'transparent',
              }} />
            ))}
            <View style={[styles.pitchLine,   { top: PITCH_H / 2 - 0.5, left: PITCH_W * 0.05, width: PITCH_W * 0.9 }]} />
            <View style={[styles.pitchCircle, { top: PITCH_H / 2 - 44, left: PITCH_W / 2 - 44, width: 88, height: 88, borderRadius: 44 }]} />
            <View style={[styles.pitchBox, { top: 0,    left: PITCH_W * 0.22, width: PITCH_W * 0.56, height: PITCH_H * 0.16 }]} />
            <View style={[styles.pitchBox, { bottom: 0, left: PITCH_W * 0.22, width: PITCH_W * 0.56, height: PITCH_H * 0.16 }]} />
          </View>

          {/* Slots + nombre externo */}
          {currentSlots.map((slot) => {
            const player     = squad[slot.id];
            const isSelected = isSlotSelected('main', slot.id);
            const borderColor = isSelected ? '#fbbf24' : getSlotBorderColor(slot.position);

            // slot.y * PITCH_H da la posición dentro del campo visual.
            // Sumamos SLOT_SIZE/2 porque el campo está desplazado esa misma cantidad.
            const left = CENTER_OFF + slot.x * PITCH_W - SLOT_SIZE / 2;
            const top  = SLOT_SIZE / 2 + slot.y * PITCH_H - SLOT_SIZE / 2;
            const shortName = player?.name?.split(' ').slice(-1)[0] ?? '';

            return (
              <Fragment key={slot.id}>
                <TouchableOpacity
                  style={[
                    styles.slot,
                    { left, top, borderColor },
                    player ? { backgroundColor: getOverallBg(player.overall) } : styles.slotEmpty,
                    isSelected && styles.slotSelected,
                  ]}
                  onPress={() => handleSlotPress(slot)}
                  onLongPress={() => handleSlotLongPress(slot)}
                  activeOpacity={0.75}
                >
                  {player
                    ? <SlotPlayer player={player} />
                    : <Text style={styles.slotLabel}>{selectedSlot ? '+' : slot.label}</Text>
                  }
                </TouchableOpacity>

                {/* Nombre fuera del slot para que no quede clippeado */}
                {player && (
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: left - 8,
                      top: top + SLOT_SIZE + 2,
                      width: SLOT_SIZE + 16,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={styles.slotNameLabel} numberOfLines={1}>{shortName}</Text>
                  </View>
                )}
              </Fragment>
            );
          })}
        </View>

        {/* Contador */}
        <View style={styles.countRow}>
          <Text style={styles.countText}>{filledCount}/11 titulares</Text>
          {benchCount > 0 && <Text style={styles.countSep}>·</Text>}
          {benchCount > 0 && <Text style={styles.countText}>{benchCount} suplentes</Text>}
          {!selectedSlot && <Text style={styles.hint}>Mantén pulsado para opciones · Toca para mover</Text>}
        </View>

        {/* ── Suplentes ──────────────────────────────────────────── */}
        <View style={[styles.section, { width: PITCH_W, alignSelf: 'center' }]}>
          <Text style={styles.sectionTitle}>Suplentes</Text>
          {chunkArray(BENCH_SLOTS, 4).map((row, rIdx) => (
            <View key={rIdx} style={styles.benchRow}>
              {row.map((slot) => (
                <BenchCard
                  key={slot.id}
                  label={slot.label}
                  player={bench[slot.id]}
                  pendingPlayer={pendingPlayer}
                  isSelected={isSlotSelected('bench', slot.id)}
                  onPress={() => handleBenchPress(slot.id, slot.label, 'bench')}
                  onLongPress={() => handleBenchLongPress(slot.id, slot.label, 'bench')}
                  style={styles.benchCardFlex}
                />
              ))}
              {row.length < 4 && Array.from({ length: 4 - row.length }).map((_, i) => (
                <View key={i} style={styles.benchCardFlex} />
              ))}
            </View>
          ))}
        </View>

        {/* ── Reservas ───────────────────────────────────────────── */}
        <View style={[styles.section, { width: PITCH_W, alignSelf: 'center' }]}>
          <Text style={styles.sectionTitle}>Reservas</Text>
          {chunkArray(RESERVE_SLOTS, 4).map((row, rIdx) => (
            <View key={rIdx} style={styles.benchRow}>
              {row.map((slot) => (
                <BenchCard
                  key={slot.id}
                  label={slot.label}
                  player={reserves[slot.id]}
                  pendingPlayer={pendingPlayer}
                  isSelected={isSlotSelected('reserves', slot.id)}
                  onPress={() => handleBenchPress(slot.id, slot.label, 'reserves')}
                  onLongPress={() => handleBenchLongPress(slot.id, slot.label, 'reserves')}
                  style={styles.benchCardFlex}
                />
              ))}
              {row.length < 4 && Array.from({ length: 4 - row.length }).map((_, i) => (
                <View key={i} style={styles.benchCardFlex} />
              ))}
            </View>
          ))}
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
            <TouchableOpacity
              style={styles.newBtn}
              onPress={() =>
                Alert.alert('Nueva pizarra', '¿Limpiar la pizarra actual?', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Nueva', style: 'destructive', onPress: newLineup },
                ])
              }
            >
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

  formationScroll: {
    maxHeight: 46, flexGrow: 0, flexShrink: 0,
    backgroundColor: '#0f172a', borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },
  formationContainer: { paddingHorizontal: 12, paddingVertical: 7, gap: 8, alignItems: 'center' },
  formationChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155',
  },
  formationChipActive:     { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  formationChipText:       { color: '#94a3b8', fontWeight: '700', fontSize: 12 },
  formationChipTextActive: { color: '#fff' },

  lineupTabsRow: {
    flexDirection: 'row', backgroundColor: '#0f172a',
    borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },
  lineupTab: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  lineupTabActive:     { borderBottomColor: '#3b82f6' },
  lineupTabText:       { color: '#475569', fontSize: 13, fontWeight: '600' },
  lineupTabTextActive: { color: '#f1f5f9' },

  scrollFlex:  { flex: 1 },
  pitchScroll: { paddingVertical: 12 },

  pitch: {
    backgroundColor: '#15803d', borderRadius: 10,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)', overflow: 'hidden',
  },
  pitchLine:   { position: 'absolute', height: 1, backgroundColor: 'rgba(255,255,255,0.25)' },
  pitchCircle: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'transparent' },
  pitchBox:    { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'transparent' },

  slot: {
    position: 'absolute',
    width: SLOT_SIZE, height: SLOT_SIZE, borderRadius: SLOT_SIZE / 2,
    justifyContent: 'center', alignItems: 'center', borderWidth: 2.5,
  },
  slotEmpty:    { backgroundColor: 'rgba(0,0,0,0.55)' },
  slotSelected: { borderColor: '#fbbf24', borderWidth: 3.5, elevation: 8 },

  slotInitial: {
    color: '#fff', fontSize: 22, fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  slotLabel: {
    color: '#fff', fontSize: 11, fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  slotNameLabel: {
    color: '#fff', fontSize: 9, fontWeight: '700', textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.95)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
    width: SLOT_SIZE + 16,
  },

  countRow: {
    flexDirection: 'row', gap: 6, alignItems: 'center',
    marginTop: 6, marginBottom: 4, flexWrap: 'wrap',
    justifyContent: 'center', paddingHorizontal: 16,
  },
  countText: { color: '#64748b', fontSize: 11 },
  countSep:  { color: '#334155', fontSize: 11 },
  hint:      { color: '#334155', fontSize: 10 },

  section:      { marginTop: 8, marginBottom: 12 },
  sectionTitle: { color: '#475569', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  benchRow:     { flexDirection: 'row', gap: 8, marginBottom: 8 },
  benchCardFlex: { flex: 1, height: 72 },
  benchCard: {
    height: 72, borderRadius: 10,
    backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155',
    justifyContent: 'center', alignItems: 'center', padding: 4,
  },
  benchCardSelected: { borderColor: '#fbbf24', borderWidth: 2 },
  benchOverall:  { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  benchName:     { color: '#fff', fontSize: 9, textAlign: 'center', maxWidth: 62 },
  benchPos:      { color: '#94a3b8', fontSize: 8, marginTop: 1 },
  benchEmptyIcon:  { color: '#334155', fontSize: 20, lineHeight: 24 },
  benchEmptyLabel: { color: '#475569', fontSize: 9, textAlign: 'center' },

  pendingBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1e3a5f', borderLeftWidth: 4, borderLeftColor: '#3b82f6',
    paddingHorizontal: 14, paddingVertical: 10,
  },
  moveBanner: { backgroundColor: '#451a03', borderLeftColor: '#fbbf24' },
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
  sheet:   { backgroundColor: '#1e293b', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  title:   { color: '#f1f5f9', fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  label:   { color: '#94a3b8', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: {
    backgroundColor: '#0f172a', borderRadius: 10, paddingHorizontal: 14,
    height: 44, color: '#f1f5f9', fontSize: 15, borderWidth: 1, borderColor: '#475569',
  },
  teamChip:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155' },
  teamChipActive:   { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  teamChipText:     { color: '#94a3b8', fontWeight: '600', fontSize: 13 },
  teamChipTextActive: { color: '#fff' },
  toggleNew:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  toggleNewText:    { color: '#94a3b8', fontSize: 13 },
  actions:          { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn:        { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#0f172a', alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  cancelText:       { color: '#94a3b8', fontWeight: '600' },
  saveBtn:          { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#16a34a', alignItems: 'center' },
  saveText:         { color: '#fff', fontWeight: '700' },
});
