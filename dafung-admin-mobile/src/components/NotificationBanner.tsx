import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { useNotifications } from '../context/NotificationContext';

export const NotificationBanner: React.FC<{ onPress?: () => void }> = ({ onPress }) => {
  const { latestNotification, clearNotification } = useNotifications();

  useEffect(() => {
    if (!latestNotification) return;

    const timer = setTimeout(() => {
      clearNotification();
    }, 6000);

    return () => clearTimeout(timer);
  }, [latestNotification]);

  if (!latestNotification) return null;

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.card}
        onPress={() => {
          clearNotification();
          onPress?.();
        }}
      >
        <View style={styles.iconBox}>
          <Ionicons name="notifications" size={20} color="#FFFFFF" />
        </View>

        <View style={styles.contentCol}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Pesanan Baru Masuk!</Text>
            <Text style={styles.amountText}>{latestNotification.formattedPrice}</Text>
          </View>
          <Text style={styles.descText} numberOfLines={1}>
            {latestNotification.orderCode} · {latestNotification.productName} ({latestNotification.customerName})
          </Text>
        </View>

        <Pressable
          hitSlop={8}
          onPress={clearNotification}
          style={styles.closeBtn}
        >
          <Ionicons name="close" size={18} color="#FFFFFF" />
        </Pressable>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  card: {
    backgroundColor: colors.blue,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: colors.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  contentCol: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  amountText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  descText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    marginTop: 1,
  },
  closeBtn: {
    padding: 4,
    marginLeft: 8,
  },
});
