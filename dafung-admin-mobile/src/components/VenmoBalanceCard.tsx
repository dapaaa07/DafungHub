import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { colors, brandGradient } from '../theme/colors';
import { typography, formatIDR } from '../theme/typography';

interface VenmoBalanceCardProps {
  todayRevenue: number;
  totalRevenue: number;
  pendingCount: number;
  onAddProduct: () => void;
  onBroadcast: () => void;
}

export const VenmoBalanceCard: React.FC<VenmoBalanceCardProps> = ({
  todayRevenue,
  totalRevenue,
  pendingCount,
  onAddProduct,
  onBroadcast,
}) => {
  return (
    <LinearGradient
      colors={brandGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.card}
    >
      <View style={styles.topRow}>
        <View>
          <Text style={styles.label}>Pendapatan Hari Ini</Text>
          <Text style={[typography.balanceDisplay, styles.balanceNum]}>
            {formatIDR(todayRevenue)}
          </Text>
        </View>
        {pendingCount > 0 && (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>{pendingCount} Perlu Kirim</Text>
          </View>
        )}
      </View>

      <View style={styles.middleRow}>
        <Text style={styles.subtext}>
          Total Omzet: <Text style={styles.subtextBold}>{formatIDR(totalRevenue)}</Text>
        </Text>
      </View>

      <View style={styles.actionRow}>
        <Pressable
          style={styles.whitePill}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onAddProduct();
          }}
        >
          <Text style={styles.whitePillText}>Tambah Produk</Text>
        </Pressable>

        <Pressable
          style={styles.whitePillOutline}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onBroadcast();
          }}
        >
          <Text style={styles.whitePillOutlineText}>Siaran Channel</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 16,
    borderRadius: 20,
    padding: 20,
    shadowColor: colors.blue,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 6,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  label: {
    ...typography.buttonSmall,
    color: 'rgba(255, 255, 255, 0.85)',
    marginBottom: 4,
  },
  balanceNum: {
    fontVariant: ['tabular-nums'],
  },
  pendingBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pendingBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  middleRow: {
    marginTop: 6,
    marginBottom: 16,
  },
  subtext: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 13,
  },
  subtextBold: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  whitePill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
  },
  whitePillText: {
    color: colors.blue,
    fontWeight: '700',
    fontSize: 13,
  },
  whitePillOutline: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderColor: 'rgba(255, 255, 255, 0.5)',
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
  },
  whitePillOutlineText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
});
