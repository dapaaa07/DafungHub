import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { typography, formatIDR } from '../theme/typography';
import { UserItem } from '../api/client';

interface UserRowProps {
  user: UserItem;
  onPress: (user: UserItem) => void;
}

export const UserRow: React.FC<UserRowProps> = ({ user, onPress }) => {
  const initial = (user.firstName?.[0] || user.username?.[0] || 'U').toUpperCase();
  const displayName = user.firstName || (user.username ? `@${user.username}` : `User ${user.telegramId}`);

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={() => onPress(user)}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>

      <View style={styles.infoCol}>
        <View style={styles.nameRow}>
          <Text style={typography.feedName} numberOfLines={1}>
            {displayName}
          </Text>
          {user.isVip && (
            <View style={styles.vipBadge}>
              <Text style={styles.vipText}>VIP</Text>
            </View>
          )}
        </View>

        <Text style={typography.timestamp}>
          {user.username ? `@${user.username} · ` : ''}ID: {user.telegramId}
        </Text>

        <Text style={styles.statsText}>
          {user.stats.totalOrders} pesanan · Total {formatIDR(user.stats.totalSpent)}
        </Text>
      </View>

      <View style={styles.balanceCol}>
        <Text style={styles.balanceLabel}>Saldo Akun</Text>
        <Text style={[typography.amount, styles.balanceValue]}>
          {formatIDR(user.balance)}
        </Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.canvas,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    alignItems: 'center',
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.blueTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: colors.blue,
    fontWeight: '700',
    fontSize: 16,
  },
  infoCol: {
    flex: 1,
    marginRight: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  vipBadge: {
    backgroundColor: '#FFF2C6',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  vipText: {
    color: '#B27400',
    fontSize: 10,
    fontWeight: '700',
  },
  statsText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 3,
  },
  balanceCol: {
    alignItems: 'flex-end',
  },
  balanceLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  balanceValue: {
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
});
