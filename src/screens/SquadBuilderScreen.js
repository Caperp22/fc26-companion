import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { FORMATIONS } from '../constants/formations';
import { getPlayerCount, updateSquadsFromCloud } from '../db/database';
import { useSquadStore } from '../store/squadStore';

const SLOT_SIZE = 56;

const getSlotBorderColor = (position) => {
  if (position === 'GK') return '#f59e0b';
  if (['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(position)) return '#3b82f6';
  if (['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(position)) return '#8b5cf6';
  return '#ef4444';
};

const getOverallBg = (overall) => {
  if (overall >= 85) return '#d97706';
  if (overall >= 75) return '#16a34a';
  return '#4b5563';
};

export default function SquadBuilderScreen({ navigation }) {
  const { formation, squad, setFormation, assignPlayer, removePlayer, pendingPlayer, clearPendingPlayer } = useSquadStore();
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState('');
  const { width: screenWidth } = useWindowDimensions();
  const dbCount = getPlayerCount();

  const PITCH_W = screenWidth - 24;
  const PITCH_H = Math.round(PITCH_W * 1.48);

  const currentSlots = FORMATIONS[formation]?.slots || [];
  const filledCount = Object.keys(squad).length;

  const handleSlotPress = (slot) => {
    if (pendingPlayer) {
      assignPlayer(slot.id, pendingPlayer);
      return;
    }
    navigation.navigate('Scouting', {
      selectionMode: true,
      slotId: slot.id,
      slotLabel: slot.label,
      slotPosition: slot.position,
    });
  };

  const handleSlotLongPress = (slot) => {
    const player = squad[slot.id];
    if (!player) {
      handleSlotPress(slot);
      return;
    }
    Alert.alert(player.name, `GRL ${player.overall}  •  ${player.position}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cambiar jugador', onPress: () => handleSlotPress(slot) },
      {
        text: 'Quitar de la pizarra',
        style: 'destructive',
        onPress: () => removePlayer(slot.id),
      },
    ]);
  };

  const handleFormationChange = (newFormation) => {
    if (newFormation === formation) return;
    const count = Object.keys(squad).length;
    if (count > 0) {
      Alert.alert(
        'Cambiar formación',
        `¿Cambiar a ${newFormation}? Se perderán los ${count} jugadores asignados.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Confirmar', style: 'destructive', onPress: () => setFormation(newFormation) },
        ]
      );
    } else {
      setFormation(newFormation);
    }
  };

  const handleUpdateSquads = async () => {
    setIsUpdating(true);
    setUpdateProgress('Iniciando...');
    const result = await updateSquadsFromCloud((msg) => setUpdateProgress(msg));
    setIsUpdating(false);
    setUpdateProgress('');
    Alert.alert(
      result.ok ? '¡Base de datos actualizada!' : 'Error al actualizar',
      result.ok
        ? `${result.count.toLocaleString()} jugadores disponibles en la app.`
        : result.error
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Mi Pizarra</Text>
          <Text style={styles.formationLabel}>
            {formation}  ·  {dbCount > 0 ? `${dbCount.toLocaleString()} jugadores en BD` : 'BD vacía — actualiza plantillas'}
          </Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{filledCount}</Text>
          <Text style={styles.countMax}>/11</Text>
        </View>
      </View>

      {/* Pending player banner */}
      {pendingPlayer && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingText}>
            Toca un puesto para asignar a{' '}
            <Text style={styles.pendingName}>{pendingPlayer.name}</Text>
          </Text>
          <TouchableOpacity onPress={clearPendingPlayer} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.pendingCancel}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Formation chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.formationScroll}
        contentContainerStyle={styles.formationContainer}
      >
        {Object.keys(FORMATIONS).map((key) => (
          <TouchableOpacity
            key={key}
            style={[styles.formationChip, formation === key && styles.formationChipActive]}
            onPress={() => handleFormationChange(key)}
          >
            <Text style={[styles.formationChipText, formation === key && styles.formationChipTextActive]}>
              {key}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Pitch */}
      <ScrollView contentContainerStyle={styles.pitchScroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.pitch, { width: PITCH_W, height: PITCH_H }]}>
          {/* Pitch markings */}
          <View style={[styles.pitchLine, { top: PITCH_H / 2 - 0.5, left: PITCH_W * 0.05, width: PITCH_W * 0.9 }]} />
          <View style={[styles.pitchCircle, { top: PITCH_H / 2 - 44, left: PITCH_W / 2 - 44, width: 88, height: 88, borderRadius: 44 }]} />
          <View style={[styles.pitchBox, { top: 0, left: PITCH_W * 0.22, width: PITCH_W * 0.56, height: PITCH_H * 0.16 }]} />
          <View style={[styles.pitchBox, { bottom: 0, left: PITCH_W * 0.22, width: PITCH_W * 0.56, height: PITCH_H * 0.16 }]} />

          {/* Player slots */}
          {currentSlots.map((slot) => {
            const player = squad[slot.id];
            const left = slot.x * PITCH_W - SLOT_SIZE / 2;
            const top = slot.y * PITCH_H - SLOT_SIZE / 2;
            const borderColor = getSlotBorderColor(slot.position);

            return (
              <TouchableOpacity
                key={slot.id}
                style={[
                  styles.slot,
                  { left, top, borderColor },
                  player ? { backgroundColor: getOverallBg(player.overall) } : styles.slotEmpty,
                ]}
                onPress={() => handleSlotPress(slot)}
                onLongPress={() => handleSlotLongPress(slot)}
                activeOpacity={0.75}
              >
                {player ? (
                  <>
                    <Text style={styles.slotOverall}>{player.overall}</Text>
                    <Text style={styles.slotName} numberOfLines={1}>
                      {player.name.split(' ').slice(-1)[0]}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.slotLabel}>{slot.label}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Hint */}
        <Text style={styles.hint}>Toca un puesto para asignar · Mantén pulsado para editar</Text>
      </ScrollView>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        {isUpdating ? (
          <View style={styles.progressRow}>
            <ActivityIndicator color="#60a5fa" size="small" />
            <Text style={styles.progressText}>{updateProgress}</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.updateButton} onPress={handleUpdateSquads}>
            <Text style={styles.updateButtonText}>🔄  Actualizar Plantillas</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  title: { color: '#f1f5f9', fontSize: 22, fontWeight: 'bold' },
  formationLabel: { color: '#64748b', fontSize: 13, marginTop: 2 },
  countBadge: { flexDirection: 'row', alignItems: 'flex-end' },
  countText: { color: '#f1f5f9', fontSize: 28, fontWeight: 'bold', lineHeight: 32 },
  countMax: { color: '#64748b', fontSize: 16, marginBottom: 2, marginLeft: 2 },

  formationScroll: { maxHeight: 46, flexGrow: 0 },
  formationContainer: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 8,
    alignItems: 'center',
  },
  formationChip: {
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  formationChipActive: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  formationChipText: { color: '#94a3b8', fontWeight: '700', fontSize: 14 },
  formationChipTextActive: { color: '#fff' },

  pitchScroll: { alignItems: 'center', paddingVertical: 12 },

  pitch: {
    backgroundColor: '#166534',
    borderRadius: 8,
    position: 'relative',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  pitchLine: {
    position: 'absolute',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  pitchCircle: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'transparent',
  },
  pitchBox: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'transparent',
  },

  slot: {
    position: 'absolute',
    width: SLOT_SIZE,
    height: SLOT_SIZE,
    borderRadius: SLOT_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    overflow: 'hidden',
  },
  slotEmpty: { backgroundColor: 'rgba(0,0,0,0.40)' },
  slotOverall: { color: '#fff', fontSize: 14, fontWeight: 'bold', lineHeight: 16 },
  slotName: { color: '#fff', fontSize: 9, maxWidth: SLOT_SIZE - 6, textAlign: 'center', lineHeight: 11 },
  slotLabel: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  hint: { color: '#475569', fontSize: 11, textAlign: 'center', marginTop: 8, marginBottom: 4 },

  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e3a5f',
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pendingText: { color: '#93c5fd', fontSize: 13, flex: 1 },
  pendingName: { color: '#fff', fontWeight: 'bold' },
  pendingCancel: { color: '#64748b', fontSize: 16, marginLeft: 12 },

  bottomBar: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    alignItems: 'center',
  },
  updateButton: {
    backgroundColor: '#16a34a',
    paddingVertical: 11,
    paddingHorizontal: 28,
    borderRadius: 24,
  },
  updateButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressText: { color: '#94a3b8', fontSize: 13 },
});
