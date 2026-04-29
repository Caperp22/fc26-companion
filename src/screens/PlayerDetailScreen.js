import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { POSITION_BG, POSITION_ES, POSITION_FULL_ES } from '../constants/positions';
import {
  addOVRSnapshot,
  addToShortlist,
  deleteOVRSnapshot,
  getOVRHistory,
  isInShortlist,
} from '../db/database';
import { useSquadStore } from '../store/squadStore';

const getOverallBg = (overall) => {
  if (overall >= 85) return '#d97706';
  if (overall >= 75) return '#16a34a';
  return '#4b5563';
};

const STATS = [
  { key: 'pace',      label: 'Ritmo',    color: '#f59e0b' },
  { key: 'shooting',  label: 'Tiro',     color: '#ef4444' },
  { key: 'passing',   label: 'Pase',     color: '#3b82f6' },
  { key: 'dribbling', label: 'Regate',   color: '#8b5cf6' },
  { key: 'defending', label: 'Defensa',  color: '#14b8a6' },
  { key: 'physic',    label: 'Físico',   color: '#f97316' },
];

function StatBar({ label, value, color }) {
  const v = value || 0;
  return (
    <View style={statBar.row}>
      <Text style={statBar.label}>{label}</Text>
      <View style={statBar.track}>
        <View style={[statBar.fill, { width: `${v}%`, backgroundColor: color }]} />
      </View>
      <Text style={[statBar.value, v >= 80 && { color }]}>{v || '—'}</Text>
    </View>
  );
}

function PosBadge({ position }) {
  return (
    <View style={[styles.posBadge, { backgroundColor: POSITION_BG(position) }]}>
      <Text style={styles.posText}>{POSITION_ES[position] || position}</Text>
    </View>
  );
}

