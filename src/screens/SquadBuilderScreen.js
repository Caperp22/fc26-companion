import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Fragment, useEffect, useMemo, useState } from 'react';
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
    getRoster,
    getTeams,
    saveLineup,
    updateSquadsFromCloud,
} from '../db/database';
import { useSquadStore } from '../store/squadStore';

// ─── Auto-asignación desde plantilla ───────────────────────────
const ADJACENT = {
  GK:[], CB:['LB','RB','CDM'], LB:['CB','LWB','LM'], RB:['CB','RWB','RM'],
  LWB:['LB','LM'], RWB:['RB','RM'], CDM:['CM','CB'], CM:['CDM','CAM','LM','RM'],
  CAM:['CM','CF','LW','RW'], LM:['LW','CM','LB'], RM:['RW','CM','RB'],
  LW:['LM','ST','CAM'], RW:['RM','ST','CAM'], CF:['ST','CAM'], ST:['CF','LW','RW'],
};
const matchScore = (player, targetPos) => {
  const positions = (player.positions || player.position || '').split(',').map(p => p.trim()).filter(Boolean);
  if (positions.includes(targetPos)) return 1.0;
  if ((ADJACENT[targetPos] || []).some(p => positions.includes(p))) return 0.7;
  return 0.45;
};
const autoAssign = (formation, playerPool) => {
  const slots = FORMATIONS[formation]?.slots || [];
  const available = [...playerPool];
  const assignment = {};
  for (const slot of slots) {
    let bestVal = 0, bestIdx = -1;
    available.forEach((p, i) => { const v = matchScore(p, slot.position) * p.overall; if (v > bestVal) { bestVal = v; bestIdx = i; } });
    if (bestIdx >= 0) { assignment[slot.id] = available[bestIdx]; available.splice(bestIdx, 1); }
  }
  return { assignment, remaining: available };
};

// ─── Constantes ────────────────────────────────────────────────
const SLOT_SIZE     = 60;
const FACE_SIZE     = SLOT_SIZE - 6;   // imagen dentro del círculo
const BENCH_SLOTS   = Array.from({ length: 7 }, (_, i) => ({ id: `B${i}`, label: `SUP ${i + 1}` }));
const RESERVE_SLOTS = Array.from({ length: 5 }, (_, i) => ({ id: `R${i}`, label: `RES ${i + 1}` }));

// Orden de formaciones: 3 atrás → 4 atrás → 5 atrás
const FORMATION_ORDER = [
  '3-4-1-2', '3-4-3', '3-5-2',
  '4-3-3', '4-3-3 (A)', '4-3-3 (D)',
  '4-4-2', '4-4-2 ♦', '4-4-1-1',
  '4-2-3-1', '4-2-3-1 (W)',
  '4-5-1', '4-1-4-1', '4-1-2-1-2',
  '4-3-1-2', '4-1-3-2', '4-3-2-1',
  '5-2-2-1', '5-3-2', '5-4-1',
];

const POS_ES = {
  GK: 'PO', LB: 'LI', RB: 'LD', CB: 'DFC',
  LWB: 'CAI', RWB: 'CAD',
  CDM: 'MCD', CM: 'MC', CAM: 'MCO',
  LM: 'MI', RM: 'MD',
  LW: 'EI', RW: 'ED',
  CF: 'SD', ST: 'DC',
};
const posEs = (pos) => POS_ES[pos] || pos;

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

