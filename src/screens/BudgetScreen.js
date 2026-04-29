import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
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
import { useBudgetStore } from '../store/budgetStore';

const fmt = (amount) => {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}€${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000)     return `${sign}€${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)         return `${sign}€${(abs / 1_000).toFixed(0)}K`;
  return `${sign}€${abs.toLocaleString()}`;
};

export default function BudgetScreen() {
  const { budget, transactions, setBudget, addTransaction, removeTransaction } = useBudgetStore();

  const [showTxModal, setShowTxModal]       = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [txType, setTxType]                 = useState('compra');
  const [playerName, setPlayerName]         = useState('');
  const [amountInput, setAmountInput]       = useState('');
  const [seasonInput, setSeasonInput]       = useState('');
  const [budgetInput, setBudgetInput]       = useState('');

  const totalSpent  = transactions.filter(t => t.type === 'compra').reduce((s, t) => s + t.amount, 0);
  const totalEarned = transactions.filter(t => t.type === 'venta').reduce((s, t) => s + t.amount, 0);
  const balance     = budget + totalEarned - totalSpent;
  const isPositive  = balance >= 0;

  // Agrupar por temporada para el timeline
  const grouped = useMemo(() => {
    const map = {};
    [...transactions].reverse().forEach(t => {
      const key = t.season || 'Sin temporada';
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return Object.entries(map).map(([season, items]) => {
      const spent  = items.filter(i => i.type === 'compra').reduce((s, i) => s + i.amount, 0);
      const earned = items.filter(i => i.type === 'venta').reduce((s, i) => s + i.amount, 0);
      return { season, items, spent, earned, net: earned - spent };
    });
  }, [transactions]);

  const handleAddTransaction = () => {
    const amount = parseFloat(amountInput.replace(',', '.')) * 1_000_000;
    if (!playerName.trim() || isNaN(amount) || amount <= 0) {
      Alert.alert('Datos incompletos', 'Escribe el nombre del jugador y el importe.');
      return;
    }
    addTransaction({ type: txType, playerName: playerName.trim(), amount, season: seasonInput.trim() });
    setPlayerName('');
    setAmountInput('');
    setSeasonInput('');
    setShowTxModal(false);
  };

  const handleSaveBudget = () => {
    const amount = parseFloat(budgetInput.replace(',', '.')) * 1_000_000;
    if (isNaN(amount) || amount < 0) return;
    setBudget(amount);
    setShowBudgetModal(false);
    setBudgetInput('');
  };

  const handleDelete = (id) => {
    Alert.alert('Eliminar movimiento', '¿Borrar este registro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => removeTransaction(id) },
    ]);
  };

  const renderGroup = ({ item: group }) => (
    <View style={styles.group}>
      {/* Cabecera de temporada */}
      <View style={styles.groupHeader}>
        <Text style={styles.groupSeason}>{group.season}</Text>
        <View style={styles.groupSummary}>
          {group.earned > 0 && (
            <Text style={styles.groupEarned}>+{fmt(group.earned)}</Text>
          )}
          {group.spent > 0 && (
            <Text style={styles.groupSpent}>-{fmt(group.spent)}</Text>
          )}
          <Text style={[styles.groupNet, { color: group.net >= 0 ? '#22c55e' : '#ef4444' }]}>
            {group.net >= 0 ? '+' : ''}{fmt(group.net)}
          </Text>
        </View>
      </View>

      {/* Transacciones de la temporada */}
      {group.items.map(item => {
        const isCompra = item.type === 'compra';
        return (
          <View key={item.id} style={styles.txCard}>
            <View style={[styles.txIconWrap, { backgroundColor: isCompra ? '#3f0f0f' : '#0d2f1a' }]}>
              <Ionicons
                name={isCompra ? 'arrow-down' : 'arrow-up'}
                size={14}
                color={isCompra ? '#ef4444' : '#22c55e'}
              />
            </View>
            <View style={styles.txBody}>
              <Text style={styles.txName}>{item.playerName}</Text>
              <Text style={styles.txDate}>
                {isCompra ? 'Compra' : 'Venta'} · {new Date(item.date).toLocaleDateString('es-ES')}
              </Text>
            </View>
            <Text style={[styles.txAmount, { color: isCompra ? '#ef4444' : '#22c55e' }]}>
              {isCompra ? '-' : '+'}{fmt(item.amount)}
            </Text>
            <TouchableOpacity style={styles.txDeleteBtn} onPress={() => handleDelete(item.id)}>
              <Ionicons name="close" size={16} color="#334155" />
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Balance card */}
      <View style={[styles.balanceCard, { borderLeftColor: isPositive ? '#16a34a' : '#ef4444' }]}>
        <Text style={styles.balanceLabel}>PRESUPUESTO DISPONIBLE</Text>
        <Text style={[styles.balanceAmount, { color: isPositive ? '#22c55e' : '#ef4444' }]}>
          {fmt(balance)}
        </Text>
        <View style={styles.summaryRow}>
          <TouchableOpacity
            style={styles.summaryItem}
            onPress={() => { setBudgetInput((budget / 1_000_000).toString()); setShowBudgetModal(true); }}
          >
            <Text style={styles.summaryLabel}>Inicial</Text>
            <Text style={styles.summaryValue}>{fmt(budget)} <Text style={{ fontSize: 10 }}>✏</Text></Text>
          </TouchableOpacity>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Gastado</Text>
            <Text style={[styles.summaryValue, { color: '#ef4444' }]}>-{fmt(totalSpent)}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Ingresado</Text>
            <Text style={[styles.summaryValue, { color: '#22c55e' }]}>+{fmt(totalEarned)}</Text>
          </View>
        </View>
      </View>

      {/* Timeline agrupada por temporada */}
      <View style={styles.txHeaderRow}>
        <Text style={styles.txHeaderText}>MOVIMIENTOS ({transactions.length})</Text>
      </View>

      <FlatList
        data={grouped}
        keyExtractor={g => g.season}
        renderItem={renderGroup}
        contentContainerStyle={styles.txList}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="wallet-outline" size={48} color="#334155" />
            <Text style={styles.emptyTitle}>Sin movimientos</Text>
            <Text style={styles.emptyText}>
              Toca + para registrar fichajes y ventas por temporada.
            </Text>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowTxModal(true)}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Modal editar presupuesto */}
      <Modal visible={showBudgetModal} transparent animationType="fade" onRequestClose={() => setShowBudgetModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Presupuesto Inicial</Text>
            <Text style={styles.modalHelper}>Importe en millones de euros</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.modalInput, { flex: 1 }]}
                value={budgetInput}
                onChangeText={setBudgetInput}
                keyboardType="numeric"
                placeholder="50"
                placeholderTextColor="#64748b"
                autoFocus
              />
              <Text style={styles.inputSuffix}>M€</Text>
            </View>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setShowBudgetModal(false)}>
                <Text style={styles.btnSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={handleSaveBudget}>
                <Text style={styles.btnPrimaryText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal añadir movimiento */}
      <Modal visible={showTxModal} transparent animationType="slide" onRequestClose={() => setShowTxModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Registrar Movimiento</Text>

            <View style={styles.typeToggle}>
              <TouchableOpacity
                style={[styles.typeBtn, txType === 'compra' && styles.typeBtnCompra]}
                onPress={() => setTxType('compra')}
              >
                <Ionicons name="arrow-down" size={14} color={txType === 'compra' ? '#ef4444' : '#64748b'} />
                <Text style={[styles.typeBtnText, txType === 'compra' && { color: '#ef4444' }]}>COMPRA</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, txType === 'venta' && styles.typeBtnVenta]}
                onPress={() => setTxType('venta')}
              >
                <Ionicons name="arrow-up" size={14} color={txType === 'venta' ? '#22c55e' : '#64748b'} />
                <Text style={[styles.typeBtnText, txType === 'venta' && { color: '#22c55e' }]}>VENTA</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Nombre del jugador"
              value={playerName}
              onChangeText={setPlayerName}
              placeholderTextColor="#64748b"
              autoFocus
            />

            <View style={styles.inputRow}>
              <TextInput
                style={[styles.modalInput, { flex: 1 }]}
                placeholder="Importe (ej: 80)"
                value={amountInput}
                onChangeText={setAmountInput}
                keyboardType="numeric"
                placeholderTextColor="#64748b"
              />
              <Text style={styles.inputSuffix}>M€</Text>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Temporada (ej: T26, 2025-26)"
              value={seasonInput}
              onChangeText={setSeasonInput}
              placeholderTextColor="#64748b"
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={() => { setShowTxModal(false); setPlayerName(''); setAmountInput(''); setSeasonInput(''); }}
              >
                <Text style={styles.btnSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={handleAddTransaction}>
                <Text style={styles.btnPrimaryText}>Registrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },

  balanceCard: {
    margin: 14, backgroundColor: '#1e293b', borderRadius: 16, padding: 20,
    borderLeftWidth: 5, borderWidth: 1, borderColor: '#334155',
  },
  balanceLabel:  { fontSize: 11, fontWeight: '700', color: '#475569', letterSpacing: 1, marginBottom: 4 },
  balanceAmount: { fontSize: 38, fontWeight: 'bold', marginBottom: 16 },
  summaryRow:    { flexDirection: 'row', alignItems: 'center' },
  summaryItem:   { flex: 1, alignItems: 'center' },
  summaryLabel:  { fontSize: 11, color: '#475569', marginBottom: 3 },
  summaryValue:  { fontSize: 13, fontWeight: '700', color: '#94a3b8' },
  summaryDivider: { width: 1, height: 30, backgroundColor: '#334155', marginHorizontal: 4 },

  txHeaderRow:  { paddingHorizontal: 16, paddingVertical: 8 },
  txHeaderText: { fontSize: 11, fontWeight: '700', color: '#475569', letterSpacing: 1 },

  txList: { paddingHorizontal: 14, paddingBottom: 90, gap: 12 },

  group:       { gap: 6 },
  groupHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1e293b', marginBottom: 2,
  },
  groupSeason:  { color: '#60a5fa', fontSize: 13, fontWeight: '800' },
  groupSummary: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  groupEarned:  { color: '#22c55e', fontSize: 11, fontWeight: '700' },
  groupSpent:   { color: '#ef4444', fontSize: 11, fontWeight: '700' },
  groupNet:     { fontSize: 12, fontWeight: '800' },

  txCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#1e293b', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#334155',
  },
  txIconWrap: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  txBody:     { flex: 1 },
  txName:     { fontSize: 14, fontWeight: '600', color: '#f1f5f9' },
  txDate:     { fontSize: 11, color: '#475569', marginTop: 2 },
  txAmount:   { fontSize: 14, fontWeight: '700' },
  txDeleteBtn: { padding: 4 },

  empty:      { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { color: '#475569', fontSize: 18, fontWeight: '700' },
  emptyText:  { textAlign: 'center', color: '#334155', fontSize: 14, lineHeight: 20 },

  fab: {
    position: 'absolute', right: 20, bottom: 24,
    width: 58, height: 58, borderRadius: 29, backgroundColor: '#1d4ed8',
    justifyContent: 'center', alignItems: 'center',
    elevation: 6, shadowColor: '#1d4ed8', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 5,
  },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: '#1e293b', borderRadius: 16, padding: 24, width: '100%', gap: 14 },
  modalTitle:  { fontSize: 18, fontWeight: 'bold', color: '#f1f5f9', textAlign: 'center' },
  modalHelper: { fontSize: 12, color: '#475569', textAlign: 'center', marginTop: -8 },
  modalInput: {
    height: 46, borderWidth: 1, borderColor: '#334155', borderRadius: 10,
    paddingHorizontal: 14, fontSize: 15, color: '#f1f5f9', backgroundColor: '#0f172a',
  },
  inputRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputSuffix: { fontSize: 16, fontWeight: '700', color: '#475569', minWidth: 24 },

  typeToggle: { flexDirection: 'row', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#334155' },
  typeBtn:    { flex: 1, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, backgroundColor: '#0f172a' },
  typeBtnCompra: { backgroundColor: '#1a0808' },
  typeBtnVenta:  { backgroundColor: '#081a0d' },
  typeBtnText:   { fontWeight: '700', fontSize: 13, color: '#475569' },

  modalBtns:       { flexDirection: 'row', gap: 10 },
  btnSecondary:    { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155' },
  btnSecondaryText: { color: '#64748b', fontWeight: '600' },
  btnPrimary:      { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#1d4ed8' },
  btnPrimaryText:  { color: '#fff', fontWeight: '700' },
});
