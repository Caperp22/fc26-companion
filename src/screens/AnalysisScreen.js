import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { FORMATIONS } from '../constants/formations';
import {
  getAffordablePlayersByPosition,
  getFreeAgentCandidates,
  getLineupsByTeam,
  getTeams,
  getTopPlayersByPosition,
} from '../db/database';
import { useBudgetStore } from '../store/budgetStore';
import { useSquadStore } from '../store/squadStore';

// ─── Compatibilidad de posición ─────────────────────────────────
const ADJACENT = {
  GK:  [],
  CB:  ['LB', 'RB', 'CDM'],
  LB:  ['CB', 'LWB', 'LM'],
  RB:  ['CB', 'RWB', 'RM'],
  LWB: ['LB', 'LM'],
  RWB: ['RB', 'RM'],
  CDM: ['CM', 'CB'],
  CM:  ['CDM', 'CAM', 'LM', 'RM'],
  CAM: ['CM', 'CF', 'LW', 'RW'],
  LM:  ['LW', 'CM', 'LB'],
  RM:  ['RW', 'CM', 'RB'],
  LW:  ['LM', 'ST', 'CAM'],
  RW:  ['RM', 'ST', 'CAM'],
  CF:  ['ST', 'CAM'],
  ST:  ['CF', 'LW', 'RW'],
};

function matchScore(player, targetPos) {
  const positions = (player.positions || player.position || '')
    .split(',').map(p => p.trim()).filter(Boolean);
  if (positions.includes(targetPos)) return 1.0;
  if ((ADJACENT[targetPos] || []).some(p => positions.includes(p))) return 0.70;
  return 0.45;
}

function scoreFormation(slots, playerPool) {
  const available = [...playerPool];
  let total = 0;
  for (const slot of slots) {
    let bestVal = 0, bestIdx = -1;
    available.forEach((p, i) => {
      const v = matchScore(p, slot.position) * p.overall;
      if (v > bestVal) { bestVal = v; bestIdx = i; }
    });
    if (bestIdx >= 0) {
      total += bestVal;
      available.splice(bestIdx, 1);
    }
  }
  return Math.round(total / slots.length);
}

