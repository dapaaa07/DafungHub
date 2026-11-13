import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { ShopeePayRow } from '../components/ShopeePayRow';
import { api, ShopeePayLedgerData } from '../api/client';

export const ShopeePayScreen: React.FC = () => {
  const [data, setData] = useState<ShopeePayLedgerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadLedger = useCallback(async () => {
    try {
      const res = await api.getShopeePayLedger(50);
      setData(res);
    } catch (err) {
      console.warn('Error loading ledger from endpoint, falling back to orders:', err);
      try {
        const ordersRes = await api.getOrders({ status: 'paid', page: 1 });
        if (ordersRes && ordersRes.orders) {
          const now = new Date();
          const isToday = (d: string) => {
            const dt = new Date(d);
            return (
              dt.getDate() === now.getDate() &&
              dt.getMonth() === now.getMonth() &&
              dt.getFullYear() === now.getFullYear()
            );
          };
          const totalToday = ordersRes.orders
            .filter((o) => isToday(o.createdAt))
            .reduce((sum, o) => sum + (o.price || 0), 0);
          const totalAll = ordersRes.orders.reduce((sum, o) => sum + (o.price || 0), 0);

          setData({
            summary: {
              totalIncomingToday: totalToday,
              totalIncomingAll: totalAll,
              totalTransactions: ordersRes.orders.length,
              matchedOrdersCount: ordersRes.orders.length,
              unmatchedCount: 0,
              formattedTotalToday: `Rp ${totalToday.toLocaleString('id-ID')}`,
              formattedTotalAll: `Rp ${totalAll.toLocaleString('id-ID')}`,
            },
            transactions: ordersRes.orders.map((o) => {
              const customerName = o.customer.username
                ? `@${o.customer.username}`
                : o.customer.firstName || o.customer.telegramId;
              const formattedTime = new Date(o.createdAt).toLocaleString('id-ID', {
                timeZone: 'Asia/Jakarta',
                dateStyle: 'medium',
                timeStyle: 'short',
              });

              return {
                transactionId: o.orderCode || o.id,
                amount: o.price,
                formattedAmount: `Rp ${(o.price || 0).toLocaleString('id-ID')}`,
                status: 'success',
                time: formattedTime,
                issuer: 'DaFung Hub API',
                isMatched: true,
                order: {
                  orderCode: o.orderCode,
                  productName: o.productName,
                  customer: customerName,
                  telegramId: o.customer.telegramId,
                },
              };
            }),
          });
        }
      } catch (fallbackErr) {
        console.warn('Fallback getOrders error:', fallbackErr);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  const onRefresh = () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    loadLedger();
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={typography.screenTitle}>Buku Kas</Text>
        <Text style={styles.headerSub}>Mutasi & pencatatan transaksi pesanan DaFung Hub</Text>
      </View>

      {/* Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryTop}>
          <View>
            <Text style={styles.summaryLabel}>Total Masuk Hari Ini</Text>
            <Text style={[typography.confirmDisplay, styles.todayNum]}>
              {data?.summary.formattedTotalToday || 'Rp 0'}
            </Text>
          </View>
          <View style={styles.qrisBadge}>
            <Text style={styles.qrisText}>DaFung Hub API</Text>
          </View>
        </View>

        <View style={styles.summaryBottom}>
          <Text style={styles.summaryStat}>
            Total Keseluruhan:{' '}
            <Text style={styles.summaryBold}>{data?.summary.formattedTotalAll || 'Rp 0'}</Text>
          </Text>
          <Text style={styles.summaryStat}>
            Pesanan Lunas:{' '}
            <Text style={styles.summaryBold}>
              {data?.summary.matchedOrdersCount || 0} / {data?.summary.totalTransactions || 0}
            </Text>
          </Text>
        </View>
      </View>

      {/* Transactions List */}
      <View style={styles.listHeader}>
        <Text style={typography.sectionTitle}>Mutasi Transaksi Penjualan</Text>
        <Text style={typography.timestamp}>DaFung Hub API</Text>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={colors.blue} />
        </View>
      ) : (
        <FlatList
          data={data?.transactions || []}
          keyExtractor={(item, index) => `${item.transactionId || 'tx'}_${index}`}
          renderItem={({ item }) => <ShopeePayRow transaction={item} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="card-outline" size={44} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>Belum ada transaksi</Text>
              <Text style={styles.emptySub}>
                Belum ada transaksi pesanan yang lunas tercatat di DaFung Hub.
              </Text>
            </View>
          }
        />
      )}
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
  summaryCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 18,
    padding: 16,
  },
  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  todayNum: {
    fontSize: 28,
    color: colors.receivedGreen,
    fontVariant: ['tabular-nums'],
  },
  qrisBadge: {
    backgroundColor: colors.blueTint,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  qrisText: {
    color: colors.blue,
    fontSize: 11,
    fontWeight: '700',
  },
  summaryBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 10,
  },
  summaryStat: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  summaryBold: {
    fontWeight: '700',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.divider,
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