export default function PlayerDetailScreen({ route, navigation }) {
  const { player, selectionMode = false, slotId = null, slotLabel = '' } = route.params;
  const { setPendingPlayer, assignPlayer, assignToBench, assignToReserves } = useSquadStore();
  const [imgError, setImgError]         = useState(false);
  const [inShortlist, setInShortlist]   = useState(false);
  const [ovrHistory, setOvrHistory]     = useState([]);
  const [showOvrForm, setShowOvrForm]   = useState(false);
  const [ovrSeason, setOvrSeason]       = useState('');
  const [ovrValue, setOvrValue]         = useState(player.overall?.toString() ?? '');

  useEffect(() => {
    setInShortlist(isInShortlist(player.name));
    setOvrHistory(getOVRHistory(player.name));
  }, [player.name]);

  const handleToggleShortlist = () => {
    if (inShortlist) return;
    const res = addToShortlist(player);
    if (res.ok) {
      setInShortlist(true);
      Alert.alert('Objetivo añadido', `${player.name} se añadió a tus objetivos de fichaje.`);
    } else {
      Alert.alert('Aviso', res.error);
    }
  };

  const handleAddOVR = () => {
    const ovr = parseInt(ovrValue, 10);
    const season = ovrSeason.trim();
    if (!season) { Alert.alert('Error', 'Escribe la temporada (ej: T26).'); return; }
    if (isNaN(ovr) || ovr < 1 || ovr > 99) { Alert.alert('Error', 'OVR debe ser 1-99.'); return; }
    addOVRSnapshot(player.name, ovr, season);
    setOvrHistory(getOVRHistory(player.name));
    setShowOvrForm(false);
    setOvrSeason('');
  };

  const handleDeleteOVR = (id) => {
    Alert.alert('Eliminar entrada', '¿Borrar este registro de OVR?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => {
        deleteOVRSnapshot(id);
        setOvrHistory(getOVRHistory(player.name));
      }},
    ]);
  };

  // Posiciones alternativas: "ST,CF,LW" → ['ST','CF','LW']
  const allPositions = player.positions
    ? player.positions.split(',').map((p) => p.trim()).filter(Boolean)
    : [player.position];

  const primaryPos = allPositions[0] || player.position;
  const altPositions = allPositions.slice(1);

  const ovBg = getOverallBg(player.overall);
  const hasStats = STATS.some((s) => (player[s.key] || 0) > 0);
  const marketM = player.marketValue ? (player.marketValue / 1_000_000).toFixed(1) : null;
  const showPhoto = player.faceUrl && !imgError;

  const handleAddToBoard = () => {
    setPendingPlayer(player);
    navigation.navigate('SquadBuilder');
  };

  const handleFichar = () => {
    if (!slotId) return;
    if (/^B\d+$/.test(slotId)) assignToBench(slotId, player);
    else if (/^R\d+$/.test(slotId)) assignToReserves(slotId, player);
    else assignPlayer(slotId, player);
    navigation.pop(2);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Hero */}
      <View style={styles.hero}>
        {showPhoto ? (
          <Image
            source={{ uri: player.faceUrl }}
            style={styles.faceImage}
            resizeMode="cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <View style={[styles.faceImage, styles.facePlaceholder, { backgroundColor: ovBg }]}>
            <Text style={styles.facePlaceholderText}>{player.name[0]}</Text>
          </View>
        )}

        <View style={styles.heroInfo}>
          <Text style={styles.playerName} numberOfLines={2}>{player.name}</Text>

          {/* Overall + posición principal */}
          <View style={styles.heroMeta}>
            <View style={[styles.ovBadge, { backgroundColor: ovBg }]}>
              <Text style={styles.ovText}>{player.overall}</Text>
            </View>
            <PosBadge position={primaryPos} />
          </View>

          {/* Posiciones alternativas */}
          {altPositions.length > 0 && (
            <View style={styles.altPosRow}>
              {altPositions.map((p) => (
                <PosBadge key={p} position={p} />
              ))}
              <Text style={styles.altPosLabel}>posic. alt.</Text>
            </View>
          )}

          <Text style={styles.posFullText}>{POSITION_FULL_ES[primaryPos] || primaryPos}</Text>
        </View>
      </View>

      {/* Información */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Información</Text>
        <InfoRow label="Edad" value={`${player.age} años`} />
        <InfoRow label="Potencial" value={player.potential} highlight />
        {marketM ? <InfoRow label="Valor" value={`€${marketM}M`} /> : null}
        {player.club ? <InfoRow label="Club" value={player.club} /> : null}
        {player.league ? <InfoRow label="Liga" value={player.league} /> : null}
        {player.nationality ? <InfoRow label="Selección" value={player.nationality} /> : null}
      </View>

      {/* Estadísticas */}
      {hasStats && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Estadísticas</Text>
          {STATS.map((s) => (
            <StatBar key={s.key} label={s.label} value={player[s.key]} color={s.color} />
          ))}
        </View>
      )}

      {/* Acción */}
      {selectionMode ? (
        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnFichar]} onPress={handleFichar} activeOpacity={0.8}>
          <Text style={styles.actionBtnText}>Fichar para {slotLabel}</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.actionBtn, { flex: 1 }]} onPress={handleAddToBoard} activeOpacity={0.8}>
            <Text style={styles.actionBtnText}>Añadir a la Pizarra</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.shortlistBtn, inShortlist && styles.shortlistBtnActive]}
            onPress={handleToggleShortlist}
            activeOpacity={0.8}
          >
            <Ionicons name={inShortlist ? 'star' : 'star-outline'} size={20} color={inShortlist ? '#f59e0b' : '#64748b'} />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Historial OVR ─────────────────────────────────────── */}
      <View style={styles.card}>
        <View style={styles.ovrHistHeader}>
          <Text style={styles.cardTitle}>Progresión OVR</Text>
          <TouchableOpacity style={styles.ovrAddBtn} onPress={() => setShowOvrForm(true)}>
            <Ionicons name="add" size={16} color="#3b82f6" />
            <Text style={styles.ovrAddText}>Registrar</Text>
          </TouchableOpacity>
        </View>
        {ovrHistory.length === 0 ? (
          <Text style={styles.ovrEmpty}>{'Sin registros. Toca "Registrar" después de cada temporada para trackear su evolución.'}</Text>
        ) : (
          <View style={styles.ovrTimeline}>
            {ovrHistory.map((entry, idx) => {
              const prev = ovrHistory[idx - 1];
              const diff = prev ? entry.overall - prev.overall : null;
              return (
                <TouchableOpacity key={entry.id} style={styles.ovrRow} onLongPress={() => handleDeleteOVR(entry.id)} activeOpacity={0.7}>
                  <View style={styles.ovrSeasonBadge}>
                    <Text style={styles.ovrSeasonText}>{entry.season}</Text>
                  </View>
                  <View style={styles.ovrBarWrap}>
                    <View style={[styles.ovrBar, { width: `${entry.overall}%` }]} />
                  </View>
                  <Text style={styles.ovrValText}>{entry.overall}</Text>
                  {diff !== null && (
                    <Text style={[styles.ovrDiff, { color: diff > 0 ? '#22c55e' : diff < 0 ? '#ef4444' : '#64748b' }]}>
                      {diff > 0 ? `+${diff}` : diff}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
            <Text style={styles.ovrHint}>Mantén pulsado para eliminar</Text>
          </View>
        )}
      </View>

      {/* Modal añadir OVR */}
      <Modal visible={showOvrForm} transparent animationType="fade" onRequestClose={() => setShowOvrForm(false)}>
        <View style={styles.ovrOverlay}>
          <View style={styles.ovrModal}>
            <Text style={styles.ovrModalTitle}>Registrar OVR</Text>
            <TextInput
              style={styles.ovrInput}
              placeholder="Temporada (ej: T26)"
              placeholderTextColor="#475569"
              value={ovrSeason}
              onChangeText={setOvrSeason}
              autoFocus
            />
            <TextInput
              style={styles.ovrInput}
              placeholder="OVR actual"
              placeholderTextColor="#475569"
              value={ovrValue}
              onChangeText={setOvrValue}
              keyboardType="numeric"
            />
            <View style={styles.ovrModalBtns}>
              <TouchableOpacity style={styles.ovrCancel} onPress={() => setShowOvrForm(false)}>
                <Text style={styles.ovrCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ovrSave} onPress={handleAddOVR}>
                <Text style={styles.ovrSaveText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function InfoRow({ label, value, highlight }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, highlight && styles.infoValueHighlight]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16, paddingBottom: 40 },

  hero: {
    flexDirection: 'row', backgroundColor: '#1e293b', borderRadius: 16,
    padding: 16, gap: 14, marginBottom: 14,
    borderWidth: 1, borderColor: '#334155', alignItems: 'flex-start',
  },
  faceImage: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#334155' },
  facePlaceholder: { justifyContent: 'center', alignItems: 'center' },
  facePlaceholderText: { color: '#fff', fontSize: 36, fontWeight: 'bold' },

  heroInfo: { flex: 1 },
  playerName: { color: '#f1f5f9', fontSize: 19, fontWeight: 'bold', marginBottom: 8, lineHeight: 24 },
  heroMeta: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  ovBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 },
  ovText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  posBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, justifyContent: 'center' },
  posText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  altPosRow: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 },
  altPosLabel: { color: '#475569', fontSize: 10 },
  posFullText: { color: '#64748b', fontSize: 12 },

  card: {
    backgroundColor: '#1e293b', borderRadius: 14, padding: 16,
    marginBottom: 14, borderWidth: 1, borderColor: '#334155',
  },
  cardTitle: {
    color: '#475569', fontSize: 11, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#0f172a',
  },
  infoLabel: { color: '#64748b', fontSize: 14 },
  infoValue: { color: '#f1f5f9', fontSize: 14, fontWeight: '600' },
  infoValueHighlight: { color: '#34d399' },

  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  actionBtn: {
    backgroundColor: '#1d4ed8', paddingVertical: 15,
    borderRadius: 14, alignItems: 'center',
  },
  actionBtnFichar: { backgroundColor: '#16a34a' },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  shortlistBtn: {
    width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155',
  },
  shortlistBtnActive: { backgroundColor: '#3d2f00', borderColor: '#f59e0b44' },

  // OVR History
  ovrHistHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  ovrAddBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#1e3a5f' },
  ovrAddText:    { color: '#3b82f6', fontSize: 12, fontWeight: '700' },
  ovrEmpty:      { color: '#475569', fontSize: 13, lineHeight: 20 },
  ovrTimeline:   { gap: 8 },
  ovrRow:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ovrSeasonBadge: { backgroundColor: '#0f172a', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, minWidth: 40, alignItems: 'center' },
  ovrSeasonText: { color: '#94a3b8', fontSize: 11, fontWeight: '700' },
  ovrBarWrap:    { flex: 1, height: 6, backgroundColor: '#0f172a', borderRadius: 3, overflow: 'hidden' },
  ovrBar:        { height: '100%', backgroundColor: '#3b82f6', borderRadius: 3 },
  ovrValText:    { color: '#f1f5f9', fontWeight: '800', fontSize: 14, width: 26, textAlign: 'right' },
  ovrDiff:       { fontSize: 11, fontWeight: '700', width: 28, textAlign: 'right' },
  ovrHint:       { color: '#334155', fontSize: 10, textAlign: 'center', marginTop: 4 },
  ovrOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 },
  ovrModal:      { backgroundColor: '#1e293b', borderRadius: 16, padding: 20, gap: 12 },
  ovrModalTitle: { color: '#f1f5f9', fontSize: 16, fontWeight: '700' },
  ovrInput: {
    backgroundColor: '#0f172a', borderRadius: 10, paddingHorizontal: 14, height: 44,
    color: '#f1f5f9', fontSize: 15, borderWidth: 1, borderColor: '#334155',
  },
  ovrModalBtns:  { flexDirection: 'row', gap: 10 },
  ovrCancel:     { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#0f172a', alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  ovrCancelText: { color: '#64748b', fontWeight: '600' },
  ovrSave:       { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#3b82f6', alignItems: 'center' },
  ovrSaveText:   { color: '#fff', fontWeight: '700' },
});

const statBar = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginVertical: 5, gap: 8 },
  label: { color: '#64748b', fontSize: 12, width: 58 },
  track: { flex: 1, height: 6, backgroundColor: '#0f172a', borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  value: { color: '#94a3b8', fontSize: 13, fontWeight: '700', width: 28, textAlign: 'right' },
});
