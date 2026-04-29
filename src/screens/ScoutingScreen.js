import { useEffect, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { searchPlayersWithFilters } from '../db/database';
import { useSquadStore } from '../store/squadStore';

const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST'];

const getOverallColor = (overall) => {
  if (overall >= 85) return '#d4a017';
  if (overall >= 75) return '#28a745';
  if (overall >= 65) return '#555';
  return '#999';
};

const getPositionBg = (position) => {
  if (position === 'GK') return '#e08800';
  if (['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(position)) return '#2563eb';
  if (['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(position)) return '#7c3aed';
  return '#dc2626';
};

export default function ScoutingScreen({ route, navigation }) {
  const { selectionMode = false, slotId = null, slotLabel = '', slotPosition = null } =
    route.params || {};

  const assignPlayer = useSquadStore((state) => state.assignPlayer);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPosition, setSelectedPosition] = useState(slotPosition || null);
  const [minOverall, setMinOverall] = useState('');
  const [minPotential, setMinPotential] = useState('');
  const [players, setPlayers] = useState([]);

  const hasFilters =
    searchQuery.length > 2 ||
    !!selectedPosition ||
    minOverall !== '' ||
    minPotential !== '';

  useEffect(() => {
    const filtersActive =
      searchQuery.length > 2 ||
      !!selectedPosition ||
      minOverall !== '' ||
      minPotential !== '';

    if (filtersActive) {
      const results = searchPlayersWithFilters({
        searchTerm: searchQuery,
        position: selectedPosition,
        minOverall: minOverall ? parseInt(minOverall, 10) : null,
        minPotential: minPotential ? parseInt(minPotential, 10) : null,
      });
      setPlayers(results);
    } else {
      setPlayers([]);
    }
  }, [searchQuery, selectedPosition, minOverall, minPotential]);

  const handleCardPress = (player) => {
    if (selectionMode && slotId) {
      assignPlayer(slotId, player);
      navigation.goBack();
    } else {
      navigation.navigate('PlayerDetail', { player });
    }
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedPosition(slotPosition || null);
    setMinOverall('');
    setMinPotential('');
  };

  const renderPlayerCard = ({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => handleCardPress(item)} activeOpacity={0.75}>
      <View style={[styles.overallBadge, { backgroundColor: getOverallColor(item.overall) }]}>
        <Text style={styles.overallText}>{item.overall}</Text>
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.playerName} numberOfLines={1}>{item.name}</Text>
        <View style={styles.cardMeta}>
          <View style={[styles.positionBadge, { backgroundColor: getPositionBg(item.position) }]}>
            <Text style={styles.positionText}>{item.position}</Text>
          </View>
          <Text style={styles.metaText}>{item.age} años</Text>
          <Text style={styles.potText}>POT {item.potential}</Text>
        </View>
      </View>
      {selectionMode ? (
        <View style={styles.fichajeBadge}>
          <Text style={styles.fichajeText}>FICHAR</Text>
        </View>
      ) : (
        <Text style={styles.arrowIcon}>›</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {selectionMode && (
        <View style={styles.selectionBanner}>
          <Text style={styles.selectionBannerText}>
            Seleccionando jugador para:{' '}
            <Text style={styles.slotLabelHighlight}>{slotLabel}</Text>
          </Text>
        </View>
      )}

      <View style={styles.searchSection}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nombre..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#aaa"
          autoCorrect={false}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.positionScroll}
        contentContainerStyle={styles.positionContainer}
      >
        <TouchableOpacity
          style={[styles.posChip, !selectedPosition && styles.posChipActive]}
          onPress={() => setSelectedPosition(null)}
        >
          <Text style={[styles.posChipText, !selectedPosition && styles.posChipTextActive]}>
            Todos
          </Text>
        </TouchableOpacity>
        {POSITIONS.map((pos) => (
          <TouchableOpacity
            key={pos}
            style={[styles.posChip, selectedPosition === pos && styles.posChipActive]}
            onPress={() => setSelectedPosition(selectedPosition === pos ? null : pos)}
          >
            <Text style={[styles.posChipText, selectedPosition === pos && styles.posChipTextActive]}>
              {pos}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.rangeRow}>
        <View style={styles.rangeField}>
          <Text style={styles.rangeLabel}>GRL mín.</Text>
          <TextInput
            style={styles.rangeInput}
            placeholder="60"
            value={minOverall}
            onChangeText={setMinOverall}
            keyboardType="numeric"
            maxLength={2}
            placeholderTextColor="#ccc"
          />
        </View>
        <View style={styles.rangeField}>
          <Text style={styles.rangeLabel}>POT mín.</Text>
          <TextInput
            style={styles.rangeInput}
            placeholder="75"
            value={minPotential}
            onChangeText={setMinPotential}
            keyboardType="numeric"
            maxLength={2}
            placeholderTextColor="#ccc"
          />
        </View>
        <TouchableOpacity style={styles.clearBtn} onPress={handleClearFilters}>
          <Text style={styles.clearBtnText}>Limpiar</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={players}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderPlayerCard}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>{hasFilters ? '🔍' : '⚽'}</Text>
            <Text style={styles.emptyText}>
              {hasFilters
                ? 'Ningún jugador coincide con los filtros.'
                : 'Usa el buscador o los filtros\npara explorar la base de datos.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f8' },

  selectionBanner: {
    backgroundColor: '#1a56db',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  selectionBannerText: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  slotLabelHighlight: { color: '#fff', fontWeight: 'bold' },

  searchSection: {
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  searchInput: {
    height: 44,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#111',
  },

  positionScroll: { maxHeight: 46, flexGrow: 0, backgroundColor: '#fff' },
  positionContainer: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 7,
    alignItems: 'center',
  },
  posChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  posChipActive: { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  posChipText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  posChipTextActive: { color: '#fff' },

  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  rangeField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  rangeLabel: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  rangeInput: {
    flex: 1,
    height: 34,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    color: '#111',
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
  },
  clearBtnText: { fontSize: 12, color: '#dc2626', fontWeight: '600' },

  listContainer: { padding: 12, gap: 10 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  overallBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overallText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  cardInfo: { flex: 1 },
  playerName: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 5 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  positionBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  positionText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  metaText: { fontSize: 12, color: '#6b7280' },
  potText: { fontSize: 12, color: '#059669', fontWeight: '600' },
  arrowIcon: { fontSize: 24, color: '#d1d5db', fontWeight: '300' },
  fichajeBadge: {
    backgroundColor: '#1a56db',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  fichajeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  emptyContainer: { alignItems: 'center', marginTop: 60, paddingHorizontal: 30 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { textAlign: 'center', fontSize: 15, color: '#9ca3af', lineHeight: 22 },
});