// ─── Mini cancha para el picker ────────────────────────────────
function MiniPitch({ slots }) {
  const W = 72;
  const H = 108;
  return (
    <View style={{ width: W, height: H, backgroundColor: '#166534', borderRadius: 5, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', left: W * 0.08, right: W * 0.08, top: H / 2, height: 0.8, backgroundColor: 'rgba(255,255,255,0.3)' }} />
      {slots.map((slot) => {
        const d = 7;
        const color = getSlotBorderColor(slot.position);
        return (
          <View
            key={slot.id}
            style={{
              position: 'absolute',
              left: slot.x * W - d / 2,
              top: slot.y * H - d / 2,
              width: d, height: d, borderRadius: d / 2,
              backgroundColor: color,
            }}
          />
        );
      })}
    </View>
  );
}

// ─── Modal selector de formación ───────────────────────────────
function FormationPickerModal({ visible, currentFormation, onSelect, onClose }) {
  const orderedFormations = FORMATION_ORDER.filter((k) => FORMATIONS[k]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={fpModal.overlay} activeOpacity={1} onPress={onClose}>
        <View style={fpModal.sheet}>
          <View style={fpModal.header}>
            <Text style={fpModal.title}>Seleccionar formación</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color="#94a3b8" />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={fpModal.grid}>
            {orderedFormations.map((key) => {
              const isActive = key === currentFormation;
              return (
                <TouchableOpacity
                  key={key}
                  style={[fpModal.card, isActive && fpModal.cardActive]}
                  onPress={() => { onClose(); onSelect(key); }}
                  activeOpacity={0.75}
                >
                  <MiniPitch slots={FORMATIONS[key].slots} />
                  <Text style={[fpModal.cardLabel, isActive && fpModal.cardLabelActive]}>{key}</Text>
                  {isActive && (
                    <View style={fpModal.checkBadge}>
                      <Ionicons name="checkmark" size={11} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Foto con badge OVR (reutilizada en RosterPickerModal) ─────
function PlayerFace({ player, size = 46 }) {
  const [err, setErr] = useState(false);
  const bg = getOverallBg(player.overall);
  return (
    <View style={{ width: size, height: size }}>
      {player.faceUrl && !err ? (
        <Image
          source={{ uri: player.faceUrl }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          onError={() => setErr(true)}
        />
      ) : (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: Math.round(size * 0.38), fontWeight: '800' }}>
            {player.name?.[0] ?? '?'}
          </Text>
        </View>
      )}
      <View style={{ position: 'absolute', bottom: -1, right: -2, backgroundColor: bg, borderRadius: 4, paddingHorizontal: 3, borderWidth: 1.5, borderColor: '#0f172a' }}>
        <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900', lineHeight: 13 }}>{player.overall}</Text>
      </View>
    </View>
  );
}

// ─── Modal selector desde plantilla ───────────────────────────
function RosterPickerModal({ visible, slotLabel, slotPosition, players, onSelect, onScouting, onClose }) {
  const { natural, others } = useMemo(() => {
    if (!slotPosition) return { natural: [], others: [...players].sort((a,b) => b.overall - a.overall) };
    const nat = players.filter(p => (p.positions || p.position || '').split(',').map(x=>x.trim()).includes(slotPosition));
    const oth = players.filter(p => !nat.includes(p)).sort((a,b) => b.overall - a.overall);
    return { natural: nat.sort((a,b) => b.overall - a.overall), others: oth };
  }, [players, slotPosition]);

  const renderRow = (p) => (
    <TouchableOpacity key={p.name} style={rpModal.row} onPress={() => onSelect(p)} activeOpacity={0.7}>
      <PlayerFace player={p} size={50} />
      <View style={{ flex: 1 }}>
        <Text style={rpModal.name} numberOfLines={1}>{p.name}</Text>
        <Text style={rpModal.meta}>{p.position}  ·  {p.club || '—'}</Text>
      </View>
      <Ionicons name="add-circle" size={24} color="#3b82f6" />
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={rpModal.overlay}>
        <View style={rpModal.sheet}>
          <View style={rpModal.header}>
            <Text style={rpModal.title}>Elegir para {slotLabel || 'posición'}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color="#64748b" /></TouchableOpacity>
          </View>

          <ScrollView style={rpModal.list} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {natural.length > 0 && <Text style={rpModal.section}>Posición natural</Text>}
            {natural.map(renderRow)}
            {others.length > 0 && natural.length > 0 && <Text style={rpModal.section}>Otros</Text>}
            {others.map(renderRow)}
            {players.length === 0 && <Text style={rpModal.empty}>La plantilla está vacía.</Text>}
          </ScrollView>

          <TouchableOpacity style={rpModal.scoutingBtn} onPress={onScouting}>
            <Ionicons name="search" size={15} color="#94a3b8" />
            <Text style={rpModal.scoutingText}>Buscar en toda la base de datos</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Modal de detalle de jugador ───────────────────────────────
function PlayerDetailModal({ visible, player, onClose }) {
  if (!player) return null;
  const positions = (player.positions || player.position || '').split(',').map(p => p.trim()).filter(Boolean);
  const attrs = [
    { label: 'VEL', value: player.pace },
    { label: 'TIR', value: player.shooting },
    { label: 'PAS', value: player.passing },
    { label: 'REG', value: player.dribbling },
    { label: 'DEF', value: player.defending },
    { label: 'FIS', value: player.physic },
  ].filter(a => a.value > 0);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={pd.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={pd.card} activeOpacity={1} onPress={() => {}}>
          <View style={pd.header}>
            <PlayerFace player={player} size={72} />
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={pd.name}>{player.name}</Text>
              <View style={pd.posRow}>
                {positions.map(pos => (
                  <View key={pos} style={[pd.posBadge, { backgroundColor: getSlotBorderColor(pos) }]}>
                    <Text style={pd.posBadgeText}>{posEs(pos)}</Text>
                  </View>
                ))}
              </View>
              <Text style={pd.meta}>
                {player.age ? `${player.age} años` : ''}
                {player.club ? `  ·  ${player.club}` : ''}
                {player.nationality ? `  ·  ${player.nationality}` : ''}
              </Text>
            </View>
          </View>

          {attrs.length > 0 ? (
            <View style={pd.attrsBox}>
              {attrs.map(({ label, value }) => (
                <View key={label} style={pd.attrRow}>
                  <Text style={pd.attrLabel}>{label}</Text>
                  <View style={pd.attrBar}>
                    <View style={[pd.attrFill, { width: `${value}%`, backgroundColor: getOverallBg(value) }]} />
                  </View>
                  <Text style={[pd.attrVal, { color: getOverallBg(value) }]}>{value}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={pd.ovrOnly}>
              <Text style={[pd.ovrBig, { color: getOverallBg(player.overall) }]}>{player.overall}</Text>
              <Text style={pd.ovrLabel}>OVR</Text>
            </View>
          )}

          <TouchableOpacity style={pd.closeBtn} onPress={onClose}>
            <Text style={pd.closeBtnText}>Cerrar</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const pd = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 24 },
  card:     { backgroundColor: '#1e293b', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#334155' },
  header:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  name:     { color: '#f1f5f9', fontSize: 18, fontWeight: '900', marginBottom: 6 },
  posRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 6 },
  posBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
  posBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  meta:     { color: '#64748b', fontSize: 12 },
  attrsBox: { gap: 8, marginBottom: 16 },
  attrRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  attrLabel:{ color: '#64748b', fontSize: 12, fontWeight: '700', width: 30 },
  attrBar:  { flex: 1, height: 7, backgroundColor: '#0f172a', borderRadius: 4, overflow: 'hidden' },
  attrFill: { height: 7, borderRadius: 4 },
  attrVal:  { fontSize: 13, fontWeight: '800', width: 26, textAlign: 'right' },
  ovrOnly:  { alignItems: 'center', paddingVertical: 16 },
  ovrBig:   { fontSize: 56, fontWeight: '900' },
  ovrLabel: { color: '#64748b', fontSize: 13, fontWeight: '700' },
  closeBtn: { backgroundColor: '#0f172a', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  closeBtnText: { color: '#94a3b8', fontSize: 14, fontWeight: '700' },
});

// ─── Bench / Reserve card ───────────────────────────────────────
function BenchCard({ label, player, pendingPlayer, isSelected, onPress, onLongPress, style }) {
  return (
    <TouchableOpacity
      style={[
        styles.benchCard,
        isSelected && styles.benchCardSelected,
        style,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.75}
    >
      {player ? (
        <>
          <PlayerFace player={player} size={40} />
          <Text style={styles.benchName} numberOfLines={1}>{player.name.split(' ').slice(-1)[0]}</Text>
          <Text style={styles.benchPos}>{posEs(player.position)}</Text>
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

  const [isUpdating, setIsUpdating]           = useState(false);
  const [updateProgress, setUpdateProgress]   = useState('');
  const [showSaveModal, setShowSaveModal]      = useState(false);
  const [showFormationPicker, setShowFormationPicker] = useState(false);
  const [selectedSlot, setSelectedSlot]       = useState(null);
  const [teamLineups, setTeamLineups]         = useState([]);
  const [rosterPlayers, setRosterPlayers]     = useState([]);
  const [rosterPickerSlot, setRosterPickerSlot] = useState(null); // { slotId, slotLabel, slotPosition, type }
  const [detailPlayer, setDetailPlayer]       = useState(null);

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

  // ── Cargar alineaciones y plantilla cuando cambia el equipo ───
  useEffect(() => {
    if (loadedTeamId) {
      setTeamLineups(getLineupsByTeam(loadedTeamId));
      const raw = getRoster(loadedTeamId);
      setRosterPlayers(raw.map(r => { try { return JSON.parse(r.playerData); } catch { return null; } }).filter(Boolean));
    } else {
      setTeamLineups([]);
      setRosterPlayers([]);
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
    } else if (rosterPlayers.length > 0) {
      setRosterPickerSlot({ slotId: slot.id, slotLabel: slot.label, slotPosition: slot.position, type: 'main' });
    } else {
      navigateToScouting(slot.id, slot.label, slot.position);
    }
  };

  const handleSlotLongPress = (slot) => {
    setSelectedSlot(null);
    const player = squad[slot.id];
    if (!player) {
      if (rosterPlayers.length > 0) setRosterPickerSlot({ slotId: slot.id, slotLabel: slot.label, slotPosition: slot.position, type: 'main' });
      else navigateToScouting(slot.id, slot.label, slot.position);
      return;
    }
    Alert.alert(player.name, `GRL ${player.overall}  •  ${player.position}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Ver detalle', onPress: () => setDetailPlayer(player) },
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
    } else if (rosterPlayers.length > 0) {
      setRosterPickerSlot({ slotId, slotLabel: label, slotPosition: null, type });
    } else {
      navigateToScouting(slotId, label, null);
    }
  };

  const handleBenchLongPress = (slotId, label, type) => {
    setSelectedSlot(null);
    const player   = type === 'bench' ? bench[slotId] : reserves[slotId];
    const removeFn = type === 'bench' ? removeFromBench : removeFromReserves;
    if (!player) {
      if (rosterPlayers.length > 0) setRosterPickerSlot({ slotId, slotLabel: label, slotPosition: null, type });
      else navigateToScouting(slotId, label, null);
      return;
    }
    Alert.alert(player.name, `GRL ${player.overall}  •  ${player.position}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Ver detalle', onPress: () => setDetailPlayer(player) },
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

  // ── Auto-asignación desde plantilla ───────────────────────────
  const handleAutoSquad = () => {
    if (!loadedTeamId) { Alert.alert('Sin equipo', 'Carga un equipo desde "Mis Equipos" para usar la plantilla.'); return; }
    if (rosterPlayers.length === 0) { Alert.alert('Plantilla vacía', 'Añade jugadores a la plantilla del equipo primero.'); return; }
    const doAssign = () => {
      const { assignment } = autoAssign(formation, rosterPlayers);
      Object.entries(assignment).forEach(([slotId, player]) => assignPlayer(slotId, player));
    };
    const filled = Object.keys(squad).length;
    if (filled > 0) {
      Alert.alert('Auto-titular', `¿Reemplazar los ${filled} jugadores actuales con la mejor combinación de la plantilla?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: doAssign },
      ]);
    } else {
      doAssign();
    }
  };

  const handleAutoBench = () => {
    if (!loadedTeamId) { Alert.alert('Sin equipo', 'Carga un equipo desde "Mis Equipos" para usar la plantilla.'); return; }
    if (rosterPlayers.length === 0) { Alert.alert('Plantilla vacía', 'Añade jugadores a la plantilla del equipo primero.'); return; }
    const usedNames = new Set(Object.values(squad).filter(Boolean).map(p => p.name));
    const remaining = rosterPlayers.filter(p => !usedNames.has(p.name)).sort((a, b) => b.overall - a.overall);
    if (remaining.length === 0) { Alert.alert('Sin jugadores disponibles', 'Todos los jugadores de la plantilla ya están en el once titular.'); return; }
    BENCH_SLOTS.forEach((slot, i) => { if (remaining[i]) assignToBench(slot.id, remaining[i]); });
  };

  // ── Actualizar BD ───────────────────────────────────────────────
  const runUpdate = async (force = false) => {
    setIsUpdating(true);
    setUpdateProgress('Verificando...');
    const result = await updateSquadsFromCloud((msg) => setUpdateProgress(msg), force);
    setIsUpdating(false);
    setUpdateProgress('');
    if (result.cached) {
      Alert.alert(
        'BD al día',
        `${result.count.toLocaleString()} jugadores · Actualizada ${result.label}.\n\nMantén pulsado "Actualizar BD" para forzar la descarga.`,
      );
    } else {
      Alert.alert(
        result.ok ? 'Base de datos actualizada' : 'Error al actualizar',
        result.ok ? `${result.count.toLocaleString()} jugadores disponibles.` : result.error,
      );
    }
  };

  const handleUpdateSquads      = () => runUpdate(false);
  const handleForceUpdateSquads = () =>
    Alert.alert('Forzar actualización', 'Descargar de nuevo aunque la BD esté al día?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Descargar', onPress: () => runUpdate(true) },
    ]);

  const isSlotSelected = (type, id) => selectedSlot?.type === type && selectedSlot?.id === id;
  const selectedPlayer = selectedSlot
    ? (selectedSlot.type === 'main'     ? squad[selectedSlot.id]
     : selectedSlot.type === 'bench'    ? bench[selectedSlot.id]
     : reserves[selectedSlot.id])
    : null;

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

      {/* ── Selector de formación ──────────────────────────────── */}
      <FormationPickerModal
        visible={showFormationPicker}
        currentFormation={formation}
        onSelect={handleFormationChange}
        onClose={() => setShowFormationPicker(false)}
      />
      <TouchableOpacity style={styles.formationBar} onPress={() => setShowFormationPicker(true)}>
        <Text style={styles.formationBarName}>{formation}</Text>
        <View style={styles.formationBarRight}>
          <Text style={styles.formationBarChange}>Cambiar</Text>
          <Ionicons name="chevron-down" size={15} color="#60a5fa" />
        </View>
      </TouchableOpacity>

      {/* Barra de auto-asignación (solo si hay plantilla cargada) */}
      {rosterPlayers.length > 0 && (
        <View style={styles.autoBar}>
          <TouchableOpacity style={styles.autoBtn} onPress={handleAutoSquad}>
            <Ionicons name="flash" size={14} color="#fff" />
            <Text style={styles.autoBtnText}>Auto-titular</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.autoBtn, styles.autoBtnSecond]} onPress={handleAutoBench}>
            <Ionicons name="people" size={14} color="#7c3aed" />
            <Text style={[styles.autoBtnText, { color: '#a78bfa' }]}>Auto-suplentes</Text>
          </TouchableOpacity>
          <Text style={styles.rosterCount}>{rosterPlayers.length} en plantilla</Text>
        </View>
      )}

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
            const posScore   = player ? matchScore(player, slot.position) : 1.0;
            const warnColor  = posScore < 0.7 ? '#ef4444' : posScore < 1.0 ? '#f59e0b' : null;
            const borderColor = isSelected ? '#fbbf24'
              : warnColor ?? getSlotBorderColor(slot.position);

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

                {/* Badge de advertencia de posición – esquina superior-izquierda */}
                {player && warnColor && (
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: left - 3, top: top - 3,
                      width: 16, height: 16, borderRadius: 8,
                      backgroundColor: warnColor,
                      justifyContent: 'center', alignItems: 'center',
                      borderWidth: 1.5, borderColor: '#0f172a', zIndex: 10,
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900', lineHeight: 16 }}>!</Text>
                  </View>
                )}

                {/* Badge OVR – fuera del slot para no ser clippeado */}
                {player && (
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: left + SLOT_SIZE - 16,
                      top: top + SLOT_SIZE - 16,
                      backgroundColor: getOverallBg(player.overall),
                      borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1,
                      borderWidth: 1.5, borderColor: '#0f172a', zIndex: 10,
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900', lineHeight: 13 }}>
                      {player.overall}
                    </Text>
                  </View>
                )}

                {/* Nombre + posición fuera del slot para que no quede clippeado */}
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
                    <Text style={styles.slotPosLabel}>{slot.label}</Text>
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

      {/* Modal de detalle */}
      <PlayerDetailModal
        visible={!!detailPlayer}
        player={detailPlayer}
        onClose={() => setDetailPlayer(null)}
      />

      {/* Picker de plantilla */}
      <RosterPickerModal
        visible={!!rosterPickerSlot}
        slotLabel={rosterPickerSlot?.slotLabel}
        slotPosition={rosterPickerSlot?.slotPosition}
        players={rosterPlayers}
        onSelect={(player) => {
          const { slotId, type } = rosterPickerSlot;
          if (type === 'main')     assignPlayer(slotId, player);
          else if (type === 'bench')    assignToBench(slotId, player);
          else if (type === 'reserves') assignToReserves(slotId, player);
          setRosterPickerSlot(null);
        }}
        onScouting={() => {
          const { slotId, slotLabel, slotPosition } = rosterPickerSlot;
          setRosterPickerSlot(null);
          navigateToScouting(slotId, slotLabel, slotPosition);
        }}
        onClose={() => setRosterPickerSlot(null)}
      />

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        {isUpdating ? (
          <View style={styles.progressRow}>
            <ActivityIndicator color="#60a5fa" size="small" />
            <Text style={styles.progressText}>{updateProgress}</Text>
          </View>
        ) : (
          <View style={styles.bottomActions}>
            <TouchableOpacity style={styles.updateButton} onPress={handleUpdateSquads} onLongPress={handleForceUpdateSquads}>
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

  formationBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#0f172a', paddingHorizontal: 16, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },
  formationBarName:   { color: '#f1f5f9', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  formationBarRight:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  formationBarChange: { color: '#60a5fa', fontSize: 13, fontWeight: '600' },

  autoBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#0f172a', borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },
  autoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#7c3aed', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
  },
  autoBtnSecond: { backgroundColor: '#1e1b4b', borderWidth: 1, borderColor: '#4c1d95' },
  autoBtnText:   { color: '#fff', fontSize: 12, fontWeight: '700' },
  rosterCount:   { color: '#475569', fontSize: 11, marginLeft: 'auto' },

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
  benchCardFlex: { flex: 1, height: 90 },
  benchCard: {
    height: 90, borderRadius: 10,
    backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155',
    justifyContent: 'center', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4,
  },
  benchCardSelected: { borderColor: '#fbbf24', borderWidth: 2 },
  benchName:     { color: '#f1f5f9', fontSize: 9, textAlign: 'center', maxWidth: 68, marginTop: 4 },
  benchPos:      { color: '#64748b', fontSize: 8, marginTop: 1 },
  benchEmptyIcon:  { color: '#334155', fontSize: 20, lineHeight: 24 },
  benchEmptyLabel: { color: '#475569', fontSize: 9, textAlign: 'center' },

  slotPosLabel: {
    color: '#e2e8f0', fontSize: 8, fontWeight: '700', textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.95)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
    marginTop: 1,
  },

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

const fpModal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  sheet:   { backgroundColor: '#1e293b', borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '82%', paddingBottom: 28 },
  header:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  title:   { color: '#f1f5f9', fontSize: 17, fontWeight: 'bold' },
  grid:    { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 10, justifyContent: 'space-between' },
  card: {
    width: '47%', backgroundColor: '#0f172a', borderRadius: 14, paddingVertical: 12,
    alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: '#334155',
  },
  cardActive:      { borderColor: '#3b82f6', backgroundColor: '#0f2d5f' },
  cardLabel:       { color: '#94a3b8', fontWeight: '700', fontSize: 13 },
  cardLabelActive: { color: '#60a5fa' },
  checkBadge: {
    position: 'absolute', top: 8, right: 8,
    width: 18, height: 18, borderRadius: 9, backgroundColor: '#3b82f6',
    justifyContent: 'center', alignItems: 'center',
  },
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

const rpModal = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: '#1e293b', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '78%', paddingBottom: 8 },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#334155' },
  title:       { color: '#f1f5f9', fontSize: 16, fontWeight: '700' },
  list:        { paddingHorizontal: 14 },
  section:     { color: '#475569', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 4 },
  row:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#0f172a' },
  ovrBadge:    { width: 38, height: 38, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  ovrText:     { color: '#fff', fontWeight: '800', fontSize: 14 },
  name:        { color: '#f1f5f9', fontSize: 14, fontWeight: '600' },
  meta:        { color: '#64748b', fontSize: 11, marginTop: 1 },
  empty:       { color: '#475569', fontSize: 13, textAlign: 'center', paddingVertical: 24 },
  scoutingBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 14, padding: 12, borderRadius: 10, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155' },
  scoutingText:{ color: '#64748b', fontSize: 13, fontWeight: '600' },
});
