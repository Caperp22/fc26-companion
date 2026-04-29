import { useEffect, useState } from 'react';
import {
    Alert,
    FlatList,
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { ALL_POSITIONS, POSITION_ES } from '../constants/positions';
import { addCustomPlayer, searchPlayersWithFilters } from '../db/database';


const getOverallColor = (overall) => {
  if (overall >= 85) return '#d97706';
  if (overall >= 75) return '#16a34a';
  return '#4b5563';
};

const getPositionBg = (position) => {
  if (position === 'GK') return '#b45309';
  if (['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(position)) return '#1d4ed8';
  if (['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(position)) return '#6d28d9';
  return '#b91c1c';
};

// ---- Tarjeta de jugador con foto ----------------------------------------

function PlayerCard({ item, onPress, selectionMode }) {
  const [imgError, setImgError] = useState(false);
  const showPhoto = !!(item.faceUrl && !imgError);
  const ovBg = getOverallColor(item.overall);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      {/* Foto o placeholder con initial */}
      <View style={styles.photoWrapper}>
        {showPhoto ? (
          <Image
            source={{ uri: item.faceUrl }}
            style={styles.playerFace}
            onError={() => setImgError(true)}
          />
        ) : (
          <View style={[styles.playerFace, styles.playerFacePlaceholder, { backgroundColor: ovBg }]}>
            <Text style={styles.playerFaceInitial}>{item.name?.[0] ?? '?'}</Text>
          </View>
        )}
        {/* Overall en esquina inferior */}
        <View style={[styles.ovrTag, { backgroundColor: ovBg }]}>
          <Text style={styles.ovrTagText}>{item.overall}</Text>
        </View>
      </View>

      {/* Info */}
      <View style={styles.cardInfo}>
        <Text style={styles.playerName} numberOfLines={1}>{item.name}</Text>
        <View style={styles.cardMeta}>
          <View style={[styles.positionBadge, { backgroundColor: getPositionBg(item.position) }]}>
            <Text style={styles.positionText}>{POSITION_ES[item.position] || item.position}</Text>
          </View>
          {item.club ? <Text style={styles.metaText} numberOfLines={1}>{item.club}</Text> : null}
          {item.age ? <Text style={styles.metaText}>{item.age} a</Text> : null}
          <Text style={styles.potText}>POT {item.potential}</Text>
        </View>
        {item.nationality ? <Text style={styles.nationalityText}>{item.nationality}</Text> : null}
      </View>

      {/* Acción */}
      {selectionMode ? (
        <View style={styles.fichajeBadge}><Text style={styles.fichajeText}>FICHAR</Text></View>
      ) : (
        <Text style={styles.arrowIcon}>›</Text>
      )}
    </TouchableOpacity>
  );
}

// ---- Modal añadir jugador manual ----------------------------------------

function AddPlayerModal({ visible, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [position, setPosition] = useState('ST');
  const [overall, setOverall] = useState('');
  const [potential, setPotential] = useState('');
  const [age, setAge] = useState('');
  const [club, setClub] = useState('');
  const [nationality, setNationality] = useState('');

  const reset = () => {
    setName(''); setPosition('ST'); setOverall('');
    setPotential(''); setAge(''); setClub(''); setNationality('');
  };

  const handleSave = () => {
    if (!name.trim()) { Alert.alert('Error', 'El nombre es obligatorio.'); return; }
    const ov = parseInt(overall, 10);
    if (!ov || ov < 1 || ov > 99) { Alert.alert('Error', 'GRL debe ser entre 1 y 99.'); return; }
    const result = addCustomPlayer({
      name: name.trim(),
      position,
      overall: ov,
      potential: parseInt(potential, 10) || ov,
      age: parseInt(age, 10) || 25,
      club: club.trim(),
      nationality: nationality.trim(),
    });
    if (result.ok) {
      onSaved();
      reset();
      onClose();
    } else {
      Alert.alert('Error', result.error || 'No se pudo guardar el jugador.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={modal.overlay}>
        <View style={modal.sheet}>
          <Text style={modal.title}>Agregar jugador</Text>

          <Text style={modal.label}>Nombre *</Text>
          <TextInput style={modal.input} value={name} onChangeText={setName}
            placeholder="Nombre del jugador" placeholderTextColor="#64748b" />

          <Text style={modal.label}>Posición</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={modal.posRow}>
            {ALL_POSITIONS.map((pos) => (
              <TouchableOpacity
                key={pos}
                style={[modal.posChip, position === pos && modal.posChipActive]}
                onPress={() => setPosition(pos)}
              >
                <Text style={[modal.posChipText, position === pos && modal.posChipTextActive]}>
                  {POSITION_ES[pos] || pos}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={modal.row}>
            <View style={modal.halfField}>
              <Text style={modal.label}>GRL *</Text>
              <TextInput style={modal.input} value={overall} onChangeText={setOverall}
                keyboardType="numeric" maxLength={2} placeholder="85" placeholderTextColor="#64748b" />
            </View>
            <View style={modal.halfField}>
              <Text style={modal.label}>Potencial</Text>
              <TextInput style={modal.input} value={potential} onChangeText={setPotential}
                keyboardType="numeric" maxLength={2} placeholder="90" placeholderTextColor="#64748b" />
            </View>
            <View style={modal.halfField}>
              <Text style={modal.label}>Edad</Text>
              <TextInput style={modal.input} value={age} onChangeText={setAge}
                keyboardType="numeric" maxLength={2} placeholder="25" placeholderTextColor="#64748b" />
            </View>
          </View>

          <Text style={modal.label}>Club</Text>
          <TextInput style={modal.input} value={club} onChangeText={setClub}
            placeholder="Real Madrid" placeholderTextColor="#64748b" />

          <Text style={modal.label}>Selección</Text>
          <TextInput style={modal.input} value={nationality} onChangeText={setNationality}
            placeholder="Colombia" placeholderTextColor="#64748b" />

          <View style={modal.actions}>
            <TouchableOpacity style={modal.cancelBtn} onPress={() => { reset(); onClose(); }}>
              <Text style={modal.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={modal.saveBtn} onPress={handleSave}>
              <Text style={modal.saveText}>Guardar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---- Main screen --------------------------------------------------------

export default function ScoutingScreen({ route, navigation }) {
  const { selectionMode = false, slotId = null, slotLabel = '', slotPosition = null } =
    route.params || {};



  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPosition, setSelectedPosition] = useState(slotPosition || null);
  const [minOverall, setMinOverall] = useState('');
  const [minPotential, setMinPotential] = useState('');
  const [clubFilter, setClubFilter] = useState('');
  const [leagueFilter, setLeagueFilter] = useState('');
  const [nationalityFilter, setNationalityFilter] = useState('');
  const [players, setPlayers] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    const filtersActive =
      searchQuery.length > 2 ||
      !!selectedPosition ||
      minOverall !== '' ||
      minPotential !== '' ||
      clubFilter.length > 1 ||
      leagueFilter.length > 1 ||
      nationalityFilter.length > 1;

    if (filtersActive) {
      const results = searchPlayersWithFilters({
        searchTerm: searchQuery,
        position: selectedPosition,
        minOverall: minOverall ? parseInt(minOverall, 10) : 0,
        minPotential: minPotential ? parseInt(minPotential, 10) : 0,
        club: clubFilter,
        league: leagueFilter,
        nationality: nationalityFilter,
      });
      setPlayers(results);
    } else {
      setPlayers([]);
    }
  }, [searchQuery, selectedPosition, minOverall, minPotential, clubFilter, leagueFilter, nationalityFilter]);

  const handleCardPress = (player) => {
    navigation.navigate('PlayerDetail', {
      player,
      selectionMode,
      slotId,
      slotLabel,
    });
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedPosition(slotPosition || null);
    setMinOverall('');
    setMinPotential('');
    setClubFilter('');
    setLeagueFilter('');
    setNationalityFilter('');
  };

  const hasFilters =
    searchQuery.length > 2 || !!selectedPosition || minOverall !== '' || minPotential !== '' ||
    clubFilter.length > 1 || leagueFilter.length > 1 || nationalityFilter.length > 1;

  const renderPlayerCard = ({ item }) => (
    <PlayerCard item={item} onPress={() => handleCardPress(item)} selectionMode={selectionMode} />
  );

  return (
    <View style={styles.container}>
      <AddPlayerModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSaved={() => {
          // Refrescar resultados si hay filtros activos
          if (hasFilters) {
            const results = searchPlayersWithFilters({
              searchTerm: searchQuery,
              position: selectedPosition,
              minOverall: minOverall ? parseInt(minOverall, 10) : 0,
              minPotential: minPotential ? parseInt(minPotential, 10) : 0,
              club: clubFilter,
              league: leagueFilter,
              nationality: nationalityFilter,
            });
            setPlayers(results);
          }
        }}
      />

      {selectionMode && (
        <View style={styles.selectionBanner}>
          <Text style={styles.selectionBannerText}>
            Seleccionando para:{' '}
            <Text style={styles.slotLabelHighlight}>{slotLabel}</Text>
          </Text>
        </View>
      )}

      {/* Búsqueda por nombre */}
      <View style={styles.searchSection}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nombre..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#94a3b8"
          autoCorrect={false}
        />
      </View>

      {/* Chips de posición en español */}
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
          <Text style={[styles.posChipText, !selectedPosition && styles.posChipTextActive]}>Todos</Text>
        </TouchableOpacity>
        {ALL_POSITIONS.map((pos) => (
          <TouchableOpacity
            key={pos}
            style={[styles.posChip, selectedPosition === pos && styles.posChipActive]}
            onPress={() => setSelectedPosition(selectedPosition === pos ? null : pos)}
          >
            <Text style={[styles.posChipText, selectedPosition === pos && styles.posChipTextActive]}>
              {POSITION_ES[pos] || pos}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Filtros numéricos */}
      <View style={styles.rangeRow}>
        <View style={styles.rangeField}>
          <Text style={styles.rangeLabel}>GRL min</Text>
          <TextInput style={styles.rangeInput} placeholder="60" value={minOverall}
            onChangeText={setMinOverall} keyboardType="numeric" maxLength={2}
            placeholderTextColor="#94a3b8" />
        </View>
        <View style={styles.rangeField}>
          <Text style={styles.rangeLabel}>POT min</Text>
          <TextInput style={styles.rangeInput} placeholder="75" value={minPotential}
            onChangeText={setMinPotential} keyboardType="numeric" maxLength={2}
            placeholderTextColor="#94a3b8" />
        </View>
        <TouchableOpacity style={styles.clearBtn} onPress={handleClearFilters}>
          <Text style={styles.clearBtnText}>Limpiar</Text>
        </TouchableOpacity>
      </View>

      {/* Filtros textuales: club / liga / selección */}
      <View style={styles.textFiltersRow}>
        <TextInput style={styles.textFilterInput} placeholder="Club..."
          value={clubFilter} onChangeText={setClubFilter}
          placeholderTextColor="#94a3b8" autoCorrect={false} />
        <TextInput style={styles.textFilterInput} placeholder="Liga..."
          value={leagueFilter} onChangeText={setLeagueFilter}
          placeholderTextColor="#94a3b8" autoCorrect={false} />
        <TextInput style={styles.textFilterInput} placeholder="Selección..."
          value={nationalityFilter} onChangeText={setNationalityFilter}
          placeholderTextColor="#94a3b8" autoCorrect={false} />
      </View>

      {/* Lista de jugadores */}
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
            <TouchableOpacity style={styles.addManualBtn} onPress={() => setShowAddModal(true)}>
              <Text style={styles.addManualBtnText}>+ Añadir jugador manualmente</Text>
            </TouchableOpacity>
          </View>
        }
        ListFooterComponent={
          players.length > 0 ? (
            <TouchableOpacity style={styles.addManualBtnFooter} onPress={() => setShowAddModal(true)}>
              <Text style={styles.addManualBtnText}>+ Añadir jugador manualmente</Text>
            </TouchableOpacity>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },

  selectionBanner: {
    backgroundColor: '#1e3a8a',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  selectionBannerText: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  slotLabelHighlight: { color: '#fff', fontWeight: 'bold' },

  searchSection: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  searchInput: {
    height: 44,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#334155',
  },

  positionScroll: { maxHeight: 46, flexGrow: 0, flexShrink: 0, backgroundColor: '#1e293b' },
  positionContainer: { paddingHorizontal: 12, paddingVertical: 7, gap: 7, alignItems: 'center' },
  posChip: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
    backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#475569',
  },
  posChipActive: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  posChipText: { fontSize: 12, fontWeight: '700', color: '#cbd5e1' },
  posChipTextActive: { color: '#fff' },

  rangeRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1e293b', paddingHorizontal: 14, paddingVertical: 10,
    gap: 10, borderBottomWidth: 1, borderBottomColor: '#334155',
  },
  rangeField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  rangeLabel: { fontSize: 12, color: '#94a3b8', fontWeight: '700' },
  rangeInput: {
    flex: 1, height: 36, backgroundColor: '#0f172a', borderRadius: 8,
    paddingHorizontal: 10, fontSize: 14, color: '#f1f5f9',
    borderWidth: 1, borderColor: '#475569',
  },
  clearBtn: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#450a0a', borderRadius: 8 },
  clearBtnText: { fontSize: 12, color: '#fca5a5', fontWeight: '700' },

  textFiltersRow: {
    flexDirection: 'row', gap: 8,
    backgroundColor: '#1e293b', paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#334155',
  },
  textFilterInput: {
    flex: 1, height: 36, backgroundColor: '#0f172a', borderRadius: 8,
    paddingHorizontal: 10, fontSize: 13, color: '#f1f5f9',
    borderWidth: 1, borderColor: '#475569',
  },

  listContainer: { padding: 12, gap: 10 },

  card: {
    backgroundColor: '#1e293b', borderRadius: 12, padding: 12,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: '#334155',
  },
  photoWrapper: { position: 'relative', width: 52, height: 52, flexShrink: 0 },
  playerFace: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#334155' },
  playerFacePlaceholder: { justifyContent: 'center', alignItems: 'center' },
  playerFaceInitial: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  ovrTag: {
    position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -14 }],
    width: 28, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center',
  },
  ovrTagText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  overallBadge: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
  overallText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  cardInfo: { flex: 1 },
  playerName: { fontSize: 15, fontWeight: '700', color: '#f1f5f9', marginBottom: 4 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  positionBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  positionText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  metaText: { fontSize: 11, color: '#94a3b8', maxWidth: 90 },
  potText: { fontSize: 11, color: '#34d399', fontWeight: '600' },
  nationalityText: { fontSize: 10, color: '#94a3b8', marginTop: 2 },
  arrowIcon: { fontSize: 24, color: '#64748b' },
  fichajeBadge: { backgroundColor: '#1d4ed8', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  fichajeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  emptyContainer: { alignItems: 'center', marginTop: 60, paddingHorizontal: 30 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { textAlign: 'center', fontSize: 15, color: '#475569', lineHeight: 22, marginBottom: 24 },

  addManualBtn: {
    backgroundColor: '#1e3a8a', paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1, borderColor: '#1d4ed8',
  },
  addManualBtnFooter: {
    marginHorizontal: 12, marginTop: 8, marginBottom: 16,
    backgroundColor: '#1e293b', paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1, borderColor: '#334155', alignItems: 'center',
  },
  addManualBtnText: { color: '#60a5fa', fontSize: 14, fontWeight: '600' },
});

const modal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1e293b', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
  },
  title: { color: '#f1f5f9', fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  label: { color: '#94a3b8', fontSize: 12, fontWeight: '600', marginTop: 10, marginBottom: 4 },
  input: {
    backgroundColor: '#0f172a', borderRadius: 10, paddingHorizontal: 12,
    height: 42, color: '#f1f5f9', fontSize: 14, borderWidth: 1, borderColor: '#334155',
  },
  row: { flexDirection: 'row', gap: 10, marginTop: 4 },
  halfField: { flex: 1 },
  posRow: { gap: 6, paddingVertical: 4 },
  posChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
    backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155',
  },
  posChipActive: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  posChipText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  posChipTextActive: { color: '#fff' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    backgroundColor: '#0f172a', alignItems: 'center',
    borderWidth: 1, borderColor: '#334155',
  },
  cancelText: { color: '#94a3b8', fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#1d4ed8', alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '700' },
});
