import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { OrderRow } from '../components/OrderRow';
import { FulfillModal } from '../components/FulfillModal';
import { api, OrderItem } from '../api/client';
import { useNotifications } from '../context/NotificationContext';

export const OrdersScreen: React.FC<{ route?: any }> = ({ route }) => {
  const initialStatus = route?.params?.status || 'all';
  const { pendingCount, refreshNotifications } = useNotifications();

  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'delivered' | 'unpaid'>(
    initialStatus
  );
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
  const [showFulfillModal, setShowFulfillModal] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      const res = await api.getOrders({
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: search.trim() || undefined,
      });
      setOrders(res.orders || []);
      await refreshNotifications();
    } catch (err) {
      console.warn('Error loading orders:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, search, refreshNotifications]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const onRefresh = () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    loadOrders();
  };

  const handleOpenFulfill = (order: OrderItem) => {
    setSelectedOrder(order);
    setShowFulfillModal(true);
  };

  const filterTabs = [
    { id: 'all', label: 'Semua' },
    { id: 'pending', label: `Perlu Kirim${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
    { id: 'delivered', label: 'Selesai' },
    { id: 'unpaid', label: 'Belum Bayar' },
  ] as const;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={typography.screenTitle}>Antrean Pesanan</Text>
        <Text style={styles.headerSub}>Kelola dan penuhi pesanan pelanggan secara instan</Text>
      </View>

      {/* Search Input */}
      <View style={styles.searchWrapper}>
        <Ionicons name="search" size={17} color={colors.textSecondary} style={{ marginRight: 8 }} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari kode order, pembeli, atau produk..."
          placeholderTextColor={colors.textTertiary}
          style={styles.searchInput}
          returnKeyType="search"
          onSubmitEditing={loadOrders}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </Pressable>
        )}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {filterTabs.map((tab) => {
          const isActive = statusFilter === tab.id;
          return (
            <Pressable
              key={tab.id}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setStatusFilter(tab.id);
              }}
            >
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Orders List */}
      {loading && !refreshing ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={colors.blue} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <OrderRow
              order={item}
              onFulfill={handleOpenFulfill}
              onPress={handleOpenFulfill}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={44} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>Tidak ada pesanan</Text>
              <Text style={styles.emptySub}>
                {search ? 'Tidak ada pesanan yang sesuai kata kunci pencarian.' : 'Belum ada data pesanan pada filter ini.'}
              </Text>
            </View>
          }
        />
      )}

      {/* Fulfill Modal */}
      <FulfillModal
        visible={showFulfillModal}
        order={selectedOrder}
        onClose={() => setShowFulfillModal(false)}
        onSuccess={loadOrders}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 54,
    paddingBottom: 10,
    backgroundColor: colors.canvas,
  },
  headerSub: {
    ...typography.timestamp,
    marginTop: 2,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.divider,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
  },
  filterChipActive: {
    backgroundColor: colors.blue,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
});
