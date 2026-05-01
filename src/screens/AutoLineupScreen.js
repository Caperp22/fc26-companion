import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { FORMATIONS } from '../constants/formations';
import { POSITION_BG } from '../constants/positions';
import {
  addCustomPlayer,
  addToRoster,
  deleteCustomPlayer,
  getLineupsByTeam,
  getRoster,
  removeFromRoster,
  saveLineup,
  saveLineupByName,
  searchPlayersWithFilters,
  setRosterPlayerStatus,
  updateCustomPlayer,
  updateRosterPlayer,
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

  // 3 pasadas: natural → adyacente → fuera de posición
  // Garantiza que cualquier jugador en posición natural siempre
  // tiene prioridad sobre uno adyacente, sin importar el OVR.
  const fillPass = (tierFn) => {
    slots.forEach(slot => {
      if (assignment[slot.id]) return;
      let bestOvr = -1, bestIdx = -1;
      available.forEach((p, i) => {
        if (!tierFn(p, slot.position)) return;
        if (p.overall > bestOvr) { bestOvr = p.overall; bestIdx = i; }
      });
      if (bestIdx >= 0) { assignment[slot.id] = available[bestIdx]; available.splice(bestIdx, 1); }
    });
  };

  fillPass((p, pos) => matchScore(p, pos) === 1.0);   // posición natural
  fillPass((p, pos) => matchScore(p, pos) === 0.7);   // posición adyacente
  fillPass((p, pos) => matchScore(p, pos) === 0.45);  // fuera de posición

  const vals = Object.values(assignment);
  const avgOVR = vals.length ? Math.round(vals.reduce((s, p) => s + p.overall, 0) / vals.length) : 0;

  // Contar encajes naturales para el ranking de formaciones
  const naturalFits = Object.entries(assignment).filter(([slotId, player]) => {
    const slot = slots.find(s => s.id === slotId);
    return slot && matchScore(player, slot.position) === 1.0;
  }).length;

  return { assignment, remaining: available, score: avgOVR, naturalFits };
}

// ── Helpers ───────────────────────────────────────────────────
const FORMATION_KEYS = Object.keys(FORMATIONS);
const OVR_BG = (ovr) => ovr >= 85 ? '#d97706' : ovr >= 75 ? '#16a34a' : '#4b5563';
const parsePlayer = (data) => { try { return JSON.parse(data); } catch { return {}; } };
const BENCH_IDS   = ['B0','B1','B2','B3','B4','B5','B6'];
const RESERVE_IDS = ['R0','R1','R2','R3','R4'];
const ALL_POS = ['GK','CB','LB','RB','LWB','RWB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST'];
const POS_ES  = { GK:'PO',CB:'DFC',LB:'LI',RB:'LD',LWB:'CAI',RWB:'CAD',CDM:'MCD',CM:'MC',CAM:'MCO',LM:'MI',RM:'MD',LW:'EI',RW:'ED',CF:'SD',ST:'DC' };

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

const STATUS_COLOR = { TIT: '#1d4ed8', SUP: '#6d28d9', RES: '#374151' };
const PLAYER_STATUS_CFG = {
  '':           { label: '—',           icon: 'ellipse-outline',   color: '#475569' },
  lesionado:    { label: 'Lesionado',   icon: 'bandage-outline',   color: '#ef4444' },
  suspendido:   { label: 'Suspendido',  icon: 'ban-outline',       color: '#f59e0b' },
  duda:         { label: 'Duda',        icon: 'help-circle-outline', color: '#f97316' },
};

// ── Fila de jugador en plantilla ──────────────────────────────
function RosterItem({ item, onRemove, onEdit, onStatusChange, assignment }) {
  const player = useMemo(() => parsePlayer(item.playerData), [item.playerData]);
  const posLabel = (player.positions || player.position || '').split(',').map(p => POS_ES[p.trim()] || p.trim()).join(' / ');
  const pStatus = item.playerStatus || '';
  const statusCfg = PLAYER_STATUS_CFG[pStatus] ?? PLAYER_STATUS_CFG[''];

  return (
    <View style={s.rosterItem}>
      <PlayerFace player={player} size={46} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text style={s.rosterName} numberOfLines={1}>{item.playerName}</Text>
          {pStatus !== '' && (
            <View style={[s.playerStatusBadge, { backgroundColor: statusCfg.color + '22', borderColor: statusCfg.color }]}>
              <Ionicons name={statusCfg.icon} size={10} color={statusCfg.color} />
              <Text style={[s.playerStatusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
            </View>
          )}
        </View>
        <Text style={s.rosterMeta}>
          {posLabel}
          {player.age ? `  ·  ${player.age}a` : ''}
          {player.club ? `  ·  ${player.club}` : ''}
          {player.jersey ? `  ·  #${player.jersey}` : ''}
        </Text>
      </View>
      {assignment && (
        <View style={[s.statusBadge, { backgroundColor: STATUS_COLOR[assignment.type] ?? '#374151' }]}>
          <Text style={s.statusText}>{assignment.type}</Text>
          {assignment.lineup ? <Text style={s.statusLineup} numberOfLines={1}>{assignment.lineup}</Text> : null}
        </View>
      )}
      <TouchableOpacity onPress={onStatusChange} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} style={{ marginLeft: 6 }}>
        <Ionicons name={statusCfg.icon} size={16} color={pStatus ? statusCfg.color : '#334155'} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} style={{ marginLeft: 6 }}>
        <Ionicons name="pencil-outline" size={17} color="#3b82f6" />
      </TouchableOpacity>
      <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 6 }}>
        <Ionicons name="trash-outline" size={18} color="#475569" />
      </TouchableOpacity>
    </View>
  );
}

