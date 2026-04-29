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
  getShortlist,
  removeFromShortlist,
  updateShortlistNote,
  updateShortlistStatus,
} from '../db/database';
import { useFocusRefresh } from '../hooks/useFocusRefresh';

const STATUS_OPTIONS = [
  { key: 'objetivo',    label: 'Objetivo',       color: '#3b82f6', icon: 'star'          },
  { key: 'seguimiento', label: 'En seguimiento',  color: '#f59e0b', icon: 'eye'           },
  { key: 'descartado',  label: 'Descartado',      color: '#64748b', icon: 'close-circle'  },
];

const STATUS_MAP = Object.fromEntries(STATUS_OPTIONS.map(s => [s.key, s]));

const fmtVal = (v) => {
  if (!v || v === 0) return 'Libre';
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `€${Math.round(v / 1_000)}K`;
  return `€${v}`;
};

const getOvrBg = (ovr) =>
  ovr >= 85 ? '#d97706' : ovr >= 75 ? '#16a34a' : '#4b5563';

// ─── Detalle de nota ────────────────────────────────────────────
function NoteModal({ item, visible, onClose, onSave }) {
  const [text, setText] = useState(item?.note ?? '');
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={nm.overlay}>
        <View style={nm.card}>
          <Text style={nm.title}>Nota — {item?.playerName}</Text>
          <TextInput
            style={nm.input}
            value={text}
            onChangeText={setText}
            placeholder="Observaciones, posición en plantilla..."
            placeholderTextColor="#475569"
            multiline
            numberOfLines={4}
            autoFocus
          />
          <View style={nm.btns}>
            <TouchableOpacity style={nm.cancel} onPress={onClose}>
              <Text style={nm.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={nm.save} onPress={() => onSave(text)}>
              <Text style={nm.saveText}>Guardar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Tarjeta de objetivo ────────────────────────────────────────
function ShortlistCard({ item, onPress, onLongPress }) {
  const player = (() => { try { return JSON.parse(item.playerData); } catch { return {}; } })();
  const st = STATUS_MAP[item.status] ?? STATUS_MAP.objetivo;
  return (
    <TouchableOpacity style={s.card} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.75}>
      <View style={[s.ovrBadge, { backgroundColor: getOvrBg(player.overall) }]}>
        <Text style={s.ovrText}>{player.overall}</Text>
      </View>
      <View style={s.cardBody}>
        <Text style={s.playerName} numberOfLines={1}>{item.playerName}</Text>
        <Text style={s.playerMeta} numberOfLines={1}>
          {player.position}  ·  {player.club || 'Sin club'}  ·  {fmtVal(player.marketValue)}
        </Text>
        {item.note ? <Text style={s.note} numberOfLines={1}>{item.note}</Text> : null}
      </View>
      <View style={[s.statusBadge, { backgroundColor: st.color + '22', borderColor: st.color + '55' }]}>
        <Ionicons name={st.icon} size={12} color={st.color} />
        <Text style={[s.statusText, { color: st.color }]}>{st.label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color="#334155" />
    </TouchableOpacity>
  );
}

// ─── Main ────────────────────────────────────────────────────────
export default function ShortlistScreen({ navigation }) {
  const [items, setItems]       = useState([]);
  const [noteTarget, setNoteTarget] = useState(null);
  const [filter, setFilter]     = useState('all');

  const reload = useCallback(() => setItems(getShortlist()), []);
  useFocusRefresh(navigation, reload);

  const displayed = filter === 'all' ? items : items.filter(i => i.status === filter);

  const handleLongPress = (item) => {
    const player = (() => { try { return JSON.parse(item.playerData); } catch { return {}; } })();
    Alert.alert(item.playerName, `OVR ${player.overall}  ·  ${player.position}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Editar nota', onPress: () => setNoteTarget(item) },
      ...STATUS_OPTIONS
        .filter(o => o.key !== item.status)
        .map(o => ({ text: `→ ${o.label}`, onPress: () => { updateShortlistStatus(item.id, o.key); reload(); } })),
      { text: 'Eliminar', style: 'destructive', onPress: () => {
        Alert.alert('Eliminar objetivo', `¿Quitar a ${item.playerName} de objetivos?`, [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Eliminar', style: 'destructive', onPress: () => { removeFromShortlist(item.id); reload(); } },
        ]);
      }},
    ]);
  };

  const handleNotesSave = (text) => {
    if (noteTarget) {
      updateShortlistNote(noteTarget.id, text);
      setNoteTarget(null);
      reload();
    }
  };

  const counts = STATUS_OPTIONS.reduce((acc, o) => {
    acc[o.key] = items.filter(i => i.status === o.key).length;
    return acc;
  }, {});

  return (
    <View style={s.container}>
      {/* Filtro de estado */}
      <View style={s.filterRow}>
        <TouchableOpacity
          style={[s.filterChip, filter === 'all' && s.filterChipActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[s.filterText, filter === 'all' && s.filterTextActive]}>
            Todos ({items.length})
          </Text>
        </TouchableOpacity>
        {STATUS_OPTIONS.map(o => (
          <TouchableOpacity
            key={o.key}
            style={[s.filterChip, filter === o.key && s.filterChipActive, filter === o.key && { borderColor: o.color }]}
            onPress={() => setFilter(o.key)}
          >
            <Ionicons name={o.icon} size={12} color={filter === o.key ? o.color : '#475569'} />
            <Text style={[s.filterText, filter === o.key && { color: o.color }]}>
              {counts[o.key] ?? 0}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={displayed}
        keyExtractor={i => i.id.toString()}
        contentContainerStyle={s.list}
        renderItem={({ item }) => (
          <ShortlistCard
            item={item}
            onPress={() => {
              const player = (() => { try { return JSON.parse(item.playerData); } catch { return {}; } })();
              navigation.navigate('PlayerDetail', { player, selectionMode: false });
            }}
            onLongPress={() => handleLongPress(item)}
          />
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="star-outline" size={48} color="#334155" />
            <Text style={s.emptyTitle}>Sin objetivos</Text>
            <Text style={s.emptyHint}>
              Abre la ficha de cualquier jugador y toca{'\n'}"Añadir a objetivos" para empezar.
            </Text>
          </View>
        }
      />

      {noteTarget && (
        <NoteModal
          item={noteTarget}
          visible
          onClose={() => setNoteTarget(null)}
          onSave={handleNotesSave}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },

  filterRow: {
    flexDirection: 'row', gap: 8, padding: 12,
    borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155',
  },
  filterChipActive: { backgroundColor: '#0f172a' },
  filterText:       { color: '#475569', fontSize: 12, fontWeight: '600' },
  filterTextActive: { color: '#f1f5f9' },

  list: { padding: 12, gap: 10, paddingBottom: 40 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#1e293b', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: '#334155',
  },
  ovrBadge: { width: 40, height: 40, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  ovrText:  { color: '#fff', fontWeight: '800', fontSize: 15 },
  cardBody: { flex: 1 },
  playerName: { color: '#f1f5f9', fontWeight: '700', fontSize: 14, marginBottom: 3 },
  playerMeta: { color: '#64748b', fontSize: 11 },
  note:       { color: '#94a3b8', fontSize: 11, marginTop: 3, fontStyle: 'italic' },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1,
  },
  statusText: { fontSize: 10, fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { color: '#475569', fontSize: 18, fontWeight: '700' },
  emptyHint:  { color: '#334155', fontSize: 13, textAlign: 'center', lineHeight: 20 },
});

const nm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 },
  card:    { backgroundColor: '#1e293b', borderRadius: 16, padding: 20, gap: 14 },
  title:   { color: '#f1f5f9', fontSize: 16, fontWeight: '700' },
  input: {
    backgroundColor: '#0f172a', borderRadius: 10, padding: 12,
    color: '#f1f5f9', fontSize: 14, borderWidth: 1, borderColor: '#334155',
    minHeight: 90, textAlignVertical: 'top',
  },
  btns:       { flexDirection: 'row', gap: 10 },
  cancel:     { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#0f172a', alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  cancelText: { color: '#64748b', fontWeight: '600' },
  save:       { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#3b82f6', alignItems: 'center' },
  saveText:   { color: '#fff', fontWeight: '700' },
});
