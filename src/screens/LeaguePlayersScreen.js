import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getPlayersByFilter } from '../db/database';

const POS_COLORS = {
  GK: '#f59e0b', CB: '#3b82f6', LB: '#3b82f6', RB: '#3b82f6',
  LWB: '#6366f1', RWB: '#6366f1', CDM: '#8b5cf6', CM: '#8b5cf6',
  CAM: '#ec4899', LM: '#22c55e', RM: '#22c55e',
  LW: '#22c55e', RW: '#22c55e', CF: '#ef4444', ST: '#ef4444',
};
const posColor = (pos) => POS_COLORS[pos] ?? '#64748b';

const getOverallColor = (ovr) => {
  if (ovr >= 85) return '#f59e0b';
  if (ovr >= 75) return '#22c55e';
  if (ovr >= 65) return '#3b82f6';
  return '#64748b';
};

const fmtValue = (v) => {
  if (!v || v === 0) return '—';
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `€${Math.round(v / 1_000)}K`;
  return `€${v}`;
};

function PlayerRow({ item }) {
  const [imgError, setImgError] = useState(false);
  const ovBg = getOverallColor(item.overall);
  const showPhoto = !!(item.faceUrl && !imgError);

  return (
    <View style={styles.row}>
      {/* Foto + OVR */}
      <View style={styles.photoWrap}>
        {showPhoto ? (
          <Image
            source={{ uri: item.faceUrl }}
            style={styles.photo}
            contentFit="cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <Text style={[styles.photoInitial, { color: ovBg }]}>
              {item.name?.[0] ?? '?'}
            </Text>
          </View>
        )}
        <View style={[styles.ovrBadge, { backgroundColor: ovBg }]}>
          <Text style={styles.ovrText}>{item.overall}</Text>
        </View>
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        <View style={styles.metaRow}>
          <View style={[styles.posBadge, { backgroundColor: posColor(item.position) + '22', borderColor: posColor(item.position) + '66' }]}>
            <Text style={[styles.posText, { color: posColor(item.position) }]}>{item.position}</Text>
          </View>
          <Text style={styles.meta}>
            {item.age} años  ·  {fmtValue(item.marketValue)}
          </Text>
        </View>
      </View>

      {/* Potencial */}
      <View style={styles.potWrap}>
        <Text style={styles.potLabel}>POT</Text>
        <Text style={[styles.potValue, { color: getOverallColor(item.potential) }]}>
          {item.potential}
        </Text>
      </View>
    </View>
  );
}

export default function LeaguePlayersScreen({ route }) {
  const { type, value } = route.params;
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const filters = type === 'club' ? { club: value } : { nationality: value };
    setPlayers(getPlayersByFilter(filters));
    setLoading(false);
  }, [type, value]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#3b82f6" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>{players.length} jugadores · ordenados por OVR</Text>
      <FlatList
        data={players}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item }) => <PlayerRow item={item} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Sin jugadores encontrados.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },

  subtitle: {
    color: '#64748b', fontSize: 12, fontWeight: '600',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },

  list: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 32 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 4, gap: 12,
  },
  sep: { height: 1, backgroundColor: '#1e293b', marginLeft: 70 },

  photoWrap: { width: 48, height: 48, position: 'relative' },
  photo: { width: 48, height: 48, borderRadius: 24 },
  photoPlaceholder: {
    backgroundColor: '#1e293b',
    justifyContent: 'center', alignItems: 'center',
  },
  photoInitial: { fontSize: 20, fontWeight: '800' },
  ovrBadge: {
    position: 'absolute', bottom: -4, right: -4,
    paddingHorizontal: 5, paddingVertical: 1,
    borderRadius: 6, borderWidth: 1.5, borderColor: '#0f172a',
    minWidth: 24, alignItems: 'center',
  },
  ovrText: { color: '#fff', fontSize: 10, fontWeight: '900' },

  info: { flex: 1 },
  name: { color: '#f1f5f9', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  posBadge: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 5, borderWidth: 1,
  },
  posText: { fontSize: 10, fontWeight: '800' },
  meta: { color: '#64748b', fontSize: 11 },

  potWrap: { alignItems: 'center', minWidth: 38 },
  potLabel: { color: '#475569', fontSize: 9, fontWeight: '700' },
  potValue: { fontSize: 15, fontWeight: '900' },

  empty: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#475569', fontSize: 14 },
});
