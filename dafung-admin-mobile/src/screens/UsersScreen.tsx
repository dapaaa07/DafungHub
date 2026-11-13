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
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalUsers, setTotalUsers] = useState(0);

  const loadUsers = useCallback(
    async (targetPage = 1, append = false) => {
      try {
        if (!append) {
          if (targetPage === 1) setLoading(true);
        } else {
          setLoadingMore(true);
        }

        const res = await api.getUsers({
          search: search.trim() || undefined,
          page: targetPage,
          limit: 20,
        });

        const newUsers = res.users || [];
        if (append) {
          setUsers((prev) => {
            const seen = new Set(prev.map((u) => u.id));
            const filtered = newUsers.filter((u) => !seen.has(u.id));
            return [...prev, ...filtered];
          });
        } else {
          setUsers(newUsers);
        }

        setPage(targetPage);
        const total = res.pagination?.total ?? (append ? users.length + newUsers.length : newUsers.length);
        const totalPages = res.pagination?.totalPages ?? Math.ceil(total / 20);
        setTotalUsers(total);
        setHasMore(targetPage < totalPages && newUsers.length > 0);
      } catch (err) {
        console.warn('Error loading users:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [search, users.length]
  );

  useEffect(() => {
    setPage(1);
    loadUsers(1, false);
  }, [search]);

  const onRefresh = () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    loadUsers(1, false);
  };

  const handleLoadMore = () => {
    if (loading || loadingMore || !hasMore) return;
    loadUsers(page + 1, true);
  };

  const handleOpenUser = async (user: UserItem) => {
    const isVipInitial = Boolean(
      user.isVip ||
      ((user.membershipTier === 'vip' || user.membership_tier === 'vip') &&
       (!user.membershipExpiresAt && !user.membership_expires_at ||
        new Date(user.membershipExpiresAt || user.membership_expires_at!) > new Date()))
    );

    setSelectedUser({
      ...user,
      isVip: isVipInitial,
      membershipTier: isVipInitial ? 'vip' : 'free',
      membership_tier: isVipInitial ? 'vip' : 'free',
    });
    setUserOrders([]);
    setShowDetailModal(true);
    setLoadingDetail(true);

    try {
      const res = await api.getUserDetail(user.id);
      if (res?.user) {
        const u = res.user;
        const isVipDetail = Boolean(
          u.isVip ||
          ((u.membershipTier === 'vip' || u.membership_tier === 'vip') &&
           (!u.membershipExpiresAt && !u.membership_expires_at ||
            new Date(u.membershipExpiresAt || u.membership_expires_at) > new Date()))
        );
        setSelectedUser({
          ...u,
          telegramId: u.telegramId || u.telegram_id,
          balance: Number(u.balance || 0),
          isVip: isVipDetail,
          membershipTier: isVipDetail ? 'vip' : 'free',
          membership_tier: isVipDetail ? 'vip' : 'free',
        });
      }
      setUserOrders(res.orders || []);
    } catch (err) {
      console.warn('Error loading user detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const isSelectedUserVip = Boolean(
    selectedUser?.isVip === true ||
    ((selectedUser?.membershipTier === 'vip' || selectedUser?.membership_tier === 'vip') &&
     (!selectedUser?.membershipExpiresAt && !selectedUser?.membership_expires_at ||
      new Date(selectedUser.membershipExpiresAt || selectedUser.membership_expires_at) > new Date()))
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={typography.screenTitle}>Data Pelanggan</Text>
        <Text style={styles.headerSub}>
          {totalUsers > 0 ? `Total ${totalUsers} pelanggan terdaftar` : 'Daftar pembeli, saldo akun, dan riwayat transaksi'}
        </Text>
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
          onSubmitEditing={() => loadUsers(1, false)}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </Pressable>
        )}
      </View>

      {/* Users List */}
      {loading && !refreshing && users.length === 0 ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={colors.blue} />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <UserRow user={item} onPress={handleOpenUser} />}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={colors.blue} />
                <Text style={styles.footerText}>Memuat pelanggan lainnya...</Text>
              </View>
            ) : !hasMore && users.length > 0 ? (
              <View style={styles.footerEnd}>
                <Text style={styles.footerText}>
                  Semua {totalUsers} pelanggan telah ditampilkan
                </Text>
              </View>
            ) : null
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
                    <Text
                      style={[
                        styles.userStatVal,
                        isSelectedUserVip ? { color: '#B27400' } : null,
                      ]}
                    >
                      {isSelectedUserVip ? 'VIP Member' : 'Biasa'}
                    </Text>
                    {isSelectedUserVip && (selectedUser?.membershipExpiresAt || selectedUser?.membership_expires_at) && (
                      <Text style={[typography.timestamp, { fontSize: 10, marginTop: 3 }]}>
                        s.d. {new Date(selectedUser.membershipExpiresAt || selectedUser.membership_expires_at).toLocaleDateString('id-ID')}
                      </Text>
                    )}
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
  footerLoader: {
    paddingVertical: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  footerEnd: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  footerText: {
    ...typography.timestamp,
    fontSize: 12,
  },
});
