import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSquadStore } from '../store/squadStore';

export default function PlayerDetailScreen({ route, navigation }) {
  const { player } = route.params;
  const setPendingPlayer = useSquadStore((state) => state.setPendingPlayer);

  const handleAddToBoard = () => {
    setPendingPlayer(player);
    navigation.navigate('SquadBuilder');
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.overallBadge}>
          <Text style={styles.overallText}>{player.overall}</Text>
        </View>
        <View style={styles.nameSection}>
          <Text style={styles.playerName}>{player.name}</Text>
          <Text style={styles.playerPosition}>{player.position}</Text>
        </View>
      </View>

      <View style={styles.statsCard}>
        <Text style={styles.sectionTitle}>Estadísticas Clave</Text>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Potencial (POT):</Text>
          <Text style={[styles.statValue, styles.potentialValue]}>{player.potential}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Edad:</Text>
          <Text style={styles.statValue}>{player.age} años</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Valor de Mercado:</Text>
          <Text style={styles.statValue}>€{(player.marketValue / 1000000).toFixed(1)}M</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.actionButton} onPress={handleAddToBoard}>
        <Text style={styles.actionButtonText}>➕ Añadir a la Pizarra</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 15 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, backgroundColor: '#fff', padding: 15, borderRadius: 12, elevation: 2 },
  overallBadge: { backgroundColor: '#333', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  overallText: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  nameSection: { flex: 1 },
  playerName: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  playerPosition: { fontSize: 16, color: '#007bff', fontWeight: '500', marginTop: 4 },
  statsCard: { backgroundColor: '#fff', padding: 20, borderRadius: 12, elevation: 2, marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#444', borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 5 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  statLabel: { fontSize: 16, color: '#666' },
  statValue: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  potentialValue: { color: '#28a745' },
  actionButton: { backgroundColor: '#28a745', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  actionButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});