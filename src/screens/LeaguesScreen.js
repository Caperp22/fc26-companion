import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getDistinctClubs, getDistinctNationalities } from '../db/database';

const TABS = [
  { label: 'Clubes', icon: 'shield-outline', key: 'club' },
  { label: 'Selecciones', icon: 'flag-outline', key: 'nationality' },
];

export default function LeaguesScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState(0);
  const [search, setSearch] = useState('');
  const [clubs, setClubs] = useState([]);
  const [nationalities, setNationalities] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = () => {
    setClubs(getDistinctClubs());
    setNationalities(getDistinctNationalities());
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', reload);
    return unsub;
  }, [navigation]);

  const rawData = activeTab === 0 ? clubs : nationalities;
  const keyField = TABS[activeTab].key;

  const filtered = search.trim()
    ? rawData.filter(item =>
        item[keyField]?.toLowerCase().includes(search.trim().toLowerCase())
      )
    : rawData;

  const handlePress = (item) => {
    navigation.navigate('LeaguePlayers', {
      type: keyField,
      value: item[keyField],
      title: item[keyField],
    });
  };

  const isEmpty = clubs.length === 0 && nationalities.length === 0;

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabRow}>
        {TABS.map((t, i) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, activeTab === i && styles.tabActive]}
            onPress={() => { setActiveTab(i); setSearch(''); }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={t.icon}
              size={15}
              color={activeTab === i ? '#fff' : '#64748b'}
              style={{ marginRight: 5 }}
            />
            <Text style={[styles.tabText, activeTab === i && styles.tabTextActive]}>
              {t.label}
            </Text>
            <Text style={[styles.tabCount, activeTab === i && styles.tabCountActive]}>
              {activeTab === i ? filtered.length : (i === 0 ? clubs.length : nationalities.length)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Buscador */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={15} color="#64748b" />
        <TextInput
          style={styles.searchInput}
          placeholder={`Buscar ${TABS[activeTab].label.toLowerCase()}...`}
          placeholderTextColor="#475569"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color="#475569" />
          </TouchableOpacity>
        )}
      </View>

      {/* Contenido */}
      {loading ? (
        <ActivityIndicator color="#3b82f6" size="large" style={{ marginTop: 60 }} />
      ) : isEmpty ? (
        <View style={styles.empty}>
          <Ionicons name="cloud-download-outline" size={56} color="#334155" />
          <Text style={styles.emptyTitle}>Sin datos de jugadores</Text>
          <Text style={styles.emptyText}>
            Ve a la Pizarra → menú ⋮ → Actualizar BD para importar la base de datos de jugadores.
          </Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="search-outline" size={48} color="#334155" />
          <Text style={styles.emptyTitle}>Sin resultados</Text>
          <Text style={styles.emptyText}>Prueba con otro término de búsqueda.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item, idx) => `${activeTab}-${idx}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.item}
              onPress={() => handlePress(item)}
              activeOpacity={0.7}
            >
              <View style={styles.itemLeft}>
                <View style={styles.iconWrap}>
                  <Ionicons name={TABS[activeTab].icon} size={18} color="#3b82f6" />
                </View>
                <Text style={styles.itemName} numberOfLines={1}>{item[keyField]}</Text>
              </View>
              <View style={styles.itemRight}>
                <Text style={styles.itemCount}>{item.playerCount}</Text>
                <Text style={styles.itemCountLabel}> jug.</Text>
                <Ionicons name="chevron-forward" size={14} color="#475569" style={{ marginLeft: 6 }} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },

  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 10,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 9, borderRadius: 10, gap: 4,
  },
  tabActive: { backgroundColor: '#1d4ed8' },
  tabText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  tabCount: {
    backgroundColor: '#334155', color: '#94a3b8',
    fontSize: 11, fontWeight: '700',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, marginLeft: 2,
  },
  tabCountActive: { backgroundColor: '#1e40af', color: '#bfdbfe' },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1e293b', borderRadius: 10,
    marginHorizontal: 16, marginBottom: 10,
    paddingHorizontal: 12, height: 42,
    borderWidth: 1, borderColor: '#334155',
  },
  searchInput: { flex: 1, color: '#f1f5f9', fontSize: 14 },

  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 6 },

  item: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1e293b', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    borderWidth: 1, borderColor: '#334155',
  },
  itemLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: '#1e3a5f', justifyContent: 'center', alignItems: 'center',
  },
  itemName: { color: '#f1f5f9', fontSize: 14, fontWeight: '600', flexShrink: 1 },
  itemRight: { flexDirection: 'row', alignItems: 'center' },
  itemCount: { color: '#3b82f6', fontSize: 14, fontWeight: '700' },
  itemCountLabel: { color: '#64748b', fontSize: 12 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyTitle: { color: '#64748b', fontSize: 17, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  emptyText: { color: '#475569', fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
