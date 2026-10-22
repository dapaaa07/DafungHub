import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';
import { typography, formatIDR } from '../theme/typography';
import { VenmoBalanceCard } from '../components/VenmoBalanceCard';
import { VenmoPayRequestPill } from '../components/VenmoPayRequestPill';
import { AddProductModal } from '../components/AddProductModal';
import { BroadcastModal } from '../components/BroadcastModal';
import { api, DashboardData } from '../api/client';
import { useNotifications } from '../context/NotificationContext';

export const DashboardScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { pendingCount, refreshNotifications } = useNotifications();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await api.getDashboard();
      setData(res);
      await refreshNotifications();
    } catch (err) {
      console.warn('Error loading dashboard:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    loadData();
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={typography.screenTitle}>Dafung Hub</Text>
          <Text style={styles.headerSub}>Panel Kendali Admin & Owner</Text>
        </View>

        <View style={styles.headerRight}>
          <Pressable
            style={styles.iconBtn}
            onPress={() => navigation.navigate('Settings')}
          >
            <Ionicons name="settings-outline" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      {loading && !data ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={colors.blue} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />
          }
          contentContainerStyle={styles.scrollContent}
        >
          {/* Hero Balance Card */}
          <VenmoBalanceCard
            todayRevenue={data?.stats.todayRevenue || 0}
            totalRevenue={data?.stats.totalRevenue || 0}
            pendingCount={pendingCount || data?.stats.pendingFulfillment || 0}
            onAddProduct={() => setShowAddProduct(true)}
            onBroadcast={() => setShowBroadcast(true)}
          />

          {/* Quick Metrics Grid */}
          <View style={styles.metricsGrid}>
            <View style={styles.metricCard}>
              <View style={styles.metricIconBox}>
                <Ionicons name="wallet-outline" size={18} color={colors.blue} />
              </View>
              <Text style={styles.metricLabel}>Saldo Supplier</Text>
              <Text style={[styles.metricValue, { fontVariant: ['tabular-nums'] }]}>
                {formatIDR(data?.supplier.balance || 0)}
              </Text>
              <Text style={styles.metricSub}>{data?.supplier.username || 'API H2H'}</Text>
            </View>

            <View style={styles.metricCard}>
              <View style={styles.metricIconBox}>
                <Ionicons name="people-outline" size={18} color={colors.blue} />
              </View>
              <Text style={styles.metricLabel}>Total Pengguna</Text>
              <Text style={[styles.metricValue, { fontVariant: ['tabular-nums'] }]}>
                {data?.stats.totalUsers || 0} User
              </Text>
              <Text style={styles.metricSub}>{data?.stats.vipUsers || 0} Member VIP</Text>
            </View>

            <View style={styles.metricCard}>
              <View style={styles.metricIconBox}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={18}
                  color={data?.shopeepay.isOnline ? colors.receivedGreen : colors.chargeRed}
                />
              </View>
              <Text style={styles.metricLabel}>ShopeePay Gateway</Text>
              <Text
                style={[
                  styles.metricValue,
                  { color: data?.shopeepay.isOnline ? colors.receivedGreen : colors.chargeRed },
                ]}
              >
                {data?.shopeepay.isOnline ? 'Online' : 'Sesi Habis'}
              </Text>
              <Text style={styles.metricSub}>prastyaaneki.biz.id</Text>
            </View>

            <View style={styles.metricCard}>
              <View style={styles.metricIconBox}>
                <Ionicons
                  name="radio-outline"
                  size={18}
                  color={data?.bot.isMaintenance ? colors.pendingOrange : colors.receivedGreen}
                />
              </View>
              <Text style={styles.metricLabel}>Status Bot</Text>
              <Text
                style={[
                  styles.metricValue,
                  { color: data?.bot.isMaintenance ? colors.pendingOrange : colors.receivedGreen },
                ]}
              >
                {data?.bot.isMaintenance ? 'Maintenance' : 'Aktif'}
              </Text>
              <Text style={styles.metricSub}>Telegram Bot</Text>
            </View>
          </View>

          {/* Anchor Split Pill */}
          <View style={{ marginVertical: 12 }}>
            <VenmoPayRequestPill
              leftTitle={`Antrean (${pendingCount || data?.stats.pendingFulfillment || 0})`}
              rightTitle="Tambah Produk"
              onFulfill={() => navigation.navigate('OrdersTab', { status: 'pending' })}
              onAddProduct={() => setShowAddProduct(true)}
            />
          </View>

          {/* Recent Orders Section */}
          <View style={styles.sectionHeader}>
            <Text style={typography.sectionTitle}>Aktivitas Pesanan Terbaru</Text>
            <Pressable onPress={() => navigation.navigate('OrdersTab')}>
              <Text style={styles.seeAllText}>Lihat Semua</Text>
            </Pressable>
          </View>

          {(data?.recentOrders?.length || 0) === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Belum ada transaksi pesanan hari ini.</Text>
            </View>
          ) : (
            data?.recentOrders.map((ord) => (
              <View key={ord.order_code} style={styles.recentRow}>
                <View style={styles.recentLeft}>
                  <Text style={styles.recentProd}>{ord.product_name}</Text>
                  <Text style={typography.timestamp}>
                    {ord.order_code} · {ord.username ? `@${ord.username}` : ord.telegram_id}
                  </Text>
                </View>

                <View style={styles.recentRight}>
                  <Text style={[styles.recentPrice, { fontVariant: ['tabular-nums'] }]}>
                    {formatIDR(ord.price)}
                  </Text>
                  <Text
                    style={[
                      styles.recentStatus,
                      {
                        color:
                          ord.fulfillment_status === 'delivered'
                            ? colors.receivedGreen
                            : colors.pendingOrange,
                      },
                    ]}
                  >
                    {ord.fulfillment_status === 'delivered' ? 'Selesai' : 'Perlu Kirim'}
                  </Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Add Product Modal */}
      <AddProductModal
        visible={showAddProduct}
        onClose={() => setShowAddProduct(false)}
        onSuccess={loadData}
      />

      {/* Broadcast Modal */}
      <BroadcastModal
        visible={showBroadcast}
        onClose={() => setShowBroadcast(false)}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 54,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.divider,
    backgroundColor: colors.canvas,
  },
  headerSub: {
    ...typography.timestamp,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    padding: 6,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 6,
  },
  metricCard: {
    width: '48.5%',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    padding: 12,
  },
  metricIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  metricLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  metricSub: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 18,
    marginBottom: 10,
  },
  seeAllText: {
    fontSize: 13,
    color: colors.blue,
    fontWeight: '600',
  },
  recentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.divider,
  },
  recentLeft: {
    flex: 1,
    marginRight: 10,
  },
  recentProd: {
    ...typography.feedName,
    fontSize: 14,
    marginBottom: 2,
  },
  recentRight: {
    alignItems: 'flex-end',
  },
  recentPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  recentStatus: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
});
