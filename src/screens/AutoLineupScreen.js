import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { FORMATIONS } from '../constants/formations';
import { POSITION_BG } from '../constants/positions';
import {
  addToRoster,
  getLineupsByTeam,
  getRoster,
  removeFromRoster,
  searchPlayersWithFilters,
} from '../db/database';
import { useSquadStore } from '../store/squadStore';

// ── Algoritmo de auto-asignación ──────────────────────────────
const ADJACENT = {
  GK:  [],
  CB:  ['LB','RB','CDM'],   LB:  ['CB','LWB','LM'],  RB:  ['CB','RWB','RM'],
  LWB: ['LB','LM'],          RWB: ['RB','RM'],
  CDM: ['CM','CB'],           CM:  ['CDM','CAM','LM','RM'],
  CAM: ['CM','CF','LW','RW'], LM:  ['LW','CM','LB'],   RM: ['RW','CM','RB'],
  LW:  ['LM','ST','CAM'],    RW:  ['RM','ST','CAM'],
  CF:  ['ST','CAM'],          ST:  ['CF','LW','RW'],
};

function matchScore(player, targetPos) {
  const positions = (player.positions || player.position || '')
    .split(',').map(p => p.trim()).filter(Boolean);
  if (positions.includes(targetPos)) return 1.0;
  if ((ADJACENT[targetPos] || []).some(p => positions.includes(p))) return 0.7;
  return 0.45;
}

function autoAssign(formation, playerPool) {
  const slots = FORMATIONS[formation]?.slots || [];
  const available = [...playerPool];
  const assignment = {};
  for (const slot of slots) {
    let bestVal = 0, bestIdx = -1;
    available.forEach((p, i) => {
      const v = matchScore(p, slot.position) * p.overall;
      if (v > bestVal) { bestVal = v; bestIdx = i; }
    });
    if (bestIdx >= 0) {
      assignment[slot.id] = available[bestIdx];
      available.splice(bestIdx, 1);
    }
  }
  const vals = Object.values(assignment);
  const score = vals.length
    ? Math.round(vals.reduce((s, p) => s + p.overall, 0) / vals.length)
    : 0;
  return { assignment, remaining: available, score };
}

// ── Helpers ───────────────────────────────────────────────────
const FORMATION_KEYS = Object.keys(FORMATIONS);
const OVR_BG = (ovr) => ovr >= 85 ? '#d97706' : ovr >= 75 ? '#16a34a' : '#4b5563';
const parsePlayer = (data) => { try { return JSON.parse(data); } catch { return {}; } };

// ── Foto con badge OVR ────────────────────────────────────────
function PlayerFace({ player, size = 48 }) {
  const [err, setErr] = useState(false);
  const bg = OVR_BG(player.overall);
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
      <View style={{ position: 'absolute', bottom: -1, right: -2, backgroundColor: bg, borderRadius: 4, paddingHorizontal: 3, borderWidth: 1.5, borderColor: '#1e293b' }}>
        <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900', lineHeight: 13 }}>{player.overall}</Text>
      </View>
    </View>
  );
}

// ── Fila de jugador en plantilla ──────────────────────────────
function RosterItem({ item, onRemove }) {
  const player = useMemo(() => parsePlayer(item.playerData), [item.playerData]);
  return (
    <View style={s.rosterItem}>
      <PlayerFace player={player} size={46} />
      <View style={{ flex: 1 }}>
        <Text style={s.rosterName} numberOfLines={1}>{item.playerName}</Text>
        <Text style={s.rosterMeta}>{player.position}  ·  {player.club || '—'}</Text>
      </View>
      <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}>
        <Ionicons name="trash-outline" size={18} color="#475569" />
      </TouchableOpacity>
    </View>
  );
}

