import { Image } from 'expo-image';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { POSITION_BG, POSITION_ES } from '../constants/positions';

const STATS = [
  { key: 'overall',   label: 'OVR',     color: '#f1f5f9' },
  { key: 'pace',      label: 'Ritmo',   color: '#f59e0b' },
  { key: 'shooting',  label: 'Tiro',    color: '#ef4444' },
  { key: 'passing',   label: 'Pase',    color: '#3b82f6' },
  { key: 'dribbling', label: 'Regate',  color: '#8b5cf6' },
  { key: 'defending', label: 'Defensa', color: '#14b8a6' },
  { key: 'physic',    label: 'Físico',  color: '#f97316' },
  { key: 'potential', label: 'POT',     color: '#34d399' },
  { key: 'age',       label: 'Edad',    color: '#94a3b8', invert: true },
];

const getOvrBg = (ovr) =>
  ovr >= 85 ? '#d97706' : ovr >= 75 ? '#16a34a' : '#4b5563';

const fmtVal = (v) => {
  if (!v || v === 0) return 'Libre';
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `€${Math.round(v / 1_000)}K`;
  return `€${v}`;
};

function PlayerHero({ player }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <View style={s.hero}>
      {player.faceUrl && !imgErr ? (
        <Image
          source={{ uri: player.faceUrl }}
          style={s.face}
          contentFit="cover"
          onError={() => setImgErr(true)}
        />
      ) : (
        <View style={[s.face, s.facePlaceholder, { backgroundColor: getOvrBg(player.overall) }]}>
          <Text style={s.faceInitial}>{player.name?.[0] ?? '?'}</Text>
        </View>
      )}
      <View style={[s.ovrBadge, { backgroundColor: getOvrBg(player.overall) }]}>
        <Text style={s.ovrText}>{player.overall}</Text>
      </View>
      <Text style={s.heroName} numberOfLines={2}>{player.name}</Text>
      <View style={[s.posBadge, { backgroundColor: POSITION_BG(player.position) }]}>
        <Text style={s.posText}>{POSITION_ES[player.position] || player.position}</Text>
      </View>
      <Text style={s.heroClub} numberOfLines={1}>{player.club || '—'}</Text>
    </View>
  );
}

function StatRow({ stat, a, b }) {
  const va = a[stat.key] || 0;
  const vb = b[stat.key] || 0;
  const max = stat.key === 'age' ? 45 : stat.key === 'potential' ? 99 : 99;

  // For age, lower is better → invert winner logic
  const aWins = stat.invert ? va < vb : va > vb;
  const bWins = stat.invert ? vb < va : vb > va;

  return (
    <View style={s.statRow}>
      {/* Left bar */}
      <View style={s.barSide}>
        <Text style={[s.barVal, aWins && { color: stat.color, fontWeight: '800' }]}>{va || '—'}</Text>
        <View style={s.barTrack}>
          <View
            style={[s.barFill, s.barFillLeft, {
              width: `${Math.round((va / max) * 100)}%`,
              backgroundColor: aWins ? stat.color : '#334155',
            }]}
          />
        </View>
      </View>

      {/* Label */}
      <Text style={s.statLabel}>{stat.label}</Text>

      {/* Right bar */}
      <View style={[s.barSide, s.barSideRight]}>
        <View style={s.barTrack}>
          <View
            style={[s.barFill, s.barFillRight, {
              width: `${Math.round((vb / max) * 100)}%`,
              backgroundColor: bWins ? stat.color : '#334155',
            }]}
          />
        </View>
        <Text style={[s.barVal, bWins && { color: stat.color, fontWeight: '800' }]}>{vb || '—'}</Text>
      </View>
    </View>
  );
}

// ─── Main ────────────────────────────────────────────────────────
export default function PlayerCompareScreen({ route }) {
  const { playerA, playerB } = route.params;

  const aScore = STATS.filter(s => !s.invert && s.key !== 'age' && s.key !== 'potential')
    .reduce((acc, s) => acc + ((playerA[s.key] || 0) > (playerB[s.key] || 0) ? 1 : 0), 0);
  const bScore = STATS.filter(s => !s.invert && s.key !== 'age' && s.key !== 'potential')
    .reduce((acc, s) => acc + ((playerB[s.key] || 0) > (playerA[s.key] || 0) ? 1 : 0), 0);

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      {/* Cabeceras */}
      <View style={s.heroRow}>
        <PlayerHero player={playerA} />
        <View style={s.vs}><Text style={s.vsText}>VS</Text></View>
        <PlayerHero player={playerB} />
      </View>

      {/* Ganador global */}
      <View style={s.verdict}>
        <Text style={s.verdictLabel}>
          {aScore > bScore
            ? `${playerA.name.split(' ').slice(-1)[0]} gana en ${aScore} de 6 categorías`
            : bScore > aScore
            ? `${playerB.name.split(' ').slice(-1)[0]} gana en ${bScore} de 6 categorías`
            : 'Empate técnico'}
        </Text>
        <Text style={s.verdictSub}>
          Valor: {fmtVal(playerA.marketValue)}  vs  {fmtVal(playerB.marketValue)}
        </Text>
      </View>

      {/* Stats comparativas */}
      <View style={s.statsCard}>
        {STATS.map(stat => (
          <StatRow key={stat.key} stat={stat} a={playerA} b={playerB} />
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content:   { padding: 12, paddingBottom: 40, gap: 12 },

  heroRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },

  hero: { flex: 1, backgroundColor: '#1e293b', borderRadius: 14, padding: 12, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#334155' },
  face: { width: 70, height: 70, borderRadius: 35 },
  facePlaceholder: { justifyContent: 'center', alignItems: 'center' },
  faceInitial: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  ovrBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 7 },
  ovrText:  { color: '#fff', fontWeight: '800', fontSize: 16 },
  heroName: { color: '#f1f5f9', fontWeight: '700', fontSize: 13, textAlign: 'center' },
  posBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  posText:  { color: '#fff', fontSize: 10, fontWeight: '800' },
  heroClub: { color: '#64748b', fontSize: 10, textAlign: 'center' },

  vs:     { justifyContent: 'center', alignItems: 'center', paddingTop: 30 },
  vsText: { color: '#334155', fontSize: 18, fontWeight: '900' },

  verdict:    { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#334155' },
  verdictLabel: { color: '#f1f5f9', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  verdictSub:   { color: '#64748b', fontSize: 11, textAlign: 'center' },

  statsCard: { backgroundColor: '#1e293b', borderRadius: 14, padding: 14, gap: 4, borderWidth: 1, borderColor: '#334155' },

  statRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  statLabel:  { color: '#475569', fontSize: 11, fontWeight: '700', width: 52, textAlign: 'center' },
  barSide:    { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  barSideRight: { flexDirection: 'row-reverse' },
  barVal:     { color: '#94a3b8', fontSize: 13, width: 24, textAlign: 'center' },
  barTrack:   { flex: 1, height: 7, backgroundColor: '#0f172a', borderRadius: 4, overflow: 'hidden' },
  barFill:    { height: '100%', borderRadius: 4 },
  barFillLeft:  { alignSelf: 'flex-end' },
  barFillRight: {},
});