// ─── Componentes base ───────────────────────────────────────────
function SectionHeader({ icon, title, subtitle }) {
  return (
    <View style={s.sectionHeader}>
      <View style={s.iconWrap}>
        <Ionicons name={icon} size={18} color="#3b82f6" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={s.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

function OvrBadge({ ovr }) {
  const bg = ovr >= 85 ? '#d97706' : ovr >= 75 ? '#16a34a' : '#4b5563';
  return (
    <View style={[s.ovrBadge, { backgroundColor: bg }]}>
      <Text style={s.ovrText}>{ovr}</Text>
    </View>
  );
}

function TipBox({ text }) {
  return (
    <View style={s.tipBox}>
      <Ionicons name="bulb-outline" size={14} color="#fbbf24" />
      <Text style={s.tipText}>{text}</Text>
    </View>
  );
}

const fmtVal = (v) => {
  if (!v || v === 0) return 'LIBRE';
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `€${Math.round(v / 1_000)}K`;
  return `€${v}`;
};

function CandidateRow({ player, rank, affordable, isFree, onPress }) {
  return (
    <TouchableOpacity style={s.candidateRow} onPress={onPress} activeOpacity={0.7}>
      <Text style={s.candidateRank}>#{rank}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.candidateName} numberOfLines={1}>{player.name}</Text>
        <Text style={s.candidateClub} numberOfLines={1}>{player.club}</Text>
      </View>
      <View style={[s.priceBadge, isFree && s.priceFree, !affordable && !isFree && s.priceOver]}>
        <Text style={[s.priceText, isFree && s.priceFreeText, !affordable && !isFree && s.priceOverText]}>
          {fmtVal(player.marketValue)}
        </Text>
      </View>
      <OvrBadge ovr={player.overall} />
      <Ionicons name="chevron-forward" size={13} color="#334155" />
    </TouchableOpacity>
  );
}

const goToDetail = (navigation, player) =>
  navigation.navigate('PlayerDetail', { player, selectionMode: false });

// ─── Sección 0: Radar de profundidad por posición ──────────────
const ALL_POSITIONS = ['GK','LB','CB','RB','LWB','RWB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST'];
const POS_ES = { GK:'PO',LB:'DFI',CB:'DFC',RB:'DFD',LWB:'CAI',RWB:'CAD',CDM:'MCD',CM:'MC',CAM:'MCO',LM:'MI',RM:'MD',LW:'EI',RW:'ED',CF:'SD',ST:'DC' };

const POS_COLOR = (pos) => {
  if (pos === 'GK') return '#b45309';
  if (['CB','LB','RB','LWB','RWB'].includes(pos)) return '#1d4ed8';
  if (['CDM','CM','CAM','LM','RM'].includes(pos)) return '#6d28d9';
  return '#b91c1c';
};

function DepthChartSection({ squad, bench, reserves }) {
  const [allLineups, setAllLineups] = useState([]);
  const [selectedId, setSelectedId] = useState('active');

  useEffect(() => {
    try {
      const teams = getTeams();
      const flat = [];
      teams.forEach(t => getLineupsByTeam(t.id).forEach(l => flat.push({ ...l, teamName: t.name })));
      setAllLineups(flat);
    } catch {}
  }, []);

  const { viewSq, viewBn, viewRs } = useMemo(() => {
    if (selectedId === 'active') return { viewSq: squad, viewBn: bench, viewRs: reserves };
    const lu = allLineups.find(l => l.id === selectedId);
    if (!lu) return { viewSq: squad, viewBn: bench, viewRs: reserves };
    const parse = (str) => { try { return JSON.parse(str || '{}'); } catch { return {}; } };
    return { viewSq: parse(lu.squad), viewBn: parse(lu.bench), viewRs: parse(lu.reserves) };
  }, [selectedId, allLineups, squad, bench, reserves]);

  const coverage = useMemo(() => {
    const counts = {};
    ALL_POSITIONS.forEach(pos => { counts[pos] = 0; });
    [...Object.values(viewSq), ...Object.values(viewBn), ...Object.values(viewRs)]
      .filter(Boolean)
      .forEach(p => {
        (p.positions || p.position || '').split(',').map(s => s.trim()).filter(Boolean)
          .forEach(pos => { if (counts[pos] !== undefined) counts[pos]++; });
      });
    return counts;
  }, [viewSq, viewBn, viewRs]);

  const total = Object.values(viewSq).filter(Boolean).length +
                Object.values(viewBn).filter(Boolean).length +
                Object.values(viewRs).filter(Boolean).length;
  const weakSpots = ALL_POSITIONS.filter(p => coverage[p] < 2).length;

  return (
    <View style={s.card}>
      <SectionHeader
        icon="grid-outline"
        title="Cobertura por posición"
        subtitle={total === 0 ? 'Selecciona una alineación' : `${weakSpots} posición${weakSpots !== 1 ? 'es' : ''} con cobertura débil`}
      />

      {/* Selector de alineación */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.depthChipScroll} contentContainerStyle={s.depthChipRow}>
        <TouchableOpacity
          style={[s.depthChip, selectedId === 'active' && s.depthChipActive]}
          onPress={() => setSelectedId('active')}
        >
          <Ionicons name="football-outline" size={12} color={selectedId === 'active' ? '#3b82f6' : '#475569'} />
          <Text style={[s.depthChipText, selectedId === 'active' && s.depthChipTextActive]}>Pizarra</Text>
        </TouchableOpacity>
        {allLineups.map(l => (
          <TouchableOpacity
            key={l.id}
            style={[s.depthChip, selectedId === l.id && s.depthChipActive]}
            onPress={() => setSelectedId(l.id)}
          >
            <Text style={[s.depthChipText, selectedId === l.id && s.depthChipTextActive]} numberOfLines={1}>
              {l.teamName} · {l.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={s.depthGrid}>
        {ALL_POSITIONS.map(pos => {
          const count = coverage[pos];
          const bg  = count === 0 ? '#3f0f0f' : count === 1 ? '#3d2f00' : '#0d2f1a';
          const dot = count === 0 ? '#ef4444' : count === 1 ? '#f59e0b' : '#22c55e';
          return (
            <View key={pos} style={[s.depthCell, { backgroundColor: bg }]}>
              <View style={[s.depthPosBadge, { backgroundColor: POS_COLOR(pos) }]}>
                <Text style={s.depthPosText}>{POS_ES[pos] || pos}</Text>
              </View>
              <View style={s.depthCountRow}>
                <View style={[s.depthDot, { backgroundColor: dot }]} />
                <Text style={[s.depthCount, { color: dot }]}>{count}</Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={s.depthLegend}>
        {[['#ef4444','Sin cobertura'],['#f59e0b','1 jugador'],['#22c55e','2+ jugadores']].map(([c, l]) => (
          <View key={l} style={s.depthLegendItem}>
            <View style={[s.depthDot, { backgroundColor: c }]} />
            <Text style={s.depthLegendText}>{l}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Sección 1: Huecos ──────────────────────────────────────────
function GapsSection({ formation, squad, balance, navigation }) {
  const slots = FORMATIONS[formation]?.slots || [];
  const emptySlots = slots.filter(sl => !squad[sl.id]);
  const missingPos = [...new Set(emptySlots.map(sl => sl.position))];

  const suggestions = useMemo(() => {
    const out = {};
    missingPos.forEach(pos => {
      out[pos] = {
        affordable: getAffordablePlayersByPosition(pos, balance, 4),
        free:       getFreeAgentCandidates(pos, 3),
        best:       getTopPlayersByPosition(pos, 3),
      };
    });
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingPos.join(','), balance]);

  const subtitle = emptySlots.length === 0
    ? null
    : `${emptySlots.length} posición${emptySlots.length > 1 ? 'es' : ''} sin cubrir`;

  return (
    <View style={s.card}>
      <SectionHeader icon="alert-circle-outline" title="Huecos del equipo" subtitle={subtitle} />

      {/* Balance disponible */}
      <View style={s.balanceRow}>
        <Ionicons name="wallet-outline" size={14} color="#64748b" />
        <Text style={s.balanceLabel}>Presupuesto disponible: </Text>
        <Text style={[s.balanceValue, balance <= 0 && { color: '#ef4444' }]}>
          {fmtVal(balance)}
        </Text>
      </View>

      {emptySlots.length === 0 ? (
        <View style={s.successRow}>
          <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
          <Text style={s.successText}>Once completo. Sin posiciones vacías.</Text>
        </View>
      ) : (
        missingPos.map(pos => {
          const slotsForPos  = emptySlots.filter(sl => sl.position === pos);
          const { affordable, free, best } = suggestions[pos] || {};

          return (
            <View key={pos} style={s.gapBlock}>
              <View style={s.gapLabelRow}>
                <View style={s.posBadge}>
                  <Text style={s.posText}>{slotsForPos[0]?.label ?? POS_ES[pos] ?? pos}</Text>
                </View>
                <Text style={s.gapPosName}>{POS_ES[pos] || pos}</Text>
                {slotsForPos.length > 1 && <Text style={s.gapCount}>× {slotsForPos.length}</Text>}
              </View>

              {/* Dentro del presupuesto */}
              {affordable?.length > 0 ? (
                <>
                  <Text style={s.subheading}>Dentro de presupuesto</Text>
                  {affordable.map((p, i) => (
                    <CandidateRow key={p.id} player={p} rank={i + 1} affordable isFree={p.marketValue === 0}
                      onPress={() => goToDetail(navigation, p)} />
                  ))}
                </>
              ) : (
                <View style={s.noAffordRow}>
                  <Ionicons name="close-circle-outline" size={14} color="#ef4444" />
                  <Text style={s.noAffordText}>
                    {balance <= 0
                      ? 'Sin presupuesto disponible.'
                      : 'No hay candidatos dentro del presupuesto actual.'}
                  </Text>
                </View>
              )}

              {/* Agentes libres */}
              {free?.length > 0 && (
                <>
                  <Text style={[s.subheading, { color: '#22c55e', marginTop: 10 }]}>Agentes libres / sin coste</Text>
                  {free.map((p, i) => (
                    <CandidateRow key={p.id} player={p} rank={i + 1} affordable isFree
                      onPress={() => goToDetail(navigation, p)} />
                  ))}
                </>
              )}

              {/* Mejores sin filtro (referencia) */}
              {affordable?.length === 0 && best?.length > 0 && (
                <>
                  <Text style={[s.subheading, { marginTop: 10 }]}>Mejores disponibles (referencia)</Text>
                  {best.map((p, i) => (
                    <CandidateRow key={p.id} player={p} rank={i + 1} affordable={false} isFree={false}
                      onPress={() => goToDetail(navigation, p)} />
                  ))}
                </>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

// ─── Sección 2: Mejor formación ─────────────────────────────────
function BestFormationSection({ currentFormation, squad, bench, reserves }) {
  const playerPool = useMemo(() => {
    const all = [
      ...Object.values(squad),
      ...Object.values(bench),
      ...Object.values(reserves),
    ].filter(Boolean);
    const seen = new Set();
    return all.filter(p => { if (seen.has(p.name)) return false; seen.add(p.name); return true; });
  }, [squad, bench, reserves]);

  const rankings = useMemo(() => {
    if (playerPool.length < 3) return [];
    return Object.entries(FORMATIONS)
      .map(([name, { slots }]) => ({ name, score: scoreFormation(slots, playerPool) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [playerPool]);

  if (playerPool.length < 3) {
    return (
      <View style={s.card}>
        <SectionHeader icon="analytics-outline" title="Mejor formación" />
        <Text style={s.emptyHint}>
          Añade al menos 3 jugadores a la pizarra para ver sugerencias.
        </Text>
      </View>
    );
  }

  const topScore = rankings[0]?.score || 1;
  const RANK_COLORS = ['#f59e0b', '#94a3b8', '#b45309', '#475569', '#475569'];

  return (
    <View style={s.card}>
      <SectionHeader
        icon="analytics-outline"
        title="Mejor formación"
        subtitle={`${playerPool.length} jugadores analizados`}
      />

      {rankings.map((item, i) => {
        const isCurrent = item.name === currentFormation;
        const barPct    = Math.round((item.score / topScore) * 100);
        return (
          <View
            key={item.name}
            style={[s.formRow, isCurrent && s.formRowActive]}
          >
            <View style={[s.rankBadge, { backgroundColor: RANK_COLORS[i] + '22', borderColor: RANK_COLORS[i] + '55' }]}>
              <Text style={[s.rankText, { color: RANK_COLORS[i] }]}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={s.formNameRow}>
                <Text style={[s.formName, isCurrent && { color: '#60a5fa' }]}>{item.name}</Text>
                {isCurrent && (
                  <View style={s.currentTag}>
                    <Text style={s.currentTagText}>actual</Text>
                  </View>
                )}
              </View>
              <View style={s.formBar}>
                <View style={[s.formBarFill, {
                  width: `${barPct}%`,
                  backgroundColor: i === 0 ? '#3b82f6' : '#334155',
                }]} />
              </View>
            </View>
            <Text style={[s.formScore, i === 0 && { color: '#60a5fa' }]}>{item.score}</Text>
          </View>
        );
      })}

      {rankings.length > 0 && rankings[0].name !== currentFormation && (
        <TipBox
          text={`Cambiar a ${rankings[0].name} podría mejorar tu equipo con los jugadores que tienes actualmente.`}
        />
      )}
    </View>
  );
}

// ─── Sección 3: Rotaciones ──────────────────────────────────────
function RotationsSection({ loadedTeamId, loadedTeamName, navigation }) {
  const [lineups, setLineups] = useState([]);

  useEffect(() => {
    const load = () => setLineups(loadedTeamId ? getLineupsByTeam(loadedTeamId) : []);
    load();
    const unsub = navigation?.addListener('focus', load);
    return unsub;
  }, [loadedTeamId, navigation]);

  if (!loadedTeamId) {
    return (
      <View style={s.card}>
        <SectionHeader icon="swap-horizontal-outline" title="Rotaciones" />
        <Text style={s.emptyHint}>
          Carga un equipo desde la Pizarra → Mis Equipos para ver sugerencias de rotación.
        </Text>
      </View>
    );
  }

  if (lineups.length < 2) {
    return (
      <View style={s.card}>
        <SectionHeader icon="swap-horizontal-outline" title="Rotaciones" subtitle={loadedTeamName} />
        <Text style={s.emptyHint}>
          Este equipo tiene {lineups.length === 0 ? 'ninguna' : 'solo una'} alineación.
          Guarda una segunda (ej. "Alternativa") para ver sugerencias de rotación.
        </Text>
      </View>
    );
  }

  const [l1, l2] = lineups;
  const squad1 = (() => { try { return JSON.parse(l1.squad || '{}'); } catch { return {}; } })();
  const squad2 = (() => { try { return JSON.parse(l2.squad || '{}'); } catch { return {}; } })();

  const names1 = new Set(Object.values(squad1).filter(Boolean).map(p => p.name));
  const names2 = new Set(Object.values(squad2).filter(Boolean).map(p => p.name));
  const shared  = [...names1].filter(n => names2.has(n));
  const onlyIn1 = Object.values(squad1).filter(p => p && !names2.has(p.name));
  const onlyIn2 = Object.values(squad2).filter(p => p && !names1.has(p.name));

  const total      = Math.max(names1.size, names2.size, 1);
  const rotPct     = Math.round((1 - shared.length / total) * 100);
  const rotColor   = rotPct >= 50 ? '#22c55e' : rotPct >= 25 ? '#f59e0b' : '#ef4444';
  const rotLabel   = rotPct >= 50 ? 'Buena rotación' : rotPct >= 25 ? 'Rotación moderada' : 'Poca rotación';

  return (
    <View style={s.card}>
      <SectionHeader
        icon="swap-horizontal-outline"
        title="Rotaciones"
        subtitle={loadedTeamName}
      />

      {/* Medidor */}
      <View style={s.rotMeter}>
        <View style={{ flex: 1 }}>
          <View style={s.rotLabelRow}>
            <Text style={s.rotMeterLabel}>Índice de rotación</Text>
            <Text style={[s.rotLabel, { color: rotColor }]}>{rotLabel}</Text>
          </View>
          <View style={s.rotBar}>
            <View style={[s.rotBarFill, { width: `${rotPct}%`, backgroundColor: rotColor }]} />
          </View>
        </View>
        <Text style={[s.rotPct, { color: rotColor }]}>{rotPct}%</Text>
      </View>

      {/* Comparativa */}
      <View style={s.rotCompare}>
        <View style={s.rotCol}>
          <Text style={s.rotLineupName} numberOfLines={1}>{l1.name}</Text>
          <Text style={s.rotFormation}>{l1.formation}  ·  {names1.size}/11</Text>
        </View>
        <Ionicons name="swap-horizontal" size={20} color="#334155" />
        <View style={[s.rotCol, { alignItems: 'flex-end' }]}>
          <Text style={s.rotLineupName} numberOfLines={1}>{l2.name}</Text>
          <Text style={s.rotFormation}>{l2.formation}  ·  {names2.size}/11</Text>
        </View>
      </View>

      {/* Jugadores compartidos */}
      {shared.length > 0 && (
        <View style={s.sharedBlock}>
          <Text style={s.sharedTitle}>
            {shared.length} jugador{shared.length > 1 ? 'es' : ''} en ambas alineaciones
          </Text>
          {shared.slice(0, 6).map(name => (
            <View key={name} style={s.sharedRow}>
              <View style={s.sharedDot} />
              <Text style={s.sharedName}>{name}</Text>
            </View>
          ))}
          {shared.length > 6 && (
            <Text style={s.moreText}>... y {shared.length - 6} más</Text>
          )}
          <TipBox
            text={`Estos jugadores juegan en los dos once. Úsalos en partidos clave con "${l1.name}" y dales descanso rotando a "${l2.name}".`}
          />
        </View>
      )}

      {/* Exclusivos por alineación */}
      {(onlyIn1.length > 0 || onlyIn2.length > 0) && (
        <View style={s.exclusiveBlock}>
          <Text style={s.exclusiveTitle}>Jugadores exclusivos</Text>
          <View style={s.exclusiveRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.exclusiveLineup}>{l1.name}</Text>
              {onlyIn1.slice(0, 5).map(p => (
                <Text key={p.name} style={s.exclusiveName} numberOfLines={1}>· {p.name}</Text>
              ))}
            </View>
            <View style={s.exclusiveDivider} />
            <View style={{ flex: 1 }}>
              <Text style={[s.exclusiveLineup, { textAlign: 'right' }]}>{l2.name}</Text>
              {onlyIn2.slice(0, 5).map(p => (
                <Text key={p.name} style={[s.exclusiveName, { textAlign: 'right' }]} numberOfLines={1}>{p.name} ·</Text>
              ))}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Sección 4: Posiciones a mejorar según presupuesto ────────
function WeakSpotsSection({ formation, squad, bench, reserves, balance, navigation }) {
  const slots = FORMATIONS[formation]?.slots || [];
  const allPlayers = useMemo(() =>
    [...Object.values(squad), ...Object.values(bench), ...Object.values(reserves)].filter(Boolean),
    [squad, bench, reserves]);
  const avgOvr = allPlayers.length ? Math.round(allPlayers.reduce((s, p) => s + p.overall, 0) / allPlayers.length) : 75;

  const weak = useMemo(() => {
    const seen = new Set();
    return slots
      .filter(sl => { const p = squad[sl.id]; return p && p.overall < avgOvr && !seen.has(sl.position) && seen.add(sl.position); })
      .map(sl => {
        const player = squad[sl.id];
        const candidates = balance > 0 ? getAffordablePlayersByPosition(sl.position, balance, 3) : [];
        const best = getTopPlayersByPosition(sl.position, 1)[0];
        return { slot: sl, player, candidates, best, gap: best ? best.overall - player.overall : 0 };
      })
      .sort((a, b) => b.gap - a.gap).slice(0, 4);
  }, [slots, squad, avgOvr, balance]);

  if (allPlayers.length < 3) return null;
  return (
    <View style={s.card}>
      <SectionHeader icon="trending-up-outline" title="Posiciones a mejorar"
        subtitle={weak.length === 0 ? 'Todos los titulares sobre la media del equipo' : `${weak.length} puesto${weak.length > 1 ? 's' : ''} por debajo de la media (${avgOvr} OVR)`} />
      {weak.length === 0 ? (
        <View style={s.successRow}><Ionicons name="checkmark-circle" size={20} color="#22c55e" />
          <Text style={s.successText}>Equipo equilibrado — sin puestos críticos.</Text></View>
      ) : weak.map(({ slot, player, candidates, best, gap }) => (
        <View key={slot.id} style={s.gapBlock}>
          <View style={s.gapLabelRow}>
            <View style={s.posBadge}><Text style={s.posText}>{slot.label}</Text></View>
            <Text style={s.gapPosName} numberOfLines={1}>{player.name}</Text>
            <View style={[s.ovrBadge, { backgroundColor: player.overall >= 75 ? '#16a34a' : '#4b5563' }]}>
              <Text style={s.ovrText}>{player.overall}</Text></View>
            {gap > 0 && <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '700' }}>▲{gap}</Text>}
          </View>
          {candidates.length > 0 ? (
            <>{<Text style={s.subheading}>Mejoras dentro del presupuesto</Text>}
              {candidates.map((p, i) => <CandidateRow key={p.id} player={p} rank={i+1} affordable isFree={p.marketValue===0} onPress={() => goToDetail(navigation, p)} />)}
            </>
          ) : (
            <Text style={s.noAffordText}>{balance <= 0 ? 'Sin presupuesto.' : `Sin candidatos asequibles. Mejor opción: ${best?.name || '—'} (${best?.overall || '—'})`}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

// ─── Sección 5: Cambios de partido ────────────────────────────
function MatchSubsSection({ formation, squad, bench }) {
  const slots = FORMATIONS[formation]?.slots || [];
  const benchPlayers = Object.values(bench).filter(Boolean);

  const subs = useMemo(() => {
    if (!benchPlayers.length) return [];
    return slots.filter(sl => squad[sl.id]).map(sl => {
      const cur = squad[sl.id];
      const curVal = matchScore(cur, sl.position) * cur.overall;
      const best = benchPlayers
        .map(p => ({ player: p, val: matchScore(p, sl.position) * p.overall }))
        .filter(x => x.val > curVal)
        .sort((a, b) => b.val - a.val)[0];
      if (!best) return null;
      return { slot: sl, out: cur, in: best.player, posScore: matchScore(cur, sl.position) };
    }).filter(Boolean)
      .sort((a, b) => (b.in.overall - b.out.overall + (b.posScore < 1 ? 8 : 0)) - (a.in.overall - a.out.overall + (a.posScore < 1 ? 8 : 0)))
      .slice(0, 4);
  }, [slots, squad, bench]);

  return (
    <View style={s.card}>
      <SectionHeader icon="git-compare-outline" title="Cambios de partido"
        subtitle={!benchPlayers.length ? 'Asigna suplentes en la Pizarra' : `${subs.length} cambio${subs.length !== 1 ? 's' : ''} recomendado${subs.length !== 1 ? 's' : ''}`} />
      {!benchPlayers.length ? <Text style={s.emptyHint}>Llena el banco de suplentes para ver sugerencias de cambios.</Text>
        : subs.length === 0 ? <View style={s.successRow}><Ionicons name="checkmark-circle" size={20} color="#22c55e" /><Text style={s.successText}>El once actual es óptimo con los suplentes disponibles.</Text></View>
        : subs.map(({ slot, out: outP, in: inP, posScore }) => (
          <View key={slot.id} style={s.subRow}>
            <View style={{ flex: 1 }}>
              <View style={s.subLine}>
                <Ionicons name="arrow-down-circle" size={14} color="#ef4444" />
                <Text style={s.subOut} numberOfLines={1}>{outP.name}</Text>
                {posScore < 1 && <Ionicons name="warning-outline" size={11} color="#f59e0b" />}
                <Text style={s.ovrSmall}>{outP.overall}</Text>
              </View>
              <View style={s.subLine}>
                <Ionicons name="arrow-up-circle" size={14} color="#22c55e" />
                <Text style={s.subIn} numberOfLines={1}>{inP.name}</Text>
                <Text style={[s.ovrSmall, { color: '#22c55e' }]}>{inP.overall}</Text>
              </View>
            </View>
            <View style={[s.posBadge, { alignSelf: 'center', marginLeft: 8 }]}><Text style={s.posText}>{slot.label}</Text></View>
          </View>
        ))
      }
    </View>
  );
}

// ─── Sección 6: Contra-formación ──────────────────────────────
const FORM_PROFILE = {
  '4-3-3':{'def':4,'mid':3,'att':3},'4-3-3 (A)':{'def':4,'mid':2,'att':4},'4-3-3 (D)':{'def':5,'mid':3,'att':3},
  '4-4-2':{'def':4,'mid':4,'att':2},'4-4-2 ♦':{'def':4,'mid':4,'att':2},
  '4-2-3-1':{'def':4,'mid':5,'att':1},'4-2-3-1 (W)':{'def':4,'mid':5,'att':1},
  '4-5-1':{'def':4,'mid':5,'att':1},'4-1-4-1':{'def':4,'mid':5,'att':1},
  '4-1-2-1-2':{'def':4,'mid':4,'att':2},'4-3-1-2':{'def':4,'mid':4,'att':2},
  '4-1-3-2':{'def':4,'mid':4,'att':2},'4-3-2-1':{'def':4,'mid':5,'att':1},'4-4-1-1':{'def':4,'mid':4,'att':2},
  '3-4-3':{'def':3,'mid':4,'att':3},'3-4-1-2':{'def':3,'mid':5,'att':2},'3-5-2':{'def':3,'mid':5,'att':2},
  '5-3-2':{'def':5,'mid':3,'att':2},'5-4-1':{'def':5,'mid':4,'att':1},'5-2-2-1':{'def':5,'mid':4,'att':1},
};
const WHY = {
  defensive:'El rival ataca con muchos hombres — refuerza la línea defensiva',
  midfield: 'El rival domina el medio — iguala o supera su número de centrocampistas',
  attacking:'El rival es conservador — presiona con más atacantes para superarlos',
  balanced: 'Formación equilibrada que se adapta bien al rival',
};

function CounterFormationSection({ squad, bench, reserves }) {
  const [rival, setRival] = useState(null);
  const playerPool = useMemo(() => {
    const all = [...Object.values(squad),...Object.values(bench),...Object.values(reserves)].filter(Boolean);
    const seen = new Set();
    return all.filter(p => { if (seen.has(p.name)) return false; seen.add(p.name); return true; });
  }, [squad, bench, reserves]);

  const counters = useMemo(() => {
    if (!rival || playerPool.length < 3) return [];
    const rp = FORM_PROFILE[rival];
    return Object.entries(FORM_PROFILE).map(([name, mp]) => {
      let score = 0, reason = 'balanced';
      if (mp.def >= rp.att + 1) { score += 3; reason = 'defensive'; }
      else if (mp.def >= rp.att) score += 1;
      if (mp.mid >= rp.mid)     { score += 2; if (reason === 'balanced') reason = 'midfield'; }
      if (mp.att > rp.att)      { score += 1; if (reason === 'balanced') reason = 'attacking'; }
      const squadScore = scoreFormation(FORMATIONS[name]?.slots || [], playerPool);
      return { name, score, reason, squadScore };
    }).sort((a, b) => (b.score * 100 + b.squadScore) - (a.score * 100 + a.squadScore)).slice(0, 3);
  }, [rival, playerPool]);

  const rivals = Object.keys(FORM_PROFILE);
  return (
    <View style={s.card}>
      <SectionHeader icon="shield-half-outline" title="Táctica vs rival" subtitle="Elige la formación del rival" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.depthChipRow} style={s.depthChipScroll}>
        {rivals.map(f => (
          <TouchableOpacity key={f} style={[s.depthChip, rival===f && s.depthChipActive]} onPress={() => setRival(rival===f ? null : f)}>
            <Text style={[s.depthChipText, rival===f && s.depthChipTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {!rival ? <Text style={[s.emptyHint,{marginTop:8}]}>Selecciona la formación del rival para ver la mejor táctica.</Text>
        : playerPool.length < 3 ? <Text style={s.emptyHint}>Añade jugadores a la pizarra para ver recomendaciones.</Text>
        : <>
          <Text style={[s.subheading, { marginTop: 12 }]}>Mejores formaciones contra {rival}</Text>
          {counters.map((c, i) => (
            <View key={c.name} style={[s.formRow, i===0 && s.formRowActive]}>
              <View style={[s.rankBadge, { backgroundColor: i===0?'#1e3a5f':'transparent', borderColor: i===0?'#3b82f6':'#334155' }]}>
                <Text style={[s.rankText, { color: i===0?'#60a5fa':'#64748b' }]}>{i+1}</Text>
              </View>
              <View style={{ flex:1 }}>
                <Text style={[s.formName, i===0&&{color:'#f1f5f9'}]}>{c.name}</Text>
                <Text style={{ color:'#475569', fontSize:10, marginTop:2 }}>{WHY[c.reason]}</Text>
              </View>
              <Text style={[s.formScore, i===0&&{color:'#60a5fa'}]}>{c.squadScore}</Text>
            </View>
          ))}
          <TipBox text={`Contra ${rival}: usa ${counters[0]?.name}. ${WHY[counters[0]?.reason]}.`} />
        </>
      }
    </View>
  );
}

// ─── Main ────────────────────────────────────────────────────────
export default function AnalysisScreen({ navigation }) {
  const { formation, squad, bench, reserves, loadedTeamId, loadedTeamName } = useSquadStore();
  const { budget, transactions } = useBudgetStore();
  const totalSpent  = transactions.filter(t => t.type === 'compra').reduce((s, t) => s + t.amount, 0);
  const totalEarned = transactions.filter(t => t.type === 'venta').reduce((s, t) => s + t.amount, 0);
  const balance     = budget + totalEarned - totalSpent;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <DepthChartSection squad={squad} bench={bench} reserves={reserves} />
      <GapsSection formation={formation} squad={squad} balance={balance} navigation={navigation} />
      <WeakSpotsSection formation={formation} squad={squad} bench={bench} reserves={reserves} balance={balance} navigation={navigation} />
      <BestFormationSection currentFormation={formation} squad={squad} bench={bench} reserves={reserves} />
      <MatchSubsSection formation={formation} squad={squad} bench={bench} />
      <CounterFormationSection squad={squad} bench={bench} reserves={reserves} />
      <RotationsSection loadedTeamId={loadedTeamId} loadedTeamName={loadedTeamName} navigation={navigation} />
    </ScrollView>
  );
}

// ─── Estilos ─────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content:   { padding: 16, paddingBottom: 40, gap: 14 },

  card: {
    backgroundColor: '#1e293b', borderRadius: 16,
    borderWidth: 1, borderColor: '#334155', padding: 16,
  },

  sectionHeader:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  iconWrap:        { width: 36, height: 36, borderRadius: 10, backgroundColor: '#1e3a5f', justifyContent: 'center', alignItems: 'center' },
  sectionTitle:    { color: '#f1f5f9', fontSize: 15, fontWeight: '700' },
  sectionSubtitle: { color: '#64748b', fontSize: 11, marginTop: 1 },

  successRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  successText: { color: '#22c55e', fontSize: 14, fontWeight: '600' },
  emptyHint:   { color: '#475569', fontSize: 13, lineHeight: 20 },

  // Gaps
  gapBlock:    { marginBottom: 14 },
  gapLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 },
  posBadge:    { backgroundColor: '#1d4ed8', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  posText:     { color: '#fff', fontSize: 11, fontWeight: '800' },
  gapPosName:  { color: '#64748b', fontSize: 12 },
  gapCount:    { color: '#475569', fontSize: 11 },
  balanceRow:   { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12, padding: 10, backgroundColor: '#0f172a', borderRadius: 8 },
  balanceLabel: { color: '#64748b', fontSize: 12 },
  balanceValue: { color: '#22c55e', fontSize: 12, fontWeight: '700' },

  subheading: { color: '#475569', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5, marginTop: 2 },
  noAffordRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  noAffordText: { color: '#64748b', fontSize: 12, flex: 1 },

  candidateRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#0f172a' },
  candidateRank: { color: '#475569', fontSize: 11, width: 22 },
  candidateName: { color: '#cbd5e1', fontSize: 13, fontWeight: '600' },
  candidateClub: { color: '#475569', fontSize: 10 },
  ovrBadge:      { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  ovrText:       { color: '#fff', fontSize: 11, fontWeight: '800' },

  priceBadge:    { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: '#1e3a5f', marginRight: 4 },
  priceText:     { color: '#60a5fa', fontSize: 10, fontWeight: '700' },
  priceFree:     { backgroundColor: '#14532d' },
  priceFreeText: { color: '#4ade80' },
  priceOver:     { backgroundColor: '#3f1111' },
  priceOverText: { color: '#f87171' },

  // Best formation
  formRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#0f172a' },
  formRowActive: { backgroundColor: '#0d1f3c', borderRadius: 10, paddingHorizontal: 8, marginHorizontal: -8, borderBottomWidth: 0, marginBottom: 1 },
  rankBadge:   { width: 26, height: 26, borderRadius: 6, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  rankText:    { fontSize: 12, fontWeight: '800' },
  formNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  formName:    { color: '#cbd5e1', fontSize: 14, fontWeight: '700' },
  formBar:     { height: 4, backgroundColor: '#0f172a', borderRadius: 2, overflow: 'hidden' },
  formBarFill: { height: '100%', borderRadius: 2 },
  formScore:   { color: '#64748b', fontSize: 14, fontWeight: '700', minWidth: 36, textAlign: 'right' },
  currentTag:      { backgroundColor: '#1d4ed8', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  currentTagText:  { color: '#bfdbfe', fontSize: 9, fontWeight: '700' },

  tipBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#1a1700', borderRadius: 10, padding: 12, marginTop: 12,
    borderWidth: 1, borderColor: '#3d3200',
  },
  tipText: { color: '#94a3b8', fontSize: 12, lineHeight: 18, flex: 1 },

  // Rotations
  rotMeter:    { marginBottom: 12 },
  rotLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  rotMeterLabel: { color: '#64748b', fontSize: 12 },
  rotLabel:    { fontSize: 12, fontWeight: '700' },
  rotBar:      { height: 8, backgroundColor: '#0f172a', borderRadius: 4, overflow: 'hidden' },
  rotBarFill:  { height: '100%', borderRadius: 4 },
  rotPct:      { fontSize: 28, fontWeight: '900', textAlign: 'right', marginTop: 4 },

  rotCompare:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0f172a', borderRadius: 10, padding: 12, marginBottom: 12, gap: 8 },
  rotCol:        { flex: 1 },
  rotLineupName: { color: '#f1f5f9', fontSize: 14, fontWeight: '700' },
  rotFormation:  { color: '#64748b', fontSize: 11, marginTop: 2 },

  sharedBlock: { marginTop: 4 },
  sharedTitle: { color: '#f59e0b', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  sharedRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  sharedDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f59e0b' },
  sharedName:  { color: '#94a3b8', fontSize: 12 },
  moreText:    { color: '#475569', fontSize: 11, marginTop: 2 },

  // Depth chart
  depthChipScroll:    { marginBottom: 12, marginHorizontal: -4 },
  depthChipRow:       { paddingHorizontal: 4, gap: 8, flexDirection: 'row' },
  depthChip:          { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155' },
  depthChipActive:    { borderColor: '#3b82f6', backgroundColor: '#0d1f3c' },
  depthChipText:      { color: '#475569', fontSize: 11, fontWeight: '600' },
  depthChipTextActive:{ color: '#3b82f6' },
  depthGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  depthCell:       { width: '29%', flexGrow: 1, borderRadius: 10, padding: 8, alignItems: 'center', gap: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  depthPosBadge:   { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  depthPosText:    { color: '#fff', fontSize: 10, fontWeight: '800' },
  depthCountRow:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  depthDot:        { width: 7, height: 7, borderRadius: 4 },
  depthCount:      { fontSize: 15, fontWeight: '900' },
  depthLegend:     { flexDirection: 'row', gap: 14, marginTop: 12, flexWrap: 'wrap' },
  depthLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  depthLegendText: { color: '#64748b', fontSize: 11 },

  // Match subs
  subRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#0f172a' },
  subLine:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 2 },
  subOut:   { flex: 1, color: '#94a3b8', fontSize: 13 },
  subIn:    { flex: 1, color: '#f1f5f9', fontSize: 13, fontWeight: '600' },
  ovrSmall: { color: '#64748b', fontSize: 11, fontWeight: '700', minWidth: 22, textAlign: 'right' },

  exclusiveBlock:   { marginTop: 14 },
  exclusiveTitle:   { color: '#475569', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  exclusiveRow:     { flexDirection: 'row', gap: 12 },
  exclusiveDivider: { width: 1, backgroundColor: '#1e293b' },
  exclusiveLineup:  { color: '#475569', fontSize: 11, fontWeight: '700', marginBottom: 5 },
  exclusiveName:    { color: '#94a3b8', fontSize: 12, marginBottom: 3 },
});