// ── Tarjeta de sugerencia ─────────────────────────────────────
function SuggestionCard({ title, formation, assignment, score, onLoad }) {
  const slots = FORMATIONS[formation]?.slots || [];
  const filled = slots.filter(sl => assignment[sl.id]);

  const handleShare = () => {
    const lines = filled.map(sl => {
      const p = assignment[sl.id];
      return `${sl.label}: ${p.name} (${p.overall})`;
    }).join('\n');
    Share.share({ message: `${title} — ${formation}\n\n${lines}`, title });
  };

  const naturalCount = filled.filter(sl => {
    const p = assignment[sl.id];
    return (p.positions || p.position || '').split(',').map(x => x.trim()).includes(sl.position);
  }).length;

  return (
    <View style={s.suggCard}>
      <View style={s.suggHeader}>
        <View>
          <Text style={s.suggTitle}>{title}</Text>
          <Text style={s.suggFitsCount}>
            <Text style={{ color: '#22c55e', fontWeight: '800' }}>{naturalCount}</Text>
            /{filled.length} en posición natural
          </Text>
        </View>
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
          const ms = matchScore(p, sl.position);
          const isNatural  = ms === 1.0;
          const isAdjacent = ms === 0.7;
          const nameStyle  = isNatural ? s.suggPlayerName
            : isAdjacent ? s.suggPlayerAdj : s.suggPlayerOff;
          return (
            <View key={sl.id} style={s.suggRow}>
              <View style={[s.posBadge, { backgroundColor: POSITION_BG(sl.position) }]}>
                <Text style={s.posText}>{sl.label}</Text>
              </View>
              <Text style={nameStyle} numberOfLines={1}>{p.name}</Text>
              {isAdjacent && <Ionicons name="alert-circle-outline" size={12} color="#f59e0b" style={{ marginRight: 4 }} />}
              {!isNatural && !isAdjacent && <Ionicons name="warning-outline" size={12} color="#ef4444" style={{ marginRight: 4 }} />}
              <Text style={[s.suggOvr, { color: OVR_BG(p.overall) }]}>{p.overall}</Text>
            </View>
          );
        })
      )}

      {naturalCount < filled.length && (
        <View style={s.offPosNote}>
          <View style={[s.offPosDot, { backgroundColor: '#f59e0b' }]} />
          <Text style={s.offPosText}>adyacente</Text>
          <View style={[s.offPosDot, { backgroundColor: '#ef4444', marginLeft: 8 }]} />
          <Text style={s.offPosText}>fuera de posición</Text>
        </View>
      )}

      {filled.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <TouchableOpacity style={[s.loadBtn, { flex: 1, marginTop: 0 }]} onPress={onLoad}>
            <Ionicons name="play" size={14} color="#fff" />
            <Text style={s.loadBtnText}>Cargar en Pizarra</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.shareBtn} onPress={handleShare}>
            <Ionicons name="share-outline" size={18} color="#60a5fa" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Modal crear / editar jugador manual ──────────────────────
