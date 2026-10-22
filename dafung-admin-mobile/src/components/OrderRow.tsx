import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';
import { typography, formatIDR } from '../theme/typography';
import { OrderItem } from '../api/client';

interface OrderRowProps {
  order: OrderItem;
  onFulfill?: (order: OrderItem) => void;
  onPress?: (order: OrderItem) => void;
}

export const OrderRow: React.FC<OrderRowProps> = ({ order, onFulfill, onPress }) => {
  const isPaid = order.paymentStatus === 'paid';
  const isPending = isPaid && !order.isDelivered;
  const isDelivered = order.isDelivered;

  const customerName = order.customer.username
    ? `@${order.customer.username}`
    : order.customer.firstName || `ID: ${order.customer.telegramId}`;

  const initial = (order.customer.firstName?.[0] || order.customer.username?.[0] || 'U').toUpperCase();

  const formattedDate = new Date(order.createdAt).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={() => onPress?.(order)}
    >
      <View style={styles.topRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>

        <View style={styles.infoCol}>
          <View style={styles.nameRow}>
            <Text style={typography.feedName} numberOfLines={1}>
              {customerName}
            </Text>
            {order.customer.isVip && (
              <View style={styles.vipBadge}>
                <Text style={styles.vipText}>VIP</Text>
              </View>
            )}
          </View>

          <Text style={styles.productName} numberOfLines={1}>
            {order.productName}
          </Text>

          <Text style={typography.timestamp}>
            {order.orderCode} · {formattedDate}
          </Text>
        </View>

        <View style={styles.amountCol}>
          <Text style={[typography.amount, styles.amountText]}>
            {formatIDR(order.price)}
          </Text>

          {isPending ? (
            <View style={[styles.statusBadge, { backgroundColor: colors.pendingOrange }]}>
              <Text style={styles.statusText}>Perlu Kirim</Text>
            </View>
          ) : isDelivered ? (
            <View style={[styles.statusBadge, { backgroundColor: colors.receivedGreen }]}>
              <Text style={styles.statusText}>Selesai</Text>
            </View>
          ) : (
            <View style={[styles.statusBadge, { backgroundColor: colors.dividerStrong }]}>
              <Text style={[styles.statusText, { color: colors.textSecondary }]}>Belum Bayar</Text>
            </View>
          )}
        </View>
      </View>

      {/* 1-Tap Quick Fulfill CTA for undelivered orders */}
      {!isDelivered && onFulfill && (
        <View style={styles.fulfillBar}>
          <Pressable
            style={[styles.fulfillButton, !isPaid && { backgroundColor: colors.blue }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              onFulfill(order);
            }}
          >
            <Ionicons name="send" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.fulfillButtonText}>
              {isPaid ? 'Kirim Kredensial / Berkas' : 'Kirim Kredensial (Tandai Lunas)'}
            </Text>
          </Pressable>
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.canvas,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
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
  productName: {
    ...typography.feedBody,
    marginTop: 2,
    marginBottom: 2,
  },
  amountCol: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontVariant: ['tabular-nums'],
    color: colors.textPrimary,
  },
  statusBadge: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  fulfillBar: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  fulfillButton: {
    backgroundColor: colors.blue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 20,
  },
  fulfillButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
