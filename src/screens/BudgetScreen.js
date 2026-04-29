import { useState } from 'react';
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
  if (abs >= 1_000_000_000) return `€${(amount / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `€${(amount / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `€${(amount / 1_000).toFixed(0)}K`;
  return `€${amount.toLocaleString()}`;
};

export default function BudgetScreen() {
  const { budget, transactions, setBudget, addTransaction, removeTransaction } = useBudgetStore();

  const [showTxModal, setShowTxModal] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [txType, setTxType] = useState('compra');
  const [playerName, setPlayerName] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [budgetInput, setBudgetInput] = useState('');

  const totalSpent = transactions.filter((t) => t.type === 'compra').reduce((s, t) => s + t.amount, 0);
  const totalEarned = transactions.filter((t) => t.type === 'venta').reduce((s, t) => s + t.amount, 0);
  const balance = budget + totalEarned - totalSpent;
  const isPositive = balance >= 0;

  const handleAddTransaction = () => {
    const amount = parseFloat(amountInput.replace(',', '.')) * 1_000_000;
    if (!playerName.trim() || isNaN(amount) || amount <= 0) {
      Alert.alert('Datos incompletos', 'Escribe el nombre del jugador y el importe.');
      return;
    }
    addTransaction({ type: txType, playerName: playerName.trim(), amount });
    setPlayerName('');
    setAmountInput('');
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

  const renderTransaction = ({ item }) => {
    const isCompra = item.type === 'compra';
    return (
      <View style={styles.txCard}>
        <View style={[styles.txDot, { backgroundColor: isCompra ? '#ef4444' : '#16a34a' }]} />
        <View style={styles.txBody}>
          <Text style={styles.txName}>{item.playerName}</Text>
          <Text style={styles.txDate}>
            {isCompra ? 'Compra' : 'Venta'} · {new Date(item.date).toLocaleDateString('es-ES')}
          </Text>
        </View>
        <Text style={[styles.txAmount, { color: isCompra ? '#ef4444' : '#16a34a' }]}>
          {isCompra ? '-' : '+'}{fmt(item.amount)}
        </Text>
        <TouchableOpacity style={styles.txDeleteBtn} onPress={() => handleDelete(item.id)}>
          <Text style={styles.txDeleteIcon}>✕</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Balance card */}
      <View style={[styles.balanceCard, { borderLeftColor: isPositive ? '#16a34a' : '#ef4444' }]}>
        <Text style={styles.balanceLabel}>PRESUPUESTO DISPONIBLE</Text>
        <Text style={[styles.balanceAmount, { color: isPositive ? '#16a34a' : '#ef4444' }]}>
          {fmt(balance)}
        </Text>
        <View style={styles.summaryRow}>
          <TouchableOpacity
            style={styles.summaryItem}
            onPress={() => { setBudgetInput((budget / 1_000_000).toString()); setShowBudgetModal(true); }}
          >
            <Text style={styles.summaryLabel}>Inicial</Text>
            <Text style={styles.summaryValue}>{fmt(budget)} ✏️</Text>
          </TouchableOpacity>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Gastado</Text>
            <Text style={[styles.summaryValue, { color: '#ef4444' }]}>-{fmt(totalSpent)}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Ingresado</Text>
            <Text style={[styles.summaryValue, { color: '#16a34a' }]}>+{fmt(totalEarned)}</Text>
          </View>
        </View>
      </View>

      {/* Transaction list */}
      <View style={styles.txHeader}>
        <Text style={styles.txHeaderText}>MOVIMIENTOS ({transactions.length})</Text>
      </View>

      <FlatList
        data={[...transactions].reverse()}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderTransaction}
        contentContainerStyle={styles.txList}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>💰</Text>
            <Text style={styles.emptyText}>
              Sin movimientos registrados.{'\n'}Toca + para añadir fichajes o ventas.
            </Text>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowTxModal(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Budget edit modal */}
      <Modal visible={showBudgetModal} transparent animationType="fade">
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
                placeholderTextColor="#888"
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

      {/* Add transaction modal */}
      <Modal visible={showTxModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Registrar Movimiento</Text>

            <View style={styles.typeToggle}>
              <TouchableOpacity
                style={[styles.typeBtn, txType === 'compra' && styles.typeBtnCompra]}
                onPress={() => setTxType('compra')}
              >
                <Text style={[styles.typeBtnText, txType === 'compra' && styles.typeBtnTextActive]}>
                  COMPRA
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, txType === 'venta' && styles.typeBtnVenta]}
                onPress={() => setTxType('venta')}
              >
                <Text style={[styles.typeBtnText, txType === 'venta' && styles.typeBtnTextActive]}>
                  VENTA
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Nombre del jugador"
              value={playerName}
              onChangeText={setPlayerName}
              placeholderTextColor="#888"
            />

            <View style={styles.inputRow}>
              <TextInput
                style={[styles.modalInput, { flex: 1 }]}
                placeholder="Importe (ej: 80)"
                value={amountInput}
                onChangeText={setAmountInput}
                keyboardType="numeric"
                placeholderTextColor="#888"
              />
              <Text style={styles.inputSuffix}>M€</Text>
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={() => { setShowTxModal(false); setPlayerName(''); setAmountInput(''); }}
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
  container: { flex: 1, backgroundColor: '#f0f4f8' },

  balanceCard: {
    margin: 14,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    borderLeftWidth: 5,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  balanceLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 1, marginBottom: 4 },
  balanceAmount: { fontSize: 38, fontWeight: 'bold', marginBottom: 16 },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 11, color: '#9ca3af', marginBottom: 3 },
  summaryValue: { fontSize: 13, fontWeight: '700', color: '#374151' },
  summaryDivider: { width: 1, height: 30, backgroundColor: '#e5e7eb', marginHorizontal: 4 },

  txHeader: { paddingHorizontal: 16, paddingVertical: 8 },
  txHeaderText: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 1 },

  txList: { paddingHorizontal: 14, paddingBottom: 90, gap: 10 },

  txCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    gap: 10,
  },
  txDot: { width: 10, height: 10, borderRadius: 5 },
  txBody: { flex: 1 },
  txName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  txDate: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: '700' },
  txDeleteBtn: { padding: 4 },
  txDeleteIcon: { fontSize: 13, color: '#d1d5db' },

  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { textAlign: 'center', color: '#9ca3af', fontSize: 15, lineHeight: 22 },

  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#1d4ed8',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#1d4ed8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 30 },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    gap: 14,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', textAlign: 'center' },
  modalHelper: { fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: -8 },
  modalInput: {
    height: 46,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#f9fafb',
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputSuffix: { fontSize: 16, fontWeight: '700', color: '#6b7280', minWidth: 24 },

  typeToggle: { flexDirection: 'row', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' },
  typeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#f9fafb' },
  typeBtnCompra: { backgroundColor: '#fef2f2' },
  typeBtnVenta: { backgroundColor: '#f0fdf4' },
  typeBtnText: { fontWeight: '700', fontSize: 13, color: '#9ca3af' },
  typeBtnTextActive: { color: '#111827' },

  modalBtns: { flexDirection: 'row', gap: 10 },
  btnSecondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  btnSecondaryText: { color: '#6b7280', fontWeight: '600' },
  btnPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#1d4ed8',
  },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },
});
