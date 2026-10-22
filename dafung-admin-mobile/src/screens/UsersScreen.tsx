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
  Modal,
  ScrollView,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';
import { typography, formatIDR } from '../theme/typography';
import { UserRow } from '../components/UserRow';
import { api, UserItem } from '../api/client';

export const UsersScreen: React.FC = () => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [userOrders, setUserOrders] = useState<any[]>([]);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const res = await api.getUsers({ search: search.trim() || undefined });
      setUsers(res.users || []);
    } catch (err) {
      console.warn('Error loading users:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const onRefresh = () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    loadUsers();
  };

  const handleOpenUser = async (user: UserItem) => {
    setSelectedUser(user);
    setShowDetailModal(true);
    setLoadingDetail(true);
    try {
      const res = await api.getUserDetail(user.id);
      setSelectedUser(res.user);
      setUserOrders(res.orders || []);
    } catch (err) {
      console.warn('Error loading user detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={typography.screenTitle}>Data Pelanggan</Text>
        <Text style={styles.headerSub}>Daftar pembeli, saldo akun, dan riwayat transaksi</Text>
      </View>

      {/* Search Input */}
      <View style={styles.searchWrapper}>
        <Ionicons name="search" size={17} color={colors.textSecondary} style={{ marginRight: 8 }} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari ID telegram, username (@), nama..."
          placeholderTextColor={colors.textTertiary}
          style={styles.searchInput}
          returnKeyType="search"
          onSubmitEditing={loadUsers}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </Pressable>
        )}
      </View>

      {/* Users List */}
      {loading && !refreshing ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={colors.blue} />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <UserRow user={item} onPress={handleOpenUser} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={44} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>Tidak ada pelanggan</Text>
              <Text style={styles.emptySub}>
                {search ? 'Tidak ada data pengguna yang cocok.' : 'Belum ada pengguna terdaftar.'}
              </Text>
            </View>
          }
        />
      )}

      {/* User Detail Modal */}
      <Modal visible={showDetailModal} animationType="slide" transparent onRequestClose={() => setShowDetailModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Detail Pelanggan</Text>
                <Text style={styles.modalSub}>
                  {selectedUser?.username ? `@${selectedUser.username}` : selectedUser?.telegramId}
                </Text>
              </View>
              <Pressable onPress={() => setShowDetailModal(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>

            {loadingDetail ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator color={colors.blue} />
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Stats Summary */}
                <View style={styles.userStatsRow}>
                  <View style={styles.userStatCard}>
                    <Text style={styles.userStatLabel}>Saldo Akun</Text>
                    <Text style={[styles.userStatVal, { fontVariant: ['tabular-nums'] }]}>
                      {formatIDR(selectedUser?.balance || 0)}
                    </Text>
                  </View>
                  <View style={styles.userStatCard}>
                    <Text style={styles.userStatLabel}>Membership</Text>
                    <Text style={styles.userStatVal}>
                      {selectedUser?.membershipTier === 'free' ? 'Biasa' : 'VIP Member'}
                    </Text>
                  </View>
                </View>

                {/* Orders History */}
                <Text style={[typography.sectionTitle, { marginTop: 16, marginBottom: 8 }]}>
                  Riwayat Pesanan ({userOrders.length})
                </Text>

                {userOrders.length === 0 ? (
                  <Text style={styles.noOrdersText}>Belum ada riwayat pesanan.</Text>
                ) : (
                  userOrders.map((ord) => (
                    <View key={ord.orderCode} style={styles.orderHistoryRow}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.historyProd}>{ord.productName}</Text>
                        <Text style={typography.timestamp}>
                          {ord.orderCode} · {new Date(ord.createdAt).toLocaleDateString('id-ID')}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[typography.amount, { fontVariant: ['tabular-nums'] }]}>
                          {formatIDR(ord.price)}
                        </Text>
                        <Text
                          style={[
                            styles.historyStatus,
                            {
                              color:
                                ord.fulfillmentStatus === 'delivered'
                                  ? colors.receivedGreen
                                  : ord.paymentStatus === 'paid'
                                  ? colors.pendingOrange
                                  : colors.textSecondary,
                            },
                          ]}
                        >
                          {ord.fulfillmentStatus === 'delivered'
                            ? 'Selesai'
                            : ord.paymentStatus === 'paid'
                            ? 'Perlu Kirim'
                            : 'Belum Bayar'}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalTitle: {
    ...typography.screenTitle,
    fontSize: 20,
  },
  modalSub: {
    ...typography.timestamp,
    color: colors.blue,
    fontWeight: '600',
    marginTop: 2,
  },
  userStatsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  userStatCard: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    padding: 14,
  },
  userStatLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  userStatVal: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  noOrdersText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginVertical: 12,
  },
  orderHistoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.divider,
  },
  historyProd: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  historyStatus: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
});
