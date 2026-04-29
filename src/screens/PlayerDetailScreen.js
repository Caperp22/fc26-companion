import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { POSITION_BG, POSITION_ES, POSITION_FULL_ES } from '../constants/positions';
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
  const [imgError, setImgError] = useState(false);

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
        <TouchableOpacity style={styles.actionBtn} onPress={handleAddToBoard} activeOpacity={0.8}>
          <Text style={styles.actionBtnText}>Añadir a la Pizarra</Text>
        </TouchableOpacity>
      )}
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

  actionBtn: {
    backgroundColor: '#1d4ed8', paddingVertical: 15,
    borderRadius: 14, alignItems: 'center', marginTop: 4,
  },
  actionBtnFichar: { backgroundColor: '#16a34a' },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

const statBar = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginVertical: 5, gap: 8 },
  label: { color: '#64748b', fontSize: 12, width: 58 },
  track: { flex: 1, height: 6, backgroundColor: '#0f172a', borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  value: { color: '#94a3b8', fontSize: 13, fontWeight: '700', width: 28, textAlign: 'right' },
});
