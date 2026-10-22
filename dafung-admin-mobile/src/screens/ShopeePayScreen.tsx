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
      console.warn('Error loading ShopeePay ledger:', err);
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
        <Text style={typography.screenTitle}>Buku Kas ShopeePay</Text>
        <Text style={styles.headerSub}>Mutasi QRIS & pencatatan penjualan gateway</Text>
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
            <Text style={styles.qrisText}>ShopeePay</Text>
          </View>
        </View>

        <View style={styles.summaryBottom}>
          <Text style={styles.summaryStat}>
            Total Keseluruhan:{' '}
            <Text style={styles.summaryBold}>{data?.summary.formattedTotalAll || 'Rp 0'}</Text>
          </Text>
          <Text style={styles.summaryStat}>
            Cocok Pesanan:{' '}
            <Text style={styles.summaryBold}>
              {data?.summary.matchedOrdersCount || 0} / {data?.summary.totalTransactions || 0}
            </Text>
          </Text>
        </View>
      </View>

      {/* Transactions List */}
      <View style={styles.listHeader}>
        <Text style={typography.sectionTitle}>Mutasi Rekening ShopeePay</Text>
        <Text style={typography.timestamp}>Auto-sync gateway</Text>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={colors.blue} />
        </View>
      ) : (
        <FlatList
          data={data?.transactions || []}
          keyExtractor={(item, index) => item.transactionId || String(index)}
          renderItem={({ item }) => <ShopeePayRow transaction={item} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="card-outline" size={44} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>Belum ada mutasi</Text>
              <Text style={styles.emptySub}>
                Belum ada transaksi masuk dari gateway ShopeePay.
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