function PlayerFormModal({ visible, initial, onClose, onSave }) {
  const [name, setName]         = useState('');
  const [selPos, setSelPos]     = useState(['CM']);
  const [overall, setOverall]   = useState('75');
  const [potential, setPotential] = useState('75');
  const [age, setAge]           = useState('25');
  const [club, setClub]         = useState('');
  const [jersey, setJersey]     = useState('');

  useEffect(() => {
    if (!visible) return;
    if (initial) {
      setName(initial.name || '');
      setSelPos((initial.positions || initial.position || 'CM').split(',').map(p => p.trim()).filter(Boolean));
      setOverall(String(initial.overall || 75));
      setPotential(String(initial.potential || initial.overall || 75));
      setAge(String(initial.age || 25));
      setClub(initial.club || '');
      setJersey(initial.jersey ? String(initial.jersey) : '');
    } else {
      setName(''); setSelPos(['CM']); setOverall('75'); setPotential('75'); setAge('25'); setClub(''); setJersey('');
    }
  }, [visible, initial]);

  const togglePos = (pos) => {
    if (selPos.includes(pos)) {
      if (selPos.length === 1) return;
      setSelPos(selPos.filter(p => p !== pos));
    } else {
      setSelPos([...selPos, pos]);
    }
  };

  const handleSave = () => {
    if (!name.trim()) { Alert.alert('Error', 'Escribe el nombre del jugador.'); return; }
    const ovr = Math.min(99, Math.max(1, parseInt(overall) || 75));
    const pot = Math.min(99, Math.max(ovr, parseInt(potential) || ovr));
    onSave({ name: name.trim(), positions: selPos, position: selPos[0], overall: ovr,
      potential: pot, age: parseInt(age) || 25, club: club.trim(), marketValue: 0,
      faceUrl: '', isCustom: true, jersey: parseInt(jersey) || 0 });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={pf.overlay}>
        <View style={pf.sheet}>
          <View style={pf.header}>
            <Text style={pf.title}>{initial ? 'Editar jugador' : 'Crear jugador manual'}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color="#64748b" /></TouchableOpacity>
          </View>
          <ScrollView style={pf.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={pf.label}>Nombre</Text>
            <TextInput style={pf.input} value={name} onChangeText={setName} placeholder="Nombre del jugador" placeholderTextColor="#475569" autoFocus={!initial} />

            <Text style={pf.label}>Posiciones</Text>
            {[
              { group: 'Portero',  color: '#f59e0b', positions: ['GK'] },
              { group: 'Defensa',  color: '#3b82f6', positions: ['CB','LB','RB','LWB','RWB'] },
              { group: 'Medio',    color: '#8b5cf6', positions: ['CDM','CM','CAM','LM','RM'] },
              { group: 'Ataque',   color: '#ef4444', positions: ['LW','RW','CF','ST'] },
            ].map(({ group, color, positions }) => (
              <View key={group} style={{ marginBottom: 8 }}>
                <Text style={[pf.groupLabel, { color }]}>{group}</Text>
                <View style={pf.posGrid}>
                  {positions.map(pos => (
                    <TouchableOpacity
                      key={pos}
                      style={[pf.posChip, selPos.includes(pos) && { ...pf.posChipActive, borderColor: color }]}
                      onPress={() => togglePos(pos)}
                    >
                      <Text style={[pf.posChipText, selPos.includes(pos) && { ...pf.posChipTextActive, color }]}>
                        {POS_ES[pos] || pos}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}

            <View style={pf.row}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={pf.label}>OVR</Text>
                <TextInput style={pf.input} value={overall} onChangeText={setOverall} keyboardType="numeric" maxLength={2} />
              </View>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={pf.label}>Potencial</Text>
                <TextInput style={pf.input} value={potential} onChangeText={setPotential} keyboardType="numeric" maxLength={2} />
              </View>
            </View>
            <View style={pf.row}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={pf.label}>Edad</Text>
                <TextInput style={pf.input} value={age} onChangeText={setAge} keyboardType="numeric" maxLength={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={pf.label}># Camiseta</Text>
                <TextInput style={pf.input} value={jersey} onChangeText={setJersey} keyboardType="numeric" maxLength={2} placeholder="—" placeholderTextColor="#475569" />
              </View>
            </View>

            <Text style={pf.label}>Club (opcional)</Text>
            <TextInput style={pf.input} value={club} onChangeText={setClub} placeholder="Nombre del club" placeholderTextColor="#475569" />
          </ScrollView>
          <TouchableOpacity style={pf.saveBtn} onPress={handleSave}>
            <Text style={pf.saveBtnText}>{initial ? 'Guardar cambios' : 'Crear jugador'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Modal de búsqueda y adición ───────────────────────────────
function AddPlayerModal({ visible, onClose, onAdd, existingNames, onCreateManual }) {
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
                    <Text style={am.playerMeta}>{POS_ES[item.position] || item.position}  ·  {item.club}</Text>
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
          <TouchableOpacity style={am.manualBtn} onPress={() => { handleClose(); onCreateManual(); }}>
            <Ionicons name="person-add-outline" size={16} color="#a78bfa" />
            <Text style={am.manualBtnText}>Crear jugador manualmente</Text>
          </TouchableOpacity>
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

// ── Estadísticas de plantilla ─────────────────────────────────
const DEF_POS = ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB'];
const MID_POS = ['CDM', 'CM', 'CAM', 'LM', 'RM'];
const ATT_POS = ['LW', 'RW', 'CF', 'ST'];

function SquadStatsCard({ roster }) {
  const stats = useMemo(() => {
    const players = roster.map(r => parsePlayer(r.playerData)).filter(p => p.overall);
    const total = players.length;
    if (total === 0) return null;
    const avg = Math.round(players.reduce((s, p) => s + p.overall, 0) / total);
    const byLine = (positions) => {
      const group = players.filter(p => {
        const pos = (p.positions || p.position || '').split(',').map(x => x.trim());
        return pos.some(po => positions.includes(po));
      });
      const groupAvg = group.length ? Math.round(group.reduce((s, p) => s + p.overall, 0) / group.length) : 0;
      return { count: group.length, avg: groupAvg };
    };
    return { total, avg, def: byLine(DEF_POS), mid: byLine(MID_POS), att: byLine(ATT_POS) };
  }, [roster]);

  if (!stats) return null;
  return (
    <View style={ss.card}>
      <Text style={ss.title}>Resumen de plantilla</Text>
      <View style={ss.row}>
        {[
          { label: 'Total', value: stats.total, sub: `OVR ${stats.avg}`, color: '#60a5fa' },
          { label: 'Defensa', value: stats.def.count, sub: `OVR ${stats.def.avg || '—'}`, color: '#22c55e' },
          { label: 'Medio', value: stats.mid.count, sub: `OVR ${stats.mid.avg || '—'}`, color: '#f59e0b' },
          { label: 'Ataque', value: stats.att.count, sub: `OVR ${stats.att.avg || '—'}`, color: '#ef4444' },
        ].map(({ label, value, sub, color }) => (
          <View key={label} style={ss.box}>
            <Text style={[ss.value, { color }]}>{value}</Text>
            <Text style={ss.label}>{label}</Text>
            <Text style={ss.sub}>{sub}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const ss = StyleSheet.create({
  card:  { backgroundColor: '#1e293b', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#334155' },
  title: { color: '#94a3b8', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  row:   { flexDirection: 'row', justifyContent: 'space-around' },
  box:   { alignItems: 'center', gap: 2 },
  value: { fontSize: 22, fontWeight: '900' },
  label: { color: '#94a3b8', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  sub:   { color: '#475569', fontSize: 10 },
});

// ── Cobertura de posiciones ───────────────────────────────────
const POS_GROUPS = [
  { key: 'GK',  positions: ['GK'] },
  { key: 'DEF', positions: ['CB','LB','RB','LWB','RWB'] },
  { key: 'MED', positions: ['CDM','CM','CAM','LM','RM'] },
  { key: 'ATK', positions: ['LW','RW','CF','ST'] },
];
const covColor = (n) => n === 0 ? '#ef4444' : n === 1 ? '#f59e0b' : '#22c55e';
const covBg    = (n) => n === 0 ? '#2d0808'  : n === 1 ? '#2d1800'  : '#052e16';

function PositionCoverageCard({ roster }) {
  const coverage = useMemo(() => {
    const map = {};
    ALL_POS.forEach(p => { map[p] = 0; });
    roster.forEach(r => {
      const pd = parsePlayer(r.playerData);
      (pd.positions || pd.position || '').split(',').map(x => x.trim()).filter(Boolean)
        .forEach(pos => { if (map[pos] !== undefined) map[pos]++; });
    });
    return map;
  }, [roster]);

  if (roster.length === 0) return null;
  return (
    <View style={cov.card}>
      <View style={cov.header}>
        <Text style={cov.title}>Cobertura de posiciones</Text>
        <View style={cov.legend}>
          {[['#22c55e','2+'],['#f59e0b','1'],['#ef4444','0']].map(([color, label]) => (
            <View key={label} style={cov.legendItem}>
              <View style={[cov.dot, { backgroundColor: color }]} />
              <Text style={cov.legendText}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
      {POS_GROUPS.map(({ key, positions }) => (
        <View key={key} style={cov.row}>
          <Text style={cov.groupLabel}>{key}</Text>
          <View style={cov.cells}>
            {positions.map(pos => {
              const n = coverage[pos] ?? 0;
              return (
                <View key={pos} style={[cov.cell, { backgroundColor: covBg(n), borderColor: covColor(n) + '66' }]}>
                  <Text style={[cov.posLabel, { color: covColor(n) }]}>{POS_ES[pos] || pos}</Text>
                  <Text style={[cov.posCount, { color: covColor(n) }]}>{n}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const cov = StyleSheet.create({
  card:       { backgroundColor: '#1e293b', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#334155', gap: 8 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:      { color: '#94a3b8', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  legend:     { flexDirection: 'row', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  dot:        { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { color: '#64748b', fontSize: 10 },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupLabel: { color: '#475569', fontSize: 10, fontWeight: '800', width: 30, textTransform: 'uppercase' },
  cells:      { flexDirection: 'row', gap: 5, flexWrap: 'wrap', flex: 1 },
  cell:       { borderRadius: 7, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3, alignItems: 'center', minWidth: 40 },
  posLabel:   { fontSize: 9,  fontWeight: '800', textTransform: 'uppercase' },
  posCount:   { fontSize: 15, fontWeight: '900', lineHeight: 19 },
});

// ── Pantalla principal ────────────────────────────────────────
export default function AutoLineupScreen({ route, navigation }) {
  const { teamId, teamName = 'Plantilla' } = route.params || {};
  const [roster, setRoster]           = useState([]);
  const [teamLineups, setTeamLineups] = useState([]);
  const [formation, setFormation]     = useState('4-3-3');
  const [suggestions, setSuggestions] = useState(null);
  const [showAdd, setShowAdd]         = useState(false);
  const [showImport, setShowImport]   = useState(false);
  const [showCreate, setShowCreate]   = useState(false);
  const [editingItem, setEditingItem] = useState(null); // { rosterId, player }
  const [filterPos, setFilterPos]     = useState('');
  const [sortBy, setSortBy]           = useState('ovr');

  const loadLineup = useSquadStore(st => st.loadLineup);

  const load = useCallback(() => {
    setRoster(getRoster(teamId));
    setTeamLineups(getLineupsByTeam(teamId) || []);
    setSuggestions(null);
  }, [teamId]);

  // Mapa jugador → { type, lineup } basado en las alineaciones guardadas
  const playerAssignments = useMemo(() => {
    const result = {};
    const parse = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
    teamLineups.forEach(lineup => {
      Object.values(parse(lineup.squad)).forEach(p => {
        if (p?.name && !result[p.name]) result[p.name] = { type: 'TIT', lineup: lineup.name };
      });
      Object.values(parse(lineup.bench)).forEach(p => {
        if (p?.name && !result[p.name]) result[p.name] = { type: 'SUP', lineup: lineup.name };
      });
      Object.values(parse(lineup.reserves)).forEach(p => {
        if (p?.name && !result[p.name]) result[p.name] = { type: 'RES', lineup: lineup.name };
      });
    });
    return result;
  }, [teamLineups]);

  useEffect(() => { load(); }, [load]);

  const existingNames = useMemo(() => new Set(roster.map(r => r.playerName)), [roster]);

  const displayRoster = useMemo(() => {
    let list = [...roster];
    if (filterPos) {
      list = list.filter(item => {
        const p = parsePlayer(item.playerData);
        return (p.positions || p.position || '').split(',').map(x => x.trim()).includes(filterPos);
      });
    }
    return list.sort((a, b) => {
      const pa = parsePlayer(a.playerData), pb = parsePlayer(b.playerData);
      if (sortBy === 'ovr')  return (pb.overall || 0) - (pa.overall || 0);
      if (sortBy === 'age')  return (pa.age || 99) - (pb.age || 99);
      return a.playerName.localeCompare(b.playerName);
    });
  }, [roster, filterPos, sortBy]);

  const handleAdd = (player) => {
    const result = addToRoster(teamId, player);
    if (result.ok) load();
    else Alert.alert('Aviso', result.error);
  };

  const handleRemove = (item) => {
    const player = parsePlayer(item.playerData);
    Alert.alert('Quitar jugador', `¿Quitar a ${item.playerName} de la plantilla?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Solo de plantilla', onPress: () => { removeFromRoster(item.id); load(); } },
      player.isCustom
        ? { text: 'Eliminar del juego', style: 'destructive', onPress: () => { if (player.id) deleteCustomPlayer(player.id); removeFromRoster(item.id); load(); } }
        : null,
    ].filter(Boolean));
  };

  const handleCreateManual = (playerData) => {
    const result = addCustomPlayer(playerData);
    if (!result.ok) { Alert.alert('Error', result.error); return; }
    const full = { ...playerData, id: result.id, isCustom: true };
    const r = addToRoster(teamId, full);
    if (!r.ok) Alert.alert('Aviso', r.error);
    setShowCreate(false);
    load();
  };

  const handleEditSave = (updatedData) => {
    if (!editingItem) return;
    const { rosterId, player } = editingItem;
    if (player.id) updateCustomPlayer(player.id, updatedData);
    const full = { ...player, ...updatedData };
    updateRosterPlayer(rosterId, full);
    setEditingItem(null);
    load();
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

  const handleStatusChange = (item) => {
    Alert.alert('Estado del jugador', item.playerName, [
      { text: 'Disponible',  onPress: () => { setRosterPlayerStatus(item.id, '');           load(); } },
      { text: 'Lesionado',   onPress: () => { setRosterPlayerStatus(item.id, 'lesionado');  load(); } },
      { text: 'Suspendido',  onPress: () => { setRosterPlayerStatus(item.id, 'suspendido'); load(); } },
      { text: 'Duda',        onPress: () => { setRosterPlayerStatus(item.id, 'duda');       load(); } },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const handleSuggest = () => {
    if (roster.length === 0) {
      Alert.alert('Plantilla vacía', 'Añade jugadores antes de generar sugerencias.');
      return;
    }
    const EXCLUDED = new Set(['lesionado', 'suspendido']);
    const excluded = roster.filter(r => EXCLUDED.has(r.playerStatus || ''));
    const available = roster.filter(r => !EXCLUDED.has(r.playerStatus || ''));
    const players = available.map(r => parsePlayer(r.playerData)).filter(p => p.overall);
    if (players.length === 0) {
      Alert.alert('Sin jugadores disponibles', 'Todos los jugadores están lesionados o suspendidos.');
      return;
    }
    // Evaluar todas las formaciones con score ponderado:
    // rankScore = OVR_promedio * (0.7 + 0.3 * ratio_encaje_natural)
    // Así se prefiere una formación con más jugadores en posición natural
    // aunque el OVR promedio sea un poco menor.
    const totalSlots = 11;
    const formScores = FORMATION_KEYS.map(f => {
      const result = autoAssign(f, players);
      const fitRatio = result.naturalFits / totalSlots;
      const rankScore = result.score * (0.70 + 0.30 * fitRatio);
      return { f, score: result.score, naturalFits: result.naturalFits, rankScore };
    }).sort((a, b) => b.rankScore - a.rankScore);

    const bestForm = formScores[0].f;
    if (bestForm !== formation) setFormation(bestForm);
    const first = autoAssign(bestForm, players);

    // Evaluar formación óptima para los jugadores restantes de forma independiente
    const altFormScores = first.remaining.length >= 11
      ? FORMATION_KEYS.map(f => {
          const result = autoAssign(f, first.remaining);
          const fitRatio = result.naturalFits / totalSlots;
          const rankScore = result.score * (0.70 + 0.30 * fitRatio);
          return { f, score: result.score, naturalFits: result.naturalFits, rankScore };
        }).sort((a, b) => b.rankScore - a.rankScore)
      : formScores; // si no hay 11 sobrantes, reutilizamos el ranking anterior

    const bestFormAlt = altFormScores[0].f;
    const second = autoAssign(bestFormAlt, first.remaining);

    setSuggestions({
      first, second, bestForm, bestFormAlt,
      topForms:      formScores.slice(0, 5),
      topFormsAlt:   altFormScores.slice(0, 5),
      excludedCount: excluded.length,
      excludedNames: excluded.map(r => r.playerName),
    });
  };

  const handleSaveBoth = () => {
    if (!suggestions || !teamId) return;
    const f    = suggestions.bestForm    || formation;
    const fAlt = suggestions.bestFormAlt || f;
    const secondPlayers = Object.values(suggestions.second.assignment).filter(Boolean);

    // Titular: bench = primera mitad de segunda XI
    const titBench = {};
    BENCH_IDS.forEach((id, i) => { if (secondPlayers[i]) titBench[id] = secondPlayers[i]; });

    // Reservas: jugadores no asignados en ninguna alineación
    const usedNames = new Set([
      ...Object.values(suggestions.first.assignment).filter(Boolean).map(p => p.name),
      ...secondPlayers.map(p => p.name),
    ]);
    const rest = roster.map(r => parsePlayer(r.playerData))
      .filter(p => p.overall && !usedNames.has(p.name))
      .sort((a, b) => b.overall - a.overall);
    const titReserves = {};
    RESERVE_IDS.forEach((id, i) => { if (rest[i]) titReserves[id] = rest[i]; });

    const r1 = saveLineup({ teamId, lineupId: null, name: 'Titular', formation: f,
      squad: suggestions.first.assignment, bench: titBench, reserves: titReserves });
    if (!r1.ok) { Alert.alert('Error', r1.error || 'No se pudo guardar la alineación titular.'); return; }

    // Alternativa: bench = resto de jugadores no usados como reserva de titular
    const altPool = rest.slice(RESERVE_IDS.length);
    const altBench = {};
    BENCH_IDS.forEach((id, i) => { if (altPool[i]) altBench[id] = altPool[i]; });

    const r2 = saveLineup({ teamId, lineupId: null, name: 'Alternativa', formation: fAlt,
      squad: suggestions.second.assignment, bench: altBench, reserves: {} });

    if (!r2.ok) {
      Alert.alert('Titular guardada', `Alternativa: ${r2.error || 'no guardada'}.`);
    } else {
      Alert.alert('Alineaciones guardadas', 'Titular y Alternativa guardadas en el equipo.', [
        { text: 'Ver equipo', onPress: () => navigation.popToTop() },
        { text: 'Seguir editando' },
      ]);
    }
  };

  const handleLoad = (assignment, lineupName, withBench = false, formOverride = null) => {
    let bench = {}, reserves = {};
    const f = formOverride || suggestions?.bestForm || formation;

    if (withBench && suggestions) {
      const secondPlayers = Object.values(suggestions.second.assignment).filter(Boolean);
      BENCH_IDS.forEach((id, i) => { if (secondPlayers[i]) bench[id] = secondPlayers[i]; });
      const usedNames = new Set([
        ...Object.values(assignment).filter(Boolean).map(p => p.name),
        ...secondPlayers.map(p => p.name),
      ]);
      const rest = roster.map(r => parsePlayer(r.playerData))
        .filter(p => p.overall && !usedNames.has(p.name))
        .sort((a, b) => b.overall - a.overall);
      RESERVE_IDS.forEach((id, i) => { if (rest[i]) reserves[id] = rest[i]; });
    }

    // Guardar en DB para que aparezcan los tabs en la pizarra
    const saveResult = teamId
      ? saveLineupByName({ teamId, name: lineupName, formation: f, squad: assignment, bench, reserves })
      : { ok: false };

    loadLineup({
      teamId, teamName,
      lineupId:   saveResult.ok ? saveResult.id : null,
      lineupName,
      formation:  f,
      squad:      assignment,
      bench,
      reserves,
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

        {/* Filtro por posición */}
        {roster.length > 0 && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
              {[{ key: '', label: 'Todos' }, ...ALL_POS.map(pos => ({ key: pos, label: POS_ES[pos] || pos }))].map(({ key, label }) => (
                <TouchableOpacity
                  key={key || 'all'}
                  style={[s.filterChip, filterPos === key && s.filterChipActive]}
                  onPress={() => setFilterPos(key)}
                >
                  <Text style={[s.filterChipText, filterPos === key && s.filterChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={s.sortRow}>
              <Text style={s.sortLabel}>Ordenar:</Text>
              {[['ovr','OVR'],['age','Edad'],['name','Nombre']].map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[s.sortBtn, sortBy === key && s.sortBtnActive]}
                  onPress={() => setSortBy(key)}
                >
                  <Text style={[s.sortBtnText, sortBy === key && s.sortBtnTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {roster.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="people-outline" size={40} color="#334155" />
            <Text style={s.emptyText}>Sin jugadores. Toca "Añadir" para empezar.</Text>
          </View>
        ) : displayRoster.length === 0 ? (
          <Text style={s.emptyText}>Sin jugadores en esa posición.</Text>
        ) : (
          displayRoster.map(item => {
            const p = parsePlayer(item.playerData);
            return (
              <RosterItem
                key={item.id}
                item={item}
                assignment={playerAssignments[item.playerName]}
                onRemove={() => handleRemove(item)}
                onEdit={() => setEditingItem({ rosterId: item.id, player: p })}
                onStatusChange={() => handleStatusChange(item)}
              />
            );
          })
        )}
      </View>

      <SquadStatsCard roster={roster} />
      <PositionCoverageCard roster={roster} />

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
          {/* Formaciones óptimas detectadas */}
          <View style={s.bestFormRow}>
            <Ionicons name="sparkles" size={14} color="#fbbf24" />
            <Text style={s.bestFormLabel}>Titular:</Text>
            <View style={s.bestFormBadge}>
              <Text style={s.bestFormBadgeText}>{suggestions.bestForm}</Text>
            </View>
            {suggestions.bestFormAlt && suggestions.bestFormAlt !== suggestions.bestForm && (
              <>
                <Text style={[s.bestFormLabel, { marginLeft: 8 }]}>Alternativa:</Text>
                <View style={[s.bestFormBadge, { backgroundColor: '#1e1b4b' }]}>
                  <Text style={[s.bestFormBadgeText, { color: '#a78bfa' }]}>{suggestions.bestFormAlt}</Text>
                </View>
              </>
            )}
          </View>
          {suggestions.topForms?.length > 1 && (
            <View style={s.topFormsRow}>
              {suggestions.topForms.map(({ f, score, naturalFits }, i) => (
                <View key={f} style={[s.topFormChip, i === 0 && s.topFormChipBest]}>
                  <Text style={[s.topFormChipText, i === 0 && s.topFormChipTextBest]}>{f}</Text>
                  <Text style={[s.topFormChipScore, i === 0 && { color: '#fbbf24' }]}>{score}</Text>
                  <Text style={s.topFormChipFits}>{naturalFits}/11 ✓</Text>
                </View>
              ))}
            </View>
          )}

          {/* Banner excluidos */}
          {suggestions.excludedCount > 0 && (
            <View style={s.excludedBanner}>
              <Ionicons name="bandage-outline" size={14} color="#ef4444" />
              <Text style={s.excludedText} numberOfLines={2}>
                {suggestions.excludedCount} excluido{suggestions.excludedCount > 1 ? 's' : ''} (lesión/suspensión): {suggestions.excludedNames.join(', ')}
              </Text>
            </View>
          )}

          {/* Comparativa rápida titular vs segunda */}
          <View style={s.compareRow}>
            <View style={s.compareBox}>
              <Text style={s.compareLabel}>Titular</Text>
              <Text style={[s.compareOvr, { color: OVR_BG(suggestions.first.score) }]}>{suggestions.first.score}</Text>
              <Text style={s.compareInfo}>{suggestions.bestForm}</Text>
            </View>
            <View style={s.compareVs}><Text style={s.compareVsText}>VS</Text></View>
            <View style={s.compareBox}>
              <Text style={s.compareLabel}>Segunda</Text>
              <Text style={[s.compareOvr, { color: OVR_BG(suggestions.second.score) }]}>{suggestions.second.score}</Text>
              <Text style={s.compareInfo}>{suggestions.bestFormAlt || suggestions.bestForm}</Text>
            </View>
          </View>

          <SuggestionCard
            title="Alineación titular"
            formation={suggestions.bestForm || formation}
            assignment={suggestions.first.assignment}
            score={suggestions.first.score}
            onLoad={() => handleLoad(suggestions.first.assignment, 'Titular', true, suggestions.bestForm)}
          />
          <SuggestionCard
            title="Segunda alineación"
            formation={suggestions.bestFormAlt || suggestions.bestForm || formation}
            assignment={suggestions.second.assignment}
            score={suggestions.second.score}
            onLoad={() => handleLoad(suggestions.second.assignment, 'Alternativa', false, suggestions.bestFormAlt)}
          />

          <TouchableOpacity style={s.saveAllBtn} onPress={handleSaveBoth}>
            <Ionicons name="save-outline" size={16} color="#86efac" />
            <Text style={s.saveAllBtnText}>Guardar ambas alineaciones</Text>
          </TouchableOpacity>

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
        onCreateManual={() => setShowCreate(true)}
      />

      <PlayerFormModal
        visible={showCreate}
        initial={null}
        onClose={() => setShowCreate(false)}
        onSave={handleCreateManual}
      />

      <PlayerFormModal
        visible={!!editingItem}
        initial={editingItem?.player}
        onClose={() => setEditingItem(null)}
        onSave={handleEditSave}
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
  suggFitsCount:  { color: '#64748b', fontSize: 11, marginTop: 1 },
  suggPlayerName: { flex: 1, color: '#cbd5e1', fontSize: 13, fontWeight: '600' },
  suggPlayerAdj:  { flex: 1, color: '#f59e0b', fontSize: 13, fontWeight: '600' },
  suggPlayerOff:  { flex: 1, color: '#ef4444', fontSize: 13, fontWeight: '600' },
  suggOvr:       { fontSize: 13, fontWeight: '800', minWidth: 24, textAlign: 'right' },
  suggEmpty:     { color: '#475569', fontSize: 13, paddingVertical: 8 },
  offPosNote:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  offPosDot:     { width: 8, height: 8, borderRadius: 4 },
  offPosText:    { color: '#94a3b8', fontSize: 11 },

  loadBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1d4ed8', borderRadius: 10, paddingVertical: 11, marginTop: 10 },
  loadBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  saveAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#052e16', borderRadius: 14, paddingVertical: 15,
    borderWidth: 1, borderColor: '#16a34a',
  },
  saveAllBtnText: { color: '#86efac', fontSize: 15, fontWeight: '800' },

  statusBadge:   { alignItems: 'center', marginRight: 6, minWidth: 36 },
  statusText:    { color: '#fff', fontSize: 10, fontWeight: '900' },
  statusLineup:  { color: '#94a3b8', fontSize: 9, maxWidth: 48 },

  playerStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  playerStatusText:  { fontSize: 9, fontWeight: '700' },

  filterChip:          { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155' },
  filterChipActive:    { borderColor: '#3b82f6', backgroundColor: '#0d1f3c' },
  filterChipText:      { color: '#475569', fontSize: 11, fontWeight: '600' },
  filterChipTextActive:{ color: '#3b82f6' },
  sortRow:             { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sortLabel:           { color: '#475569', fontSize: 11 },
  sortBtn:             { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155' },
  sortBtnActive:       { borderColor: '#3b82f6', backgroundColor: '#0d1f3c' },
  sortBtnText:         { color: '#475569', fontSize: 11, fontWeight: '600' },
  sortBtnTextActive:   { color: '#3b82f6' },

  shareBtn:        { width: 44, height: 44, borderRadius: 10, backgroundColor: '#1e3a5f', borderWidth: 1, borderColor: '#1d4ed8', justifyContent: 'center', alignItems: 'center' },
  excludedBanner:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#2d0808', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#ef444444' },
  excludedText:    { color: '#fca5a5', fontSize: 11, flex: 1 },

  bestFormRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1e293b', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#f59e0b33' },
  bestFormLabel:   { color: '#94a3b8', fontSize: 12, fontWeight: '600', flex: 1 },
  bestFormBadge:   { backgroundColor: '#92400e', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  bestFormBadgeText: { color: '#fbbf24', fontSize: 12, fontWeight: '800' },

  topFormsRow:          { flexDirection: 'row', gap: 6 },
  topFormChip:          { flex: 1, backgroundColor: '#1e293b', borderRadius: 8, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  topFormChipBest:      { borderColor: '#f59e0b', backgroundColor: '#1c1709' },
  topFormChipText:      { color: '#475569', fontSize: 10, fontWeight: '700' },
  topFormChipTextBest:  { color: '#fbbf24' },
  topFormChipScore:     { color: '#475569', fontSize: 13, fontWeight: '900' },
  topFormChipFits:      { color: '#22c55e', fontSize: 9, fontWeight: '700' },

  compareRow:  { flexDirection: 'row', backgroundColor: '#1e293b', borderRadius: 14, borderWidth: 1, borderColor: '#334155', overflow: 'hidden' },
  compareBox:  { flex: 1, alignItems: 'center', paddingVertical: 14, gap: 2 },
  compareLabel:{ color: '#64748b', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  compareOvr:  { fontSize: 28, fontWeight: '900' },
  compareInfo: { color: '#475569', fontSize: 11 },
  compareVs:   { width: 1, backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14 },
  compareVsText: { color: '#334155', fontSize: 10, fontWeight: '800', position: 'absolute' },
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
  manualBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, margin: 12, borderRadius: 10, backgroundColor: '#1e1b4b', borderWidth: 1, borderColor: '#4c1d95' },
  manualBtnText: { color: '#a78bfa', fontSize: 13, fontWeight: '700' },
});

// ─── Estilos AddPlayerModal extras ───────────────────────────
// (manualBtn ya referenciado arriba)

// ─── Estilos PlayerFormModal ──────────────────────────────────
const pf = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet:   { backgroundColor: '#1e293b', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%', paddingBottom: 16 },
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  title:   { color: '#f1f5f9', fontSize: 16, fontWeight: '700' },
  body:    { padding: 16 },
  label:   { color: '#94a3b8', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 14 },
  input:   { backgroundColor: '#0f172a', borderRadius: 10, paddingHorizontal: 14, height: 44, color: '#f1f5f9', fontSize: 14, borderWidth: 1, borderColor: '#334155' },
  row:     { flexDirection: 'row' },
  groupLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  posGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  posChip:        { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155' },
  posChipActive:  { backgroundColor: '#1e3a5f', borderColor: '#3b82f6' },
  posChipText:    { color: '#475569', fontSize: 12, fontWeight: '700' },
  posChipTextActive: { color: '#60a5fa' },
  saveBtn:     { margin: 16, backgroundColor: '#3b82f6', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
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