// ── Tarjeta de sugerencia ─────────────────────────────────────
function SuggestionCard({ title, formation, assignment, score, onLoad }) {
  const slots = FORMATIONS[formation]?.slots || [];
  const filled = slots.filter(sl => assignment[sl.id]);

  return (
    <View style={s.suggCard}>
      <View style={s.suggHeader}>
        <Text style={s.suggTitle}>{title}</Text>
        <View style={s.suggBadges}>
          <View style={s.formBadge}>
            <Text style={s.formBadgeText}>{formation}</Text>
          </View>
          <View style={[s.ovrBadge, { backgroundColor: OVR_BG(score) }]}>
            <Text style={s.ovrText}>{score}</Text>
          </View>
        </View>
      </View>

      {filled.length === 0 ? (
        <Text style={s.suggEmpty}>No hay jugadores suficientes para rellenar esta formación.</Text>
      ) : (
        filled.map(sl => {
          const p = assignment[sl.id];
          const isNatural = (p.positions || p.position || '')
            .split(',').map(x => x.trim()).includes(sl.position);
          return (
            <View key={sl.id} style={s.suggRow}>
              <View style={[s.posBadge, { backgroundColor: POSITION_BG(sl.position) }]}>
                <Text style={s.posText}>{sl.label}</Text>
              </View>
              <Text
                style={[s.suggPlayerName, !isNatural && s.suggPlayerOff]}
                numberOfLines={1}
              >
                {p.name}
              </Text>
              {!isNatural && (
                <Ionicons name="warning-outline" size={12} color="#f59e0b" style={{ marginRight: 4 }} />
              )}
              <Text style={[s.suggOvr, { color: OVR_BG(p.overall) }]}>{p.overall}</Text>
            </View>
          );
        })
      )}

      {filled.some(sl => {
        const p = assignment[sl.id];
        return p && !(p.positions || p.position || '').split(',').map(x => x.trim()).includes(sl.position);
      }) && (
        <View style={s.offPosNote}>
          <Ionicons name="warning-outline" size={12} color="#f59e0b" />
          <Text style={s.offPosText}>nombre en naranja = fuera de posición natural</Text>
        </View>
      )}

      {filled.length > 0 && (
        <TouchableOpacity style={s.loadBtn} onPress={onLoad}>
          <Ionicons name="play" size={14} color="#fff" />
          <Text style={s.loadBtnText}>Cargar en Pizarra</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Modal de búsqueda y adición ───────────────────────────────
function AddPlayerModal({ visible, onClose, onAdd, existingNames }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  const doSearch = useCallback((text) => {
    setQuery(text);
    if (text.trim().length < 2) { setResults([]); return; }
    try {
      setResults(searchPlayersWithFilters({ searchTerm: text }).slice(0, 25));
    } catch { setResults([]); }
  }, []);

  const handleClose = () => { setQuery(''); setResults([]); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={am.overlay}>
        <View style={am.sheet}>
          <View style={am.header}>
            <Text style={am.title}>Añadir a plantilla</Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>

          <TextInput
            style={am.input}
            value={query}
            onChangeText={doSearch}
            placeholder="Buscar jugador por nombre..."
            placeholderTextColor="#475569"
            autoFocus
          />

          <FlatList
            data={results}
            keyExtractor={i => i.id.toString()}
            style={am.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const already = existingNames.has(item.name);
              return (
                <TouchableOpacity
                  style={[am.resultRow, already && am.resultDisabled]}
                  onPress={() => { if (!already) { onAdd(item); handleClose(); } }}
                  disabled={already}
                >
                  <PlayerFace player={item} size={50} />
                  <View style={{ flex: 1 }}>
                    <Text style={[am.playerName, already && am.playerNameDim]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={am.playerMeta}>{item.position}  ·  {item.club}</Text>
                  </View>
                  {already
                    ? <Text style={am.alreadyText}>En plantilla</Text>
                    : <Ionicons name="add-circle" size={24} color="#3b82f6" />
                  }
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={am.hint}>
                {query.length >= 2 ? `Sin resultados para "${query}"` : 'Escribe al menos 2 caracteres'}
              </Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

// ── Modal: importar desde alineación guardada ─────────────────
function ImportLineupModal({ visible, teamId, onClose, onImport }) {
  const [lineups, setLineups] = useState([]);

  useEffect(() => {
    if (visible) {
      try { setLineups(getLineupsByTeam(teamId)); } catch { setLineups([]); }
    }
  }, [visible, teamId]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={im.overlay}>
        <View style={im.card}>
          <View style={im.header}>
            <Text style={im.title}>Importar jugadores de alineación</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>
          <Text style={im.hint}>
            Se añadirán a la plantilla todos los jugadores del titular, suplentes y reservas de la alineación elegida.
          </Text>
          {lineups.length === 0 ? (
            <Text style={im.empty}>Este equipo no tiene alineaciones guardadas.</Text>
          ) : (
            lineups.map(l => {
              const sq = (() => { try { return JSON.parse(l.squad || '{}'); } catch { return {}; } })();
              const bn = (() => { try { return JSON.parse(l.bench || '{}'); } catch { return {}; } })();
              const rs = (() => { try { return JSON.parse(l.reserves || '{}'); } catch { return {}; } })();
              const total = Object.values(sq).filter(Boolean).length +
                            Object.values(bn).filter(Boolean).length +
                            Object.values(rs).filter(Boolean).length;
              return (
                <TouchableOpacity key={l.id} style={im.lineupRow} onPress={() => onImport(l)}>
                  <View style={{ flex: 1 }}>
                    <Text style={im.lineupName}>{l.name}</Text>
                    <Text style={im.lineupMeta}>{l.formation}  ·  {total} jugadores</Text>
                  </View>
                  <Ionicons name="download-outline" size={20} color="#3b82f6" />
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Pantalla principal ────────────────────────────────────────
export default function AutoLineupScreen({ route, navigation }) {
  const { teamId, teamName = 'Plantilla' } = route.params || {};
  const [roster, setRoster]         = useState([]);
  const [formation, setFormation]   = useState('4-3-3');
  const [suggestions, setSuggestions] = useState(null);
  const [showAdd, setShowAdd]       = useState(false);
  const [showImport, setShowImport] = useState(false);

  const loadLineup = useSquadStore(st => st.loadLineup);

  const load = useCallback(() => {
    setRoster(getRoster(teamId));
    setSuggestions(null);
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  const existingNames = useMemo(() => new Set(roster.map(r => r.playerName)), [roster]);

  const handleAdd = (player) => {
    const result = addToRoster(teamId, player);
    if (result.ok) load();
    else Alert.alert('Aviso', result.error);
  };

  const handleRemove = (id) => {
    Alert.alert('Quitar jugador', '¿Eliminarlo de la plantilla?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => { removeFromRoster(id); load(); } },
    ]);
  };

  const handleImport = (lineup) => {
    const parse = (str) => { try { return JSON.parse(str || '{}'); } catch { return {}; } };
    const players = [
      ...Object.values(parse(lineup.squad)),
      ...Object.values(parse(lineup.bench)),
      ...Object.values(parse(lineup.reserves)),
    ].filter(Boolean);

    let added = 0;
    players.forEach(p => {
      const r = addToRoster(teamId, p);
      if (r.ok) added++;
    });
    setShowImport(false);
    load();
    Alert.alert('Importación completa', `${added} jugadores añadidos a la plantilla.`);
  };

  const handleSuggest = () => {
    if (roster.length === 0) {
      Alert.alert('Plantilla vacía', 'Añade jugadores antes de generar sugerencias.');
      return;
    }
    const players = roster.map(r => parsePlayer(r.playerData)).filter(p => p.overall);
    const first  = autoAssign(formation, players);
    const second = autoAssign(formation, first.remaining);
    setSuggestions({ first, second });
  };

  const handleLoad = (assignment) => {
    loadLineup({
      teamId,
      teamName,
      lineupId:   null,
      lineupName: 'Sugerencia automática',
      formation,
      squad:    assignment,
      bench:    {},
      reserves: {},
    });
    navigation.popToTop();
  };

  const unassigned = useMemo(() => {
    if (!suggestions) return [];
    const used = new Set([
      ...Object.values(suggestions.first.assignment),
      ...Object.values(suggestions.second.assignment),
    ].filter(Boolean).map(p => p.name));
    return roster.filter(r => !used.has(r.playerName));
  }, [suggestions, roster]);

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

      {/* Selector de formación */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Formación</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.formRow}>
          {FORMATION_KEYS.map(f => (
            <TouchableOpacity
              key={f}
              style={[s.formChip, formation === f && s.formChipActive]}
              onPress={() => { setFormation(f); setSuggestions(null); }}
            >
              <Text style={[s.formChipText, formation === f && s.formChipTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Plantilla */}
      <View style={s.card}>
        <View style={s.cardHeaderRow}>
          <Text style={s.cardTitle}>
            {teamName}  ·  {roster.length} jugadores
          </Text>
          <View style={s.headerBtns}>
            <TouchableOpacity style={s.importBtn} onPress={() => setShowImport(true)}>
              <Ionicons name="download-outline" size={14} color="#3b82f6" />
              <Text style={s.importBtnText}>Importar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.addBtn} onPress={() => setShowAdd(true)}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={s.addBtnText}>Añadir</Text>
            </TouchableOpacity>
          </View>
        </View>

        {roster.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="people-outline" size={40} color="#334155" />
            <Text style={s.emptyText}>Sin jugadores. Toca "Añadir" para empezar.</Text>
          </View>
        ) : (
          roster.map(item => (
            <RosterItem key={item.id} item={item} onRemove={() => handleRemove(item.id)} />
          ))
        )}
      </View>

      {/* Botón sugerir */}
      <TouchableOpacity
        style={[s.suggestBtn, roster.length === 0 && s.suggestBtnDisabled]}
        onPress={handleSuggest}
        disabled={roster.length === 0}
      >
        <Ionicons name="flash" size={18} color="#fff" />
        <Text style={s.suggestBtnText}>Sugerir alineaciones</Text>
      </TouchableOpacity>

      {/* Resultados */}
      {suggestions && (
        <>
          <SuggestionCard
            title="Alineación titular"
            formation={formation}
            assignment={suggestions.first.assignment}
            score={suggestions.first.score}
            onLoad={() => handleLoad(suggestions.first.assignment)}
          />
          <SuggestionCard
            title="Segunda alineación"
            formation={formation}
            assignment={suggestions.second.assignment}
            score={suggestions.second.score}
            onLoad={() => handleLoad(suggestions.second.assignment)}
          />

          {unassigned.length > 0 && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Sin alinear — {unassigned.length} jugadores</Text>
              {unassigned.map(r => {
                const p = parsePlayer(r.playerData);
                return (
                  <View key={r.id} style={s.rosterItem}>
                    <View style={[s.ovrBadge, { backgroundColor: OVR_BG(p.overall) }]}>
                      <Text style={s.ovrText}>{p.overall}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rosterName} numberOfLines={1}>{r.playerName}</Text>
                      <Text style={s.rosterMeta}>{p.position}  ·  {p.club || '—'}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}

      <AddPlayerModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onAdd={handleAdd}
        existingNames={existingNames}
      />

      <ImportLineupModal
        visible={showImport}
        teamId={teamId}
        onClose={() => setShowImport(false)}
        onImport={handleImport}
      />
    </ScrollView>
  );
}

// ─── Estilos principales ──────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content:   { padding: 14, paddingBottom: 48, gap: 12 },

  card: { backgroundColor: '#1e293b', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#334155', gap: 8 },
  cardTitle:     { color: '#94a3b8', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  formRow:         { gap: 8, paddingVertical: 4 },
  formChip:        { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155' },
  formChipActive:  { borderColor: '#3b82f6', backgroundColor: '#0d1f3c' },
  formChipText:    { color: '#475569', fontSize: 13, fontWeight: '600' },
  formChipTextActive: { color: '#3b82f6' },

  headerBtns:    { flexDirection: 'row', gap: 8, alignItems: 'center' },
  importBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#1d4ed8', backgroundColor: '#0d1f3c' },
  importBtnText: { color: '#3b82f6', fontSize: 12, fontWeight: '700' },
  addBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#1d4ed8', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  addBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  rosterItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#0f172a' },
  ovrBadge:   { width: 38, height: 38, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  ovrText:    { color: '#fff', fontWeight: '800', fontSize: 14 },
  rosterName: { color: '#f1f5f9', fontSize: 14, fontWeight: '600' },
  rosterMeta: { color: '#64748b', fontSize: 11, marginTop: 1 },

  empty:     { alignItems: 'center', paddingVertical: 24, gap: 10 },
  emptyText: { color: '#475569', fontSize: 13, textAlign: 'center' },

  suggestBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#7c3aed', borderRadius: 14, paddingVertical: 15,
    borderWidth: 1, borderColor: '#6d28d9',
  },
  suggestBtnDisabled: { opacity: 0.4 },
  suggestBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  suggCard:   { backgroundColor: '#1e293b', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#334155', gap: 2 },
  suggHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  suggTitle:  { color: '#f1f5f9', fontSize: 15, fontWeight: '800' },
  suggBadges: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  formBadge:  { backgroundColor: '#1e3a5f', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  formBadgeText: { color: '#60a5fa', fontSize: 11, fontWeight: '700' },

  suggRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#0f172a' },
  posBadge:      { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, minWidth: 30, alignItems: 'center' },
  posText:       { color: '#fff', fontSize: 10, fontWeight: '800' },
  suggPlayerName: { flex: 1, color: '#cbd5e1', fontSize: 13, fontWeight: '600' },
  suggPlayerOff:  { color: '#f59e0b' },
  suggOvr:       { fontSize: 13, fontWeight: '800', minWidth: 24, textAlign: 'right' },
  suggEmpty:     { color: '#475569', fontSize: 13, paddingVertical: 8 },
  offPosNote:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  offPosText:    { color: '#94a3b8', fontSize: 11 },

  loadBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1d4ed8', borderRadius: 10, paddingVertical: 11, marginTop: 10 },
  loadBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});

// ─── Estilos del modal ────────────────────────────────────────
const am = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet:   { backgroundColor: '#1e293b', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34, maxHeight: '85%' },
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  title:   { color: '#f1f5f9', fontSize: 16, fontWeight: '700' },
  input:   { margin: 12, backgroundColor: '#0f172a', borderRadius: 10, paddingHorizontal: 14, height: 44, color: '#f1f5f9', fontSize: 14, borderWidth: 1, borderColor: '#334155' },
  list:    { maxHeight: 400 },

  resultRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: '#0f172a' },
  resultDisabled:{ opacity: 0.5 },
  ovrBadge:      { width: 36, height: 36, borderRadius: 7, justifyContent: 'center', alignItems: 'center' },
  ovrText:       { color: '#fff', fontWeight: '800', fontSize: 13 },
  playerName:    { color: '#f1f5f9', fontSize: 13, fontWeight: '600' },
  playerNameDim: { color: '#475569' },
  playerMeta:    { color: '#64748b', fontSize: 11 },
  alreadyText:   { color: '#475569', fontSize: 11, fontWeight: '600' },
  hint:          { color: '#475569', fontSize: 13, textAlign: 'center', padding: 24 },
});

// ─── Estilos modal importar ───────────────────────────────────
const im = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 24 },
  card:       { backgroundColor: '#1e293b', borderRadius: 16, padding: 20, gap: 12, borderWidth: 1, borderColor: '#334155' },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:      { color: '#f1f5f9', fontSize: 16, fontWeight: '700' },
  hint:       { color: '#64748b', fontSize: 12, lineHeight: 18 },
  empty:      { color: '#475569', fontSize: 13, textAlign: 'center', paddingVertical: 16 },
  lineupRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#334155' },
  lineupName: { color: '#f1f5f9', fontSize: 14, fontWeight: '700' },
  lineupMeta: { color: '#64748b', fontSize: 11, marginTop: 2 },
});
